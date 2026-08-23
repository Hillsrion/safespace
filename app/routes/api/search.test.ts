import { describe, expect, it } from "vitest";
import { getSearchAccessFilters } from "./search";

describe("search access filters", () => {
  it("scopes posts and entities to a regular user's memberships", () => {
    const filters = getSearchAccessFilters({
      id: "user-1",
      isSuperAdmin: false,
    });

    expect(filters.postAccess).toEqual(
      expect.objectContaining({
        space: { memberships: { some: { userId: "user-1" } } },
        status: "active",
      })
    );
    expect(filters.entityAccess).toEqual({
      space: { memberships: { some: { userId: "user-1" } } },
    });
  });

  it("lets a super admin search globally", () => {
    expect(
      getSearchAccessFilters({ id: "root-1", isSuperAdmin: true })
    ).toEqual({ postAccess: {}, entityAccess: {} });
  });

  it("only exposes admin-only posts to elevated space roles", () => {
    const { postAccess } = getSearchAccessFilters({
      id: "user-1",
      isSuperAdmin: false,
    });

    expect(postAccess).toHaveProperty("OR.1.space.memberships.some.role.in", [
      "ADMIN",
      "MODERATOR",
      "Admin",
      "Moderator",
    ]);
  });
});
