import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "~/generated/prisma";

import {
  createModerationAppeal,
  decideModerationAppeal,
  issueProgressiveDiscipline,
  listModerationAppeals,
} from "./moderation-governance.server";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const SPACE_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_SPACE_ID = "44444444-4444-4444-8444-444444444444";
const FLAG_ID = "55555555-5555-4555-8555-555555555555";
const APPEAL_ID = "66666666-6666-4666-8666-666666666666";

function appealRow(overrides: Record<string, unknown> = {}) {
  return {
    id: APPEAL_ID,
    postFlagId: FLAG_ID,
    reason: "The evidence was misunderstood",
    status: "pending",
    decisionNote: null,
    decidedAt: null,
    createdAt: new Date("2026-08-26T10:00:00.000Z"),
    updatedAt: new Date("2026-08-26T10:00:00.000Z"),
    ...overrides,
  };
}

function disciplineRow(overrides: Record<string, unknown> = {}) {
  return {
    id: APPEAL_ID,
    userId: TARGET_ID,
    kind: "warning",
    level: 1,
    reason: "Repeated policy violations",
    status: "active",
    expiresAt: null,
    issuedByUserId: ACTOR_ID,
    revokedByUserId: null,
    revokedAt: null,
    revocationReason: null,
    createdAt: new Date("2026-08-26T10:00:00.000Z"),
    ...overrides,
  };
}

function harness(options: { actorRole?: string; targetRole?: string; superAdmin?: boolean } = {}) {
  const tx = {
    user: { findUnique: vi.fn().mockResolvedValue({ isSuperAdmin: options.superAdmin ?? false }) },
    userSpaceMembership: {
      findUnique: vi.fn(({ where }: any) => {
        const userId = where.userId_spaceId.userId;
        if (userId === ACTOR_ID) return Promise.resolve({ role: options.actorRole ?? "MODERATOR" });
        if (userId === TARGET_ID) return Promise.resolve({ role: options.targetRole ?? "EDITOR" });
        return Promise.resolve(null);
      }),
    },
    postFlag: {
      findFirst: vi.fn().mockResolvedValue({ id: FLAG_ID, status: "rejected", postId: APPEAL_ID }),
      update: vi.fn().mockResolvedValue({ id: FLAG_ID }),
    },
    moderationAppeal: {
      create: vi.fn().mockResolvedValue(appealRow()),
      findFirst: vi.fn().mockResolvedValue(appealRow()),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(appealRow({ status: "upheld", decisionNote: "Reviewed" })),
    },
    disciplinaryAction: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(disciplineRow()),
      findFirst: vi.fn().mockResolvedValue(disciplineRow()),
      update: vi.fn().mockResolvedValue(disciplineRow({ status: "revoked" })),
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditLog: { create: vi.fn().mockResolvedValue({ id: APPEAL_ID }) },
  };
  const transaction = vi.fn(async (operation: any) => operation(tx));
  return { tx, client: { $transaction: transaction } as unknown as PrismaClient };
}

