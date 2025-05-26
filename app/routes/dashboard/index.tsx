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
import { type AuthorProfile, type SpaceInfo, type EvidenceMedia, type PostComponentProps } from "~/lib/types";

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
  let posts: Post[] = [];
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
  return { posts, toastData };
}

// Helper function to map Prisma User to AuthorProfile (adjust based on actual PrismaUser structure)
const mapPrismaUserToAuthor = (prismaUser: any /* Replace any with actual Prisma User type if available */): AuthorProfile => ({
  id: prismaUser.id,
  name: prismaUser.name || "Unknown Author",
  username: prismaUser.username || "unknown",
  avatarUrl: prismaUser.avatarUrl || undefined,
  isAdmin: prismaUser.role === 'ADMIN', // Example mapping
  isModerator: prismaUser.role === 'MODERATOR', // Example mapping
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


export default function Dashboard({ posts: prismaPosts = [], user }: { posts: PrismaPost[], user: any /* Replace any with actual User type from loader */ }) {
    const { toastData, posts } = useLoaderData<typeof loader>();
  useToastTrigger(toastData);
  const currentUserInfo = {
    id: user.id,
    // Assuming user object from loader has a 'role' field e.g. 'ADMIN', 'MODERATOR', 'USER'
    // Adjust this based on the actual structure of your user object
    role: user.role?.toLowerCase() as "admin" | "moderator" | "user" || "user",
  };

  const mockOnDeletePost = (postId: string) => console.log(`FR: Supprimer le post: ${postId}`);
  const mockOnHidePost = (postId: string) => console.log(`FR: Masquer le post: ${postId}`);
  const mockOnUnhidePost = (postId: string) => console.log(`FR: Afficher le post: ${postId}`);

  const mappedPosts: PostComponentProps[] = prismaPosts.map((post: any /* Replace any with PrismaPost & relations */) => ({
    id: post.id,
    author: post.author ? mapPrismaUserToAuthor(post.author) : mapPrismaUserToAuthor({id: "unknown", name: "Unknown Author", username: "unknown"}), // Handle missing author
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
      <div className="mt-4 space-y-6 p-4 md:p-6"> {/* Added some padding and spacing */}
        {mappedPosts.length === 0 && (
          <p className="text-center text-muted-foreground">Aucun post à afficher pour le moment.</p>
        )}
        {mappedPosts.map((post) => (
          <Post key={post.id} {...post} />
        ))}
      </div>
    </div>
  );
}
