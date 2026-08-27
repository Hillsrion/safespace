import { build } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Build-time only. The production image does not need tsx, Vite or TypeScript.
await build({
  configFile: false,
  plugins: [tsconfigPaths()],
  build: {
    ssr: "server/database.ts",
    outDir: "build/runtime",
    target: "node22",
    sourcemap: false,
    rollupOptions: { output: { entryFileNames: "database.js" } },
  },
});
