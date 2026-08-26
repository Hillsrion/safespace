import type { PrismaClient } from "../generated/prisma";
import { normalizeSpaceRole, type SpaceRole } from "../lib/invitations";

type TransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

export type ActiveDiscipline = "restriction" | "suspension" | null;
export type EffectiveSpaceAccess = {
  isSuperAdmin: boolean;
  role: SpaceRole | null;
  discipline: ActiveDiscipline;
};

/**
 * Resolve current authorization from durable state. Restrictions downgrade a
 * member to read-only; suspensions remove space access entirely. Super-admin
 * break-glass access is global and cannot be issued through a space action.
 */
export async function getEffectiveSpaceAccess(
  client: TransactionClient,
  userId: string,
  spaceId: string,
  now = new Date()
): Promise<EffectiveSpaceAccess> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true },
  });
  if (!user) return { isSuperAdmin: false, role: null, discipline: null };
  if (user.isSuperAdmin) {
    return { isSuperAdmin: true, role: null, discipline: null };
  }

  const [membership, disciplinaryAction] = await Promise.all([
    client.userSpaceMembership.findUnique({
      where: { userId_spaceId: { userId, spaceId } },
      select: { role: true },
    }),
    client.disciplinaryAction.findFirst({
      where: {
        userId,
        spaceId,
        status: "active",
        kind: { in: ["restriction", "suspension"] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ level: "desc" }, { createdAt: "desc" }],
      select: { kind: true },
    }),
  ]);
  const membershipRole = normalizeSpaceRole(membership?.role ?? "");
  const discipline: ActiveDiscipline =
    disciplinaryAction?.kind === "suspension"
      ? "suspension"
      : disciplinaryAction?.kind === "restriction"
        ? "restriction"
        : null;

  if (!membershipRole || discipline === "suspension") {
    return { isSuperAdmin: false, role: null, discipline };
  }
  return {
    isSuperAdmin: false,
    role: discipline === "restriction" ? "READ_ONLY" : membershipRole,
    discipline,
  };
}
