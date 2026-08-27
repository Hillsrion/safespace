import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), post: vi.fn(), role: vi.fn(), feedback: vi.fn() }));
vi.mock("./auth.server", () => ({ getCurrentUser: mocks.user }));
vi.mock("../db/client.server", () => ({ prisma: { post: { findFirst: mocks.post } } }));
vi.mock("../db/repositories/spaces/queries.server", () => ({ getUserSpaceRole: mocks.role }));
vi.mock("./sensitive-review-feedback.server", () => ({ getOwnSensitiveReviewFeedback: mocks.feedback }));
import { loadReportForEditing as loader } from "./report-edit-loader.server";

const args = { request: new Request("https://safe.test/dashboard/posts/post/edit"), params: { id: "post" }, context: {} };
describe("edit loader evidence privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "author", isSuperAdmin: false });
    mocks.role.mockResolvedValue("EDITOR"); mocks.feedback.mockResolvedValue(null);
    mocks.post.mockResolvedValue({ id: "post", spaceId: "space", authorId: "author", description: "Own report", isAnonymous: true, isAdminOnly: false, severity: "high", verificationStatus: "pending", requiresSensitiveReview: true,
      space: { id: "space", name: "My space" }, reportedEntity: { name: "Entity", handles: [{ handle: "handle" }] },
      media: [{ id: "mine", uploaderId: "author", mimeType: "image/jpeg", fileSize: 50, isBlurred: true }, { id: "other", uploaderId: "other-uploader-private-id", mimeType: "image/jpeg", fileSize: 50, isBlurred: true }],
    });
  });
  it("sends capabilities, not uploader/anonymous author identities, and includes only own correction feedback", async () => {
    const result = await loader(args);
    expect(result.post.evidence.map(({ viewerCanDelete }) => viewerCanDelete)).toEqual([true, false]);
    expect(JSON.stringify(result)).not.toMatch(/authorId|uploaderId|other-uploader-private-id/);
    expect(mocks.feedback).toHaveBeenCalledWith("post");
    expect(result.post.requiresSensitiveReview).toBe(true);
  });
  it("does not return evidence when discipline has removed write rights", async () => {
    mocks.role.mockResolvedValue("READ_ONLY");
    await expect(loader(args)).rejects.toMatchObject({ status: 404 });
    expect(mocks.feedback).not.toHaveBeenCalled();
  });
  it("allows moderation to delete evidence without loading another author's private feedback", async () => {
    mocks.user.mockResolvedValue({ id: "moderator", isSuperAdmin: false }); mocks.role.mockResolvedValue("MODERATOR");
    const result = await loader(args);
    expect(result.post.evidence.every(({ viewerCanDelete }) => viewerCanDelete)).toBe(true);
    expect(mocks.feedback).not.toHaveBeenCalled();
  });
});
