import { Post, type PostComponentProps } from "~/components/post"; // Adjust path if necessary
import { type AuthorProfile, type EvidenceMedia, type ReportedUserInfo, type SpaceInfo } from "~/lib/types"; // Adjust path

// Mock Data
const mockUser1: AuthorProfile = {
  id: "user1",
  name: "Jane Doe",
  username: "janedoe",
  avatarUrl: "https://via.placeholder.com/150/0000FF/808080?Text=JD",
  isAdmin: false,
  isModerator: true,
};

const mockUser2: AuthorProfile = {
  id: "user2",
  name: "John Smith",
  username: "johnsmith",
  avatarUrl: "https://via.placeholder.com/150/FF0000/FFFFFF?Text=JS",
  isAdmin: true,
  isModerator: false,
};

const mockCurrentUser = { // Current user viewing the posts
    id: "currentUser1",
    role: "admin" as "admin" | "moderator" | "user",
};

const mockCurrentUserAuthor: AuthorProfile = {
    id: "currentUserAuthor",
    name: "Current Author User",
    username: "currentauthor",
    avatarUrl: "https://via.placeholder.com/150/00FF00/FFFFFF?Text=CAU",
};

const mockSpace: SpaceInfo = {
  id: "space1",
  name: "Nature Lovers",
  url: "/spaces/nature-lovers",
};

const mockReportedUser: ReportedUserInfo = {
  user: {
    id: "reportedUser1",
    name: "Scammer Joe",
    username: "scammerjoe",
  },
  platformUrl: "https://instagram.com/scammerjoe",
};

const mockMedia: EvidenceMedia[] = [
  { id: "media1", url: "https://via.placeholder.com/600x400/cccccc/808080?Text=Evidence+1", type: "image", altText: "Evidence image 1" },
  { id: "media2", url: "https://via.placeholder.com/600x400/dddddd/808080?Text=Evidence+2", type: "image", altText: "Evidence image 2" },
  { id: "media3", url: "https://via.placeholder.com/600x400/eeeeee/808080?Text=Evidence+3", type: "image", altText: "Evidence image 3" },
];

const postsData: PostComponentProps[] = [
  {
    id: "post1",
    author: mockUser1,
    createdAt: new Date().toISOString(),
    content: "This is a post by a moderator with multiple images and a reported user. Status: Published.",
    media: mockMedia,
    status: "published",
    reportedUserInfo: mockReportedUser,
    space: mockSpace,
    currentUser: mockCurrentUser, // Admin is viewing
    onDeletePost: (postId) => console.log(`Delete post: ${postId}`),
    onHidePost: (postId) => console.log(`Hide post: ${postId}`),
  },
  {
    id: "post2",
    author: mockUser2, // This user is an Admin
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago
    content: "This is a post by an admin. Status: Admin Only. No images, no reported user, no space.",
    status: "admin_only",
    currentUser: mockCurrentUser, // Admin is viewing
    onDeletePost: (postId) => console.log(`Delete post: ${postId}`),
    onHidePost: (postId) => console.log(`Hide post: ${postId}`),
  },
  {
    id: "post3",
    author: mockCurrentUserAuthor, // Current user is the author
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(), // 5 days ago
    content: "This is my own post. Status: Hidden. I should be able to delete it.",
    media: [mockMedia[0]],
    status: "hidden",
    currentUser: {id: mockCurrentUserAuthor.id, role: "user"}, // Author (user role) is viewing
    onDeletePost: (postId) => console.log(`Delete post: ${postId}`),
    onHidePost: (postId) => console.log(`Hide post: ${postId}`),
    onUnhidePost: (postId) => console.log(`Unhide post: ${postId}`),
  },
   {
    id: "post4",
    author: mockUser1,
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(), // 10 days ago
    content: "A simple published post by a moderator, viewed by a regular user who is not the author.",
    status: "published",
    currentUser: {id: "someOtherUser", role: "user"}, // Regular user (non-author) is viewing
    onDeletePost: (postId) => console.log(`Delete post: ${postId}`),
    onHidePost: (postId) => console.log(`Hide post: ${postId}`),
  },
];

export default function PostsExamplePage() {
  return (
    <div className="container mx-auto p-4 space-y-8">
      <h1 className="text-2xl font-bold mb-6">Post Component Examples</h1>
      {postsData.map((post) => (
        <Post key={post.id} {...post} />
      ))}
    </div>
  );
}
