import { SearchBar } from "~/components/search-bar";
import { loginRedirect } from "~/lib/redirects";
import type { Post as PrismaPost, User as PrismaUser, Space as PrismaSpace, Media as PrismaMedia } from "~/generated/prisma";
import { getSpacePosts } from "~/db/repositories/posts/queries.server";
import { getCurrentUser } from "~/services/auth.server";
import { useToastTrigger } from "~/hooks/use-toast-trigger";
import { useLoaderData } from "react-router";
import { getSession } from "~/services/session.server";
import type { ToastData } from "~/hooks/use-toast-trigger";
import { getUserById } from "~/db/repositories/users.server";
import { getAllPosts } from "~/db/repositories/posts/queries.server";
import { Post } from "~/components/post";
import { type AuthorProfile, type SpaceInfo, type EvidenceMedia, type PostComponentProps, type EnhancedUser, USER_ROLES } from "~/lib/types";
import { useUser } from "~/hooks/useUser";

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
  let posts: PrismaPost[] = [];
  if (!user) {
    loginRedirect(request);
    throw new Error("User not found");
  }
  const completedUser = await getUserById(user.id, {
    isSuperAdmin: true,
  });
  if(!completedUser?.isSuperAdmin){
    posts = await getSpacePosts(user.id);
  } else {
    posts = await getAllPosts(user.id);
  }
  return { posts, toastData, isSuperAdmin: completedUser?.isSuperAdmin };
}

// Helper function to map Prisma User to AuthorProfile (adjust based on actual PrismaUser structure)
const mapPrismaUserToAuthor = (user: EnhancedUser /* Replace any with actual Prisma User type if available */): AuthorProfile => ({
  id: user.id,
  name: user.name || "Unknown Author",
  username: user.instagram || "unknown",
  role: user.role,
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
  const { toastData, posts, isSuperAdmin } = useLoaderData<typeof loader>();
  const user = useUser();
  useToastTrigger(toastData);
  const currentUserInfo = {
    id: user?.id,
    isSuperAdmin: user?.isSuperAdmin,
    role: user?.role?.toLowerCase() as "admin" | "moderator" | "user" || "user",
  };

  const mockOnDeletePost = (postId: string) => console.log(`FR: Supprimer le post: ${postId}`);
  const mockOnHidePost = (postId: string) => console.log(`FR: Masquer le post: ${postId}`);
  const mockOnUnhidePost = (postId: string) => console.log(`FR: Afficher le post: ${postId}`);

  const mappedPosts: PostComponentProps[] = posts.map((post: any /* Replace any with PrismaPost & relations */) => ({
    id: post.id,
    author: post.author ? mapPrismaUserToAuthor(post.author) : {
      id: "unknown",
      name: "Unknown Author",
      username: "unknown",
      role: "user",
    },
    createdAt: post.createdAt ? new Date(post.createdAt).toISOString() : new Date().toISOString(),
    content: post.description || "", // Assuming 'description' field holds the content
    media: mapPrismaMediaToEvidence(post.media), // Assuming 'media' is an array relation
    status: post.status ? post.status.toLowerCase() as PostComponentProps['status'] : "published", // Example mapping
    reportedUserInfo: undefined, // Assuming no reported user info from this query for now
    space: post.space ? mapPrismaSpaceToSpaceInfo(post.space) : undefined, // Assuming 'space' is a relation
    currentUser: currentUserInfo,
    onDeletePost: mockOnDeletePost,
    onHidePost: mockOnHidePost,
    onUnhidePost: mockOnUnhidePost,
  }));
  return (
    <div>
      <SearchBar />
      <div className="mt-4 space-y-6 sm:p-4 md:p-6 flex flex-col items-center w-full max-w-2xl mx-auto">
        {mappedPosts.length === 0 && (
          <p className="text-center text-lg font-semibold text-muted-foreground">Aucun post à afficher pour le moment.</p>
        )}
        {mappedPosts.map((post) => (
          <Post key={post.id} {...post} />
        ))}
      </div>
    </div>
  );
}
