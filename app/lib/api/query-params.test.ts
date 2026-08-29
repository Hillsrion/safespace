import { describe, expect, it } from "vitest";

import { HttpError } from "./http-error";
import { parseUniqueSearchParams } from "./query-params";

describe("unique API query parameters", () => {
  it("returns a plain record for unique parameters", () => {
    expect(
      parseUniqueSearchParams(new Request("https://safe.test/api?page=2&role=ADMIN"))
    ).toEqual({ page: "2", role: "ADMIN" });
  });

  it("rejects duplicate names instead of silently selecting one value", () => {
    expect(() =>
      parseUniqueSearchParams(new Request("https://safe.test/api?page=1&page=2"))
    ).toThrow(HttpError);
  });
});
