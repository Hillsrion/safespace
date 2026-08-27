import { describe, expect, it } from "vitest";

import { parseError } from "./parse";

describe("public error parsing", () => {
  it("keeps expected client errors while rejecting raw technical messages", () => {
    expect(
      parseError({
        name: "ApiError",
        message: "Access denied",
        status: 403,
        code: "forbidden:api",
      })
    ).toBe("Access denied");

    expect(
      parseError(new Error("Prisma query failed for victim@example.com"))
    ).toBe("An error occurred");
    expect(
      parseError({
        name: "ApiError",
        message: "database password is secret",
        status: 500,
        code: "server_error:api",
      })
    ).toBe("An error occurred");
  });
});
