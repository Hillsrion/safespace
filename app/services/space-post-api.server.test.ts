import type { PrismaClient } from "~/generated/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createReport: vi.fn(),
  updateReport: vi.fn(),
  deletePost: vi.fn(),
}));
vi.mock("./auth.server", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("../db/repositories/posts/write.server", () => ({
  createReport: mocks.createReport,
  updateReport: mocks.updateReport,
}));
vi.mock("../db/repositories/posts/queries.server", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  deletePost: mocks.deletePost,
}));

import {
  getSpacePost,
  listSpacePosts,
  spacePostAction,
  spacePostsAction,
} from "./space-post-api.server";

const SPACE = "11111111-1111-4111-8111-111111111111";
const POST = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";

function args(method: string, body?: unknown, params = { spaceId: SPACE, postId: POST }) {
  return {
    request: new Request("https://safe.test/resources/api/space/posts", {
      method,
      headers: { Origin: "https://safe.test", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params,
  } as never;
}

const client = {
  user: { findUnique: vi.fn() },
  userSpaceMembership: { findUnique: vi.fn() },
  disciplinaryAction: { findFirst: vi.fn() },
  post: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
} as unknown as PrismaClient;

const rawPost = {
  id: POST, spaceId: SPACE, authorId: USER, isAnonymous: true, isAdminOnly: false,
  status: "active", description: "private", media: [{ id: "m", storageKey: "secret", uploaderId: USER, sha256: "hash" }],
  author: { id: USER, firstName: "Secret", lastName: "Writer", instagram: "secret" },
  space: { id: SPACE, name: "S" }, reportedEntity: { id: "e", name: "E", handles: [] },
};

describe("space post API contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: USER, isSuperAdmin: false });
    (client.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ isSuperAdmin: false });
    (client.userSpaceMembership.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ role: "EDITOR" });
    (client.disciplinaryAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (client.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([rawPost]);
    (client.post.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (client.post.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(rawPost);
  });

  it("scopes list reads, bounds pagination and removes anonymous/storage identities", async () => {
    const result = await listSpacePosts(USER, SPACE, {
      page: 1, limit: 20, sortBy: "createdAt", sortOrder: "desc",
    }, client);
    expect(client.post.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ spaceId: SPACE }), take: 20, skip: 0,
    }));
    expect(result.posts[0]).toMatchObject({ authorId: null, author: { id: "anonymous" } });
    expect(JSON.stringify(result)).not.toContain("storageKey");
    expect(JSON.stringify(result)).not.toContain("sha256");
  });

  it("requires exact space scope for item reads", async () => {
    await getSpacePost(USER, SPACE, POST, client);
    expect(client.post.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: POST, spaceId: SPACE }),
    }));
  });

  it("maps the PRD create contract and rejects unsafe media reattachment", async () => {
    mocks.createReport.mockResolvedValue({ success: true });
    const valid = { targetEntityName: "Entity", targetEntityHandles: ["@safe"], description: "Report" };
    expect((await spacePostsAction(args("POST", valid, { spaceId: SPACE }))).status).toBe(201);
    expect(mocks.createReport).toHaveBeenCalledWith(expect.objectContaining({ id: USER }), expect.objectContaining({
      spaceId: SPACE, entity: { name: "Entity", handles: ["safe"] }, description: "Report",
    }));
    const refused = await spacePostsAction(args("POST", { ...valid, mediaIds: [POST] }, { spaceId: SPACE }));
    expect(refused.status).toBe(400);
  });

  it("maps the scoped PRD update contract without trusting a body space", async () => {
    mocks.updateReport.mockResolvedValue({ success: true });
    const response = await spacePostAction(args("PUT", {
      targetEntityName: "Entity corrigée",
      targetEntityHandles: ["@safe"],
      description: "Rapport corrigé",
      isAnonymous: true,
    }));

    expect(response.status).toBe(200);
    expect(mocks.updateReport).toHaveBeenCalledWith(
      POST,
      expect.objectContaining({ id: USER }),
      {
        spaceId: SPACE,
        entity: { name: "Entity corrigée", handles: ["safe"] },
        description: "Rapport corrigé",
        isAnonymous: true,
        isAdminOnly: undefined,
        severity: undefined,
        verificationStatus: undefined,
      }
    );
  });

  it("enforces methods, CSRF and expected space on deletion", async () => {
    expect((await spacePostAction(args("PATCH", {}))).status).toBe(405);
    const foreign = args("DELETE");
    foreign.request = new Request(foreign.request.url, { method: "DELETE", headers: { Origin: "https://evil.test" } });
    expect((await spacePostAction(foreign)).status).toBe(403);
    const response = await spacePostAction(args("DELETE"));
    expect(response.status).toBe(200);
    expect(mocks.deletePost).toHaveBeenCalledWith(POST, USER, expect.anything(), { expectedSpaceId: SPACE });
  });
});
