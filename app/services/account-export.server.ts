import type { PrismaClient } from "~/generated/prisma";
import { prisma } from "~/db/client.server";
import { errors } from "~/lib/api/http-error";

type TransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

export type AccountExportActor = { id: string };

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

async function buildAccountExport(
  tx: TransactionClient,
  actor: AccountExportActor
) {
  const user = await tx.user.findUnique({
    where: { id: actor.id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      instagram: true,
      isSuperAdmin: true,
      codeOfConductAcceptedAt: true,
      createdAt: true,
      updatedAt: true,
      memberships: {
        orderBy: { joinedAt: "asc" },
        select: {
          role: true,
          joinedAt: true,
          space: { select: { id: true, name: true } },
        },
      },
      authoredPosts: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          spaceId: true,
          description: true,
          isAnonymous: true,
          isAdminOnly: true,
          status: true,
          severity: true,
          verificationStatus: true,
          createdAt: true,
          updatedAt: true,
          reportedEntity: {
            select: {
              id: true,
              name: true,
              handles: {
                orderBy: { createdAt: "asc" },
                select: { platform: true, handle: true },
              },
            },
          },
          media: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              fileName: true,
              mimeType: true,
              fileSize: true,
              metadataStripped: true,
              isBlurred: true,
              createdAt: true,
            },
          },
        },
      },
      postedFlags: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          postId: true,
          reason: true,
          status: true,
          createdAt: true,
          resolvedAt: true,
        },
      },
      auditLogs: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          action: true,
          targetEntityType: true,
          targetEntityId: true,
          spaceId: true,
          createdAt: true,
        },
      },
      _count: { select: { sentInvites: true } },
    },
  });

  if (!user) throw errors.unauthorized("Authentication is no longer valid");

  return {
    format: "safespace-account-export",
    version: 1,
    generatedAt: new Date().toISOString(),
    profile: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      instagram: user.instagram,
      isSuperAdmin: user.isSuperAdmin,
      codeOfConductAcceptedAt: iso(user.codeOfConductAcceptedAt),
      createdAt: iso(user.createdAt),
      updatedAt: iso(user.updatedAt),
    },
    memberships: user.memberships.map((membership) => ({
      spaceId: membership.space.id,
      spaceName: membership.space.name,
      role: membership.role,
      joinedAt: iso(membership.joinedAt),
    })),
    contributions: user.authoredPosts.map((post) => ({
      ...post,
      createdAt: iso(post.createdAt),
      updatedAt: iso(post.updatedAt),
      media: post.media.map((media) => ({
        ...media,
        createdAt: iso(media.createdAt),
      })),
    })),
    moderationFlags: user.postedFlags.map((flag) => ({
      ...flag,
      createdAt: iso(flag.createdAt),
      resolvedAt: iso(flag.resolvedAt),
    })),
    auditHistory: user.auditLogs.map((audit) => ({
      ...audit,
      createdAt: iso(audit.createdAt),
    })),
    activitySummary: { sentInviteCount: user._count.sentInvites },
  };
}

export async function exportAccountData(
  actor: AccountExportActor,
  client: PrismaClient = prisma
) {
  return client.$transaction(
    (tx) => buildAccountExport(tx, actor),
    { isolationLevel: "RepeatableRead" }
  );
}
