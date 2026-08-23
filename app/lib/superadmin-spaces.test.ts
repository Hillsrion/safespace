import { describe, expect, it } from "vitest";
import {
  adminSpaceListQuerySchema,
  auditLogQuerySchema,
  createAdminSpaceSchema,
  deleteAdminSpaceSchema,
  updateAdminSpaceSchema,
} from "./superadmin-spaces";

const SPACE_ID = "11111111-1111-4111-8111-111111111111";

describe("SuperAdmin space schemas", () => {
  it("trims creation fields and normalizes an empty description to null", () => {
    expect(
      createAdminSpaceSchema.parse({ name: "  Safety Team ", description: "  " })
    ).toEqual({ name: "Safety Team", description: null });
    expect(createAdminSpaceSchema.parse({ name: "Safety Team" })).toEqual({
      name: "Safety Team",
      description: null,
    });
  });

  it("rejects mass-assignment fields and empty updates", () => {
    expect(
      createAdminSpaceSchema.safeParse({
        name: "Safety Team",
        createdBy: SPACE_ID,
      }).success
    ).toBe(false);
    expect(updateAdminSpaceSchema.safeParse({}).success).toBe(false);
    expect(updateAdminSpaceSchema.parse({ description: null })).toEqual({
      description: null,
    });
  });

  it("accepts only the bounded pagination and known audit filters", () => {
    expect(adminSpaceListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(
      auditLogQuerySchema.parse({
        limit: "25",
        cursor: SPACE_ID,
        spaceId: SPACE_ID,
        action: "space_update",
      })
    ).toEqual({
      limit: 25,
      cursor: SPACE_ID,
      spaceId: SPACE_ID,
      action: "space_update",
    });
    expect(auditLogQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(auditLogQuerySchema.safeParse({ action: "password_read" }).success).toBe(
      false
    );
  });

  it("requires a strict deletion confirmation object", () => {
    expect(deleteAdminSpaceSchema.parse({ confirmation: " DELETE Safety " })).toEqual({
      confirmation: "DELETE Safety",
    });
    expect(
      deleteAdminSpaceSchema.safeParse({
        confirmation: "DELETE Safety",
        cascade: true,
      }).success
    ).toBe(false);
  });
});
