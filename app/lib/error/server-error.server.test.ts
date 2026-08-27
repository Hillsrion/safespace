import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureServerException: vi.fn(async () => null),
}));

vi.mock("../../services/observability.server", () => ({
  captureServerException: mocks.captureServerException,
}));

import { logServerException } from "./server-error.server";

describe("server technical error boundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps raw exception content out of local logs while capturing it safely", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error(
      "Prisma failed for victim@example.com at https://safe.test/private?token=secret"
    );

    logServerException(error, {
      operation: "post.create",
      errorCode: "server_error:api",
      httpStatus: 500,
    });

    const output = logged.mock.calls[0]?.join(" ") ?? "";
    expect(output).toContain('"operation":"post.create"');
    for (const privateValue of ["victim@example.com", "private?token", "secret", "Prisma"]) {
      expect(output).not.toContain(privateValue);
    }
    expect(mocks.captureServerException).toHaveBeenCalledWith(error, {
      operation: "post.create",
      outcome: "failure",
      errorCode: "server_error:api",
      httpStatus: 500,
    });
  });
});
