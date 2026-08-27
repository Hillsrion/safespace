import assert from "node:assert/strict";
import { test } from "node:test";
import { request as httpRequest } from "node:http";
import { mkdtemp, mkdir, writeFile, rm, symlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProductionServer, runtimeConfig, SECURITY_HEADERS } from "./http.mjs";

async function fixture(t, handleRequest = async (request) => Response.json({ url: request.url }), options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "safespace-http-"));
  const clientDirectory = path.join(directory, "client");
  await mkdir(path.join(clientDirectory, "assets"), { recursive: true });
  await writeFile(path.join(clientDirectory, "assets", "app-12345678.js"), "export const ready = true;");
  await writeFile(path.join(clientDirectory, "robots.txt"), "User-agent: *\nDisallow: /dashboard\n");
  await writeFile(path.join(directory, "server-secret.txt"), "not-public-test-fixture");
  await symlink(path.join(directory, "server-secret.txt"), path.join(clientDirectory, "outside.txt"));
  const { server, shutdown } = await createProductionServer({ clientDirectory, origin: "https://safe.example", handleRequest, ...options, onError() {} });
  t.after(async () => {
    await shutdown(100);
    await rm(directory, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, server, shutdown };
}

function rawRequest(base, target, options = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(base, { ...options, path: target }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, text: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject);
    request.end(options.body);
  });
}

test("production config requires HTTPS, private session key and no privileged URL", () => {
  const env = { NODE_ENV: "production", APP_URL: "https://safe.example", DATABASE_URL: "postgresql://app@db/safe", SESSION_SECRET: "a-test-key-longer-than-24-characters" };
  assert.equal(runtimeConfig(env).origin, "https://safe.example");
  for (const override of [
    { NODE_ENV: "test" }, { APP_URL: "http://safe.example" },
    { APP_URL: "https://user:password@safe.example" }, { APP_URL: "https://safe.example/path" },
    { APP_URL: "https://safe.example?query=1" }, { SESSION_SECRET: "short" },
    { DATABASE_URL: "" }, { SYSTEM_DATABASE_URL: "postgresql://owner@db/safe" },
    { PORT: "0" }, { PORT: "3000invalid" }, { SHUTDOWN_TIMEOUT_MS: "0" },
  ]) assert.throws(() => runtimeConfig({ ...env, ...override }));
});

test("adapter security policy stays aligned with application headers", async () => {
  const source = await readFile(new URL("../app/lib/security.server.ts", import.meta.url), "utf8");
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    assert.ok(source.includes(`"${header}"`), `Missing application header ${header}`);
    if (header === "Content-Security-Policy") {
      for (const directive of value.split("; ")) assert.ok(source.includes(`"${directive}"`));
    } else assert.ok(source.includes(`"${value}"`), `Header drift for ${header}`);
  }
});

test("fingerprinted assets are immutable; plain public files revalidate", async (t) => {
  const { base } = await fixture(t);
  const asset = await fetch(`${base}/assets/app-12345678.js`);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.match(asset.headers.get("content-type"), /^text\/javascript/);
  assert.equal(asset.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await asset.text(), "export const ready = true;");
  const cached = await fetch(`${base}/assets/app-12345678.js`, { headers: { "If-None-Match": asset.headers.get("etag") } });
  assert.equal(cached.status, 304);
  assert.equal(await cached.text(), "");
  const head = await fetch(`${base}/assets/app-12345678.js`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), "26");
  assert.equal(await head.text(), "");
  const plain = await fetch(`${base}/robots.txt`);
  assert.equal(plain.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  await plain.text();
});

test("static serving cannot expose dotfiles, traversal, maps or escaping symlinks", async (t) => {
  const { base } = await fixture(t);
  for (const target of ["/.env", "/../server-secret.txt", "/%2e%2e/server-secret.txt", "/assets/%2e%2e/server-secret.txt", "/%5cserver-secret.txt", "/%00.txt", "//evil.example/path", "/%invalid"]) {
    const response = await rawRequest(base, target);
    assert.equal(response.status, 400, target);
    assert.equal(response.headers["cache-control"], "private, no-store");
    assert.ok(!response.text.includes("not-public-test-fixture"));
  }
  for (const target of ["/assets/missing.js", "/assets/app-12345678.js.map"]) {
    const response = await fetch(`${base}${target}`);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    await response.text();
  }
  const outside = await fetch(`${base}/outside.txt`);
  assert.ok(!(await outside.text()).includes("not-public-test-fixture"));
});

