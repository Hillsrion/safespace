import { describe, expect, it, vi } from "vitest";

import {
  dashboardDestinationForSpace,
  parseSpaceLoginId,
  resolveSpaceLoginDestination,
} from "./space-login.server";

const SPACE_ID = "00000000-0000-4000-8000-000000000001";

function accessClient({
  role = null,
  discipline = null,
  superAdmin = false,
  space = false,
}: {
  role?: string | null;
  discipline?: "restriction" | "suspension" | null;
  superAdmin?: boolean;
  space?: boolean;
} = {}) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue({ isSuperAdmin: superAdmin }),
    },
    userSpaceMembership: {
      findUnique: vi.fn().mockResolvedValue(role ? { role } : null),
    },
    disciplinaryAction: {
      findFirst: vi.fn().mockResolvedValue(discipline ? { kind: discipline } : null),
    },
    space: {
      findUnique: vi.fn().mockResolvedValue(space ? { id: SPACE_ID } : null),
    },
  };
}

describe("space login destination", () => {
  it("does not turn malformed path values into a selected space", async () => {
    const client = accessClient();

    expect(parseSpaceLoginId("not-a-space")).toBeNull();
    await expect(
      resolveSpaceLoginDestination(
        { id: "user-1", isSuperAdmin: false },
        "not-a-space",
        client as never
      )
    ).resolves.toBe("/dashboard");

    expect(client.userSpaceMembership.findUnique).not.toHaveBeenCalled();
    expect(client.space.findUnique).not.toHaveBeenCalled();
  });

  it("keeps a regular user on the requested space only with effective access", async () => {
    const client = accessClient({ role: "EDITOR" });

    await expect(
      resolveSpaceLoginDestination(
        { id: "user-1", isSuperAdmin: false },
        SPACE_ID,
        client as never
      )
    ).resolves.toBe(dashboardDestinationForSpace(SPACE_ID));

    expect(client.userSpaceMembership.findUnique).toHaveBeenCalledWith({
      where: { userId_spaceId: { userId: "user-1", spaceId: SPACE_ID } },
      select: { role: true },
    });
  });

  it("falls back to the general dashboard when membership has been revoked", async () => {
    const client = accessClient();

    await expect(
      resolveSpaceLoginDestination(
        { id: "user-1", isSuperAdmin: false },
        SPACE_ID,
        client as never
      )
    ).resolves.toBe("/dashboard");
  });

  it("refuses a suspended member even while the membership record remains", async () => {
    const client = accessClient({ role: "EDITOR", discipline: "suspension" });

    await expect(
      resolveSpaceLoginDestination(
        { id: "user-1", isSuperAdmin: false },
        SPACE_ID,
        client as never
      )
    ).resolves.toBe("/dashboard");
  });

  it("allows a restricted member to resume at the read-only space", async () => {
    const client = accessClient({ role: "ADMIN", discipline: "restriction" });

    await expect(
      resolveSpaceLoginDestination(
        { id: "user-1", isSuperAdmin: false },
        SPACE_ID,
        client as never
      )
    ).resolves.toBe(dashboardDestinationForSpace(SPACE_ID));
  });

  it("preserves super-admin access while requiring a real target space", async () => {
    const client = accessClient({ space: true, superAdmin: true });

    await expect(
      resolveSpaceLoginDestination(
        // The stored flag, not this stale login projection, determines access.
        { id: "root-1", isSuperAdmin: false },
        SPACE_ID,
        client as never
      )
    ).resolves.toBe(dashboardDestinationForSpace(SPACE_ID));
    expect(client.userSpaceMembership.findUnique).not.toHaveBeenCalled();

    const missing = accessClient({ superAdmin: true });
    await expect(
      resolveSpaceLoginDestination(
        { id: "root-1", isSuperAdmin: false },
        SPACE_ID,
        missing as never
      )
    ).resolves.toBe("/dashboard");
  });
});
