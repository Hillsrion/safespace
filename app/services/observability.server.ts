import {
  createPrivacySafeError,
  sanitizeObservabilityContext,
  sanitizeSentryEvent,
  type ObservabilityContext,
  type SentryEventLike,
} from "~/lib/observability/privacy";

type CaptureContext = {
  level?: "error" | "warning";
  tags?: Record<string, string>;
  extra?: Record<string, number>;
  fingerprint?: string[];
};

export type SentryAdapter = {
  init(options: {
    dsn: string;
    environment?: string;
    release?: string;
    sendDefaultPii: false;
    defaultIntegrations: false;
    maxBreadcrumbs: 0;
    tracesSampleRate: 0;
    beforeBreadcrumb(): null;
    beforeSend(event: SentryEventLike): SentryEventLike;
  }): void;
  captureException(error: Error, context: CaptureContext): string | undefined;
  captureMessage?(message: string, context: CaptureContext): string | undefined;
  flush?(timeout: number): Promise<boolean>;
};

export type Observability = {
  captureException(error: unknown, context: ObservabilityContext): Promise<string | null>;
  captureOperationalEvent(context: ObservabilityContext): Promise<string | null>;
  flush(timeoutMs?: number): Promise<boolean>;
};

type ObservabilityConfig = {
  dsn?: string;
  environment?: string;
  release?: string;
};

type AdapterLoader = () => Promise<SentryAdapter | null>;

function validatedDsn(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const dsn = new URL(value);
    if (dsn.protocol !== "https:" || !dsn.username || !/^\/\d+\/?$/.test(dsn.pathname)) {
      return undefined;
    }
    return dsn.toString();
  } catch {
    return undefined;
  }
}

function safeEnvironment(value: string | undefined): string | undefined {
  return value && ["development", "preview", "production", "staging", "test"].includes(value)
    ? value
    : undefined;
}

function safeRelease(value: string | undefined): string | undefined {
  return value && /^(?:[a-f0-9]{7,64}|safespace@[A-Za-z0-9][A-Za-z0-9.-]{0,63})$/.test(value)
    ? value
    : undefined;
}

async function loadOptionalSentryAdapter(): Promise<SentryAdapter | null> {
  try {
    // Avoid a static dependency: deployments that opt into Sentry may install
    // `@sentry/node`; all other deployments stay a zero-network no-op.
    const packageName = "@sentry/node";
    return (await import(/* @vite-ignore */ packageName)) as SentryAdapter;
  } catch {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "observability_adapter_unavailable",
        provider: "sentry",
      })
    );
    return null;
  }
}

export function createObservability(
  config: ObservabilityConfig,
  loadAdapter: AdapterLoader = loadOptionalSentryAdapter
): Observability {
  const dsn = validatedDsn(config.dsn);
  let adapterPromise: Promise<SentryAdapter | null> | undefined;

  const adapter = async (): Promise<SentryAdapter | null> => {
    if (!dsn) return null;
    adapterPromise ??= loadAdapter().then((loaded) => {
      if (!loaded) return null;
      loaded.init({
        dsn,
        environment: safeEnvironment(config.environment),
        release: safeRelease(config.release),
        sendDefaultPii: false,
        defaultIntegrations: false,
        maxBreadcrumbs: 0,
        tracesSampleRate: 0,
        beforeBreadcrumb: () => null,
        beforeSend: sanitizeSentryEvent,
      });
      return loaded;
    });
    return adapterPromise;
  };

  const captureContext = (context: ObservabilityContext): CaptureContext => {
    const safe = sanitizeObservabilityContext(context);
    return {
      level: context.outcome === "timeout" ? "warning" : "error",
      tags: safe.tags,
      extra: safe.measurements,
      fingerprint: [safe.tags.operation, safe.tags.error_code ?? "technical_failure"],
    };
  };

  return {
    async captureException(error, context) {
      try {
        const loaded = await adapter();
        if (!loaded) return null;
        return loaded.captureException(createPrivacySafeError(error), captureContext(context)) ?? null;
      } catch {
        console.warn(JSON.stringify({ level: "warn", event: "observability_capture_failed" }));
        return null;
      }
    },
    async captureOperationalEvent(context) {
      try {
        const loaded = await adapter();
        if (!loaded?.captureMessage) return null;
        const safe = sanitizeObservabilityContext(context);
        return (
          loaded.captureMessage(
            `SafeSpace operation: ${safe.tags.operation}`,
            captureContext(context)
          ) ?? null
        );
      } catch {
        console.warn(JSON.stringify({ level: "warn", event: "observability_capture_failed" }));
        return null;
      }
    },
    async flush(timeoutMs = 2_000) {
      try {
        const loaded = await adapter();
        if (!loaded?.flush) return true;
        const boundedTimeout = Math.max(1, Math.min(5_000, Math.floor(timeoutMs)));
        return loaded.flush(boundedTimeout);
      } catch {
        return false;
      }
    },
  };
}

let defaultObservability: Observability | undefined;

export function getObservability(): Observability {
  defaultObservability ??= createObservability({
    dsn: process.env.SENTRY_DSN?.trim(),
    environment: process.env.OBSERVABILITY_ENVIRONMENT?.trim() || process.env.NODE_ENV,
    release: process.env.APP_RELEASE?.trim(),
  });
  return defaultObservability;
}

export async function captureServerException(
  error: unknown,
  context: ObservabilityContext
): Promise<string | null> {
  return getObservability().captureException(error, context);
}
