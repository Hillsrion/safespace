import { loginRedirect } from "~/lib/redirects";
import type { Post as PrismaPost, User as PrismaUser, Space as PrismaSpace, Media as PrismaMedia, ReportedEntity } from "~/generated/prisma"; // Added ReportedEntity
import { getSpacePosts } from "~/db/repositories/posts/queries.server";
import { getCurrentUser } from "~/services/auth.server";
import { useToastTrigger } from "~/hooks/use-toast-trigger";
import { data, Link, useLoaderData } from "react-router";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePostStore } from "~/stores/postStore";
import { getSession } from "~/services/session.server";
import type { ToastData } from "~/hooks/use-toast-trigger";
import { getUserById } from "~/db/repositories/users.server";
import { getAllPosts } from "~/db/repositories/posts/queries.server";
import { useInView } from 'react-intersection-observer';
import { usePostFeedApi } from '~/services/api.client/posts';
import { Post } from "~/components/post";
import { type AuthorProfile, type SpaceInfo, type TPost, TPostCurrentUser } from "~/lib/types";
import { toEvidenceMedia } from "~/lib/evidence";
import { useUser } from "~/hooks/useUser";
import { getUserIdentity } from "~/lib/utils";
import { handleError } from "~/lib/error";
import { POSTS_PAGE_LIMIT } from "~/lib/constants";
import { getUserSpaces } from "~/db/repositories/spaces/queries.server";
import {
  clearLastVisitedSpaceCookie,
  getLastVisitedSpaceId,
  selectAccessibleLastVisitedSpace,
} from "~/lib/last-visited-space";

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

  const requestedSpaceId = new URL(request.url).searchParams.get("spaceId");
  const showAllSpaces = requestedSpaceId === "all";
  const lastVisitedSpaceId = getLastVisitedSpaceId(request.headers.get("Cookie"));
  const spaces = await getUserSpaces(user.id);
  const requestedSpace = selectAccessibleLastVisitedSpace(requestedSpaceId, spaces);
  if (requestedSpaceId && !showAllSpaces && !requestedSpace) {
    throw new Response("Espace introuvable", { status: 404 });
  }
  const lastVisitedSpace = selectAccessibleLastVisitedSpace(lastVisitedSpaceId, spaces);
  const selectedSpace = showAllSpaces ? null : requestedSpace ?? lastVisitedSpace;
  const selectedSpaceId = selectedSpace?.id;

  let initialLoadResult;

  if (!completedUser?.isSuperAdmin) {
    initialLoadResult = await getSpacePosts(user.id, {
      limit: POSTS_PAGE_LIMIT,
      spaceId: selectedSpaceId,
    });
  } else {
    initialLoadResult = await getAllPosts(user.id, {
      limit: POSTS_PAGE_LIMIT,
      spaceId: selectedSpaceId,
    });
  }

  const headers = new Headers();
  if (lastVisitedSpaceId && !lastVisitedSpace) {
    // The space was removed or access was revoked; stop retrying that stale preference.
    headers.set("Set-Cookie", clearLastVisitedSpaceCookie());
  }

  return data({
    initialPosts: initialLoadResult.posts,
    initialNextCursor: initialLoadResult.nextCursor,
    initialHasNextPage: initialLoadResult.hasNextPage,
    toastData,
    isSuperAdmin: completedUser?.isSuperAdmin,
    selectedSpaceId,
    selectedSpaceName: selectedSpace?.name,
  }, { headers });
}

// Helper function to map Prisma User to AuthorProfile (adjust based on actual PrismaUser structure)
const mapPrismaUserToAuthor = (user: PrismaUser /* Replace any with actual Prisma User type if available */): AuthorProfile => ({
  id: user.id,
  name: getUserIdentity(user) || "Unknown Author",
  username: user.instagram || "unknown",
  role: null
});

// Helper function to map Prisma Space to SpaceInfo
const mapPrismaSpaceToSpaceInfo = (prismaSpace: any /* Replace any with actual Prisma Space type */): SpaceInfo | undefined => {
    if (!prismaSpace) return undefined;
    return {
        id: prismaSpace.id,
        name: prismaSpace.name || "Unknown Space",
        url: `/dashboard?spaceId=${encodeURIComponent(prismaSpace.id)}`,
    };
};


export default function Dashboard() {
  const {
    initialPosts,
    initialNextCursor,
    initialHasNextPage,
    toastData,
    selectedSpaceId,
    selectedSpaceName,
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
  const feedGeneration = useRef(0);

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
    viewerCanEdit?: boolean;
    viewerCanDelete?: boolean;
    viewerCanModerate?: boolean;
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
      media: toEvidenceMedia(typedPost.media),
      status: typedPost.status === "hidden"
        ? "hidden"
        : typedPost.isAdminOnly
          ? "admin_only"
          : "published",
      severity: typedPost.severity,
      verificationStatus: typedPost.verificationStatus,
      requiresSensitiveReview: typedPost.requiresSensitiveReview,
      reportedEntity: typedPost.reportedEntity || undefined,
      space: typedPost.space ? mapPrismaSpaceToSpaceInfo(typedPost.space) : undefined,
      currentUser,
      viewerCanEdit: typedPost.viewerCanEdit === true,
      viewerCanDelete: typedPost.viewerCanDelete === true,
      viewerCanModerate: typedPost.viewerCanModerate === true,
    };
  }, []);

  useEffect(() => {
    feedGeneration.current += 1;
    const mappedInitialPosts = initialPosts.map(p =>
      mapPrismaPostToTPost(p, currentUserInfo)
    );
    setPosts(mappedInitialPosts, initialNextCursor, initialHasNextPage);
    return () => { feedGeneration.current += 1; };
  }, [initialPosts, initialNextCursor, initialHasNextPage, selectedSpaceId, currentUserInfo, mapPrismaPostToTPost, setPosts]);

  const { ref, inView } = useInView({
    threshold: 0,
    triggerOnce: false,
  });

  useEffect(() => {
    const currentFeed = usePostStore.getState();
    if (inView && currentFeed.hasNextPage && !currentFeed.isLoadingMore) {
      const generation = feedGeneration.current;
      setIsLoadingMore(true);
      fetchPaginatedPosts(currentFeed.nextCursor ?? "", POSTS_PAGE_LIMIT, selectedSpaceId)
        .then(response => {
          // A response from a previously selected space must never enter the
          // new feed, even if that older request finishes after navigation.
          if (generation !== feedGeneration.current) return;
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
          if (generation !== feedGeneration.current) return;
          handleError(error);
          setIsLoadingMore(false);
        });
    }
  }, [inView, nextCursor, selectedSpaceId]);

  return (
    <div>
      <div className="mx-auto mt-6 flex w-full max-w-2xl items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{selectedSpaceName ?? "Tous mes espaces"}</h1>
        {selectedSpaceId && <Link className="text-sm underline" to="/dashboard?spaceId=all">Tous mes espaces</Link>}
      </div>
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
