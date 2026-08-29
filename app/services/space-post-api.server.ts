import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";

import { prisma } from "~/db/client.server";
import { redactAnonymousPost, withViewerPermissions } from "~/db/repositories/posts/queries.server";
import { createReport, updateReport } from "~/db/repositories/posts/write.server";
import { deletePost } from "~/db/repositories/posts/queries.server";
import type { PrismaClient } from "~/generated/prisma";
import { HttpError, errors } from "~/lib/api/http-error";
import { errorResponse } from "~/lib/api/response";
import { createReportSchema, reportIdSchema, updateReportSchema } from "~/lib/reports";
import { requireSameOrigin } from "~/lib/security.server";
import { logServerException } from "~/lib/error/server-error.server";
import { getCurrentUser } from "~/services/auth.server";
import { getEffectiveSpaceAccess } from "~/services/effective-space-access.server";

const paramsSchema = z.object({ spaceId: z.string().uuid(), postId: reportIdSchema.optional() });
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  filterBySeverity: z.enum(["low", "medium", "high"]).optional(),
  filterByVerification: z.enum(["unverified", "pending", "verified", "disputed"]).optional(),
});

const collectionCreateSchema = z.object({
  targetEntityName: z.string(),
  targetEntityHandles: z.array(z.string()),
  description: z.string(),
  isAnonymous: z.boolean().default(false),
  isAdminOnly: z.boolean().default(false),
  severity: z.enum(["low", "medium", "high"]).optional(),
  verificationStatus: z.enum(["unverified", "pending", "verified", "disputed"]).optional(),
  mediaIds: z.array(z.string().uuid()).max(10).optional(),
}).strict();

const itemUpdateSchema = z.object({
  targetEntityName: z.string().optional(),
  targetEntityHandles: z.array(z.string()).optional(),
  description: z.string().optional(),
  isAnonymous: z.boolean().optional(),
  isAdminOnly: z.boolean().optional(),
  severity: z.enum(["low", "medium", "high"]).optional(),
  verificationStatus: z.enum(["unverified", "pending", "verified", "disputed"]).optional(),
  mediaIds: z.array(z.string().uuid()).max(10).optional(),
}).strict();

type Client = Pick<PrismaClient, "post" | "user" | "userSpaceMembership" | "disciplinaryAction">;

function methodNotAllowed(allow: string) {
  const response = errorResponse("Method not allowed", "bad_request:api", 405);
  response.headers.set("Allow", allow);
  return response;
}

function boundaryError(
  error: unknown,
  operation: "database.query" | "post.create" | "post.update" | "post.delete"
) {
  if (error instanceof HttpError) return error.toResponse();
  logServerException(error, { operation, errorCode: "server_error:api", httpStatus: 500 });
  return errorResponse("Unable to process the report request", "server_error:api", 500);
}

async function jsonBody(request: Request): Promise<unknown> {
  try { return await request.json(); }
  catch { throw errors.badRequest("A valid JSON body is required"); }
}

function isElevated(access: Awaited<ReturnType<typeof getEffectiveSpaceAccess>>) {
  return access.isSuperAdmin || access.role === "ADMIN" || access.role === "MODERATOR";
}

const postInclude = {
  author: { select: { id: true, firstName: true, lastName: true, instagram: true } },
  space: { select: { id: true, name: true } },
  reportedEntity: { select: { id: true, name: true, handles: { select: { id: true, handle: true, platform: true } } } },
  media: {
    select: {
      id: true,
      mimeType: true,
      fileSize: true,
      metadataStripped: true,
      isBlurred: true,
      evidenceCategory: true,
      caption: true,
      sortOrder: true,
      createdAt: true,
    },
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }] as Array<{ sortOrder?: "asc"; id?: "asc" }>,
  },
} as const;

function safePost<T extends { authorId: string | null; isAnonymous: boolean; spaceId: string }>(
  post: T,
  userId: string,
  access: Awaited<ReturnType<typeof getEffectiveSpaceAccess>>
) {
  const role = access.isSuperAdmin ? "SUPERADMIN" : access.role;
  return redactAnonymousPost(withViewerPermissions(post, userId, role));
}

