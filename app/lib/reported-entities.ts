import { z } from "zod";

export const REPORTED_ENTITY_ADMIN_PAGE_MAX_LIMIT = 100;
export const REPORTED_ENTITY_PLATFORM_MAX_LENGTH = 50;
export const REPORTED_ENTITY_ADMIN_HANDLE_MAX_LENGTH = 200;
export const REPORTED_ENTITY_ADMIN_HANDLES_MAX_COUNT = 20;
export const REPORTED_ENTITY_ADMIN_NAME_MAX_LENGTH = 200;

const reportedEntityHandleSchema = z
  .object({
    platform: z.string().trim().min(1).max(REPORTED_ENTITY_PLATFORM_MAX_LENGTH),
    handle: z.string().trim().min(1).max(REPORTED_ENTITY_ADMIN_HANDLE_MAX_LENGTH),
  })
  .strict()
  .transform(({ platform, handle }) => ({
    platform,
    handle: handle.replace(/^@/, "").trim().toLowerCase(),
  }))
  .refine(({ handle }) => handle.length > 0, {
    message: "A handle is required",
  });

const reportedEntityHandlesSchema = z
  .array(reportedEntityHandleSchema)
  .min(1, "At least one handle is required")
  .max(REPORTED_ENTITY_ADMIN_HANDLES_MAX_COUNT)
  .superRefine((handles, context) => {
    const seen = new Set<string>();
    handles.forEach(({ handle }, index) => {
      if (seen.has(handle)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate handles are not allowed",
          path: [index, "handle"],
        });
      }
      seen.add(handle);
    });
  });

const nameSchema = z
  .string()
  .trim()
  .min(1, "Entity name is required")
  .max(REPORTED_ENTITY_ADMIN_NAME_MAX_LENGTH);

export const createReportedEntitySchema = z
  .object({
    name: nameSchema,
    handles: reportedEntityHandlesSchema,
  })
  .strict();

export const updateReportedEntitySchema = z
  .object({
    name: nameSchema.optional(),
    handles: reportedEntityHandlesSchema.optional(),
  })
  .strict()
  .refine(({ name, handles }) => name !== undefined || handles !== undefined, {
    message: "At least one editable field is required",
  });

export const reportedEntityCollectionParamsSchema = z
  .object({ spaceId: z.string().uuid() })
  .strict();

export const reportedEntityItemParamsSchema = z
  .object({
    spaceId: z.string().uuid(),
    entityId: z.string().uuid(),
  })
  .strict();

export const reportedEntityListQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(REPORTED_ENTITY_ADMIN_PAGE_MAX_LIMIT)
      .default(50),
  })
  .strict();

export type CreateReportedEntityInput = z.infer<
  typeof createReportedEntitySchema
>;
export type UpdateReportedEntityInput = z.infer<
  typeof updateReportedEntitySchema
>;
export type ReportedEntityListQuery = z.infer<
  typeof reportedEntityListQuerySchema
>;
