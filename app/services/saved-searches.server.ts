import type { PrismaClient } from "~/generated/prisma";
import { prisma } from "~/db/client.server";
import { errors } from "~/lib/api/http-error";
import type {
  SavedSearchCreateInput,
  SavedSearchUpdateInput,
} from "~/lib/search";

export type SavedSearchActor = { id: string; isSuperAdmin: boolean };

const SAVED_SEARCH_SELECT = {
  id: true,
  name: true,
  query: true,
  type: true,
  spaceId: true,
  severity: true,
  verificationStatus: true,
  alertEnabled: true,
  alertHandle: true,
  createdAt: true,
  updatedAt: true,
} as const;

type SavedSearchRow = {
  id: string;
  name: string;
  query: string;
  type: string;
  spaceId: string | null;
  severity: "low" | "medium" | "high" | null;
  verificationStatus: "unverified" | "pending" | "verified" | "disputed" | null;
  alertEnabled: boolean;
  alertHandle: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toSavedSearchResponse(row: SavedSearchRow) {
  return {
    id: row.id,
    name: row.name,
    query: row.query,
    type: row.type as "posts" | "entities" | "all",
    spaceId: row.spaceId,
    severity: row.severity,
    verificationStatus: row.verificationStatus,
    alertEnabled: row.alertEnabled,
    alertHandle: row.alertHandle,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function requireAccessibleSpace(
  actor: SavedSearchActor,
  spaceId: string | null | undefined,
  client: PrismaClient
) {
  if (!spaceId || actor.isSuperAdmin) return;
  const membership = await client.userSpaceMembership.findUnique({
    where: { userId_spaceId: { userId: actor.id, spaceId } },
    select: { userId: true },
  });
  if (!membership) {
    throw errors.forbidden("You are not a member of the requested space");
  }
}

async function getOwnedSearchOrThrow(
  actor: SavedSearchActor,
  savedSearchId: string,
  client: PrismaClient
) {
  const row = await client.savedSearch.findFirst({
    where: { id: savedSearchId, userId: actor.id },
    select: SAVED_SEARCH_SELECT,
  });
  // Do not disclose whether an ID owned by another user exists.
  if (!row) throw errors.notFound("Saved search not found");
  return row as SavedSearchRow;
}

function ensureEnabledAlertHasHandle(
  alertEnabled: boolean,
  alertHandle: string | null | undefined
) {
  if (alertEnabled && !alertHandle) {
    throw errors.badRequest("An alert handle is required when alerts are enabled");
  }
}

export async function listSavedSearches(
  actor: SavedSearchActor,
  client: PrismaClient = prisma
) {
  let accessibleSpaceIds: string[] | undefined;
  if (!actor.isSuperAdmin) {
    const memberships = await client.userSpaceMembership.findMany({
      where: { userId: actor.id },
      select: { spaceId: true },
    });
    accessibleSpaceIds = memberships.map((membership) => membership.spaceId);
  }

  const rows = await client.savedSearch.findMany({
    where: {
      userId: actor.id,
      ...(accessibleSpaceIds
        ? { OR: [{ spaceId: null }, { spaceId: { in: accessibleSpaceIds } }] }
        : {}),
    },
    select: SAVED_SEARCH_SELECT,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  return rows.map((row) => toSavedSearchResponse(row as SavedSearchRow));
}

export async function createSavedSearch(
  actor: SavedSearchActor,
  input: SavedSearchCreateInput,
  client: PrismaClient = prisma
) {
  await requireAccessibleSpace(actor, input.spaceId, client);
  ensureEnabledAlertHasHandle(input.alertEnabled, input.alertHandle);
  const row = await client.savedSearch.create({
    data: { ...input, userId: actor.id },
    select: SAVED_SEARCH_SELECT,
  });
  return toSavedSearchResponse(row as SavedSearchRow);
}

export async function getSavedSearch(
  actor: SavedSearchActor,
  savedSearchId: string,
  client: PrismaClient = prisma
) {
  const row = await getOwnedSearchOrThrow(actor, savedSearchId, client);
  await requireAccessibleSpace(actor, row.spaceId, client);
  return toSavedSearchResponse(row);
}

export async function updateSavedSearch(
  actor: SavedSearchActor,
  savedSearchId: string,
  input: SavedSearchUpdateInput,
  client: PrismaClient = prisma
) {
  const current = await getOwnedSearchOrThrow(actor, savedSearchId, client);
  const nextSpaceId = input.spaceId === undefined ? current.spaceId : input.spaceId;
  const nextAlertEnabled = input.alertEnabled ?? current.alertEnabled;
  const nextAlertHandle =
    input.alertHandle === undefined ? current.alertHandle : input.alertHandle;
  await requireAccessibleSpace(actor, nextSpaceId, client);
  ensureEnabledAlertHasHandle(nextAlertEnabled, nextAlertHandle);

  const row = await client.savedSearch.update({
    where: { id: savedSearchId },
    data: input,
    select: SAVED_SEARCH_SELECT,
  });
  return toSavedSearchResponse(row as SavedSearchRow);
}

export async function deleteSavedSearch(
  actor: SavedSearchActor,
  savedSearchId: string,
  client: PrismaClient = prisma
) {
  await getOwnedSearchOrThrow(actor, savedSearchId, client);
  await client.savedSearch.delete({ where: { id: savedSearchId } });
  return { deletedSavedSearchId: savedSearchId };
}
