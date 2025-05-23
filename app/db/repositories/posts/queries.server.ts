import { prisma } from "~/db/client.server";
import type { Post, PostStatus,  PostSeverity, Prisma } from "~/generated/prisma";
import { getUserById } from "../users.server";

type GetUserPostsOptions = {
  status?: PostStatus;
  limit?: number;
  cursor?: string;
  includeHidden?: boolean;
};

type GetSpacePostsOptions = GetUserPostsOptions & {
  spaceId?: string;
};

export async function getUserPosts(
  userId: string,
  options: GetUserPostsOptions = {}
) {
  const {
    status = "active",
    limit = 20,
    cursor,
    includeHidden = false,
  } = options;

  return prisma.post.findMany({
    where: {
      authorId: userId,
      status: includeHidden ? undefined : status,
    },
    include: {
      reportedEntity: true,
      media: true,
      author: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
  });
}

export async function getTotalPosts() {
  return prisma.post.count();
}

export type CreatePostData = {
  name: string; // For ReportedEntity
  instagramHandle: string; // For ReportedEntityHandle
  description: string;
  severity: PostSeverity;
  isAnonymous: boolean;
  isAdminOnly: boolean;
  authorId: string | null; // Required for entity/media creation, null for anonymous post author
  spaceId: string;
  evidence?: Array<{ // Changed to Array for multiple files
    filePath: string; // This will be the R2 key
    fileName: string;
    mimeType: string;
    fileSize: number;
  }>; // Optional, might be undefined or empty array
};

export async function createPost(data: CreatePostData): Promise<Post> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let reportedEntity: PostCreateReportedEntity; // Define type for reportedEntity based on Prisma schema relation or select

    // Define a subset of ReportedEntity that Post model expects, or use Prisma.ReportedEntityCreateNestedOneWithoutPostsInput related type
    // For simplicity, we'll ensure reportedEntity has at least an `id`.
    type PostCreateReportedEntity = { id: string; name: string; spaceId: string; /* other fields if needed */ };


    // 1. Search by Handle
    const existingHandle = await tx.reportedEntityHandle.findFirst({
      where: {
        handle: data.instagramHandle,
        reportedEntity: {
          spaceId: data.spaceId,
        },
      },
      include: {
        reportedEntity: true, // Include the parent ReportedEntity
      },
    });

    if (existingHandle) {
      reportedEntity = existingHandle.reportedEntity;
    } else {
      // 2. If Not Found by Handle (Fallback to Name/Create)
      let entityByName = await tx.reportedEntity.findFirst({
        where: {
          name: data.name,
          spaceId: data.spaceId,
        },
      });

      if (entityByName) {
        // Entity found by name, but handle was not. Link the new handle.
        await tx.reportedEntityHandle.create({
          data: {
            reportedEntityId: entityByName.id,
            handle: data.instagramHandle,
            platform: "Instagram",
          },
        });
        reportedEntity = entityByName;
      } else {
        // Neither handle nor name exists in this space. Create new Entity and Handle.
        if (!data.authorId) {
          throw new Error("User ID is required to create a new reported entity when it does not exist.");
        }
        const newEntity = await tx.reportedEntity.create({
          data: {
            name: data.name,
            spaceId: data.spaceId,
            addedByUserId: data.authorId, 
          },
        });
        await tx.reportedEntityHandle.create({
          data: {
            reportedEntityId: newEntity.id,
            handle: data.instagramHandle,
            platform: "Instagram",
          },
        });
        reportedEntity = newEntity;
      }
    }

    // Ensure reportedEntity is defined before proceeding
    if (!reportedEntity) {
        // This should ideally not be reached if logic above is correct
        throw new Error("Failed to find or create a reported entity.");
    }
    
    // 3. Create Post
    const post = await tx.post.create({
      data: {
        spaceId: data.spaceId,
        authorId: data.isAnonymous ? null : data.authorId,
        reportedEntityId: reportedEntity.id,
        description: data.description,
        severity: data.severity,
        isAnonymous: data.isAnonymous,
        isAdminOnly: data.isAdminOnly,
        status: 'active', // Default status, as per schema or common practice
        // verificationStatus can be defaulted by Prisma or set if needed, e.g., 'unverified'
      },
    });

    // 4. Create Media if evidence is provided (now an array)
    if (data.evidence && data.evidence.length > 0) {
      if (!data.authorId) {
        // This logic remains: if evidence is present, authorId is needed for uploaderId.
        // This implies anonymous users (where authorId is null) cannot upload media.
        // If isAnonymous is true, data.authorId is already null.
        // The main concern is if isAnonymous is false but data.authorId is still null.
        if (!data.isAnonymous) { // Non-anonymous post but authorId somehow became null
            console.warn("Evidence provided for non-anonymous post, but authorId is missing. Media not created.");
        } else { // Anonymous post, authorId is correctly null
             console.warn("Evidence provided for anonymous post. Media uploads by anonymous users are currently not supported as uploaderId is required. Media not created.");
        }
      } else {
        // data.authorId is available, proceed to create media records for each file
        const mediaToCreate = data.evidence.map(ev => ({
          postId: post.id,
          uploaderId: data.authorId!, // Assert authorId is non-null here due to the check above
          storageKey: ev.filePath,    // This is the R2 key
          fileName: ev.fileName,
          mimeType: ev.mimeType,
          fileSize: ev.fileSize,
          // metadataStripped and isBlurred can be defaulted by Prisma or set as needed
        }));

        if (mediaToCreate.length > 0) {
          await tx.media.createMany({
            data: mediaToCreate,
          });
        }
      }
    }
    
    // Return the created post.
    // To match Promise<Post>, we return the post object.
    // If relations are needed by the caller, this can be a findUnique call.
    // For now, the created post object itself is returned.
    return post;
  });
}

export async function getSpacePosts(
  userId: string,
  options: GetSpacePostsOptions = {}
) {
  const {
    status = "active",
    limit = 20,
    cursor,
    includeHidden = false,
    spaceId,
  } = options;

  // First, get all spaces the user is a member of
  const userSpaces = await prisma.userSpaceMembership.findMany({
    where: { userId },
    select: { spaceId: true },
  });

  const spaceIds = userSpaces.map((us: { spaceId: string }) => us.spaceId);

  if (spaceIds.length === 0) {
    return [];
  }

  return prisma.post.findMany({
    where: {
      spaceId: spaceId ? spaceId : { in: spaceIds },
      status: includeHidden ? undefined : status,
      OR: [
        { isAdminOnly: false }, // Public posts
        {
          isAdminOnly: true,
          space: {
            memberships: {
              some: {
                userId,
                role: { in: ["ADMIN", "MODERATOR"] },
              },
            },
          },
        }, // Admin-only posts in spaces where user is admin/moderator
      ],
    },
    include: {
      reportedEntity: true,
      media: true,
      author: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      space: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
  });
}

// NOTE: This function is so critical that it should be protected by a super admin check
export async function getAllPosts(userId: string) {
  const user = await getUserById(userId, {
    isSuperAdmin: true,
  });
  if (user?.isSuperAdmin) {
    return prisma.post.findMany({
      include: {
        reportedEntity: true,
        media: true,
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        space: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  } else {
    return [];
  }
}
