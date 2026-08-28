import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "~/generated/prisma";
import { createSystemAnnouncement, deleteSystemAnnouncement, listActiveSystemAnnouncements, listSystemAnnouncements, SystemAnnouncementError, updateSystemAnnouncement } from "./system-announcements.server";

const ACTOR = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const row = { id: ID, content: "Maintenance tonight", publishedAt: new Date("2026-08-28T10:00:00Z"), expiresAt: null, createdAt: new Date("2026-08-28T09:00:00Z"), updatedAt: new Date("2026-08-28T09:00:00Z") };
function harness(superAdmin = true) {
  const tx = { user: { findUnique: vi.fn().mockResolvedValue({ id: ACTOR, isSuperAdmin: superAdmin }) }, systemAnnouncement: { findMany: vi.fn().mockResolvedValue([row]), findUnique: vi.fn().mockResolvedValue(row), create: vi.fn().mockResolvedValue(row), update: vi.fn().mockResolvedValue(row), delete: vi.fn().mockResolvedValue(row) }, auditLog: { create: vi.fn().mockResolvedValue({ id: "audit" }) } };
  return { tx, client: { $transaction: vi.fn((callback) => callback(tx)) } as unknown as PrismaClient };
}
describe("system announcements", () => {
  it("requires current super-admin status for management", async () => {
    const h = harness(false);
    await expect(listSystemAnnouncements({ id: ACTOR }, h.client)).rejects.toBeInstanceOf(SystemAnnouncementError);
    expect(h.tx.systemAnnouncement.findMany).not.toHaveBeenCalled();
  });
  it("only queries current active announcements for an authenticated account", async () => {
    const h = harness();
    await listActiveSystemAnnouncements({ id: ACTOR }, h.client);
    expect(h.tx.systemAnnouncement.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ publishedAt: { lte: expect.any(Date) }, OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }] }) }));
  });
  it("rejects an expiry that precedes its effective publication", async () => {
    const h = harness();
    await expect(updateSystemAnnouncement({ id: ACTOR }, ID, { publishedAt: new Date("2026-08-29"), expiresAt: new Date("2026-08-28") }, h.client)).rejects.toMatchObject({ status: 409 });
    expect(h.tx.systemAnnouncement.update).not.toHaveBeenCalled();
  });
  it("attributes creation to the current super-admin", async () => {
    const h = harness();
    await createSystemAnnouncement({ id: ACTOR }, { content: "Maintenance tonight", publishedAt: row.publishedAt, expiresAt: null }, h.client);
    expect(h.tx.systemAnnouncement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ createdByUserId: ACTOR }) }));
    expect(h.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "system_announcement_create", targetEntityId: ID }) }));
    expect(JSON.stringify(h.tx.auditLog.create.mock.calls[0][0].data.details)).not.toContain("Maintenance tonight");
  });
  it("audits update and deletion without announcement text", async () => {
    const h = harness();
    await updateSystemAnnouncement({ id: ACTOR }, ID, { content: "Edited notice" }, h.client);
    await deleteSystemAnnouncement({ id: ACTOR }, ID, h.client);
    expect(h.tx.auditLog.create).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: expect.objectContaining({ action: "system_announcement_update", details: { changedFields: ["content"] } }) }));
    expect(h.tx.auditLog.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: expect.objectContaining({ action: "system_announcement_delete", targetEntityId: ID }) }));
    expect(JSON.stringify(h.tx.auditLog.create.mock.calls)).not.toContain("Edited notice");
  });
});
