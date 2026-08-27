import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./auth.server", () => ({ requireUser: vi.fn() }));
vi.mock("./sensitive-review.server", () => ({ decideSensitiveReview: vi.fn(), listSensitiveReviews: vi.fn(), requireSensitiveReview: vi.fn() }));
vi.mock("../lib/error/server-error.server", () => ({ logServerException: vi.fn() }));
import { requireUser } from "./auth.server";
import { decideSensitiveReview, listSensitiveReviews, requireSensitiveReview } from "./sensitive-review.server";
import { sensitiveReviewAction, sensitiveReviewsLoader } from "./sensitive-review-actions.server";
import { HttpError } from "../lib/api/http-error";

const spaceId = "00000000-0000-4000-8000-000000000001";
const postId = "00000000-0000-4000-8000-000000000002";
const actor = { id: "00000000-0000-4000-8000-000000000003" };
const validDecision = { revision: 2, stage: 1, outcome: "approve", note: "Independently examined evidence." };
const args = (method: string, body: unknown = validDecision, origin = "https://safe.test") => ({
  request: new Request(`https://safe.test/resources/api/spaces/${spaceId}/sensitive-reviews/${postId}`, {
    method, headers: { Origin: origin, "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body),
  }), params: { spaceId, postId }, context: undefined,
});

describe("sensitive review resource boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireUser).mockResolvedValue(actor as never);
    vi.mocked(decideSensitiveReview).mockResolvedValue({ success: true });
    vi.mocked(requireSensitiveReview).mockResolvedValue({ success: true });
    vi.mocked(listSensitiveReviews).mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
  });
  it("requires same-origin before authentication and any write", async () => {
    const response = await sensitiveReviewAction(args("PATCH", validDecision, "https://evil.test") as never);
    expect(response.status).toBe(403); expect(requireUser).not.toHaveBeenCalled(); expect(decideSensitiveReview).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("requires authentication and preserves login redirects without caching", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new Response(null, { status: 302, headers: { Location: "/auth/login" } }));
    const response = await sensitiveReviewAction(args("PATCH") as never);
    expect(response.status).toBe(302); expect(response.headers.get("Location")).toBe("/auth/login");
    expect(decideSensitiveReview).not.toHaveBeenCalled();
  });
  it("accepts only POST/PATCH with strict JSON, valid scope and expected revision", async () => {
    expect((await sensitiveReviewAction(args("DELETE") as never)).status).toBe(405);
    for (const body of [
      { ...validDecision, revision: undefined }, { ...validDecision, revision: 0 },
      { ...validDecision, stage: 4 }, { ...validDecision, note: "short" },
      { ...validDecision, reviewerUserId: actor.id }, { ...validDecision, outcome: "verified" },
    ]) expect((await sensitiveReviewAction(args("PATCH", body) as never)).status).toBe(400);
    const invalidPath = args("PATCH"); invalidPath.params.postId = "invalid";
    expect((await sensitiveReviewAction(invalidPath as never)).status).toBe(400);
    const invalidType = args("PATCH"); invalidType.request.headers.set("Content-Type", "text/plain");
    expect((await sensitiveReviewAction(invalidType as never)).status).toBe(400);
    expect(decideSensitiveReview).not.toHaveBeenCalled();
  });
  it("uses the server identity and explicit stage/revision for a decision", async () => {
    const response = await sensitiveReviewAction(args("PATCH") as never);
    expect(response.status).toBe(200);
    expect(decideSensitiveReview).toHaveBeenCalledWith(actor, spaceId, postId, validDecision);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("distinguishes motivated classification from a review approval", async () => {
    const body = { revision: 3, reason: "Manual sensitive classification." };
    expect((await sensitiveReviewAction(args("POST", body) as never)).status).toBe(201);
    expect(requireSensitiveReview).toHaveBeenCalledWith(actor, spaceId, postId, body);
    expect(decideSensitiveReview).not.toHaveBeenCalled();
  });
  it("returns conflict without leaking SQL or applicant data", async () => {
    vi.mocked(decideSensitiveReview).mockRejectedValueOnce(new HttpError(409, "Reload the changed revision", "bad_request:api"));
    expect((await sensitiveReviewAction(args("PATCH") as never)).status).toBe(409);
    vi.mocked(decideSensitiveReview).mockRejectedValueOnce(new Error("private SQL author@example.test"));
    const response = await sensitiveReviewAction(args("PATCH") as never);
    expect(response.status).toBe(500); expect(await response.text()).not.toContain("author@example.test");
  });
  it("validates pagination and returns a private scoped queue", async () => {
    const params = args("GET");
    const response = await sensitiveReviewsLoader(params as never);
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(listSensitiveReviews).toHaveBeenCalledWith(actor, spaceId, { classification: "required", limit: 20 });
    params.request = new Request(`${params.request.url}?limit=1000`);
    expect((await sensitiveReviewsLoader(params as never)).status).toBe(400);
  });
});
