import { describe, expect, it } from "vitest";
import { advancedSearchQuerySchema, savedSearchCreateSchema } from "./search";

describe("advanced search schemas", () => {
  it("accepts the documented type and post filters", () => {
    expect(
      advancedSearchQuerySchema.parse({
        q: "reported account",
        type: "posts",
        severity: "high",
        verification: "verified",
      })
    ).toMatchObject({ type: "posts", severity: "high", verification: "verified" });
  });

  it("rejects an enabled alert without a normalized handle", () => {
    expect(() =>
      savedSearchCreateSchema.parse({
        name: "Alert",
        query: "reported account",
        alertEnabled: true,
      })
    ).toThrow();
  });

  it("normalizes the alert handle without persisting an @ prefix", () => {
    expect(
      savedSearchCreateSchema.parse({
        name: "Alert",
        query: "reported account",
        alertEnabled: true,
        alertHandle: "@Reported.Account",
      }).alertHandle
    ).toBe("reported.account");
  });
});
