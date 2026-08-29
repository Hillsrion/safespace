import { z } from "zod";

export const spaceInviteParamsSchema = z
  .object({ spaceId: z.string().uuid() })
  .strict();

export const spaceInviteBodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    role: z.enum(["READ_ONLY", "EDITOR", "MODERATOR", "ADMIN"]),
  })
  .strict();

export type SpaceInviteInput = z.infer<typeof spaceInviteBodySchema>;
