# Privacy-first observability

SafeSpace's technical telemetry is opt-in and disabled by default. The server
continues normally when no provider is configured or when capture fails.
The official `@sentry/node` SDK is now included in the production dependencies.
Audit logs remain the source of truth for
security-sensitive business actions; telemetry is only for aggregate technical
health and failures.

## Data boundary

The public capture API accepts only an enumerated operation, low-cardinality
technical tags, and bounded numeric measurements. It has no fields for arbitrary
metadata or for user, space, post, entity, media or storage identifiers.

The following are never sent:

- names, email addresses, social handles, IP addresses or Sentry `user` data;
- report descriptions, search queries, moderation reasons or form/request bodies;
- cookies, session values, authorization headers, invitation/reset tokens or URLs;
- filenames, R2 object keys, database identifiers or local-variable/source context;
- breadcrumbs, request integrations, traces, profiles or replay data.

Raw exception messages are replaced by `Captured technical failure`. Stack
frames retain only application-relative/module-relative filenames, safe function
names and line/column numbers; workstation and user directory paths are removed.
A strict `beforeSend` allowlist reconstructs every event as a second boundary,
even if a future SDK integration enriches the event.

## Opt-in Sentry adapter

Without `SENTRY_DSN`, the adapter loader is never called and capture is a
zero-network no-op. To enable the bundled SDK, configure the deployment:

```dotenv
SENTRY_DSN=https://publickey@organization.ingest.sentry.io/456
OBSERVABILITY_ENVIRONMENT=production
APP_RELEASE=safespace@release-id
```

Only HTTPS DSNs with an alphanumeric/underscore public key and numeric project
ID are accepted; passwords, query strings, fragments and trailing paths are
rejected before the SDK can print an invalid DSN. Initialization enforces
`sendDefaultPii: false`, disables all default integrations and breadcrumbs, and
sets tracing to zero. Do not add Sentry request, user, browser replay, tracing or
profiling integrations without a new privacy review.

The adapter constructs a private `NodeClient`, without global `Sentry.init` or
OpenTelemetry setup. It disables server names, session/client reports, automatic
logs and metrics. A second allowlist at the **transport** boundary reconstructs
the final envelope and drops attachments and dynamic sampling/trace headers,
including data introduced by a global SDK scope. Only explicit technical events
are sent. A real SDK test inspects the serialized envelope with a local injected
transport; no test sends production data to Sentry.

Network requests have a two-second abort deadline, no cookies, no redirects,
no referrer and a 20-event buffer. The Node runtime flushes for at most two
seconds during graceful shutdown. Delivery is best effort, not an audit trail:
abrupt process termination or serverless freezing can still discard telemetry.
Provider-side ingestion/retention must be verified with an approved test event
after configuring a real deployment; local tests do not prove that setup.

## Usage

Server code captures failures with a predeclared operation and technical status:

```ts
await captureServerException(error, {
  operation: "media.upload",
  outcome: "failure",
  errorCode: "server_error:api",
  httpStatus: 503,
  storageProvider: "r2",
});
```

Do not concatenate input or identifiers into operation names, error codes, log
messages, fingerprints or release/environment values. If a new metric is needed,
add it explicitly to `ObservabilityContext` and its sanitizer with tests first.

## Retention and access checklist

Before production enablement, configure the provider project for the shortest
useful retention, restrict project access to operational maintainers, disable
third-party forwarding, and exercise deletion/export obligations with the
privacy owner. Provider-side controls supplement—but never replace—the local
allowlist and tests.
