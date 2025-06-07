import { reactRouter } from "@react-router/dev/vite";
import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import netlifyPlugin from "@netlify/vite-plugin-react-router";
import devtoolsJson from "vite-plugin-devtools-json";
import type { UserConfig } from "vite";
import type { InlineConfig } from "vitest/node";
import { fileURLToPath } from "url";

// Helper to create aliases
const createAlias = (name: string, path: string) => ({
  find: name,
  replacement: fileURLToPath(new URL(path, import.meta.url)),
});

interface VitestUserConfig extends UserConfig {
  test: InlineConfig;
}

export default defineConfig(({ command, mode }) => {
  const isTest = mode === 'test' || process.env.NODE_ENV === 'test';
  
  return {
    css: {
      postcss: {
        plugins: [tailwindcss, autoprefixer],
      },
    },
    plugins: isTest 
      ? [tsconfigPaths()] 
      : [reactRouter(), tsconfigPaths(), netlifyPlugin(), devtoolsJson()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./app/test/setup-test-env.ts",
    include: ["./app/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    watchExclude: ["**/node_modules/**", "**/build/**"],
    deps: {
      inline: [
        "react-remove-scroll",
        "@radix-ui/react-dialog",
        "@radix-ui/react-portal",
        "@radix-ui/react-slot",
        "@radix-ui/react-label",
      ],
    },
    resolve: {
      alias: {
        "^@/": "/app/",
        "^msw/node$": "msw/node",
        "^tslib$": "tslib/tslib.cjs",
      },
    },
    alias: [
      // Core aliases
      { find: /^msw\/node$/, replacement: "msw/node" },
      { find: /^@\//, replacement: "/app/" },

      // Fix for tslib
      {
        find: /^tslib$/,
        replacement: fileURLToPath(
          new URL("./node_modules/tslib/tslib.cjs", import.meta.url)
        ),
      },

      // Fix for react-remove-scroll
      {
        find: /^react-remove-scroll$/,
        replacement: fileURLToPath(
          new URL(
            "./node_modules/react-remove-scroll/dist/umd/Component.js",
            import.meta.url
          )
        ),
      },
      {
        find: /^react-remove-scroll\/dist\/es5\/index\.js$/,
        replacement: fileURLToPath(
          new URL(
            "./node_modules/react-remove-scroll/dist/umd/Component.js",
            import.meta.url
          )
        ),
      },

      // Radix UI fixes
      {
        find: /^@radix-ui\/react-dialog$/,
        replacement: fileURLToPath(
          new URL(
            "./node_modules/@radix-ui/react-dialog/dist/index.js",
            import.meta.url
          )
        ),
      },
      {
        find: /^@radix-ui\/react-portal$/,
        replacement: fileURLToPath(
          new URL(
            "./node_modules/@radix-ui/react-portal/dist/index.js",
            import.meta.url
          )
        ),
      },
      {
        find: /^@radix-ui\/react-slot$/,
        replacement: fileURLToPath(
          new URL(
            "./node_modules/@radix-ui/react-slot/dist/index.js",
            import.meta.url
          )
        ),
      },
      {
        find: /^@radix-ui\/react-label$/,
        replacement: fileURLToPath(
          new URL(
            "./node_modules/@radix-ui/react-label/dist/index.js",
            import.meta.url
          )
        ),
      },
    ],
  },
  };
}) as VitestUserConfig;
