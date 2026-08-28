import { z } from "zod";
import type { PrismaClient } from "~/generated/prisma";
import { prisma } from "~/db/client.server";
import { errors } from "~/lib/api/http-error";
import { EVIDENCE_CATEGORIES } from "~/lib/evidence";

export type AccountExportActor = { id: string };
const nullableText = z.string().nullable();
const media = z.object({
  id: z.string(), fileName: z.string(), mimeType: z.string(), fileSize: z.number(),
  metadataStripped: z.boolean(), isBlurred: z.boolean(), createdAt: z.string(),
  evidenceCategory: z.enum(EVIDENCE_CATEGORIES), caption: z.string().max(280).nullable(), sortOrder: z.number().int().nonnegative(),
}).strict();
const ownReviewsSchema = z.array(z.object({
  id: z.string(), postId: z.string(), revision: z.number().int().positive(),
  stage: z.number().int().min(1).max(3), outcome: z.enum(["approve", "request_changes"]),
  note: z.string(), createdAt: z.string(),
}).strict());
// Fail closed if a future SQL change adds credentials, keys or other identities.
const ownDataSchema = z.object({
  contributions: z.array(z.object({
    id: z.string(), spaceId: z.string(), reportedEntityId: z.string(), description: z.string(),
    isAnonymous: z.boolean(), isAdminOnly: z.boolean(), status: z.string(),
    severity: nullableText, verificationStatus: nullableText,
    createdAt: z.string(), updatedAt: z.string(), media: z.array(media),
  }).strict()),
  uploadedMedia: z.array(media.extend({ postId: z.string() }).strict()),
  moderationFlags: z.array(z.object({
    id: z.string(), postId: z.string(), reason: nullableText, status: z.string(),
    createdAt: z.string(), resolvedAt: nullableText,
  }).strict()),
  sentInviteCount: z.number().int().nonnegative(),
}).strict();

/** No elevated connection: only the transaction's authenticated self. */
export async function exportAccountData(actor: AccountExportActor, client: PrismaClient = prisma) {
  return client.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: actor.id },
      select: {
        id: true, email: true, firstName: true, lastName: true, instagram: true,
        isSuperAdmin: true, codeOfConductAcceptedAt: true, createdAt: true, updatedAt: true,
        memberships: {
          orderBy: { joinedAt: "asc" },
          select: { role: true, joinedAt: true, spaceId: true },
        },
        auditLogs: {
          orderBy: { createdAt: "asc" },
          select: { id: true, action: true, targetEntityType: true, targetEntityId: true, spaceId: true, createdAt: true },
        },
      },
    });
    if (!user) throw errors.unauthorized("Authentication is no longer valid");
    const [self] = await tx.$queryRaw<Array<{ userId: string | null; ownData: unknown; ownReviews: unknown }>>`
      SELECT safespace_private.current_user_id() AS "userId",
        safespace_private.export_own_contributions() AS "ownData",
        safespace_private.export_own_sensitive_review_decisions() AS "ownReviews"
    `;
    if (self?.userId !== actor.id) throw errors.unauthorized("Authentication is no longer valid");
    const ownData = ownDataSchema.parse(self.ownData);
    const sensitiveReviewDecisions = ownReviewsSchema.parse(self.ownReviews);
    const [spaces, savedSearches, appeals, disciplinaryActions, spaceActivity] = await Promise.all([
      tx.space.findMany({ where: { id: { in: user.memberships.map(({ spaceId }) => spaceId) } }, select: { id: true, name: true } }),
      tx.savedSearch.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, query: true, spaceId: true, severity: true, verificationStatus: true, alertEnabled: true, alertHandle: true, type: true, createdAt: true, updatedAt: true } }),
      tx.moderationAppeal.findMany({ where: { filedByUserId: actor.id }, orderBy: { createdAt: "asc" }, select: { id: true, spaceId: true, postFlagId: true, reason: true, status: true, decisionNote: true, decidedAt: true, createdAt: true } }),
      tx.disciplinaryAction.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "asc" }, select: { id: true, spaceId: true, kind: true, level: true, reason: true, status: true, expiresAt: true, revokedAt: true, revocationReason: true, createdAt: true } }),
      tx.memberSpaceActivity.findMany({ where: { userId: actor.id }, orderBy: { spaceId: "asc" }, select: { spaceId: true, lastActiveDay: true } }),
    ]);
    const names = new Map(spaces.map((space) => [space.id, space.name]));
    const { memberships, auditLogs } = user;
    return {
      format: "safespace-account-export", version: 5, generatedAt: new Date().toISOString(),
      profile: {
        id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
        instagram: user.instagram, isSuperAdmin: user.isSuperAdmin,
        codeOfConductAcceptedAt: user.codeOfConductAcceptedAt,
        createdAt: user.createdAt, updatedAt: user.updatedAt,
      },
      memberships: memberships.map(({ spaceId, role, joinedAt }) => ({ spaceId, role, joinedAt, spaceName: names.get(spaceId) ?? null })),
      contributions: ownData.contributions, uploadedMedia: ownData.uploadedMedia,
      moderationFlags: ownData.moderationFlags, auditHistory: auditLogs,
      savedSearches, appeals, disciplinaryActions, sensitiveReviewDecisions,
      spaceActivity: spaceActivity.map(({ spaceId, lastActiveDay }) => ({ spaceId, lastActiveDay: lastActiveDay.toISOString().slice(0, 10) })),
      activitySummary: { sentInviteCount: ownData.sentInviteCount },
      scope: "Own contributions and media metadata, including inaccessible spaces. No media bytes, storage keys, invitation recipients, or other members' identities.",
    };
  }, { isolationLevel: "RepeatableRead" });
}
