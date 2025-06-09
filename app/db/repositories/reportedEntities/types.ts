import type {
  AuthorProfile,
  EvidenceMedia,
  SpaceInfo,
  TPost // For reference, aiming for compatibility
} from "~/lib/types";
import type { ReportedEntity as PrismaReportedEntity, Post as PrismaPost, User as PrismaUser, Space as PrismaSpace } from "~/generated/prisma"; // Assuming default Prisma client export location

// Represents the structure of the author data as selected in getReportedEntityPosts
type PostAuthor = Pick<AuthorProfile, "id" | "name" | "username" | "avatarUrl" | "role">;
// Represents the structure of the space data as selected
type PostSpace = Pick<SpaceInfo, "id" | "name"> & { url?: string }; // url might be constructed
// Represents the structure of the reported entity data within a post
type PostReportedEntity = PrismaReportedEntity & { handles: Array<{ id: string; handle: string }> };


export type ReportedEntityWithHandles = PrismaReportedEntity & {
  // Add other ReportedEntity fields here if not covered by PrismaReportedEntity
  handles: Array<{ id: string; handle: string; platform?: string }>; // Added platform to handle
};

// This type now reflects the richer post object returned by getReportedEntityPosts
// It should be very similar to TPost, but derived from what the query actually returns.
export type ReportedEntityPost = Omit<PrismaPost, "authorId" | "userId" | "reportedEntityId" | "spaceId" | "createdAt" | "updatedAt"> & {
  // Overwrite or add included fields:
  author: PostAuthor;
  space?: PostSpace | null; // Prisma returns null for missing optional relations
  media: EvidenceMedia[]; // Assuming 'media' relation on Post model fetches these fields
  reportedEntity?: PostReportedEntity | null; // The entity reported in the post itself

  // Ensure fields from TPost are present, potentially transformed by the mapping step in queries.server.ts
  createdAt: string; // Now a string due to toISOString()
  updatedAt?: string | null; // Now a string due to toISOString()

  // Fields from PrismaPost like content, status, etc., are inherited.
  // We omit the foreign key IDs if the full object is present.
};

// For type checking, this should ideally be true or very close:
// const _check: ReportedEntityPost = {} as TPost; // This would fail if not compatible
// const _check2: TPost = {} as ReportedEntityPost; // This would also fail if not compatible
// The goal is to make them as interchangeable as possible.
