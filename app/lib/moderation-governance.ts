import { z } from "zod";
import { hasUnfilledModerationTemplate } from "./moderation-templates";

export const GOVERNANCE_REASON_MAX_LENGTH = 2_000;
export const GOVERNANCE_PAGE_LIMIT = 25;
export const GOVERNANCE_MAX_PAGE_LIMIT = 100;

const uuid = z.string().uuid();
const reason = z.string().trim().min(1).max(GOVERNANCE_REASON_MAX_LENGTH)
  .refine((value) => !hasUnfilledModerationTemplate(value), "Complete the moderation template before submitting");

export const moderationSpacePathSchema = z.object({ spaceId: uuid }).strict();
export const moderationAppealPathSchema = z
  .object({ spaceId: uuid, appealId: uuid })
  .strict();
export const disciplinePathSchema = z
  .object({ spaceId: uuid, disciplineId: uuid })
  .strict();
export const memberHistoryPathSchema = z
  .object({ spaceId: uuid, userId: uuid })
  .strict();

export const createAppealSchema = z
  .object({ flagId: uuid, reason })
  .strict();

export const appealDecisionSchema = z
  .object({
    status: z.enum(["upheld", "overturned"]),
    decisionNote: reason,
  })
  .strict();

export const appealsQuerySchema = z
  .object({
    status: z.enum(["pending", "upheld", "overturned"]).default("pending"),
    cursor: uuid.optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(GOVERNANCE_MAX_PAGE_LIMIT)
      .default(GOVERNANCE_PAGE_LIMIT),
  })
  .strict();

export const createDisciplineSchema = z
  .object({
    userId: uuid,
    reason,
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .transform((value) => ({
    ...value,
    expiresAt: value.expiresAt ? new Date(value.expiresAt) : undefined,
  }));

export const revokeDisciplineSchema = z
  .object({ revocationReason: reason })
  .strict();

export type CreateAppealInput = z.infer<typeof createAppealSchema>;
export type AppealDecisionInput = z.infer<typeof appealDecisionSchema>;
export type AppealsQuery = z.infer<typeof appealsQuerySchema>;
export type CreateDisciplineInput = z.infer<typeof createDisciplineSchema>;
export type RevokeDisciplineInput = z.infer<typeof revokeDisciplineSchema>;
