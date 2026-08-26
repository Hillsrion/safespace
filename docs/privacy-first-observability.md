# Privacy-first observability

SafeSpace's technical telemetry is opt-in and disabled by default. The server
continues normally when no provider is configured, when the optional adapter is
not installed, or when capture fails. Audit logs remain the source of truth for
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

## Optional Sentry adapter

No Sentry or network dependency is added by this implementation. Without
`SENTRY_DSN`, the adapter loader is never called and capture is a zero-network
no-op. To enable Sentry in a deployment, approve and install a compatible
`@sentry/node` package, then configure:

```dotenv
SENTRY_DSN=https://public-key@organization.ingest.sentry.io/456
OBSERVABILITY_ENVIRONMENT=production
APP_RELEASE=safespace@release-id
```

Only HTTPS DSNs with a numeric project ID are accepted. Initialization enforces
`sendDefaultPii: false`, disables all default integrations and breadcrumbs, and
sets tracing to zero. Do not add Sentry request, user, browser replay, tracing or
profiling integrations without a new privacy review.

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
