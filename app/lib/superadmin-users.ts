import { z } from "zod";

export const ADMIN_USER_PAGE_MAX_LIMIT = 100;
export const ADMIN_USER_SEARCH_MAX_LENGTH = 100;

export const adminUserListQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(ADMIN_USER_PAGE_MAX_LIMIT)
      .default(50),
    q: z
      .string()
      .trim()
      .min(1)
      .max(ADMIN_USER_SEARCH_MAX_LENGTH)
      .optional(),
    isSuperAdmin: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    spaceId: z.string().uuid().optional(),
    role: z.enum(["READ_ONLY", "EDITOR", "MODERATOR", "ADMIN"]).optional(),
  })
  .strict();

export const adminUserParamsSchema = z
  .object({ userId: z.string().uuid() })
  .strict();

export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;
