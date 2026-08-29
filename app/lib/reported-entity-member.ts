import { z } from "zod";

export const REPORTED_ENTITY_MEMBER_MAX_LIMIT = 100;
export const REPORTED_ENTITY_MEMBER_MAX_PAGE = 1_000;

export const reportedEntityMemberCollectionParamsSchema = z
  .object({ spaceId: z.string().uuid() })
  .strict();

export const reportedEntityMemberItemParamsSchema = z
  .object({
    spaceId: z.string().uuid(),
    entityId: z.string().uuid(),
  })
  .strict();

export const reportedEntityMemberPageQuerySchema = z
  .object({
    page: z.coerce
      .number()
      .int()
      .min(1)
      .max(REPORTED_ENTITY_MEMBER_MAX_PAGE)
      .default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(REPORTED_ENTITY_MEMBER_MAX_LIMIT)
      .default(20),
  })
  .strict();

export type ReportedEntityMemberPageQuery = z.infer<
  typeof reportedEntityMemberPageQuerySchema
>;
