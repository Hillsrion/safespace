import { Prisma, type PrismaClient } from "~/generated/prisma";
import { prisma } from "~/db/client.server";
import { errors } from "~/lib/api/http-error";
import type { RequireSensitiveReviewInput, SensitiveReviewDecisionInput, SensitiveReviewQuery } from "~/lib/sensitive-review";

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
type Actor = { id: string };
type Access = { role: string | null; isSuperAdmin: boolean; discipline: string | null };

async function requireAccess(tx: Tx, actor: Actor, spaceId: string): Promise<Access> {
  // The review workflow deliberately has no discipline/break-glass exception,
  // and superadmins may not impersonate the first two roles without membership.
  const [access] = await tx.$queryRaw<Access[]>`
    SELECT upper(replace(m.role, '-', '_')) AS role, u."isSuperAdmin",
      safespace_private.active_discipline_kind(${spaceId}::uuid, u.id) AS discipline
    FROM "User" u LEFT JOIN "UserSpaceMembership" m
      ON m."userId" = u.id AND m."spaceId" = ${spaceId}::uuid
    WHERE u.id = ${actor.id}::uuid AND u.id = safespace_private.current_user_id()
  `;
  if (!access || access.discipline || (!access.isSuperAdmin && !["MODERATOR", "ADMIN"].includes(access.role ?? ""))) {
    throw errors.forbidden("An unrestricted moderator, administrator or superadministrator is required");
  }
  return access;
}

function databaseCode(error: unknown): string | undefined {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return;
  return error.code === "P2010" ? String(error.meta?.code) : error.code;
}

async function transaction<T>(client: PrismaClient, operation: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await client.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const code = databaseCode(error);
      if (["P2034", "40001", "40P01"].includes(code ?? "") && attempt < 2) continue;
      if (["P2034", "40001", "40P01", "P2002", "23505"].includes(code ?? "")) {
        throw errors.conflict("This revision or review stage changed; reload the report");
      }
      if (code === "42501") throw errors.forbidden("An independent, authorized reviewer is required");
      if (code === "22023") throw errors.badRequest("Invalid review decision or rationale");
      throw error;
    }
  }
  throw new Error("Unreachable review transaction state");
}

const POST_SELECT = {
  id: true, spaceId: true, authorId: true, description: true,
  isAnonymous: true, isAdminOnly: true, status: true, severity: true,
  requiresSensitiveReview: true, contentRevision: true, verificationStatus: true,
  reportedEntity: { select: { id: true, name: true, handles: { select: { handle: true } } } },
  media: { select: { id: true, mimeType: true, fileSize: true, isBlurred: true } },
  sensitiveReviewRounds: {
    orderBy: { revision: "desc" as const }, take: 10,
    select: {
      id: true, revision: true, status: true, reason: true, createdAt: true,
      decisions: {
        orderBy: { stage: "asc" as const },
        select: { stage: true, reviewerUserId: true, outcome: true, note: true, createdAt: true },
      },
    },
  },
} as const;

export async function listSensitiveReviews(actor: Actor, spaceId: string, query: SensitiveReviewQuery, client: PrismaClient = prisma) {
  return transaction(client, async (tx) => {
    const access = await requireAccess(tx, actor, spaceId);
    const posts = await tx.post.findMany({
      where: { spaceId, requiresSensitiveReview: query.classification === "required" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1, skip: query.cursor ? 1 : 0,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      select: POST_SELECT,
    });
    const hasMore = posts.length > query.limit;
    const items = posts.slice(0, query.limit).map((post) => {
      const round = post.sensitiveReviewRounds.find(({ revision }) => revision === post.contentRevision);
      const nextStage = (round?.decisions.length ?? 0) + 1;
      const canDecide = round?.status === "pending" && post.authorId !== null && post.authorId !== actor.id
        && !round.decisions.some(({ reviewerUserId }) => reviewerUserId === actor.id)
        && ((nextStage === 1 && access.role === "MODERATOR") || (nextStage === 2 && access.role === "ADMIN")
          || (nextStage === 3 && access.isSuperAdmin));
      // Explicit DTO: neither the anonymous author, reviewer identities, storage
      // keys, uploader IDs nor raw Prisma relations can leave this service.
      return {
        id: post.id, spaceId: post.spaceId, description: post.description,
        isAnonymous: post.isAnonymous, isAdminOnly: post.isAdminOnly, status: post.status,
        severity: post.severity, requiresSensitiveReview: post.requiresSensitiveReview,
        contentRevision: post.contentRevision, verificationStatus: post.verificationStatus,
        entity: { id: post.reportedEntity.id, name: post.reportedEntity.name, handles: post.reportedEntity.handles.map(({ handle }) => handle) },
        media: post.media.map(({ id, mimeType, fileSize, isBlurred }) => ({ id, mimeType, fileSize, isBlurred })),
        canDecide: Boolean(canDecide), nextStage: nextStage <= 3 ? nextStage : null,
        rounds: post.sensitiveReviewRounds.map((item) => ({
          id: item.id, revision: item.revision, status: item.status, reason: item.reason, createdAt: item.createdAt.toISOString(),
          decisions: item.decisions.map(({ stage, outcome, note, createdAt }) => ({ stage, outcome, note, createdAt: createdAt.toISOString() })),
        })),
      };
    });
    return { items, hasMore, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
  });
}

export async function requireSensitiveReview(actor: Actor, spaceId: string, postId: string, input: RequireSensitiveReviewInput, client: PrismaClient = prisma) {
  return transaction(client, async (tx) => {
    await requireAccess(tx, actor, spaceId);
    if (!await tx.post.findFirst({ where: { id: postId, spaceId }, select: { id: true } })) throw errors.notFound("Report not found");
    await tx.$queryRaw`SELECT safespace_private.require_sensitive_review(${postId}::uuid, ${input.revision}::int, ${input.reason}::text)`;
    return { success: true as const };
  });
}

export async function decideSensitiveReview(actor: Actor, spaceId: string, postId: string, input: SensitiveReviewDecisionInput, client: PrismaClient = prisma) {
  return transaction(client, async (tx) => {
    await requireAccess(tx, actor, spaceId);
    if (!await tx.post.findFirst({ where: { id: postId, spaceId }, select: { id: true } })) throw errors.notFound("Report not found");
    await tx.$queryRaw`SELECT safespace_private.decide_sensitive_review(
      ${postId}::uuid, ${input.revision}::int, ${input.stage}::int, ${input.outcome}::text, ${input.note}::text
    )`;
    return { success: true as const };
  });
}
