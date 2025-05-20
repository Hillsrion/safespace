import type { User } from "~/generated/prisma";

export type EnhancedUser = User & {
  name: string;
};
