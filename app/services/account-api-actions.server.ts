import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";

import { AccountProfileError, updateOwnAccount } from "~/services/account-profile.server";
import { getCurrentUser, type AuthenticatedUser } from "~/services/auth.server";
import { deleteAccountAction } from "~/services/member-lifecycle-actions.server";
import { requireSameOrigin } from "~/lib/security.server";
import { validatePassword } from "~/lib/password";
import { logServerException } from "~/lib/error/server-error.server";
import { HttpError } from "~/lib/api/http-error";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

export type CurrentUserDto = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  /** PRD-compatible display name; updates are mapped losslessly to name parts. */
  name: string;
  instagram: string | null;
  createdAt: string;
  updatedAt: string;
};

const updateCurrentUserSchema = z
  .object({
    // `name` is accepted for the PRD contract. It must contain two parts so
    // the required firstName/lastName model is never silently lossy.
    name: z.string().trim().min(1).max(201).optional(),
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    instagram: z.string().trim().max(100).nullable().optional(),
    currentPassword: z.string().min(1).max(1024).optional(),
    newPassword: z.string().min(1).max(1024).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.name && (input.firstName !== undefined || input.lastName !== undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use either name or firstName/lastName",
        path: ["name"],
      });
    }
    if (input.newPassword && !validatePassword(input.newPassword)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "New password does not meet password requirements",
        path: ["newPassword"],
      });
    }
  });

function toCurrentUserDto(user: AuthenticatedUser): CurrentUserDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name: `${user.firstName} ${user.lastName}`.trim(),
    instagram: user.instagram,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function methodNotAllowed(allowed: string): Response {
  return Response.json(
    { success: false, error: "Method not allowed" },
    { status: 405, headers: { ...PRIVATE_HEADERS, Allow: allowed } }
  );
}

function unauthorized(): Response {
  return Response.json(
    { success: false, error: "Authentication required" },
    { status: 401, headers: PRIVATE_HEADERS }
  );
}

async function requireCurrentUser(request: Request): Promise<AuthenticatedUser | Response> {
  return (await getCurrentUser(request)) ?? unauthorized();
}

function splitPrdName(name: string): { firstName: string; lastName: string } | null {
  const parts = name.trim().split(/\s+/);
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ");
  return firstName.length <= 100 && lastName.length <= 100
    ? { firstName, lastName }
    : null;
}

async function readJson(request: Request): Promise<unknown | Response> {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    return Response.json(
      { success: false, error: "Content-Type must be application/json" },
      { status: 400, headers: PRIVATE_HEADERS }
    );
  }
  try {
    return await request.json();
  } catch {
    return Response.json(
      { success: false, error: "A valid JSON body is required" },
      { status: 400, headers: PRIVATE_HEADERS }
    );
  }
}

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

export async function currentUserLoader({ request }: LoaderFunctionArgs): Promise<Response> {
  if (request.method.toUpperCase() !== "GET") return methodNotAllowed("GET");
  const user = await requireCurrentUser(request);
  if (isResponse(user)) return user;
  return Response.json(toCurrentUserDto(user), { headers: PRIVATE_HEADERS });
}

/** `/auth/me` is a compatibility alias with the exact same safe projection. */
export const authMeLoader = currentUserLoader;

export async function currentUserAction(args: ActionFunctionArgs): Promise<Response> {
  const { request } = args;
  const method = request.method.toUpperCase();
  if (method === "DELETE") {
    // Preserve the stronger existing DELETE_ACCOUNT confirmation and
    // contributionPolicy contract rather than weakening it to password alone.
    const response = await deleteAccountAction(args);
    response.headers.set("Cache-Control", PRIVATE_HEADERS["Cache-Control"]);
    return response;
  }
  if (method !== "PUT") return methodNotAllowed("PUT, DELETE");

  try {
    requireSameOrigin(request);
    const user = await requireCurrentUser(request);
    if (isResponse(user)) return user;
    const body = await readJson(request);
    if (isResponse(body)) return body;
    const parsed = updateCurrentUserSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: "Invalid account update" },
        { status: 400, headers: PRIVATE_HEADERS }
      );
    }

    const nameParts = parsed.data.name ? splitPrdName(parsed.data.name) : null;
    if (parsed.data.name && !nameParts) {
      return Response.json(
        { success: false, error: "Name is too long" },
        { status: 400, headers: PRIVATE_HEADERS }
      );
    }
    const input = {
      email: parsed.data.email ?? user.email,
      firstName: nameParts?.firstName ?? parsed.data.firstName ?? user.firstName,
      lastName: nameParts?.lastName ?? parsed.data.lastName ?? user.lastName,
      instagram: parsed.data.instagram === null ? undefined : parsed.data.instagram ?? user.instagram ?? undefined,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
    };
    await updateOwnAccount(user.id, input);

    // Re-read through the authentication boundary so the returned DTO reflects
    // normalized durable values and keeps its safe projection in one place.
    const updatedUser = await requireCurrentUser(request);
    if (isResponse(updatedUser)) return updatedUser;
    return Response.json(toCurrentUserDto(updatedUser), { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse();
    if (error instanceof AccountProfileError) {
      return Response.json(
        { success: false, error: "Account update could not be completed" },
        { status: error.status, headers: PRIVATE_HEADERS }
      );
    }
    logServerException(error, {
      operation: "account.update",
      errorCode: "server_error:api",
      httpStatus: 500,
    });
    return Response.json(
      { success: false, error: "Account update could not be completed" },
      { status: 500, headers: PRIVATE_HEADERS }
    );
  }
}
