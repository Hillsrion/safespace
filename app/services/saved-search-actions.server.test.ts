import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth.server", () => ({ requireUser: vi.fn() }));
vi.mock("./saved-searches.server", () => ({
  createSavedSearch: vi.fn(),
  deleteSavedSearch: vi.fn(),
  getSavedSearch: vi.fn(),
  listSavedSearches: vi.fn(),
  updateSavedSearch: vi.fn(),
}));

import { requireUser } from "./auth.server";
import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
  updateSavedSearch,
} from "./saved-searches.server";
import {
  createSavedSearchAction,
  mutateSavedSearchAction,
  savedSearchesLoader,
} from "./saved-search-actions.server";

const SEARCH_ID = "11111111-1111-4111-8111-111111111111";
const actor = { id: "22222222-2222-4222-8222-222222222222", isSuperAdmin: false };

function request(
  path: string,
  method: string,
  body?: unknown,
  origin = "https://safe.test"
) {
  return new Request(`https://safe.test/resources/api${path}`, {
    method,
    headers: {
      Origin: origin,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("saved search resource boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireUser).mockResolvedValue(actor as never);
  });

  it("requires same-origin POST requests before creating state", async () => {
    const response = await createSavedSearchAction({
      request: request("/saved-searches", "POST", { name: "x" }, "https://evil.test"),
      params: {},
      context: undefined,
    } as never);

    expect(response.status).toBe(403);
    expect(createSavedSearch).not.toHaveBeenCalled();
  });

  it("validates a strict create body", async () => {
    const response = await createSavedSearchAction({
      request: request("/saved-searches", "POST", {
        name: "Watch account",
        query: "account",
        unexpected: true,
      }),
      params: {},
      context: undefined,
    } as never);

    expect(response.status).toBe(400);
    expect(createSavedSearch).not.toHaveBeenCalled();
  });

  it("lists the authenticated user's saved searches only", async () => {
    vi.mocked(listSavedSearches).mockResolvedValue([]);
    const response = await savedSearchesLoader({
      request: request("/saved-searches", "GET"),
      params: {},
      context: undefined,
    } as never);

    expect(response.status).toBe(200);
    expect(listSavedSearches).toHaveBeenCalledWith(actor);
  });

  it("accepts PATCH and DELETE only after validating the identifier", async () => {
    const invalid = await mutateSavedSearchAction({
      request: request("/saved-searches/nope", "PATCH", { name: "Changed" }),
      params: { savedSearchId: "nope" },
      context: undefined,
    } as never);
    expect(invalid.status).toBe(400);

    vi.mocked(updateSavedSearch).mockResolvedValue({ id: SEARCH_ID } as never);
    const patch = await mutateSavedSearchAction({
      request: request(`/saved-searches/${SEARCH_ID}`, "PATCH", { name: "Changed" }),
      params: { savedSearchId: SEARCH_ID },
      context: undefined,
    } as never);
    expect(patch.status).toBe(200);
    expect(updateSavedSearch).toHaveBeenCalledWith(actor, SEARCH_ID, { name: "Changed" });

    vi.mocked(deleteSavedSearch).mockResolvedValue({ deletedSavedSearchId: SEARCH_ID });
    const deletion = await mutateSavedSearchAction({
      request: request(`/saved-searches/${SEARCH_ID}`, "DELETE"),
      params: { savedSearchId: SEARCH_ID },
      context: undefined,
    } as never);
    expect(deletion.status).toBe(200);
    expect(deleteSavedSearch).toHaveBeenCalledWith(actor, SEARCH_ID);
  });
});
