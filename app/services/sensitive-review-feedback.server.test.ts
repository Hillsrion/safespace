import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "~/generated/prisma";
import { getOwnSensitiveReviewFeedback } from "./sensitive-review-feedback.server";

describe("self-scoped correction feedback", () => {
  it("preserves only the explicit author feedback DTO", async () => {
    const feedback = { revision: 2, status: "changes_requested", corrections: [{ stage: 1, note: "Clarify the timeline", createdAt: "2026-08-27" }] };
    const client = { $queryRaw: vi.fn().mockResolvedValue([{ feedback }]) } as unknown as PrismaClient;
    expect(await getOwnSensitiveReviewFeedback("00000000-0000-4000-8000-000000000001", client)).toEqual(feedback);
  });
  it("returns nothing for a report the SQL identity cannot read as author", async () => {
    const client = { $queryRaw: vi.fn().mockResolvedValue([{ feedback: null }]) } as unknown as PrismaClient;
    expect(await getOwnSensitiveReviewFeedback("00000000-0000-4000-8000-000000000001", client)).toBeNull();
  });
  it("rejects accidental identity enrichment", async () => {
    const client = { $queryRaw: vi.fn().mockResolvedValue([{ feedback: { revision: 1, status: "pending", corrections: [], reviewerUserId: "secret" } }]) } as unknown as PrismaClient;
    await expect(getOwnSensitiveReviewFeedback("00000000-0000-4000-8000-000000000001", client)).rejects.toThrow();
  });
});
