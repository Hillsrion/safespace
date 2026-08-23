import { describe, expect, it } from "vitest";
import {
  adminUserListQuerySchema,
  adminUserParamsSchema,
} from "./superadmin-users";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("SuperAdmin user schemas", () => {
  it("applies a bounded default page", () => {
    expect(adminUserListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(adminUserListQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(adminUserListQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("normalizes safe filters", () => {
    expect(
      adminUserListQuerySchema.parse({
        limit: "25",
        q: "  member@example.com ",
        isSuperAdmin: "false",
        spaceId: UUID,
        role: "EDITOR",
      })
    ).toEqual({
      limit: 25,
      q: "member@example.com",
      isSuperAdmin: false,
      spaceId: UUID,
      role: "EDITOR",
    });
  });

  it("rejects unknown filters, roles and malformed UUIDs", () => {
    expect(adminUserListQuerySchema.safeParse({ includePassword: "true" }).success).toBe(
      false
    );
    expect(adminUserListQuerySchema.safeParse({ role: "OWNER" }).success).toBe(false);
    expect(adminUserListQuerySchema.safeParse({ cursor: "bad-id" }).success).toBe(false);
  });

  it("strictly validates detail parameters", () => {
    expect(adminUserParamsSchema.parse({ userId: UUID })).toEqual({ userId: UUID });
    expect(
      adminUserParamsSchema.safeParse({ userId: UUID, includePassword: "true" }).success
    ).toBe(false);
  });
});
