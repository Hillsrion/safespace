import { SearchBar } from "~/components/search-bar";
import { loginRedirect } from "~/lib/redirects";
import type { Post as PrismaPost, User as PrismaUser, Space as PrismaSpace, Media as PrismaMedia, ReportedEntity } from "~/generated/prisma"; // Added ReportedEntity
import { getSpacePosts } from "~/db/repositories/posts/queries.server";
import { getCurrentUser } from "~/services/auth.server";
import { useToastTrigger } from "~/hooks/use-toast-trigger";
import { useLoaderData } from "react-router";
import { useCallback, useEffect, useMemo } from "react";
import { usePostStore } from "~/stores/postStore";
import { getSession } from "~/services/session.server";
import type { ToastData } from "~/hooks/use-toast-trigger";
import { getUserById } from "~/db/repositories/users.server";
import { getAllPosts } from "~/db/repositories/posts/queries.server";
import { useInView } from 'react-intersection-observer';
import { usePostFeedApi } from '~/services/api.client/posts';
import { Post } from "~/components/post";
import { type AuthorProfile, type SpaceInfo, type EvidenceMedia, type TPost, TPostCurrentUser } from "~/lib/types";
import { useUser } from "~/hooks/useUser";
import { getUserIdentity } from "~/lib/utils";
import { handleError } from "~/lib/error";
import { POSTS_PAGE_LIMIT } from "~/lib/constants";

export function meta() {
  return [{ title: "Dashboard" }];
}

export const handle = {
  crumb: "Tableau de bord"
};

export async function loader({ request }: { request: Request }) {
  const user = await getCurrentUser(request);
  const session = await getSession(request);
  const toastData = session.get("toast") as ToastData | null;

  if (!user) {
    loginRedirect(request);
    // This throw will be caught by Remix's error boundary if loginRedirect doesn't stop execution.
    // Ensure loginRedirect actually throws a redirect.
    throw new Error("User not found and redirect failed.");
  }

  const completedUser = await getUserById(user.id, {
    isSuperAdmin: true,
  });

  let initialLoadResult;

  if (!completedUser?.isSuperAdmin) {
    initialLoadResult = await getSpacePosts(user.id, { limit: POSTS_PAGE_LIMIT });
  } else {
    initialLoadResult = await getAllPosts(user.id, { limit: POSTS_PAGE_LIMIT });
  }

  return {
    initialPosts: initialLoadResult.posts,
    initialNextCursor: initialLoadResult.nextCursor,
    initialHasNextPage: initialLoadResult.hasNextPage,
    toastData,
    isSuperAdmin: completedUser?.isSuperAdmin
  };
}

// Helper function to map Prisma User to AuthorProfile (adjust based on actual PrismaUser structure)
const mapPrismaUserToAuthor = (user: PrismaUser /* Replace any with actual Prisma User type if available */): AuthorProfile => ({
  id: user.id,
  name: getUserIdentity(user) || "Unknown Author",
  username: user.instagram || "unknown",
  role: null
});

// Helper function to map Prisma Media to EvidenceMedia
const mapPrismaMediaToEvidence = (prismaMedia: any[] | undefined /* Replace any with actual Prisma Media type */): EvidenceMedia[] => {
  if (!prismaMedia) return [];
  return prismaMedia.map(m => ({
    id: m.id,
    url: m.url,
    type: m.type === 'VIDEO' ? 'video' : 'image', // Example mapping
    altText: m.altText || `Media ${m.id}`,
  }));
};

// Helper function to map Prisma Space to SpaceInfo
const mapPrismaSpaceToSpaceInfo = (prismaSpace: any /* Replace any with actual Prisma Space type */): SpaceInfo | undefined => {
    if (!prismaSpace) return undefined;
    return {
        id: prismaSpace.id,
        name: prismaSpace.name || "Unknown Space",
        url: `/spaces/${prismaSpace.id}`, // Example URL structure
    };
};


