/**
 * Privacy boundary for technical telemetry. The API deliberately has no fields
 * for user IDs, space/post/media IDs, URLs, filenames, search queries, report
 * descriptions, email addresses, tokens, or arbitrary metadata.
 */

export const OBSERVABILITY_OPERATIONS = [
  "account.delete",
  "account.export",
  "account.update",
  "auth.login",
  "auth.register",
  "database.query",
  "invite.deliver",
  "media.delete",
  "media.download",
  "media.upload",
  "media.update",
  "moderation.mutate",
  "post.create",
  "post.delete",
  "post.update",
  "search.execute",
  "space.mutate",
  "system.startup",
  "system.render",
  "system_announcement.mutate",
] as const;

export type ObservabilityOperation = (typeof OBSERVABILITY_OPERATIONS)[number];
export type ObservabilityOutcome = "failure" | "success" | "timeout";

export type ObservabilityContext = {
  operation: ObservabilityOperation;
  outcome?: ObservabilityOutcome;
  errorCode?: string;
  httpStatus?: number;
  mediaKind?: "audio" | "image" | "video";
  storageProvider?: "r2";
  durationMs?: number;
  payloadBytes?: number;
  retryCount?: number;
};

export type SafeTelemetry = {
  tags: Record<string, string>;
  measurements: Record<string, number>;
};

type SentryFrameLike = Record<string, unknown>;
export type SentryEventLike = Record<string, unknown>;

const OPERATIONS = new Set<string>(OBSERVABILITY_OPERATIONS);
const OUTCOMES = new Set<string>(["failure", "success", "timeout"]);
const LEVELS = new Set<string>(["debug", "info", "warning", "error", "fatal"]);
const MEDIA_KINDS = new Set<string>(["audio", "image", "video"]);
const ERROR_CODE_PATTERN = /^[a-z_]+:[a-z_]+$/;
const SAFE_ERROR_TYPE_PATTERN = /^(?:Error|[A-Za-z][A-Za-z0-9]{0,47}Error)$/;
const SAFE_ENVIRONMENTS = new Set(["development", "preview", "production", "staging", "test"]);
const SAFE_RELEASE_PATTERN = /^(?:[a-f0-9]{7,64}|safespace@[A-Za-z0-9][A-Za-z0-9.-]{0,63})$/;

function finiteNonNegative(value: unknown, maximum: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum
    ? value
    : undefined;
}

function safeErrorType(value: unknown): string {
  return typeof value === "string" && SAFE_ERROR_TYPE_PATTERN.test(value) ? value : "Error";
}

function safeFunctionName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/[^A-Za-z0-9_.$<>[\] ]/g, "").trim().slice(0, 120);
  return normalized || undefined;
}

/** Removes origins, query strings and workstation/user directories. */
export function sanitizeStackFilename(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  let path = value.replaceAll("\\", "/").split(/[?#]/, 1)[0] ?? "";
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) path = new URL(path).pathname;
  } catch {
    return undefined;
  }
  const appIndex = path.lastIndexOf("/app/");
  if (appIndex >= 0) return path.slice(appIndex + 1).slice(0, 240);
  const modulesIndex = path.lastIndexOf("/node_modules/");
  if (modulesIndex >= 0) {
    const segments = path.slice(modulesIndex + 14).split("/");
    const packageLength = segments[0]?.startsWith("@") ? 2 : 1;
    const packageName = segments.slice(0, packageLength).join("/");
    const fileName = segments.at(-1) || "module";
    return `node_modules/${packageName}/${fileName}`.slice(0, 240);
  }
  return "<external>";
}

