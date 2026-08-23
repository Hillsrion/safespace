import { z } from "zod";

export const POST_FLAG_REASON_MAX_LENGTH = 1_000;
export const MODERATION_FLAGS_PAGE_LIMIT = 20;
export const MODERATION_FLAGS_MAX_PAGE_LIMIT = 100;

export const postFlagPathSchema = z
  .object({
    spaceId: z.string().uuid("Invalid space ID"),
    postId: z.string().uuid("Invalid post ID"),
  })
  .strict();

export const postFlagBodySchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(1, "Flag reason cannot be empty")
      .max(POST_FLAG_REASON_MAX_LENGTH)
      .optional(),
  })
  .strict();

export const moderationFlagsPathSchema = z
  .object({ spaceId: z.string().uuid("Invalid space ID") })
  .strict();

export const moderationFlagPathSchema = z
  .object({
    spaceId: z.string().uuid("Invalid space ID"),
    flagId: z.string().uuid("Invalid flag ID"),
  })
  .strict();

export const moderationFlagsQuerySchema = z
  .object({
    status: z
      .enum(["pending_review", "resolved", "rejected"])
      .default("pending_review"),
    cursor: z.string().uuid("Invalid cursor").optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MODERATION_FLAGS_MAX_PAGE_LIMIT)
      .default(MODERATION_FLAGS_PAGE_LIMIT),
  })
  .strict();

export const moderationDecisionSchema = z
  .object({ status: z.enum(["resolved", "rejected"]) })
  .strict();

export type CreatePostFlagInput = z.infer<typeof postFlagBodySchema> & {
  spaceId: string;
  postId: string;
};
export type ModerationFlagsQuery = z.infer<
  typeof moderationFlagsQuerySchema
> & { spaceId: string };
export type ModerationDecisionInput = z.infer<
  typeof moderationDecisionSchema
> & { spaceId: string; flagId: string };

export type PostFlagResponse = {
  id: string;
  postId: string;
  reason: string | null;
  status: "pending_review" | "resolved" | "rejected";
  createdAt: string;
  resolvedAt: string | null;
};

export type ModerationFlag = PostFlagResponse & {
  post: {
    id: string;
    description: string;
    isAnonymous: boolean;
    isAdminOnly: boolean;
    status: "active" | "hidden";
    createdAt: string;
    reportedEntity: {
      id: string;
      name: string;
      handles: Array<{ handle: string; platform: string }>;
    };
  };
};

export type ModerationQueueResponse = {
  flags: ModerationFlag[];
  nextCursor?: string;
  hasNextPage: boolean;
};
