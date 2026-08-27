import { NodeClient, Scope, createTransport, defaultStackParser, type ErrorEvent } from "@sentry/node";
import type { SentryAdapter } from "./observability.server";
import { sanitizeSentryEvent } from "~/lib/observability/privacy";

/**
 * A private client: no global Sentry.init, integrations, HTTP interception,
 * OpenTelemetry setup, session tracker or automatic process handlers.
 * The transport is a final boundary, including envelope attachments/trace data.
 */
export function createSentryAdapter(send: typeof fetch = globalThis.fetch): SentryAdapter {
  let client: NodeClient | undefined;
  return {
    init(options) {
      client = new NodeClient({
        ...options, debug: false, integrations: [], stackParser: defaultStackParser,
        beforeSend: (event) => options.beforeSend({ ...event }) as unknown as ErrorEvent,
        includeServerName: false, sendClientReports: false, enableLogs: false, enableMetrics: false,
        transport(transportOptions) {
          const transport = createTransport({ ...transportOptions, bufferSize: 20 }, async ({ body }) => {
            const response = await send(transportOptions.url, {
              method: "POST", body: body as BodyInit,
              headers: { "Content-Type": "application/x-sentry-envelope" },
              credentials: "omit", redirect: "error", referrerPolicy: "no-referrer",
              signal: AbortSignal.timeout(2_000),
            });
            // Never read or log a provider response body.
            await response.body?.cancel();
            return { statusCode: response.status, headers: {
              "retry-after": response.headers.get("retry-after"),
              "x-sentry-rate-limits": response.headers.get("x-sentry-rate-limits"),
            } };
          });
          return {
            flush: (timeout) => transport.flush(timeout),
            send(envelope) {
              const event = envelope[1].find(([header]) => header.type === "event")?.[1];
              if (!event || typeof event !== "object" || Array.isArray(event)) return Promise.resolve({});
              const safe = sanitizeSentryEvent(event as Record<string, unknown>) as unknown as ErrorEvent;
              if (!safe.event_id) return Promise.resolve({});
              // Rebuild instead of forwarding envelope headers: no DSC, replay,
              // attachments, logs, sessions, metrics or profiling payloads.
              return transport.send([
                { event_id: safe.event_id, sent_at: new Date().toISOString() },
                [[{ type: "event" }, safe]],
              ]);
            },
          };
        },
      });
      client.init();
    },
    captureException(error, context) {
      const scope = new Scope();
      scope.update(context);
      return client?.captureException(error, {}, scope);
    },
    captureMessage(message, context) {
      const scope = new Scope();
      scope.update(context);
      return client?.captureMessage(message, context.level, {}, scope);
    },
    async flush(timeout) { return await client?.flush(timeout) ?? true; },
  };
}
