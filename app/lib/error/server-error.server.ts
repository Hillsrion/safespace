import { logger } from "~/lib/logger";
import type { ObservabilityContext } from "~/lib/observability/privacy";
import { captureServerException } from "~/services/observability.server";

type TechnicalFailureContext = Omit<ObservabilityContext, "outcome">;

/**
 * Technical failure boundary: the raw exception is sent only through the
 * privacy-sanitising telemetry adapter. Local logs contain allowlisted,
 * low-cardinality operational metadata and never exception content.
 */
export function logServerException(
  error: unknown,
  context: TechnicalFailureContext
): void {
  const safeContext: ObservabilityContext = { ...context, outcome: "failure" };
  logger.error(safeContext);
  void captureServerException(error, safeContext);
}
