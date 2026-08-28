import { redirect, type LoaderFunctionArgs } from "react-router";
import { prisma } from "~/db/client.server";
import { getUserSpaceRole } from "~/db/repositories/spaces/queries.server";
import { getCurrentUser } from "~/services/auth.server";
import { getOwnSensitiveReviewFeedback } from "~/services/sensitive-review-feedback.server";
import { trackVisitedSpace } from "~/services/space-activity-tracking.server";

export async function loadReportForEditing({ request, params }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);
  if (!user) throw redirect("/auth/login");
  if (!params.id) throw new Response("Signalement introuvable", { status: 404 });

  const post = await prisma.post.findFirst({
    where: {
      id: params.id,
      ...(user.isSuperAdmin
        ? {}
        : {
            OR: [
              {
                authorId: user.id,
                space: {
                  memberships: {
                    some: {
                      userId: user.id,
                      role: { in: ["EDITOR", "Editor", "editor"] },
                    },
                  },
                },
              },
              {
                space: {
                  memberships: {
                    some: {
                      userId: user.id,
                      role: {
                        in: [
                          "ADMIN",
                          "Admin",
                          "admin",
                          "MODERATOR",
                          "Moderator",
                          "moderator",
                        ],
                      },
                    },
                  },
                },
              },
            ],
          }),
    },
    select: {
      id: true,
      authorId: true,
      spaceId: true,
      description: true,
      isAnonymous: true,
      isAdminOnly: true,
      severity: true,
      verificationStatus: true,
      requiresSensitiveReview: true,
      contentRevision: true,
      space: { select: { id: true, name: true } },
      reportedEntity: {
        select: {
          name: true,
          handles: { orderBy: { createdAt: "asc" }, select: { handle: true } },
        },
      },
      media: {
        select: {
          id: true,
          mimeType: true,
          fileSize: true,
          isBlurred: true,
          evidenceCategory: true,
          caption: true,
          sortOrder: true,
          // Read only to derive the client capability below. It is never
          // serialized, including for anonymous reports.
          uploaderId: true,
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!post) throw new Response("Signalement introuvable", { status: 404 });

  const role = await getUserSpaceRole(user.id, post.spaceId);
  const mayModerate = role === "ADMIN" || role === "MODERATOR";
  const mayEditOwn = role === "EDITOR" && post.authorId === user.id;
  if (!mayModerate && !mayEditOwn) {
    throw new Response("Signalement introuvable", { status: 404 });
  }

  await trackVisitedSpace(user.id, post.spaceId);
  return {
    reviewFeedback: post.authorId === user.id && post.requiresSensitiveReview
      ? await getOwnSensitiveReviewFeedback(post.id) : null,
    post: {
      id: post.id,
      spaceId: post.spaceId,
      description: post.description,
      isAnonymous: post.isAnonymous,
      isAdminOnly: post.isAdminOnly,
      severity: post.severity ?? undefined,
      verificationStatus: post.verificationStatus ?? "unverified",
      requiresSensitiveReview: post.requiresSensitiveReview,
      contentRevision: post.contentRevision,
      entity: {
        name: post.reportedEntity.name,
        handles: post.reportedEntity.handles.map(({ handle }) => handle),
      },
      evidence: post.media.map((media) => ({
        id: media.id,
        mimeType: media.mimeType,
        fileSize: media.fileSize,
        isBlurred: media.isBlurred === true,
        evidenceCategory: media.evidenceCategory,
        caption: media.caption,
        sortOrder: media.sortOrder,
        viewerCanDelete:
          mayModerate || (mayEditOwn && media.uploaderId === user.id),
      })),
    },
    spaces: [{ ...post.space, role: role ?? "" }],
  };
}
