import { describe, expect, it } from "vitest";

import {
  createReportedEntitySchema,
  reportedEntityItemParamsSchema,
  reportedEntityListQuerySchema,
  updateReportedEntitySchema,
} from "./reported-entities";

const SPACE_ID = "11111111-1111-4111-8111-111111111111";
const ENTITY_ID = "22222222-2222-4222-8222-222222222222";

describe("reported entity admin contracts", () => {
  it("normalizes handles and rejects duplicate or unknown input", () => {
    expect(
      createReportedEntitySchema.parse({
        name: "  Example Person  ",
        handles: [{ platform: "Instagram", handle: " @Example.User " }],
      })
    ).toEqual({
      name: "Example Person",
      handles: [{ platform: "Instagram", handle: "example.user" }],
    });

    expect(
      createReportedEntitySchema.safeParse({
        name: "Example",
        handles: [
          { platform: "Instagram", handle: "@same" },
          { platform: "Other", handle: "SAME" },
        ],
      }).success
    ).toBe(false);
    expect(
      createReportedEntitySchema.safeParse({
        name: "Example",
        handles: [{ platform: "Instagram", handle: "valid" }],
        addedByUserId: ENTITY_ID,
      }).success
    ).toBe(false);
  });

  it("requires an effective update payload", () => {
    expect(updateReportedEntitySchema.safeParse({}).success).toBe(false);
    expect(updateReportedEntitySchema.safeParse({ name: "Renamed" }).success).toBe(
      true
    );
  });

  it("strictly validates UUID paths and bounded pagination", () => {
    expect(
      reportedEntityItemParamsSchema.safeParse({
        spaceId: SPACE_ID,
        entityId: ENTITY_ID,
      }).success
    ).toBe(true);
    expect(
      reportedEntityItemParamsSchema.safeParse({
        spaceId: SPACE_ID,
        entityId: "not-a-uuid",
      }).success
    ).toBe(false);
    expect(reportedEntityListQuerySchema.parse({ limit: "10" })).toEqual({
      limit: 10,
    });
    expect(reportedEntityListQuerySchema.safeParse({ limit: "101" }).success).toBe(
      false
    );
    expect(
      reportedEntityListQuerySchema.safeParse({ limit: "10", extra: "x" }).success
    ).toBe(false);
  });
});
