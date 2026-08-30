import { Prisma } from "../generated/prisma";

const SEARCH_RESULT_LIMIT = 20;

export type SearchQueryFilters = {
  q: string;
  severity?: string;
  verification?: string;
};

export type SearchQueryScope = {
  accessibleSpaceIds: string[] | null;
  elevatedSpaceIds: string[] | null;
  isSuperAdmin: boolean;
};

function spaceScopeSql(
  column: Prisma.Sql,
  accessibleSpaceIds: string[] | null,
) {
  if (accessibleSpaceIds === null) return Prisma.empty;
  return Prisma.sql`AND ${column} IN (${Prisma.join(
    accessibleSpaceIds.map((spaceId) => Prisma.sql`${spaceId}::uuid`),
  )})`;
}

function postFilterSql(filters: SearchQueryFilters, scope: SearchQueryScope) {
  return Prisma.sql`
    ${spaceScopeSql(Prisma.sql`post."spaceId"`, scope.accessibleSpaceIds)}
    ${
      scope.isSuperAdmin
        ? Prisma.empty
        : Prisma.sql`
            AND post.status::text = 'active'
            AND (
              post."isAdminOnly" = false
              ${
                scope.elevatedSpaceIds?.length
                  ? Prisma.sql`OR post."spaceId" IN (${Prisma.join(
                      scope.elevatedSpaceIds.map(
                        (spaceId) => Prisma.sql`${spaceId}::uuid`,
                      ),
                    )})`
                  : Prisma.empty
              }
            )
          `
    }
    ${filters.severity ? Prisma.sql`AND post.severity::text = ${filters.severity}` : Prisma.empty}
    ${filters.verification ? Prisma.sql`AND post."verificationStatus"::text = ${filters.verification}` : Prisma.empty}
  `;
}

export function buildPostSearchQuery(
  filters: SearchQueryFilters,
  scope: SearchQueryScope,
) {
  return Prisma.sql`
    SELECT
      post.id,
      post.description,
      post."isAnonymous",
      post."isAdminOnly",
      post.status::text AS status,
      post.severity::text AS severity,
      post."verificationStatus"::text AS "verificationStatus",
      post."createdAt",
      post."updatedAt",
      entity.id AS "entityId",
      entity.name AS "entityName",
      entity."createdAt" AS "entityCreatedAt",
      entity."updatedAt" AS "entityUpdatedAt",
      COALESCE(handles.items, '[]'::jsonb) AS "entityHandles"
    FROM "Post" post
    JOIN "ReportedEntity" entity ON entity.id = post."reportedEntityId"
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', handle.id,
          'handle', handle.handle,
          'platform', handle.platform
        ) ORDER BY handle."createdAt", handle.id
      ) AS items
      FROM "ReportedEntityHandle" handle
      WHERE handle."reportedEntityId" = entity.id
    ) handles ON true
    WHERE to_tsvector('simple', COALESCE(post.description, ''))
      @@ websearch_to_tsquery('simple', ${filters.q})
      ${postFilterSql(filters, scope)}
    ORDER BY post."createdAt" DESC, post.id DESC
    LIMIT ${SEARCH_RESULT_LIMIT}
  `;
}

export function buildEntitySearchQuery(
  filters: Pick<SearchQueryFilters, "q">,
  scope: Pick<SearchQueryScope, "accessibleSpaceIds">,
) {
  return Prisma.sql`
    WITH matching_entity_ids AS (
      SELECT candidate.id
      FROM "ReportedEntity" candidate
      WHERE
        to_tsvector('simple', COALESCE(candidate.name, ''))
          @@ websearch_to_tsquery('simple', ${filters.q})
        OR lower(candidate.name) LIKE '%' || lower(${filters.q}) || '%'

      UNION

      SELECT matching_handle."reportedEntityId"
      FROM "ReportedEntityHandle" matching_handle
      WHERE
        to_tsvector('simple', COALESCE(matching_handle.handle, ''))
          @@ websearch_to_tsquery('simple', ${filters.q})
        OR lower(matching_handle.handle) LIKE '%' || lower(${filters.q}) || '%'
    )
    SELECT
      entity.id,
      entity.name,
      entity."createdAt",
      entity."updatedAt",
      COALESCE(handles.items, '[]'::jsonb) AS handles
    FROM matching_entity_ids matches
    JOIN "ReportedEntity" entity ON entity.id = matches.id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', handle.id,
          'handle', handle.handle,
          'platform', handle.platform
        ) ORDER BY handle."createdAt", handle.id
      ) AS items
      FROM "ReportedEntityHandle" handle
      WHERE handle."reportedEntityId" = entity.id
    ) handles ON true
    WHERE true
      ${spaceScopeSql(Prisma.sql`entity."spaceId"`, scope.accessibleSpaceIds)}
    ORDER BY entity."updatedAt" DESC, entity.id DESC
    LIMIT ${SEARCH_RESULT_LIMIT}
  `;
}