export default function Dashboard() {
  const {
    initialPosts,
    initialNextCursor,
    initialHasNextPage,
    toastData,
  } = useLoaderData<typeof loader>();

  const user = useUser(); // For currentUserInfo
  const {
    posts,
    setPosts,
    addPosts,
    nextCursor,
    hasNextPage,
    isLoadingMore,
    setIsLoadingMore
  } = usePostStore();

  const { getPosts: fetchPaginatedPosts, isLoading: apiIsLoading } = usePostFeedApi();

  useToastTrigger(toastData);

  const currentUserInfo = useMemo(() => ({
    id: user?.id,
    isSuperAdmin: user?.isSuperAdmin,
    role: (user?.role?.toLowerCase() as "admin" | "moderator" | "user") || "user",
  }), [user?.id, user?.isSuperAdmin, user?.role]);

  type PrismaPostWithIncludes = PrismaPost & {
    author?: PrismaUser | null;
    media?: PrismaMedia[];
    space?: PrismaSpace | null;
    reportedEntity?: ReportedEntity | null;
    description?: string | null;
    createdAt: string;
    updatedAt?: string | null;
  };

  const mapPrismaPostToTPost = useCallback((post: any, currentUser: TPostCurrentUser): TPost => {
    const typedPost = post as PrismaPostWithIncludes;
    return {
      id: typedPost.id,
      author: typedPost.author ? mapPrismaUserToAuthor(typedPost.author) : {
        id: "unknown",
        name: "Unknown Author",
        username: "unknown",
        role: null,
      },
      createdAt: typedPost.createdAt,
      content: typedPost.description || "",
      media: mapPrismaMediaToEvidence(typedPost.media),
      status: (typedPost.status ? typedPost.status.toLowerCase() : "published") as TPost['status'],
      reportedEntity: typedPost.reportedEntity || undefined,
      space: typedPost.space ? mapPrismaSpaceToSpaceInfo(typedPost.space) : undefined,
      currentUser,
    };
  }, []);

  useEffect(() => {
    if (initialPosts.length > 0) {
      const mappedInitialPosts = initialPosts.map(p => 
        mapPrismaPostToTPost(p, currentUserInfo)
      );
      setPosts(mappedInitialPosts, initialNextCursor, initialHasNextPage);
    }
  }, []);

  const { ref, inView } = useInView({
    threshold: 0,
    triggerOnce: false,
  });

  useEffect(() => {
    if (inView && hasNextPage && !isLoadingMore && !apiIsLoading) {
      setIsLoadingMore(true);
      fetchPaginatedPosts(nextCursor ?? "", POSTS_PAGE_LIMIT)
        .then(response => {
          if (response.data && response.data.posts && !response.error) {
            const mappedNewPosts = response.data.posts.map(p => 
              mapPrismaPostToTPost(p, currentUserInfo)
            );
            addPosts(mappedNewPosts, response.data.nextCursor, response.data.hasNextPage);
          } else if (response.error) {
            handleError(response.error);
            setIsLoadingMore(false);
          }
        })
        .catch(error => {
          handleError(error);
          setIsLoadingMore(false);
        });
    }
  }, [inView]);

  return (
    <div>
      <SearchBar />
      <div className="mt-4 space-y-6 sm:p-4 md:p-6 flex flex-col items-center w-full max-w-2xl mx-auto">
        {posts.map((post) => (
          <Post key={post.id} {...post} />
        ))}

        {hasNextPage && !isLoadingMore && !apiIsLoading && (
          <div ref={ref} className="h-px" />
        )}

        {(isLoadingMore || (apiIsLoading && posts.length === 0)) && hasNextPage && (
          <div className="text-center py-4">
            <p>Chargement des posts...</p>
          </div>
        )}

        {!hasNextPage && posts.length > 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <p>Vous avez atteint la fin de la liste.</p>
          </div>
        )}

        {posts.length === 0 && !hasNextPage && !isLoadingMore && !apiIsLoading && (
           <p className="text-center text-lg font-semibold text-muted-foreground">Aucun post à afficher pour le moment.</p>
        )}
      </div>
    </div>
  );
}
