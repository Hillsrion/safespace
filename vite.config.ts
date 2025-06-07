import { reactRouter } from "@react-router/dev/vite";
import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import netlifyPlugin from "@netlify/vite-plugin-react-router";
import devtoolsJson from "vite-plugin-devtools-json";
import type { UserConfig } from "vite";
import type { InlineConfig } from "vitest/node";

interface VitestUserConfig extends UserConfig {
  test: InlineConfig;
}

export default defineConfig({
  css: {
    postcss: {
      plugins: [tailwindcss, autoprefixer],
    },
  },
  plugins: [reactRouter(), tsconfigPaths(), netlifyPlugin(), devtoolsJson()],
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: "./app/test/setup-test-env.ts",
    include: ["./app/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    watchExclude: [".*\\/node_modules\\/.*", ".*\\/build\\/.*"],
    resolve: {
      conditions: ["node", "import", "module"],
    },
    alias: [
      {
        find: /^msw\/node$/,
        replacement: "msw/node",
      },
      {
        find: /^tslib$/,
        replacement: "tslib/tslib.js", // Attempt to force CommonJS version
      },
    ],
  },
} as VitestUserConfig);