test("canonical APP_URL defeats forged Host and forwarding headers; POST streams intact", async (t) => {
  const { base } = await fixture(t, async (request) => Response.json({
    url: request.url, host: request.headers.get("host"), origin: request.headers.get("origin"),
    forwarded: request.headers.get("forwarded"), xForwardedHost: request.headers.get("x-forwarded-host"),
    body: await request.text(),
  }));
  const response = await rawRequest(base, "/action?value=1", {
    method: "POST", body: "hello=world", headers: { Host: "evil.example", Origin: "https://safe.example", "X-Forwarded-Host": "evil.example", "X-Forwarded-Proto": "http", Forwarded: "host=evil.example", "Content-Type": "application/x-www-form-urlencoded" },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.text), { url: "https://safe.example/action?value=1", host: "safe.example", origin: "https://safe.example", forwarded: null, xForwardedHost: null, body: "hello=world" });
});

test("SSR, data, redirects, cookies and errors remain private and uncached", async (t) => {
  const { base } = await fixture(t, async (request) => {
    if (new URL(request.url).pathname === "/error") throw new Error("secret-email@example.invalid");
    const headers = new Headers({ "Cache-Control": "public, max-age=99999", "Content-Type": "text/plain", Location: "/next" });
    headers.append("Set-Cookie", "first=one; HttpOnly; Secure");
    headers.append("Set-Cookie", "second=two; HttpOnly; Secure");
    return new Response("private body", { status: 302, headers });
  });
  const response = await rawRequest(base, "/dashboard.data");
  assert.equal(response.status, 302);
  assert.equal(response.headers["cache-control"], "private, no-store");
  assert.equal(response.headers["set-cookie"].length, 2);
  assert.equal(response.headers["x-frame-options"], "DENY");
  const head = await rawRequest(base, "/dashboard", { method: "HEAD" });
  assert.equal(head.text, "");
  const error = await fetch(`${base}/error`);
  assert.equal(error.status, 500);
  assert.equal(error.headers.get("cache-control"), "private, no-store");
  assert.equal(await error.text(), "Internal server error");
});

test("healthcheck is opaque, uncached, and restricted to GET/HEAD", async (t) => {
  const { base } = await fixture(t, () => { throw new Error("Health must not invoke SSR or a database query"); });
  const health = await fetch(`${base}/_health`);
  assert.equal(health.status, 200);
  assert.equal(await health.text(), "ok");
  assert.equal(health.headers.get("cache-control"), "private, no-store");
  const post = await fetch(`${base}/_health`, { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
  await post.text();
});

test("oversized declared bodies are rejected before SSR", async (t) => {
  const { base } = await fixture(t, () => { throw new Error("Oversized body reached SSR"); });
  const response = await rawRequest(base, "/upload", { method: "POST", headers: { "Content-Length": String(102 * 1024 * 1024) } });
  assert.equal(response.status, 413);
  assert.equal(response.headers.connection, "close");
});

test("chunked bodies cannot bypass the streaming byte limit", async (t) => {
  const { base } = await fixture(t, async (request) => new Response(await request.text()), { maxBodyBytes: 1024 });
  const response = await rawRequest(base, "/upload", {
    method: "POST", headers: { "Transfer-Encoding": "chunked" }, body: "x".repeat(1025),
  });
  assert.equal(response.status, 413);
  assert.equal(response.text, "Payload too large");
});

test("shutdown waits for an in-flight request and then closes the listener", async (t) => {
  let finish;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const { base, shutdown, server } = await fixture(t, async () => {
    markStarted();
    await new Promise((resolve) => { finish = resolve; });
    return new Response("committed response");
  });
  const response = fetch(`${base}/slow`);
  await started;
  let stopped = false;
  const stopping = shutdown(1000).then((result) => { stopped = true; return result; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stopped, false);
  finish();
  assert.equal(await (await response).text(), "committed response");
  assert.deepEqual(await stopping, { forced: false }, "A drained keep-alive connection must not wait for the force deadline");
  assert.equal(server.listening, false);
});

test("shutdown deadline aborts stalled requests and force-closes connections", async (t) => {
  let markStarted;
  let signal;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const { base, shutdown, server } = await fixture(t, async (request) => {
    signal = request.signal;
    markStarted();
    await new Promise((resolve) => request.signal.addEventListener("abort", resolve, { once: true }));
    return new Response("cancelled");
  });
  const pending = fetch(`${base}/stalled`).catch(() => null);
  await started;
  assert.deepEqual(await shutdown(20), { forced: true });
  assert.equal(signal.aborted, true);
  assert.equal(server.listening, false);
  await pending;
});
