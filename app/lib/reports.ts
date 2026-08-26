import { z } from "zod";

export const REPORT_DESCRIPTION_MAX_LENGTH = 10_000;
export const REPORTED_ENTITY_NAME_MAX_LENGTH = 200;
export const REPORTED_ENTITY_HANDLE_MAX_LENGTH = 30;
export const REPORTED_ENTITY_HANDLES_MAX_COUNT = 20;

const instagramHandlePattern = /^[a-zA-Z0-9._]+$/;
const optionalSeverity = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.enum(["low", "medium", "high"]).optional()
);
const optionalVerificationStatus = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.enum(["unverified", "pending", "verified", "disputed"]).optional()
);

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

export const reportedEntityTargetSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Entity name is required")
      .max(REPORTED_ENTITY_NAME_MAX_LENGTH),
    handles: z
      .array(
        z
          .string()
          .transform(normalizeHandle)
          .pipe(
            z
              .string()
              .min(1, "An Instagram handle is required")
              .max(REPORTED_ENTITY_HANDLE_MAX_LENGTH)
              .regex(instagramHandlePattern, "Invalid Instagram handle")
          )
      )
      .min(1, "At least one Instagram handle is required")
      .max(REPORTED_ENTITY_HANDLES_MAX_COUNT)
      .transform((handles) => [...new Set(handles)]),
  })
  .strict();

export const createReportSchema = z
  .object({
    spaceId: z.string().uuid(),
    entity: reportedEntityTargetSchema,
    description: z
      .string()
      .trim()
      .min(1, "Description is required")
      .max(REPORT_DESCRIPTION_MAX_LENGTH),
    isAnonymous: z.boolean().default(false),
    isAdminOnly: z.boolean().default(false),
    severity: optionalSeverity,
    verificationStatus: optionalVerificationStatus,
  })
  .strict();

export const reportIdSchema = z.string().uuid("Invalid post ID");

export const updateReportSchema = z
  .object({
    // Optional as a concurrency/scope guard. When supplied it must equal the
    // post's current space; a report can never be moved between spaces.
    spaceId: z.string().uuid().optional(),
    entity: reportedEntityTargetSchema.optional(),
    description: z
      .string()
      .trim()
      .min(1, "Description is required")
      .max(REPORT_DESCRIPTION_MAX_LENGTH)
      .optional(),
    isAnonymous: z.boolean().optional(),
    isAdminOnly: z.boolean().optional(),
    severity: optionalSeverity,
    verificationStatus: optionalVerificationStatus,
  })
  .strict()
  .refine(
    ({ entity, description, isAnonymous, isAdminOnly, severity, verificationStatus }) =>
      entity !== undefined ||
      description !== undefined ||
      isAnonymous !== undefined ||
      isAdminOnly !== undefined ||
      severity !== undefined ||
      verificationStatus !== undefined,
    { message: "At least one editable field is required" }
  );

export type ReportedEntityTargetInput = z.infer<
  typeof reportedEntityTargetSchema
>;
export type CreateReportInput = z.infer<typeof createReportSchema>;
export type UpdateReportInput = z.infer<typeof updateReportSchema>;

export type ReportWriteResponse = {
  success: true;
  post: {
    id: string;
    spaceId: string;
    description: string;
    isAnonymous: boolean;
    isAdminOnly: boolean;
    severity: "low" | "medium" | "high" | null;
    verificationStatus: "unverified" | "pending" | "verified" | "disputed" | null;
    createdAt: string;
    updatedAt: string;
    reportedEntity: {
      id: string;
      name: string;
      handles: string[];
    };
  };
};
