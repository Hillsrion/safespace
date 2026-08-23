import { z } from "zod";
import { AuditAction } from "~/generated/prisma";

export const SPACE_NAME_MAX_LENGTH = 120;
export const SPACE_DESCRIPTION_MAX_LENGTH = 5_000;
export const ADMIN_PAGE_MAX_LIMIT = 100;

const descriptionSchema = z
  .string()
  .trim()
  .max(SPACE_DESCRIPTION_MAX_LENGTH)
  .transform((value) => (value === "" ? null : value));

export const createAdminSpaceSchema = z
  .object({
    name: z.string().trim().min(1).max(SPACE_NAME_MAX_LENGTH),
    description: descriptionSchema.nullable().optional().default(null),
  })
  .strict();

export const updateAdminSpaceSchema = z
  .object({
    name: z.string().trim().min(1).max(SPACE_NAME_MAX_LENGTH).optional(),
    description: descriptionSchema.nullable().optional(),
  })
  .strict()
  .refine(
    ({ name, description }) => name !== undefined || description !== undefined,
    { message: "At least one editable field is required" }
  );

export const deleteAdminSpaceSchema = z
  .object({
    confirmation: z.string().trim().min(1).max(SPACE_NAME_MAX_LENGTH + 7),
  })
  .strict();

export const adminSpaceParamsSchema = z
  .object({ spaceId: z.string().uuid() })
  .strict();

const paginationFields = {
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(ADMIN_PAGE_MAX_LIMIT).default(50),
};

export const adminSpaceListQuerySchema = z
  .object(paginationFields)
  .strict();

export const auditLogQuerySchema = z
  .object({
    ...paginationFields,
    spaceId: z.string().uuid().optional(),
    action: z.nativeEnum(AuditAction).optional(),
  })
  .strict();

export type CreateAdminSpaceInput = z.infer<typeof createAdminSpaceSchema>;
export type UpdateAdminSpaceInput = z.infer<typeof updateAdminSpaceSchema>;
export type AdminSpaceListQuery = z.infer<typeof adminSpaceListQuerySchema>;
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
