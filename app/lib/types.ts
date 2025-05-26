import type { User } from "~/generated/prisma";

export type EnhancedUser = User & {
  name: string;
};

// User who created the post or is being reported
export type UserProfile = {
  id: string;
  name: string; // Full name or display name
  username: string; // Unique @username
  avatarUrl?: string; // URL to avatar image
  isVerified?: boolean; // Optional: if user is verified
  // Add other profile fields as necessary
};

// For authors, to determine if they have special roles
export type AuthorProfile = UserProfile & {
  isAdmin?: boolean;
  isModerator?: boolean;
};

// Represents an image or video evidence item in a post
export type EvidenceMedia = {
  id: string;
  url: string; // URL to the media
  type: "image" | "video"; // Type of media
  altText?: string; // Alt text for accessibility
  thumbnailUrl?: string; // Optional: for video previews or image thumbnails
};

// Information about a user being reported in a post
export type ReportedUserInfo = {
  user: UserProfile;
  platformUrl?: string; // e.g., Instagram profile link, Twitter profile link
  // Add other relevant details about the report context if needed
};

// Represents a "Space" or community where the post belongs
export type SpaceInfo = {
  id: string;
  name: string;
  url: string; // URL to the space (e.g., /spaces/space-name)
  // Optional: Add other space details like icon, description etc.
};

// Defines the structure for a Post
export type Post = {
  id: string;
  author: AuthorProfile; // The user who created the post
  createdAt: string; // ISO date string
  updatedAt?: string; // ISO date string, if updates are allowed
  content: string; // The main text content of the post
  media?: EvidenceMedia[]; // Array of images or videos
  status: "published" | "hidden" | "admin_only" | "pending_review"; // Post visibility status
  reportedUserInfo?: ReportedUserInfo; // Information about the user being reported
  space?: SpaceInfo; // The space this post belongs to
  tags?: string[]; // Optional: For categorizing or filtering posts
  // Analytics or interaction counts
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  // Who can perform actions on this post
  permissions: {
    canDelete: boolean;
    canHide: boolean;
    canEdit: boolean;
  };
};

// Props for the Post component, combining Post data with UI-specific state/roles
export type PostComponentProps = Omit<Post, 'permissions'> & {
  currentUser: {
    id: string;
    role: "admin" | "moderator" | "user"; // Role of the user viewing the post
  };
  // Actions - these would typically be functions passed down to the component
  onDeletePost?: (postId: string) => void;
  onHidePost?: (postId: string) => void;
  onUnhidePost?: (postId: string) => void;
  // Add other interaction handlers as needed, e.g., onLike, onComment, onReport
};
