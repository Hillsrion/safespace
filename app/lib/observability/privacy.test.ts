import { describe, expect, it } from "vitest";
import {
  createPrivacySafeError,
  sanitizeObservabilityContext,
  sanitizeSentryEvent,
  sanitizeStackFilename,
} from "./privacy";

describe("privacy-first telemetry boundary", () => {
  it("exposes only low-cardinality tags and bounded numeric measurements", () => {
    const safe = sanitizeObservabilityContext({
      operation: "media.upload",
      outcome: "failure",
      errorCode: "server_error:api",
      httpStatus: 503,
      mediaKind: "image",
      storageProvider: "r2",
      durationMs: 42,
      payloadBytes: 12_345,
      retryCount: 1,
    });
    expect(safe).toEqual({
      tags: {
        operation: "media.upload",
        outcome: "failure",
        error_code: "server_error:api",
        http_status: "503",
        media_kind: "image",
        storage_provider: "r2",
      },
      measurements: {
        duration_ms: 42,
        payload_bytes: 12_345,
        retry_count: 1,
      },
    });
  });

  it("never forwards a raw exception message and removes local user paths", () => {
    const source = new Error("Bearer secret-token for victim@example.com in report text");
    source.stack = [
      "Error: Bearer secret-token for victim@example.com in report text",
      "    at upload (/Users/alice/project/app/routes/api/media/upload.ts:10:4)",
      "    at invoke (/Users/alice/project/node_modules/react-router/index.js:20:2)",
    ].join("\n");
    const safe = createPrivacySafeError(source);
    const serialized = `${safe.name}\n${safe.message}\n${safe.stack}`;
    expect(safe.message).toBe("Captured technical failure");
    expect(serialized).toContain("app/routes/api/media/upload.ts");
    expect(serialized).not.toContain("victim@example.com");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("/Users/alice");
  });

  it("normalizes filenames to application/package-relative locations", () => {
    expect(sanitizeStackFilename("file:///srv/safespace/app/services/search.server.ts?token=x")).toBe(
      "app/services/search.server.ts"
    );
    expect(sanitizeStackFilename("/Users/alice/private/file.ts")).toBe("<external>");
  });

  it("reconstructs Sentry events and drops user, request, breadcrumb and content data", () => {
    const safe = sanitizeSentryEvent({
      event_id: "a".repeat(32),
      level: "error",
      user: { id: "user-secret", email: "victim@example.com", ip_address: "127.0.0.1" },
      request: {
        url: "https://safe.invalid/posts/private-id?token=secret",
        data: { description: "confidential report" },
        cookies: "session=secret",
      },
      breadcrumbs: [{ message: "confidential report" }],
      tags: {
        operation: "media.download",
        outcome: "failure",
        error_code: "not_found:api",
        media_id: "private-id",
      },
      extra: {
        duration_ms: 12,
        report_description: "confidential report",
      },
      exception: {
        values: [
          {
            type: "StorageError",
            value: "victim@example.com secret-token",
            stacktrace: {
              frames: [
                {
                  abs_path: "/Users/alice/project/app/services/media.server.ts",
                  function: "download",
                  lineno: 20,
                  context_line: "const token = 'secret-token'",
                  vars: { report: "confidential report" },
                },
              ],
            },
          },
        ],
      },
    });
    const serialized = JSON.stringify(safe);
    expect(safe.tags).toEqual({
      operation: "media.download",
      outcome: "failure",
      error_code: "not_found:api",
    });
    expect(serialized).toContain("app/services/media.server.ts");
    for (const secret of [
      "victim@example.com",
      "secret-token",
      "confidential report",
      "private-id",
      "/Users/alice",
      "session=",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(safe).not.toHaveProperty("request");
    expect(safe).not.toHaveProperty("user");
    expect(safe).not.toHaveProperty("breadcrumbs");
  });
});
