import type { PrismaClient } from "~/generated/prisma";
import { prisma } from "~/db/client.server";
import type { CreateSystemAnnouncementInput, UpdateSystemAnnouncementInput } from "~/lib/system-announcements";

type TransactionClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
export type SystemAnnouncementActor = { id: string };

export class SystemAnnouncementError extends Error {
  constructor(public readonly status: 403 | 404 | 409, message: string) {
    super(message);
    this.name = "SystemAnnouncementError";
  }
}

const SELECT = { id: true, content: true, publishedAt: true, expiresAt: true, createdAt: true, updatedAt: true } as const;

function response(row: { id: string; content: string; publishedAt: Date; expiresAt: Date | null; createdAt: Date; updatedAt: Date }) {
  return { id: row.id, content: row.content, publishedAt: row.publishedAt.toISOString(), expiresAt: row.expiresAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

async function requireSuperAdmin(tx: TransactionClient, actor: SystemAnnouncementActor) {
  const user = await tx.user.findUnique({ where: { id: actor.id }, select: { isSuperAdmin: true } });
  if (!user?.isSuperAdmin) throw new SystemAnnouncementError(403, "Current super-administrator rights are required");
}

export async function listActiveSystemAnnouncements(actor: SystemAnnouncementActor, client: PrismaClient = prisma) {
  return client.$transaction(async (tx) => {
    // Re-read the account so a stale cookie cannot access notices after deletion.
    const user = await tx.user.findUnique({ where: { id: actor.id }, select: { id: true } });
    if (!user) throw new SystemAnnouncementError(403, "Authentication required");
    const now = new Date();
    const rows = await tx.systemAnnouncement.findMany({
      where: { publishedAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }], select: SELECT,
    });
    return rows.map(response);
  });
}

export async function listSystemAnnouncements(actor: SystemAnnouncementActor, client: PrismaClient = prisma) {
  return client.$transaction(async (tx) => {
    await requireSuperAdmin(tx, actor);
    return (await tx.systemAnnouncement.findMany({ orderBy: [{ publishedAt: "desc" }, { id: "desc" }], select: SELECT })).map(response);
  });
}

export async function createSystemAnnouncement(actor: SystemAnnouncementActor, input: CreateSystemAnnouncementInput, client: PrismaClient = prisma) {
  return client.$transaction(async (tx) => {
    await requireSuperAdmin(tx, actor);
    const created = await tx.systemAnnouncement.create({ data: { ...input, createdByUserId: actor.id }, select: SELECT });
    await tx.auditLog.create({ data: { actorUserId: actor.id, action: "system_announcement_create", targetEntityType: "SystemAnnouncement", targetEntityId: created.id, details: { publishedAt: created.publishedAt.toISOString(), expiresAt: created.expiresAt?.toISOString() ?? null } } });
    return response(created);
  });
}

export async function updateSystemAnnouncement(actor: SystemAnnouncementActor, announcementId: string, input: UpdateSystemAnnouncementInput, client: PrismaClient = prisma) {
  return client.$transaction(async (tx) => {
    await requireSuperAdmin(tx, actor);
    const current = await tx.systemAnnouncement.findUnique({ where: { id: announcementId }, select: SELECT });
    if (!current) throw new SystemAnnouncementError(404, "Announcement not found");
    const publishedAt = input.publishedAt ?? current.publishedAt;
    const expiresAt = input.expiresAt === undefined ? current.expiresAt : input.expiresAt;
    if (expiresAt && expiresAt <= publishedAt) throw new SystemAnnouncementError(409, "Expiry must be after publication");
    const changedFields = Object.keys(input);
    const updated = await tx.systemAnnouncement.update({ where: { id: announcementId }, data: input, select: SELECT });
    await tx.auditLog.create({ data: { actorUserId: actor.id, action: "system_announcement_update", targetEntityType: "SystemAnnouncement", targetEntityId: updated.id, details: { changedFields } } });
    return response(updated);
  });
}

export async function deleteSystemAnnouncement(actor: SystemAnnouncementActor, announcementId: string, client: PrismaClient = prisma) {
  return client.$transaction(async (tx) => {
    await requireSuperAdmin(tx, actor);
    const existing = await tx.systemAnnouncement.findUnique({ where: { id: announcementId }, select: { id: true } });
    if (!existing) throw new SystemAnnouncementError(404, "Announcement not found");
    await tx.systemAnnouncement.delete({ where: { id: announcementId } });
    await tx.auditLog.create({ data: { actorUserId: actor.id, action: "system_announcement_delete", targetEntityType: "SystemAnnouncement", targetEntityId: announcementId } });
    return { deletedAnnouncementId: announcementId };
  });
}
