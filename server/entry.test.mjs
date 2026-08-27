import assert from "node:assert/strict";
import { test } from "node:test";
import { tsImport } from "tsx/esm/api";

test("React Router's error hook never logs raw error or request data", async (t) => {
  const { handleError } = await tsImport("../app/entry.server.tsx", import.meta.url);
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args));
  handleError(new Error("private-email@example.invalid database=password report text"), {
    request: new Request("https://safe.example/private-id?token=secret"), context: {}, params: { id: "private-id" },
  });
  assert.deepEqual(logs, [[JSON.stringify({ level: "error", event: "server_render_failure", errorType: "Error" })]]);
  const controller = new AbortController();
  controller.abort();
  handleError(new Error("cancelled"), { request: new Request("https://safe.example", { signal: controller.signal }), context: {}, params: {} });
  assert.equal(logs.length, 1);
});

test("Netlify/data responses preserve cookies while enforcing private cache headers", async () => {
  const { handleDataRequest } = await tsImport("../app/entry.server.tsx", import.meta.url);
  const headers = new Headers({ "Cache-Control": "public, max-age=99999" });
  headers.append("Set-Cookie", "a=1; HttpOnly");
  headers.append("Set-Cookie", "b=2; HttpOnly");
  const response = handleDataRequest(new Response("private data", { headers }));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.getSetCookie().length, 2);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(await response.text(), "private data");
});
