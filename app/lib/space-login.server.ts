import { z } from "zod";

import { prisma } from "~/db/client.server";
import { runWithDbContext } from "~/db/context.server";
import { getEffectiveSpaceAccess } from "~/services/effective-space-access.server";

const spaceIdSchema = z.string().uuid();

export type SpaceLoginUser = { id: string; isSuperAdmin: boolean };

type SpaceLoginAccessClient = Pick<
  typeof prisma,
  "space" | "user" | "userSpaceMembership" | "disciplinaryAction"
>;

/** A malformed path is intentionally indistinguishable from a private space. */
export function parseSpaceLoginId(value: unknown): string | null {
  const parsed = spaceIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function dashboardDestinationForSpace(spaceId: string): string {
  return `/dashboard?${new URLSearchParams({ spaceId }).toString()}`;
}

async function hasCurrentAccess(
  user: SpaceLoginUser,
  spaceId: string,
  client: SpaceLoginAccessClient
): Promise<boolean> {
  const access = await getEffectiveSpaceAccess(client, user.id, spaceId);
  if (access.isSuperAdmin) {
    // The super-admin flag is intentionally re-read by
    // getEffectiveSpaceAccess. Re-enter the DB context with that fresh flag
    // before checking the resource, because a just-promoted administrator may
    // not have a membership on the target space.
    return Boolean(
      await runWithDbContext(
        { mode: "user", userId: user.id, isSuperAdmin: true },
        () =>
          client.space.findUnique({
            where: { id: spaceId },
            select: { id: true },
          })
      )
    );
  }

  // A restriction remains valid read-only access; a suspension and a missing
  // membership both produce a null role and must fall back to /dashboard.
  return access.role !== null;
}

/**
 * Resolve an authenticated user's landing page without ever exposing whether
 * a space exists to an unauthenticated request. Membership is re-read after
 * the password check, so revoked access cannot be carried in the URL.
 */
export async function resolveSpaceLoginDestination(
  user: SpaceLoginUser,
  rawSpaceId: unknown,
  client: SpaceLoginAccessClient = prisma
): Promise<string> {
  const spaceId = parseSpaceLoginId(rawSpaceId);
  if (!spaceId) return "/dashboard";

  const allowed = await runWithDbContext(
    { mode: "user", userId: user.id, isSuperAdmin: user.isSuperAdmin },
    () => hasCurrentAccess(user, spaceId, client)
  );
  return allowed ? dashboardDestinationForSpace(spaceId) : "/dashboard";
}
