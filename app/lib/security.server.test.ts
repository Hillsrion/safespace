import { describe, expect, it } from "vitest";
import { HttpError } from "~/lib/api/http-error";
import { requireSameOrigin, SECURITY_HEADERS } from "./security.server";

describe("requireSameOrigin", () => {
  it("accepts a same-origin mutation", () => {
    const request = new Request("https://safe.example/account", {
      method: "POST",
      headers: { Origin: "https://safe.example" },
    });

    expect(() => requireSameOrigin(request)).not.toThrow();
  });

  it("rejects a cross-origin mutation", () => {
    const request = new Request("https://safe.example/account", {
      method: "POST",
      headers: { Origin: "https://attacker.example" },
    });

    expect(() => requireSameOrigin(request)).toThrowError(
      expect.objectContaining<Partial<HttpError>>({ status: 403 })
    );
  });

  it("does not require an origin for safe methods", () => {
    expect(() =>
      requireSameOrigin(new Request("https://safe.example/dashboard"))
    ).not.toThrow();
  });
});

describe("security headers", () => {
  it("prevents framing and MIME sniffing", () => {
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(SECURITY_HEADERS["Cache-Control"]).toBe("private, no-store");
    expect(SECURITY_HEADERS["Strict-Transport-Security"]).toContain(
      "max-age=63072000"
    );
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toContain(
      "frame-ancestors 'none'"
    );
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toContain(
      "form-action 'self'"
    );
  });
});
