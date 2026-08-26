import { z } from "zod";

const SEARCH_QUERY_MAX_LENGTH = 100;

export const searchTypeSchema = z.enum(["posts", "entities", "all"]);
export const searchSeveritySchema = z.enum(["low", "medium", "high"]);
export const searchVerificationSchema = z.enum([
  "unverified",
  "pending",
  "verified",
  "disputed",
]);

const optionalString = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.string().optional()
);

export const advancedSearchQuerySchema = z
  .object({
    // `q` is the established API parameter; `query` is accepted for clients
    // that follow the PRD wording. The route normalizes it before parsing.
    q: z.string().trim().min(2).max(SEARCH_QUERY_MAX_LENGTH),
    type: searchTypeSchema.default("all"),
    spaceId: optionalString.pipe(z.string().uuid().optional()),
    severity: optionalString.pipe(searchSeveritySchema.optional()),
    verification: optionalString.pipe(searchVerificationSchema.optional()),
  })
  .strict();

const savedSearchFields = {
  name: z.string().trim().min(1).max(100),
  query: z.string().trim().min(2).max(SEARCH_QUERY_MAX_LENGTH),
  type: searchTypeSchema.default("all"),
  spaceId: optionalString.pipe(z.string().uuid().optional()),
  severity: optionalString.pipe(searchSeveritySchema.optional()),
  verificationStatus: optionalString.pipe(searchVerificationSchema.optional()),
  alertEnabled: z.boolean().default(false),
  alertHandle: optionalString
    .pipe(z.string().trim().max(200).optional())
    .transform((handle) => handle?.replace(/^@/, "").toLowerCase()),
};

export const savedSearchCreateSchema = z
  .object(savedSearchFields)
  .strict()
  .superRefine((value, context) => {
    if (value.alertEnabled && !value.alertHandle) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["alertHandle"],
        message: "An alert handle is required when alerts are enabled",
      });
    }
  });

export const savedSearchUpdateSchema = z
  .object({
    name: savedSearchFields.name.optional(),
    query: savedSearchFields.query.optional(),
    type: searchTypeSchema.optional(),
    spaceId: optionalString.pipe(z.string().uuid().nullable().optional()),
    severity: optionalString.pipe(searchSeveritySchema.nullable().optional()),
    verificationStatus: optionalString.pipe(
      searchVerificationSchema.nullable().optional()
    ),
    alertEnabled: z.boolean().optional(),
    alertHandle: optionalString
      .pipe(z.string().trim().max(200).nullable().optional())
      .transform((handle) =>
        typeof handle === "string"
          ? handle.replace(/^@/, "").toLowerCase()
          : handle
      ),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const savedSearchIdParamsSchema = z.object({
  savedSearchId: z.string().uuid(),
});

export type AdvancedSearchQuery = z.infer<typeof advancedSearchQuerySchema>;
export type SavedSearchCreateInput = z.infer<typeof savedSearchCreateSchema>;
export type SavedSearchUpdateInput = z.infer<typeof savedSearchUpdateSchema>;
