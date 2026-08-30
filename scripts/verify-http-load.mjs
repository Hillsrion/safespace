/**
 * Bounded smoke-load test for a locally running production image. It refuses
 * non-loopback targets so this command cannot accidentally load production.
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

const concurrency = 20;
const requestsPerWorker = 15;
const maximumP95Ms = 2_500;

function percentile(values, fraction) {
  assert.ok(values.length > 0, "at least one timing sample is required");
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

async function requestScenario(baseUrl, scenario) {
  const startedAt = performance.now();
  const response = await fetch(new URL(scenario.path, baseUrl), {
    redirect: "manual",
    signal: AbortSignal.timeout(maximumP95Ms * 2),
  });
  const body = await response.text();
  assert.equal(response.status, scenario.status, `${scenario.path} returned ${response.status}`);
  assert.match(
    response.headers.get("cache-control") ?? "",
    /(?:^|,\s*)private(?:,|$)/,
    `${scenario.path} must remain private`,
  );
  assert.match(
    response.headers.get("cache-control") ?? "",
    /(?:^|,\s*)no-store(?:,|$)/,
    `${scenario.path} must not be cached`,
  );
  if (scenario.body) assert.equal(body, scenario.body, `${scenario.path} returned an unexpected body`);
  if (scenario.contains) assert.ok(body.includes(scenario.contains), `${scenario.path} omitted expected content`);
  return performance.now() - startedAt;
}

async function main() {
  assert.equal(process.env.HTTP_LOAD_TEST_ALLOW_LOCAL, "1", "HTTP_LOAD_TEST_ALLOW_LOCAL=1 is required");
  const rawTarget = process.argv[2];
  assert.ok(rawTarget, "a loopback base URL is required");
  const baseUrl = new URL(rawTarget);
  assert.equal(baseUrl.protocol, "http:", "the load smoke test accepts local HTTP only");
  assert.ok(
    ["127.0.0.1", "localhost", "::1", "[::1]"].includes(baseUrl.hostname),
    "the load smoke test refuses non-loopback targets",
  );
  assert.equal(baseUrl.pathname, "/", "the base URL must not contain a path");
  assert.equal(baseUrl.search, "", "the base URL must not contain a query");
  assert.equal(baseUrl.hash, "", "the base URL must not contain a fragment");

  const scenarios = [
    { path: "/community-policy", status: 200, contains: "Charte de conduite" },
    { path: "/dashboard", status: 302 },
    { path: "/_health", status: 200, body: "ok" },
  ];
  const timings = [];
  await Promise.all(Array.from({ length: concurrency }, async (_, worker) => {
    for (let iteration = 0; iteration < requestsPerWorker; iteration += 1) {
      const scenario = scenarios[(worker + iteration) % scenarios.length];
      timings.push(await requestScenario(baseUrl, scenario));
    }
  }));

  const result = {
    requests: timings.length,
    concurrency,
    medianMs: Number(percentile(timings, 0.5).toFixed(2)),
    p95Ms: Number(percentile(timings, 0.95).toFixed(2)),
    maximumMs: Number(Math.max(...timings).toFixed(2)),
  };
  assert.ok(result.p95Ms <= maximumP95Ms, `HTTP p95 exceeded ${maximumP95Ms}ms (${result.p95Ms}ms)`);
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "HTTP load verification failed");
  process.exitCode = 1;
});
