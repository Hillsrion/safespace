// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { getGlobalScope, getClient } from "@sentry/node";
import { createObservability } from "./observability.server";
import { createSentryAdapter } from "./sentry-adapter.server";

describe("real Sentry SDK transport privacy", () => {
  afterEach(() => getGlobalScope().clear());
  it("sends an actual SDK envelope without global PII, attachments, trace context or raw errors", async () => {
    const sent: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const send: typeof fetch = vi.fn(async (url, init) => { sent.push([url, init]); return new Response(null, { status: 200 }); });
    const before = getClient();
    const scope = getGlobalScope();
    scope.setUser({ id: "private-user", email: "victim@example.com", ip_address: "192.0.2.99" });
    scope.setExtra("report", "confidential report");
    scope.setTag("private-tag", "private-token");
    scope.addBreadcrumb({ message: "private breadcrumb" });
    scope.addAttachment({ filename: "private-attachment.txt", data: "confidential attachment" });
    scope.setContext("trace", { trace_id: "b".repeat(32), span_id: "c".repeat(16), data: { private: "trace-secret" } });
    const observability = createObservability({ dsn: "https://publickey@o123.ingest.sentry.io/456", environment: "production", release: "safespace@1.0.0" }, async () => createSentryAdapter(send));
    const eventId = await observability.captureException(new Error("victim@example.com private-token confidential report"), {
      operation: "media.upload", outcome: "failure", httpStatus: 503, payloadBytes: 123,
    });
    expect(eventId).toMatch(/^[a-f0-9]{32}$/);
    expect(await observability.flush()).toBe(true);
    expect(getClient()).toBe(before);
    expect(sent).toHaveLength(1);
    const [url, init] = sent[0];
    expect(String(url)).toMatch(/^https:\/\/o123\.ingest\.sentry\.io\/api\/456\/envelope\//);
    expect(init).toMatchObject({ credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const body = typeof init?.body === "string" ? init.body : new TextDecoder().decode(init?.body as Uint8Array);
    const lines = body.trim().split("\n").map((line) => JSON.parse(line));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual({ event_id: eventId, sent_at: expect.any(String) });
    expect(lines[1]).toMatchObject({ type: "event" });
    expect(lines[2].exception.values[0].value).toBe("Captured technical failure");
    expect(lines[2].tags).toMatchObject({ operation: "media.upload", outcome: "failure", http_status: "503" });
    expect(lines[2].extra).toEqual({ payload_bytes: 123 });
    for (const secret of ["private-user", "victim@example.com", "192.0.2.99", "confidential report", "private-token", "private breadcrumb", "attachment", "trace-secret", "server_name", "cookies", "request", "sdkProcessingMetadata"]) {
      expect(body).not.toContain(secret);
    }
    expect(lines[2]).not.toHaveProperty("contexts");
  });

  it("preserves a useful fixed operational message, never caller content", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const observability = createObservability({ dsn: "https://key@o123.ingest.sentry.io/456" }, async () => createSentryAdapter(send));
    await observability.captureOperationalEvent({ operation: "media.delete", outcome: "failure", retryCount: 2 });
    await observability.flush();
    const payload = String(send.mock.calls[0][1]?.body).trim().split("\n").at(-1)!;
    expect(JSON.parse(payload).message).toBe("SafeSpace operation: media.delete");
  });

  it("does not throw or emit provider response content on transport failure", async () => {
    const send = vi.fn<typeof fetch>().mockRejectedValue(new Error("provider-private-diagnostic"));
    const observability = createObservability({ dsn: "https://key@o123.ingest.sentry.io/456" }, async () => createSentryAdapter(send));
    await expect(observability.captureException(new Error("secret"), { operation: "system.startup" })).resolves.toBeTypeOf("string");
    await expect(observability.flush()).resolves.toBeTypeOf("boolean");
  });
});
