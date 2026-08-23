import { describe, expect, it } from "vitest";
import {
  moderationDecisionSchema,
  moderationFlagsQuerySchema,
  POST_FLAG_REASON_MAX_LENGTH,
  postFlagBodySchema,
} from "./post-flags";

describe("post flag validation", () => {
  it("accepts an omitted reason and trims a bounded reason", () => {
    expect(postFlagBodySchema.parse({})).toEqual({});
    expect(postFlagBodySchema.parse({ reason: "  harmful content  " })).toEqual(
      { reason: "harmful content" }
    );
  });

  it("rejects empty, oversized, and unknown flag fields", () => {
    expect(postFlagBodySchema.safeParse({ reason: "   " }).success).toBe(false);
    expect(
      postFlagBodySchema.safeParse({
        reason: "x".repeat(POST_FLAG_REASON_MAX_LENGTH + 1),
      }).success
    ).toBe(false);
    expect(postFlagBodySchema.safeParse({ reason: "ok", postId: "leak" }).success)
      .toBe(false);
  });

  it("defaults the queue safely and bounds pagination", () => {
    expect(moderationFlagsQuerySchema.parse({})).toEqual({
      status: "pending_review",
      limit: 20,
    });
    expect(
      moderationFlagsQuerySchema.safeParse({ limit: "101" }).success
    ).toBe(false);
    expect(
      moderationFlagsQuerySchema.safeParse({ unexpected: "true" }).success
    ).toBe(false);
  });

  it("only permits final moderation states", () => {
    expect(moderationDecisionSchema.parse({ status: "resolved" })).toEqual({
      status: "resolved",
    });
    expect(
      moderationDecisionSchema.safeParse({ status: "pending_review" }).success
    ).toBe(false);
    expect(
      moderationDecisionSchema.safeParse({ status: "rejected", note: "extra" })
        .success
    ).toBe(false);
  });
});
