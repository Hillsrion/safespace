import { describe, expect, it } from "vitest";
import {
  createInviteToken,
  getInviteTokenCandidates,
  hashInviteToken,
} from "./invite-token.server";

describe("invitation tokens", () => {
  it("creates high-entropy tokens and stores only their digest", () => {
    const first = createInviteToken();
    const second = createInviteToken();

    expect(first.rawToken).not.toBe(first.tokenHash);
    expect(first.tokenHash).toBe(hashInviteToken(first.rawToken));
    expect(first.rawToken.length).toBeGreaterThanOrEqual(40);
    expect(first.rawToken).not.toBe(second.rawToken);
  });

  it("supports hashed tokens and legacy raw tokens during migration", () => {
    expect(getInviteTokenCandidates(" legacy-token ")).toEqual([
      hashInviteToken("legacy-token"),
      "legacy-token",
    ]);
  });
});