/** Read service with explicit space scoping in addition to PostgreSQL RLS. */
export async function listSpacePosts(
  userId: string,
  spaceId: string,
  query: z.infer<typeof listQuerySchema>,
  client: Client = prisma
) {
  const access = await getEffectiveSpaceAccess(client, userId, spaceId);
  if (!access.isSuperAdmin && access.role === null) throw errors.notFound("Space not found");
  const elevated = isElevated(access);
  const visibility = elevated
    ? {}
    : { OR: [{ status: "active" as const, isAdminOnly: false }, { authorId: userId }] };
  const where = {
    spaceId,
    ...visibility,
    severity: query.filterBySeverity,
    verificationStatus: query.filterByVerification,
  };
  const [posts, total] = await Promise.all([
    client.post.findMany({
      where,
      include: postInclude,
      orderBy: [{ [query.sortBy]: query.sortOrder }, { id: query.sortOrder }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    client.post.count({ where }),
  ]);
  return {
    posts: posts.map((post) => safePost(post, userId, access)),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.ceil(total / query.limit),
  };
}

export async function getSpacePost(
  userId: string,
  spaceId: string,
  postId: string,
  client: Client = prisma
) {
  const access = await getEffectiveSpaceAccess(client, userId, spaceId);
  if (!access.isSuperAdmin && access.role === null) throw errors.notFound("Post not found");
  const visibility = isElevated(access)
    ? {}
    : { OR: [{ status: "active" as const, isAdminOnly: false }, { authorId: userId }] };
  const post = await client.post.findFirst({
    where: { id: postId, spaceId, ...visibility },
    include: postInclude,
  });
  if (!post) throw errors.notFound("Post not found");
  return safePost(post, userId, access);
}

export async function spacePostsLoader({ request, params }: LoaderFunctionArgs) {
  try {
    if (request.method.toUpperCase() !== "GET") return methodNotAllowed("GET, POST");
    const parsedParams = paramsSchema.pick({ spaceId: true }).safeParse(params);
    if (!parsedParams.success) throw errors.badRequest("Invalid space path");
    const user = await getCurrentUser(request);
    if (!user) throw errors.unauthorized("Authentication required");
    const url = new URL(request.url);
    const parsedQuery = listQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsedQuery.success) throw errors.badRequest("Invalid post list query");
    return Response.json(await listSpacePosts(user.id, parsedParams.data.spaceId, parsedQuery.data));
  } catch (error) { return boundaryError(error, "database.query"); }
}

export async function spacePostsAction({ request, params }: ActionFunctionArgs) {
  try {
    if (request.method.toUpperCase() !== "POST") return methodNotAllowed("GET, POST");
    requireSameOrigin(request);
    const parsedParams = paramsSchema.pick({ spaceId: true }).safeParse(params);
    if (!parsedParams.success) throw errors.badRequest("Invalid space path");
    const user = await getCurrentUser(request);
    if (!user) throw errors.unauthorized("Authentication required");
    const parsed = collectionCreateSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw errors.badRequest("Invalid report payload");
    if (parsed.data.mediaIds?.length) {
      throw errors.badRequest("Upload evidence after report creation; media cannot be reattached by identifier");
    }
    const input = createReportSchema.safeParse({
      spaceId: parsedParams.data.spaceId,
      entity: { name: parsed.data.targetEntityName, handles: parsed.data.targetEntityHandles },
      description: parsed.data.description,
      isAnonymous: parsed.data.isAnonymous,
      isAdminOnly: parsed.data.isAdminOnly,
      severity: parsed.data.severity,
      verificationStatus: parsed.data.verificationStatus,
    });
    if (!input.success) throw errors.badRequest("Invalid report payload");
    return Response.json(await createReport(user, input.data), { status: 201 });
  } catch (error) { return boundaryError(error, "post.create"); }
}

export async function spacePostLoader({ request, params }: LoaderFunctionArgs) {
  try {
    if (request.method.toUpperCase() !== "GET") return methodNotAllowed("GET, PUT, DELETE");
    const parsed = paramsSchema.required().safeParse(params);
    if (!parsed.success) throw errors.badRequest("Invalid report path");
    const user = await getCurrentUser(request);
    if (!user) throw errors.unauthorized("Authentication required");
    return Response.json(await getSpacePost(user.id, parsed.data.spaceId, parsed.data.postId));
  } catch (error) { return boundaryError(error, "database.query"); }
}

export async function spacePostAction({ request, params }: ActionFunctionArgs) {
  const operation = request.method.toUpperCase() === "DELETE" ? "post.delete" : "post.update";
  try {
    const method = request.method.toUpperCase();
    if (method !== "PUT" && method !== "DELETE") return methodNotAllowed("GET, PUT, DELETE");
    requireSameOrigin(request);
    const parsedParams = paramsSchema.required().safeParse(params);
    if (!parsedParams.success) throw errors.badRequest("Invalid report path");
    const user = await getCurrentUser(request);
    if (!user) throw errors.unauthorized("Authentication required");
    if (method === "DELETE") {
      await deletePost(parsedParams.data.postId, user.id, prisma, { expectedSpaceId: parsedParams.data.spaceId });
      return Response.json({ success: true, action: "deleted" });
    }
    const parsed = itemUpdateSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw errors.badRequest("Invalid report payload");
    if (parsed.data.mediaIds !== undefined) {
      throw errors.badRequest("Evidence is managed through the authenticated media endpoint");
    }
    if ((parsed.data.targetEntityName === undefined) !== (parsed.data.targetEntityHandles === undefined)) {
      throw errors.badRequest("Entity name and handles must be updated together");
    }
    const input = updateReportSchema.safeParse({
      spaceId: parsedParams.data.spaceId,
      entity: parsed.data.targetEntityName === undefined ? undefined : {
        name: parsed.data.targetEntityName,
        handles: parsed.data.targetEntityHandles,
      },
      description: parsed.data.description,
      isAnonymous: parsed.data.isAnonymous,
      isAdminOnly: parsed.data.isAdminOnly,
      severity: parsed.data.severity,
      verificationStatus: parsed.data.verificationStatus,
    });
    if (!input.success) throw errors.badRequest("Invalid report payload");
    return Response.json(await updateReport(parsedParams.data.postId, user, input.data));
  } catch (error) { return boundaryError(error, operation); }
}
