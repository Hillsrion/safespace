// Import PostSeverity from Prisma client
import type { PostSeverity } from "@prisma/client"; // Or from '~/generated/prisma' if re-exported

// Old Severity enum and SEVERITY_LEVELS constant are removed.

export interface Space {
  id: string;
  name: string;
}

export interface SortOptions {
  orderBy: 'date' | 'severity' | 'title'; // 'severity' here is a string literal, not the enum type
  orderDirection: 'asc' | 'desc';
  groupBySpace: boolean;
}

export interface FilterState {
  searchTerm: string;
  severity: PostSeverity | null; // Updated to use PostSeverity
  spaceIds: string[];
  myPostsOnly: boolean;
  adminOnly: boolean;
  sortOptions: SortOptions;
  // Results and loading are typically runtime states within the hook,
  // not part of this definition of storable/transmittable filter state.
}