function sanitizeStack(stack: string | undefined, errorType: string): string | undefined {
  if (!stack) return undefined;
  const frames: string[] = [];
  for (const line of stack.split("\n").slice(1, 31)) {
    const match = line.match(/^\s*at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
    if (!match) continue;
    const functionName = safeFunctionName(match[1]) ?? "anonymous";
    const fileName = sanitizeStackFilename(match[2]);
    if (!fileName) continue;
    frames.push(`    at ${functionName} (${fileName}:${match[3]}:${match[4]})`);
  }
  return frames.length > 0 ? [`${errorType}: Captured technical failure`, ...frames].join("\n") : undefined;
}

export function createPrivacySafeError(error: unknown): Error {
  const source = error instanceof Error ? error : undefined;
  const name = safeErrorType(source?.name);
  const safe = new Error("Captured technical failure");
  safe.name = name;
  safe.stack = sanitizeStack(source?.stack, name);
  return safe;
}

export function sanitizeObservabilityContext(context: ObservabilityContext): SafeTelemetry {
  const operation = OPERATIONS.has(context.operation) ? context.operation : "system.startup";
  const tags: Record<string, string> = { operation };
  if (context.outcome && OUTCOMES.has(context.outcome)) tags.outcome = context.outcome;
  if (context.errorCode && ERROR_CODE_PATTERN.test(context.errorCode)) {
    tags.error_code = context.errorCode;
  }
  if (Number.isInteger(context.httpStatus) && context.httpStatus! >= 100 && context.httpStatus! <= 599) {
    tags.http_status = String(context.httpStatus);
  }
  if (context.mediaKind && MEDIA_KINDS.has(context.mediaKind)) tags.media_kind = context.mediaKind;
  if (context.storageProvider === "r2") tags.storage_provider = "r2";

  const measurements: Record<string, number> = {};
  const durationMs = finiteNonNegative(context.durationMs, 86_400_000);
  const payloadBytes = finiteNonNegative(context.payloadBytes, 1_000_000_000);
  const retryCount = finiteNonNegative(context.retryCount, 100);
  if (durationMs !== undefined) measurements.duration_ms = durationMs;
  if (payloadBytes !== undefined) measurements.payload_bytes = payloadBytes;
  if (retryCount !== undefined) measurements.retry_count = retryCount;
  return { tags, measurements };
}

function sanitizeFrame(frame: SentryFrameLike): SentryFrameLike | null {
  const filename = sanitizeStackFilename(frame.filename ?? frame.abs_path);
  if (!filename) return null;
  const output: SentryFrameLike = { filename };
  const functionName = safeFunctionName(frame.function);
  if (functionName) output.function = functionName;
  const line = finiteNonNegative(frame.lineno, 10_000_000);
  const column = finiteNonNegative(frame.colno, 100_000);
  if (line !== undefined) output.lineno = line;
  if (column !== undefined) output.colno = column;
  if (typeof frame.in_app === "boolean") output.in_app = frame.in_app;
  return output;
}

function safeRelease(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_RELEASE_PATTERN.test(value) ? value : undefined;
}

/**
 * Final Sentry `beforeSend` gate. It reconstructs an event from a strict
 * allowlist, so future SDK integrations cannot accidentally add request/user
 * data, breadcrumbs, source context, cookies, URLs or local variables.
 */
export function sanitizeSentryEvent(event: SentryEventLike): SentryEventLike {
  const output: SentryEventLike = {
    platform: "node",
    logger: "safespace",
  };
  if (typeof event.event_id === "string" && /^[a-f0-9]{32}$/i.test(event.event_id)) {
    output.event_id = event.event_id;
  }
  if (typeof event.timestamp === "number" && Number.isFinite(event.timestamp)) {
    output.timestamp = event.timestamp;
  }
  if (typeof event.level === "string" && LEVELS.has(event.level)) output.level = event.level;
  const environment =
    typeof event.environment === "string" && SAFE_ENVIRONMENTS.has(event.environment)
      ? event.environment
      : undefined;
  const release = safeRelease(event.release);
  if (environment) output.environment = environment;
  if (release) output.release = release;

  const rawTags =
    typeof event.tags === "object" && event.tags !== null
      ? (event.tags as Record<string, unknown>)
      : {};
  const operation =
    typeof rawTags.operation === "string" && OPERATIONS.has(rawTags.operation)
      ? (rawTags.operation as ObservabilityOperation)
      : "system.startup";
  const safeContext = sanitizeObservabilityContext({
    operation,
    outcome: OUTCOMES.has(String(rawTags.outcome))
      ? (rawTags.outcome as ObservabilityOutcome)
      : undefined,
    errorCode:
      typeof rawTags.error_code === "string" ? rawTags.error_code : undefined,
    httpStatus:
      typeof rawTags.http_status === "string" ? Number(rawTags.http_status) : undefined,
    mediaKind: MEDIA_KINDS.has(String(rawTags.media_kind))
      ? (rawTags.media_kind as "audio" | "image" | "video")
      : undefined,
    storageProvider: rawTags.storage_provider === "r2" ? "r2" : undefined,
  });
  output.tags = safeContext.tags;
  output.transaction = operation;

  const rawExtra =
    typeof event.extra === "object" && event.extra !== null
      ? (event.extra as Record<string, unknown>)
      : {};
  const measurements = sanitizeObservabilityContext({
    operation,
    durationMs: rawExtra.duration_ms as number,
    payloadBytes: rawExtra.payload_bytes as number,
    retryCount: rawExtra.retry_count as number,
  }).measurements;
  if (Object.keys(measurements).length > 0) output.extra = measurements;

  const rawException = event.exception as
    | { values?: Array<{ type?: unknown; stacktrace?: { frames?: SentryFrameLike[] } }> }
    | undefined;
  const values = rawException?.values?.slice(-3).map((value) => {
    const frames = value.stacktrace?.frames
      ?.slice(-50)
      .map(sanitizeFrame)
      .filter((frame): frame is SentryFrameLike => frame !== null);
    return {
      type: safeErrorType(value.type),
      value: "Captured technical failure",
      ...(frames && frames.length > 0 ? { stacktrace: { frames } } : {}),
    };
  });
  if (values && values.length > 0) output.exception = { values };
  else output.message = `SafeSpace operation: ${operation}`;
  output.fingerprint = [operation, values?.at(-1)?.type ?? "Error"];
  return output;
}
