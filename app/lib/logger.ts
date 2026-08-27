import {
  sanitizeObservabilityContext,
  type ObservabilityContext,
} from "~/lib/observability/privacy";

type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * This interface deliberately accepts only privacy-allowlisted telemetry.
 * It cannot serialize an Error, a Request, URLs, user data, or arbitrary
 * metadata into server logs.
 */
function formatMessage(
  level: LogLevel,
  event: "server_exception" | "operational_event",
  context: ObservabilityContext
): string {
  const safe = sanitizeObservabilityContext(context);
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...safe.tags,
    ...safe.measurements,
  });
}

export const logger = {
  debug: (context: ObservabilityContext) => {
    console.debug(formatMessage("debug", "operational_event", context));
  },
  info: (context: ObservabilityContext) => {
    console.info(formatMessage("info", "operational_event", context));
  },
  warn: (context: ObservabilityContext) => {
    console.warn(formatMessage("warn", "operational_event", context));
  },
  error: (context: ObservabilityContext) => {
    console.error(formatMessage("error", "server_exception", context));
  },
};
