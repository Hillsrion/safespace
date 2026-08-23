import { describe, expect, it } from "vitest";
import { isInviteEligible, normalizeSpaceRole } from "./invitations";

describe("invitation security", () => {
  const now = new Date("2026-08-23T12:00:00Z");

  it("accepts only an unused, unexpired invitation for the same email", () => {
    expect(
      isInviteEligible(
        {
          email: "Member@Example.com",
          isUsed: false,
          expiresAt: new Date("2026-08-23T13:00:00Z"),
        },
        "member@example.com",
        now
      )
    ).toBe(true);
  });

  it("rejects expired, consumed, or email-mismatched invitations", () => {
    expect(
      isInviteEligible(
        { email: "a@example.com", isUsed: true, expiresAt: new Date("2027-01-01") },
        "a@example.com",
        now
      )
    ).toBe(false);
    expect(
      isInviteEligible(
        { email: "a@example.com", isUsed: false, expiresAt: now },
        "a@example.com",
        now
      )
    ).toBe(false);
    expect(
      isInviteEligible(
        { email: "a@example.com", isUsed: false, expiresAt: new Date("2027-01-01") },
        "b@example.com",
        now
      )
    ).toBe(false);
  });

  it("normalizes supported roles and rejects unexpected privilege strings", () => {
    expect(normalizeSpaceRole("read-only")).toBe("READ_ONLY");
    expect(normalizeSpaceRole("Moderator")).toBe("MODERATOR");
    expect(normalizeSpaceRole("SUPERADMIN")).toBeNull();
  });
});
