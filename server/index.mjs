import { fileURLToPath } from "node:url";
import { createRequestHandler } from "react-router";
import { createProductionServer, runtimeConfig } from "./http.mjs";

async function start() {
  const config = runtimeConfig();
  const { verifyRuntimeDatabase } = await import("../build/runtime/database.js");
  await verifyRuntimeDatabase();
  const build = await import("../build/server/index.js");
  const { server, shutdown } = await createProductionServer({
    origin: config.origin,
    clientDirectory: fileURLToPath(new URL("../build/client", import.meta.url)),
    handleRequest: createRequestHandler(build, "production"),
  });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try {
      const { forced } = await shutdown(config.shutdownTimeoutMs);
      await build.entry.module.flushTelemetry?.();
      if (forced) console.error("Production shutdown deadline exceeded");
      process.exit(forced ? 1 : 0);
    } catch {
      console.error("Production server shutdown failed");
      process.exit(1);
    }
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, resolve);
  });
  console.log(`SafeSpace production server listening on port ${config.port}`);
}

start().catch(() => {
  // Configuration/Prisma errors may embed URLs or passwords; never print them.
  console.error("Production startup failed: check configuration, build artifacts, migrations and the non-owner database role");
  process.exitCode = 1;
});
