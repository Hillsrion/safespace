import { describe, expect, it } from "vitest";
import {
  getLastVisitedSpaceId,
  persistLastVisitedSpace,
  selectAccessibleLastVisitedSpace,
} from "./last-visited-space";

const SPACE_A = "00000000-0000-4000-8000-000000000001";
const SPACE_B = "00000000-0000-4000-8000-000000000002";

describe("last visited space preference", () => {
  it("only accepts a UUID from its own cookie", () => {
    expect(
      getLastVisitedSpaceId(`theme=dark; safespace_last_visited_space=${SPACE_A}`)
    ).toBe(SPACE_A);
    expect(getLastVisitedSpaceId("safespace_last_visited_space=not-a-space")).toBeNull();
    expect(getLastVisitedSpaceId("another_cookie=" + SPACE_A)).toBeNull();
  });

  it("redirects only to a currently accessible space", () => {
    const spaces = [{ id: SPACE_A, name: "A" }];
    expect(selectAccessibleLastVisitedSpace(SPACE_A, spaces)).toEqual(spaces[0]);
    expect(selectAccessibleLastVisitedSpace(SPACE_B, spaces)).toBeNull();
    expect(selectAccessibleLastVisitedSpace(null, spaces)).toBeNull();
  });

  it("persists only a valid dashboard space path", () => {
    document.cookie = "safespace_last_visited_space=; Path=/; Max-Age=0";

    persistLastVisitedSpace(`/dashboard/spaces/${SPACE_A}`);
    expect(getLastVisitedSpaceId(document.cookie)).toBe(SPACE_A);

    persistLastVisitedSpace(`/dashboard?spaceId=${SPACE_B}`);
    expect(getLastVisitedSpaceId(document.cookie)).toBe(SPACE_B);

    persistLastVisitedSpace("/dashboard/spaces/not-a-uuid");
    expect(getLastVisitedSpaceId(document.cookie)).toBe(SPACE_B);
  });
});
