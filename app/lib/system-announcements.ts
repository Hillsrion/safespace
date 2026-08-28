import { z } from "zod";

export const SYSTEM_ANNOUNCEMENT_MAX_LENGTH = 4_000;

const content = z
  .string()
  .trim()
  .min(1)
  .max(SYSTEM_ANNOUNCEMENT_MAX_LENGTH)
  .refine((value) => !/<\/?[a-z][^>]*>/i.test(value), {
    message: "Announcements must be plain text",
  });
const date = z.string().datetime({ offset: true }).transform((value) => new Date(value));

export const createSystemAnnouncementSchema = z
  .object({ content, publishedAt: date, expiresAt: date.nullable().optional().default(null) })
  .strict()
  .superRefine(({ publishedAt, expiresAt }, context) => {
    if (expiresAt && expiresAt <= publishedAt) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "Expiry must be after publication" });
    }
  });

export const updateSystemAnnouncementSchema = z
  .object({ content: content.optional(), publishedAt: date.optional(), expiresAt: date.nullable().optional() })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const systemAnnouncementParamsSchema = z.object({ announcementId: z.string().uuid() }).strict();
export type CreateSystemAnnouncementInput = z.infer<typeof createSystemAnnouncementSchema>;
export type UpdateSystemAnnouncementInput = z.infer<typeof updateSystemAnnouncementSchema>;
