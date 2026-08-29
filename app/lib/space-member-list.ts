import { z } from "zod";

export const SPACE_MEMBER_PAGE_MAX = 100;
export const SPACE_MEMBER_PAGE_SIZE_MAX = 100;

export const spaceMemberListParamsSchema = z
  .object({ spaceId: z.string().uuid() })
  .strict();

export const spaceMemberListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(SPACE_MEMBER_PAGE_MAX).default(1),
    limit: z.coerce.number().int().min(1).max(SPACE_MEMBER_PAGE_SIZE_MAX).default(25),
    q: z.string().trim().min(1).max(100).optional(),
    role: z.enum(["READ_ONLY", "EDITOR", "MODERATOR", "ADMIN"]).optional(),
  })
  .strict();

export type SpaceMemberListQuery = z.infer<typeof spaceMemberListQuerySchema>;
