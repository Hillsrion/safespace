import { describe, expect, it } from "vitest";
import {
  createReportSchema,
  reportIdSchema,
  REPORTED_ENTITY_HANDLE_MAX_LENGTH,
  updateReportSchema,
} from "./reports";

const SPACE_ID = "11111111-1111-4111-8111-111111111111";

describe("report payload schemas", () => {
  it("normalizes names, descriptions and Instagram handles on create", () => {
    const result = createReportSchema.parse({
      spaceId: SPACE_ID,
      entity: {
        name: "  Example Person  ",
        handles: [" @Example.Name ", "example.name", "SECOND_HANDLE"],
      },
      description: "  A factual report.  ",
    });

    expect(result).toEqual({
      spaceId: SPACE_ID,
      entity: {
        name: "Example Person",
        handles: ["example.name", "second_handle"],
      },
      description: "A factual report.",
      isAnonymous: false,
      isAdminOnly: false,
    });
  });

  it("rejects malformed handles, empty text and unknown fields", () => {
    expect(
      createReportSchema.safeParse({
        spaceId: SPACE_ID,
        entity: { name: "Person", handles: ["not a handle"] },
        description: "Report",
      }).success
    ).toBe(false);
    expect(
      createReportSchema.safeParse({
        spaceId: SPACE_ID,
        entity: { name: " ", handles: ["valid"] },
        description: " ",
      }).success
    ).toBe(false);
    expect(
      createReportSchema.safeParse({
        spaceId: SPACE_ID,
        entity: { name: "Person", handles: ["valid"] },
        description: "Report",
        authorId: SPACE_ID,
      }).success
    ).toBe(false);
  });

  it("applies handle length after stripping @ and whitespace", () => {
    const maxLengthHandle = "a".repeat(REPORTED_ENTITY_HANDLE_MAX_LENGTH);

    expect(
      createReportSchema.parse({
        spaceId: SPACE_ID,
        entity: { name: "Person", handles: [` @${maxLengthHandle} `] },
        description: "Report",
      }).entity.handles
    ).toEqual([maxLengthHandle]);
    expect(
      createReportSchema.safeParse({
        spaceId: SPACE_ID,
        entity: { name: "Person", handles: [`a${maxLengthHandle}`] },
        description: "Report",
      }).success
    ).toBe(false);
  });

  it("requires at least one editable update field", () => {
    expect(updateReportSchema.safeParse({}).success).toBe(false);
    expect(updateReportSchema.safeParse({ spaceId: SPACE_ID }).success).toBe(
      false
    );
    expect(
      updateReportSchema.parse({
        spaceId: SPACE_ID,
        isAnonymous: false,
      })
    ).toEqual({ spaceId: SPACE_ID, isAnonymous: false });
  });

  it("accepts only the supported classification values", () => {
    expect(
      createReportSchema.parse({
        spaceId: SPACE_ID,
        entity: { name: "Person", handles: ["valid"] },
        description: "Report",
        severity: "high",
        verificationStatus: "pending",
      })
    ).toMatchObject({ severity: "high", verificationStatus: "pending" });
    expect(updateReportSchema.safeParse({ severity: "critical" }).success).toBe(false);
    expect(
      updateReportSchema.safeParse({ verificationStatus: "approved" }).success
    ).toBe(false);
  });

  it("validates UUID route identifiers", () => {
    expect(reportIdSchema.parse(SPACE_ID)).toBe(SPACE_ID);
    expect(reportIdSchema.safeParse("not-a-uuid").success).toBe(false);
  });
});
