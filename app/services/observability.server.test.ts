import { describe, expect, it, vi } from "vitest";
import {
  createObservability,
  type SentryAdapter,
} from "./observability.server";

function adapter() {
  return {
    init: vi.fn(),
    captureException: vi.fn(() => "event-id"),
    captureMessage: vi.fn(() => "message-id"),
    flush: vi.fn(async () => true),
  } satisfies SentryAdapter;
}

describe("optional Sentry observability adapter", () => {
  it("is a zero-network no-op when no DSN is configured", async () => {
    const load = vi.fn(async () => adapter());
    const observability = createObservability({}, load);
    await expect(
      observability.captureException(new Error("secret"), {
        operation: "media.upload",
        outcome: "failure",
      })
    ).resolves.toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it("initializes Sentry with every automatic PII surface disabled", async () => {
    const sentry = adapter();
    const observability = createObservability(
      {
        dsn: "https://public-key@o123.ingest.sentry.io/456",
        environment: "production",
        release: "safespace@1.2.3",
      },
      async () => sentry
    );
    await observability.captureException(new Error("private report victim@example.com"), {
      operation: "post.create",
      outcome: "failure",
      errorCode: "server_error:api",
      httpStatus: 500,
    });

    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        sendDefaultPii: false,
        defaultIntegrations: false,
        maxBreadcrumbs: 0,
        tracesSampleRate: 0,
        beforeBreadcrumb: expect.any(Function),
        beforeSend: expect.any(Function),
      })
    );
    expect(sentry.init.mock.calls[0][0].beforeBreadcrumb()).toBeNull();
  });

  it("captures only a sanitized error and allowlisted context", async () => {
    const sentry = adapter();
    const observability = createObservability(
      { dsn: "https://public-key@o123.ingest.sentry.io/456" },
      async () => sentry
    );
    const source = new Error("Bearer secret for victim@example.com");
    source.stack =
      "Error: Bearer secret for victim@example.com\n" +
      "    at upload (/Users/alice/project/app/services/media.server.ts:10:4)";

    await expect(
      observability.captureException(source, {
        operation: "media.upload",
        outcome: "failure",
        errorCode: "server_error:api",
        payloadBytes: 123,
      })
    ).resolves.toBe("event-id");

    const [error, context] = sentry.captureException.mock.calls[0];
    expect(error.message).toBe("Captured technical failure");
    expect(`${error.stack}`).not.toContain("victim@example.com");
    expect(`${error.stack}`).not.toContain("/Users/alice");
    expect(context).toEqual({
      level: "error",
      tags: {
        operation: "media.upload",
        outcome: "failure",
        error_code: "server_error:api",
      },
      extra: { payload_bytes: 123 },
      fingerprint: ["media.upload", "server_error:api"],
    });
  });

  it("never lets adapter failures alter the application error path", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const observability = createObservability(
      { dsn: "https://public-key@o123.ingest.sentry.io/456" },
      async () => {
        throw new Error("module path with private data");
      }
    );
    await expect(
      observability.captureException(new Error("report content"), {
        operation: "post.create",
      })
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      JSON.stringify({ level: "warn", event: "observability_capture_failed" })
    );
    warn.mockRestore();
  });
});

