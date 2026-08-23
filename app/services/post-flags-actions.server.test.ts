import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth.server", () => ({ requireUser: vi.fn() }));
vi.mock("../db/repositories/posts/flags.server", () => ({
  createPostFlag: vi.fn(),
  listModerationFlags: vi.fn(),
  decideModerationFlag: vi.fn(),
}));

import {
  createPostFlag,
  decideModerationFlag,
  listModerationFlags,
} from "../db/repositories/posts/flags.server";
import { HttpError } from "../lib/api/http-error";
import { requireUser } from "./auth.server";
import {
  createPostFlagAction,
  decideModerationFlagAction,
  moderationFlagsLoader,
} from "./post-flags-actions.server";

const spaceId = "00000000-0000-4000-8000-000000000001";
const postId = "00000000-0000-4000-8000-000000000010";
const flagId = "00000000-0000-4000-8000-000000000020";
const actor = { id: "00000000-0000-4000-8000-000000000030" };
const baseUrl = `https://safe.test/resources/api/spaces/${spaceId}`;

function request(
  path: string,
  method: string,
  body?: unknown,
  options: { origin?: string; contentType?: string } = {}
) {
  return new Request(`${baseUrl}${path}`, {
    method,
    headers: {
      Origin: options.origin ?? "https://safe.test",
      ...(body === undefined
        ? {}
        : { "Content-Type": options.contentType ?? "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("post flag resource boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireUser).mockResolvedValue(actor as never);
  });

  it("enforces CSRF before creating a flag", async () => {
    const response = await createPostFlagAction({
      request: request("/posts/x/flag", "POST", {}, { origin: "https://evil.test" }),
      params: { spaceId, postId },
      context: undefined,
    } as never);

    expect(response.status).toBe(403);
    expect(createPostFlag).not.toHaveBeenCalled();
  });

  it("requires authentication, POST, JSON, UUIDs, and a strict body", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(
      new HttpError(401, "Unauthorized", "unauthorized:auth")
    );
    const unauthenticated = await createPostFlagAction({
      request: request("/posts/x/flag", "POST", {}),
      params: { spaceId, postId },
      context: undefined,
    } as never);
    expect(unauthenticated.status).toBe(401);

    const wrongMethod = await createPostFlagAction({
      request: request("/posts/x/flag", "PATCH", {}),
      params: { spaceId, postId },
      context: undefined,
    } as never);
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("Allow")).toBe("POST");

    const wrongType = await createPostFlagAction({
      request: request("/posts/x/flag", "POST", {}, { contentType: "text/plain" }),
      params: { spaceId, postId },
      context: undefined,
    } as never);
    expect(wrongType.status).toBe(400);

    const invalid = await createPostFlagAction({
      request: request("/posts/x/flag", "POST", { reason: "ok", extra: true }),
      params: { spaceId: "invalid", postId },
      context: undefined,
    } as never);
    expect(invalid.status).toBe(400);
    expect(createPostFlag).not.toHaveBeenCalled();
  });

  it("returns the documented create response", async () => {
    vi.mocked(createPostFlag).mockResolvedValue({
      id: flagId,
      postId,
      reason: null,
      status: "pending_review",
      createdAt: "2026-08-23T12:00:00.000Z",
      resolvedAt: null,
    });

    const response = await createPostFlagAction({
      request: request("/posts/x/flag", "POST", {}),
      params: { spaceId, postId },
      context: undefined,
    } as never);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      success: true,
      flag: { id: flagId, status: "pending_review" },
    });
    expect(createPostFlag).toHaveBeenCalledWith(actor, { spaceId, postId });
  });

  it("strictly validates and forwards moderation queue pagination", async () => {
    vi.mocked(listModerationFlags).mockResolvedValue({
      flags: [],
      hasNextPage: false,
    });
    const response = await moderationFlagsLoader({
      request: request("/moderation/flags?status=rejected&limit=10", "GET"),
      params: { spaceId },
      context: undefined,
    } as never);

    expect(response.status).toBe(200);
    expect(listModerationFlags).toHaveBeenCalledWith(actor, {
      spaceId,
      status: "rejected",
      limit: 10,
    });

    const invalid = await moderationFlagsLoader({
      request: request("/moderation/flags?limit=101&extra=x", "GET"),
      params: { spaceId },
      context: undefined,
    } as never);
    expect(invalid.status).toBe(400);
  });

  it("requires PATCH, same-origin JSON, and a final decision status", async () => {
    const wrongStatus = await decideModerationFlagAction({
      request: request("/moderation/flags/x", "PATCH", {
        status: "pending_review",
      }),
      params: { spaceId, flagId },
      context: undefined,
    } as never);
    expect(wrongStatus.status).toBe(400);

    const crossOrigin = await decideModerationFlagAction({
      request: request(
        "/moderation/flags/x",
        "PATCH",
        { status: "resolved" },
        { origin: "https://evil.test" }
      ),
      params: { spaceId, flagId },
      context: undefined,
    } as never);
    expect(crossOrigin.status).toBe(403);

    vi.mocked(decideModerationFlag).mockResolvedValue({
      id: flagId,
      postId,
      reason: null,
      status: "rejected",
      createdAt: "2026-08-23T12:00:00.000Z",
      resolvedAt: "2026-08-23T12:05:00.000Z",
    });
    const accepted = await decideModerationFlagAction({
      request: request("/moderation/flags/x", "PATCH", {
        status: "rejected",
      }),
      params: { spaceId, flagId },
      context: undefined,
    } as never);
    expect(accepted.status).toBe(200);
    expect(decideModerationFlag).toHaveBeenCalledWith(actor, {
      spaceId,
      flagId,
      status: "rejected",
    });
  });
});