describe("moderation governance authorization", () => {
  it("does not expose the moderator appeal queue to ordinary members", async () => {
    const h = harness({ actorRole: "EDITOR" });

    await expect(
      listModerationAppeals({ id: ACTOR_ID }, SPACE_ID, { status: "pending", limit: 25 }, h.client)
    ).rejects.toMatchObject({ status: 403 });
    expect(h.tx.moderationAppeal.findMany).not.toHaveBeenCalled();
  });

  it("removes moderator powers while a restriction is active", async () => {
    const h = harness({ actorRole: "MODERATOR" });
    h.tx.disciplinaryAction.findFirst.mockResolvedValueOnce({ kind: "restriction" });

    await expect(
      listModerationAppeals(
        { id: ACTOR_ID },
        SPACE_ID,
        { status: "pending", limit: 25 },
        h.client
      )
    ).rejects.toMatchObject({ status: 403 });
    expect(h.tx.moderationAppeal.findMany).not.toHaveBeenCalled();
  });

  it("scopes an appeal to the caller's own flag in the requested space", async () => {
    const h = harness();
    h.tx.postFlag.findFirst.mockResolvedValue(null);

    await expect(
      createModerationAppeal(
        { id: ACTOR_ID }, SPACE_ID,
        { flagId: FLAG_ID, reason: "Please review again" }, h.client
      )
    ).rejects.toMatchObject({ status: 404 });
    expect(h.tx.postFlag.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: FLAG_ID, flaggerUserId: ACTOR_ID, post: { spaceId: SPACE_ID } },
      })
    );
    expect(h.tx.moderationAppeal.create).not.toHaveBeenCalled();
  });

  it("uses a space-scoped lookup for appeal decisions to prevent IDOR", async () => {
    const h = harness();
    h.tx.moderationAppeal.findFirst.mockResolvedValue(null);

    await expect(
      decideModerationAppeal(
        { id: ACTOR_ID }, OTHER_SPACE_ID, APPEAL_ID,
        { status: "upheld", decisionNote: "Reviewed" }, h.client
      )
    ).rejects.toMatchObject({ status: 404 });
    expect(h.tx.moderationAppeal.findFirst).toHaveBeenCalledWith({
      where: { id: APPEAL_ID, spaceId: OTHER_SPACE_ID },
      select: { id: true, postFlagId: true, status: true },
    });
    expect(h.tx.moderationAppeal.update).not.toHaveBeenCalled();
  });

  it("does not accept repeated appeals for the same final moderation decision", async () => {
    const h = harness();
    h.tx.postFlag.findFirst.mockResolvedValue({
      id: FLAG_ID,
      status: "rejected",
      postId: APPEAL_ID,
      resolvedAt: new Date("2026-08-26T10:00:00.000Z"),
    });
    h.tx.moderationAppeal.findFirst.mockResolvedValue({
      status: "upheld",
      decidedAt: new Date("2026-08-26T11:00:00.000Z"),
    });

    await expect(
      createModerationAppeal(
        { id: ACTOR_ID },
        SPACE_ID,
        { flagId: FLAG_ID, reason: "Please review this again" },
        h.client
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(h.tx.moderationAppeal.create).not.toHaveBeenCalled();
  });

  it("allows a new appeal only after a newer rejection decision", async () => {
    const h = harness();
    h.tx.postFlag.findFirst.mockResolvedValue({
      id: FLAG_ID,
      status: "rejected",
      postId: APPEAL_ID,
      resolvedAt: new Date("2026-08-26T12:00:00.000Z"),
    });
    h.tx.moderationAppeal.findFirst.mockResolvedValue({
      status: "upheld",
      decidedAt: new Date("2026-08-26T11:00:00.000Z"),
    });

    await expect(
      createModerationAppeal(
        { id: ACTOR_ID },
        SPACE_ID,
        { flagId: FLAG_ID, reason: "A new decision needs a new review" },
        h.client
      )
    ).resolves.toMatchObject({ id: APPEAL_ID, status: "pending" });
    expect(h.tx.moderationAppeal.create).toHaveBeenCalledTimes(1);
  });

  it("prevents a moderator from disciplining an equal-ranked target", async () => {
    const h = harness({ actorRole: "MODERATOR", targetRole: "MODERATOR" });

    await expect(
      issueProgressiveDiscipline(
        { id: ACTOR_ID }, SPACE_ID,
        { userId: TARGET_ID, reason: "Policy issue" }, h.client
      )
    ).rejects.toMatchObject({ status: 403 });
    expect(h.tx.disciplinaryAction.create).not.toHaveBeenCalled();
  });

  it("assigns the first progressive level and audits without copying the sensitive reason", async () => {
    const h = harness();
    const issued = await issueProgressiveDiscipline(
      { id: ACTOR_ID }, SPACE_ID,
      { userId: TARGET_ID, reason: "Sensitive details" }, h.client
    );

    expect(issued).toMatchObject({ kind: "warning", level: 1 });
    expect(h.tx.disciplinaryAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "warning", level: 1, reason: "Sensitive details" }),
      })
    );
    expect(h.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "discipline_issue",
        details: { userId: TARGET_ID, kind: "warning", level: 1 },
      }),
    });
  });
});
