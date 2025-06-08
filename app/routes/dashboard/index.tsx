import { SearchBar } from "~/components/search-bar";
import { loginRedirect } from "~/lib/redirects";
import type { Post as PrismaPost, User as PrismaUser, Space as PrismaSpace, Media as PrismaMedia, ReportedEntity } from "~/generated/prisma"; // Added ReportedEntity
import { getSpacePosts } from "~/db/repositories/posts/queries.server";
import { getCurrentUser } from "~/services/auth.server";
import { useToastTrigger } from "~/hooks/use-toast-trigger";
import { useLoaderData } from "react-router";
import { useEffect } from "react";
import { usePostStore } from "~/stores/postStore";
import { getSession } from "~/services/session.server";
import type { ToastData } from "~/hooks/use-toast-trigger";
import { getUserById } from "~/db/repositories/users.server";
import { getAllPosts } from "~/db/repositories/posts/queries.server";
import { useInView } from 'react-intersection-observer';
import { usePostApi } from '~/services/api.client/posts';
import { Post } from "~/components/post";
import { type AuthorProfile, type SpaceInfo, type EvidenceMedia, type TPost } from "~/lib/types";
import { useUser } from "~/hooks/useUser";
import { getUserIdentity } from "~/lib/utils";

const DEFAULT_PAGE_LIMIT = 10; // Same as in loader

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

  const DEFAULT_PAGE_LIMIT = 10;
  let initialLoadResult;

  if (!completedUser?.isSuperAdmin) {
    initialLoadResult = await getSpacePosts(user.id, { limit: DEFAULT_PAGE_LIMIT, cursor: undefined });
  } else {
    initialLoadResult = await getAllPosts(user.id, { limit: DEFAULT_PAGE_LIMIT, cursor: undefined });
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
    isSuperAdmin // isSuperAdmin is already part of loader data
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

  const { getPosts: fetchPaginatedPosts, isLoading: apiIsLoading } = usePostApi();

  useToastTrigger(toastData);

  // This will be used for mapping posts
  const currentUserInfo: TPostCurrentUser = { // Explicitly type currentUserInfo
    id: user?.id,
    isSuperAdmin: user?.isSuperAdmin,
    role: user?.role?.toLowerCase() as "admin" | "moderator" | "user" || "user",
  };

  // Define a more specific type for posts coming from the loader/API
  type PrismaPostWithIncludes = PrismaPost & {
    author?: PrismaUser | null;
    media?: PrismaMedia[];
    space?: PrismaSpace | null;
    reportedEntity?: ReportedEntity | null;
    description?: string | null; // Ensure this matches your Prisma model or query
    // Prisma's Date fields are typically Date objects in Prisma Client,
    // but become ISO strings after JSON serialization in loaders/APIs.
    createdAt: string; // Assuming it's already a string from loader/API
    updatedAt?: string | null; // Assuming it's already a string
  };

  // Helper function to map Prisma Post to TPost
  const mapPrismaPostToTPost = (post: PrismaPostWithIncludes): TPost => ({
    id: post.id,
    author: post.author ? mapPrismaUserToAuthor(post.author) : {
      id: "unknown",
      name: "Unknown Author",
      username: "unknown",
      role: null,
    },
    createdAt: post.createdAt, // Already a string if serialized by loader/API
    content: post.description || "",
    media: mapPrismaMediaToEvidence(post.media),
    status: (post.status ? post.status.toLowerCase() : "published") as TPost['status'],
    reportedEntity: post.reportedEntity || undefined,
    space: post.space ? mapPrismaSpaceToSpaceInfo(post.space) : undefined,
    currentUser: currentUserInfo,
  });

  useEffect(() => {
    const mappedInitialPosts = initialPosts.map(p => mapPrismaPostToTPost(p as PrismaPostWithIncludes));
    setPosts(mappedInitialPosts, initialNextCursor, initialHasNextPage);
  }, [initialPosts, initialNextCursor, initialHasNextPage, setPosts, mapPrismaPostToTPost]); // Added mapPrismaPostToTPost

  const { ref, inView } = useInView({
    threshold: 0,
    triggerOnce: false,
  });

  useEffect(() => {
    if (inView && hasNextPage && !isLoadingMore && !apiIsLoading) {
      setIsLoadingMore(true);
      fetchPaginatedPosts(nextCursor ?? undefined, DEFAULT_PAGE_LIMIT)
        .then(response => {
          if (response.posts && !response.error) {
            const mappedNewPosts = response.posts.map(p => mapPrismaPostToTPost(p as PrismaPostWithIncludes));
            addPosts(mappedNewPosts, response.nextCursor, response.hasNextPage);
          } else if (response.error) {
            console.error("Failed to fetch more posts:", response.error);
            // Optionally show a toast or error message to the user
            setIsLoadingMore(false); // Reset loading state on error
          }
        })
        .catch(error => {
          console.error("Error fetching more posts:", error);
          // Optionally show a toast or error message
          setIsLoadingMore(false); // Reset loading state on error
        });
    }
  }, [inView, hasNextPage, isLoadingMore, nextCursor, fetchPaginatedPosts, addPosts, setIsLoadingMore, apiIsLoading, mapPrismaPostToTPost]); // Added mapPrismaPostToTPost to deps

  return (
    <div>
      <SearchBar />
      <div className="mt-4 space-y-6 sm:p-4 md:p-6 flex flex-col items-center w-full max-w-2xl mx-auto">
        {posts.map((post) => (
          <Post key={post.id} {...post} />
        ))}

        {/* Intersection Observer Trigger */}
        {hasNextPage && !isLoadingMore && !apiIsLoading && (
          <div ref={ref} style={{ height: '1px' }} /> // Invisible trigger
        )}

        {/* Loading Indicator */}
        {(isLoadingMore || (apiIsLoading && posts.length === 0)) && hasNextPage && ( // Show loader if loading more or initial API load for next page (when posts are empty)
          <div className="text-center py-4">
            <p>Chargement des posts...</p> {/* Or a spinner component */}
          </div>
        )}

        {/* End of list message */}
        {!hasNextPage && posts.length > 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <p>Vous avez atteint la fin de la liste.</p>
          </div>
        )}

        {/* Initial empty state message - only if no posts after initial load and not currently loading more */}
        {posts.length === 0 && !hasNextPage && !isLoadingMore && !apiIsLoading && (
           <p className="text-center text-lg font-semibold text-muted-foreground">Aucun post à afficher pour le moment.</p>
        )}
      </div>
    </div>
  );
}
