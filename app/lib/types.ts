import type { User } from "@prisma/client";

export type EnhancedUser = User & {
  name: string;
};
