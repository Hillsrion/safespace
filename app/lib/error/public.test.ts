import { describe, expect, it } from "vitest";

import { publicDomainErrorMessage, publicMessageForStatus } from "./public";

describe("public error messages", () => {
  it("keeps 4xx failures actionable without reflecting server error content", () => {
    expect(publicMessageForStatus(403)).toBe(
      "You do not have permission to perform this action."
    );
    expect(publicMessageForStatus(409)).toContain("Refresh and try again");
    expect(publicMessageForStatus(500)).toBe("An unexpected error occurred.");
  });

  it("preserves reviewed recovery hints but rejects interpolated PII", () => {
    expect(
      publicDomainErrorMessage(
        409,
        "A space must retain at least one administrator"
      )
    ).toBe("A space must retain at least one administrator");
    expect(
      publicDomainErrorMessage(
        409,
        "Account owns spaces that must be transferred before deletion"
      )
    ).toBe("Account owns spaces that must be transferred before deletion");
    expect(
      publicDomainErrorMessage(409, "Space Alice’s private network already exists")
    ).toBe("The request conflicts with the current state. Refresh and try again.");
  });
});
