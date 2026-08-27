import { createServer } from "node:http";
import { realpath, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

// Match the application policy, including on static assets and adapter errors.
export const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self' https://fonts.gstatic.com data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; upgrade-insecure-requests",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-DNS-Prefetch-Control": "off",
  "X-Frame-Options": "DENY",
};
const MIME_TYPES = {
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".ico": "image/x-icon",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".avif": "image/avif", ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".otf": "font/otf",
};
const HOP_HEADERS = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);
const MAX_BODY_BYTES = 101 * 1024 * 1024;

export function runtimeConfig(env = process.env) {
  if (env.NODE_ENV !== "production") throw new Error("NODE_ENV must be production; use npm run dev for development");
  if (!env.APP_URL) throw new Error("APP_URL is required");
  const origin = new URL(env.APP_URL);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("APP_URL must be a canonical HTTPS origin without credentials, path, query or fragment");
  }
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const database = new URL(env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(database.protocol) || (database.searchParams.get("schema") ?? "public") !== "public") {
    throw new Error("DATABASE_URL must use PostgreSQL and the public schema protected by the migrations");
  }
  if (env.SYSTEM_DATABASE_URL?.trim()) throw new Error("SYSTEM_DATABASE_URL must not be present in the web runtime");
  if (!env.SESSION_SECRET || env.SESSION_SECRET.trim().length < 24 || env.SESSION_SECRET === "your_session_secret_here") {
    throw new Error("SESSION_SECRET must contain a private value of at least 24 characters");
  }
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be between 1 and 65535");
  const shutdownTimeoutMs = Number(env.SHUTDOWN_TIMEOUT_MS ?? 30_000);
  if (!Number.isInteger(shutdownTimeoutMs) || shutdownTimeoutMs < 1000 || shutdownTimeoutMs > 120_000) {
    throw new Error("SHUTDOWN_TIMEOUT_MS must be between 1000 and 120000");
  }
  return { origin: origin.origin, host: env.HOST ?? "0.0.0.0", port, shutdownTimeoutMs };
}

function responseHeaders(res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
  res.setHeader("Cache-Control", "private, no-store");
}

function sendText(req, res, status, text) {
  responseHeaders(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(text));
  res.end(req.method === "HEAD" ? undefined : text);
}

function requestPath(target) {
  // Check before URL normalization, which would otherwise erase dot segments.
  if (!target?.startsWith("/") || target.startsWith("//") || target.includes("#")) return null;
  try {
    const decoded = decodeURIComponent(target.split("?", 1)[0]);
    if (decoded.includes("\\") || /[\u0000-\u001f\u007f]/.test(decoded)) return null;
    if (decoded.split("/").some((part) => part.startsWith("."))) return null;
    return decoded;
  } catch {
    return null;
  }
}

async function staticFile(req, res, pathname, clientDirectory) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const type = MIME_TYPES[path.extname(pathname).toLowerCase()];
  if (!type) return false;
  let file;
  let metadata;
  try {
    file = await realpath(path.resolve(clientDirectory, `.${pathname}`));
    if (!file.startsWith(`${clientDirectory}${path.sep}`)) return false;
    metadata = await stat(file);
    if (!metadata.isFile()) return false;
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return false;
    throw error;
  }
  responseHeaders(res);
  const fingerprinted = pathname.startsWith("/assets/") && /[-.][A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i.test(pathname);
  res.setHeader("Cache-Control", fingerprinted ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate");
  res.setHeader("Content-Type", type);
  const etag = `W/"${metadata.size.toString(16)}-${metadata.mtimeMs.toString(16)}"`;
  res.setHeader("ETag", etag);
  res.setHeader("Last-Modified", metadata.mtime.toUTCString());
  if (req.headers["if-none-match"]?.split(/\s*,\s*/).some((value) => value === etag || value === "*")) {
    res.statusCode = 304;
    res.end();
    return true;
  }
  res.setHeader("Content-Length", metadata.size);
  if (req.method === "HEAD") res.end();
  else await pipeline(createReadStream(file), res);
  return true;
}

async function writeResponse(req, res, response) {
  responseHeaders(res);
  for (const [name, value] of response.headers) {
    if (name !== "set-cookie" && name !== "cache-control" && !HOP_HEADERS.has(name)) res.setHeader(name, value);
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader("Set-Cookie", cookies);
  // Dynamic HTML, loader data, redirects, errors and media must never become
  // public cache entries, even if a future route accidentally asks for caching.
  res.setHeader("Cache-Control", "private, no-store");
  res.statusCode = response.status;
  if (req.method === "HEAD" || response.body === null || [204, 205, 304].includes(response.status)) {
    await response.body?.cancel();
    res.end();
  } else {
    await pipeline(Readable.fromWeb(response.body), res);
  }
}

/** RequestHandler is injected so Node HTTP behavior can be tested without DB. */
export async function createProductionServer({ handleRequest, clientDirectory, origin, maxBodyBytes = MAX_BODY_BYTES, onError = () => console.error("HTTP request failed") }) {
  const publicDirectory = await realpath(clientDirectory);
  let draining = false;
  const controllers = new Set();
  const server = createServer({ maxHeaderSize: 16 * 1024, requestTimeout: 120_000, headersTimeout: 20_000, keepAliveTimeout: 5000 }, async (req, res) => {
    res.once("finish", () => {
      if (draining) setImmediate(() => server.closeIdleConnections());
    });
    let controller;
    let body;
    try {
      const pathname = requestPath(req.url);
      if (pathname === null) return sendText(req, res, 400, "Bad request");
      if (draining) {
        res.setHeader("Connection", "close");
        return sendText(req, res, 503, "Service unavailable");
      }
      if (pathname === "/_health") {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.setHeader("Allow", "GET, HEAD");
          return sendText(req, res, 405, "Method not allowed");
        }
        return sendText(req, res, 200, "ok");
      }
      if (await staticFile(req, res, pathname, publicDirectory)) return;
      // No HTML fallback for missing bundles or source maps.
      if (pathname.startsWith("/assets/") || pathname.endsWith(".map")) return sendText(req, res, 404, "Not found");
      if (["CONNECT", "TRACE"].includes(req.method)) return sendText(req, res, 405, "Method not allowed");
      const length = req.headers["content-length"];
      if (length && (!/^\d+$/.test(length) || Number(length) > maxBodyBytes)) {
        res.setHeader("Connection", "close");
        return sendText(req, res, 413, "Payload too large");
      }
      controller = new AbortController();
      controllers.add(controller);
      const abort = () => controller.abort();
      req.once("aborted", abort);
      res.once("close", abort);
      const headers = new Headers();
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const name = req.rawHeaders[i].toLowerCase();
        if (!HOP_HEADERS.has(name) && name !== "host" && name !== "forwarded" && !name.startsWith("x-forwarded-")) {
          headers.append(name, req.rawHeaders[i + 1]);
        }
      }
      headers.set("host", new URL(origin).host);
      const init = { method: req.method, headers, signal: controller.signal };
      if (req.method !== "GET" && req.method !== "HEAD") {
        let bytes = 0;
        body = new Transform({ transform(chunk, encoding, callback) {
          bytes += chunk.length;
          if (bytes > maxBodyBytes) {
            const error = new Error("Payload too large");
            error.code = "BODY_TOO_LARGE";
            callback(error);
          } else callback(null, chunk);
        } });
        req.pipe(body);
        req.on("error", (error) => body.destroy(error));
        init.body = Readable.toWeb(body);
        init.duplex = "half";
      }
      // Never infer the public origin from Host or forwarded client headers.
      // Coolify terminates TLS; APP_URL retains HTTPS for CSRF checks/redirects.
      const request = new Request(new URL(req.url, origin), init);
      const response = await handleRequest(request);
      if (draining) res.setHeader("Connection", "close");
      await writeResponse(req, res, response);
    } catch (error) {
      if (res.destroyed) return;
      if (res.headersSent) res.destroy();
      else sendText(req, res, error?.code === "BODY_TOO_LARGE" ? 413 : 500, error?.code === "BODY_TOO_LARGE" ? "Payload too large" : "Internal server error");
      // Deliberately omit raw URLs, cookies, headers and error messages.
      if (error?.code !== "BODY_TOO_LARGE") onError();
    } finally {
      if (controller) controllers.delete(controller);
      if (body && !body.readableEnded) {
        req.unpipe(body);
        body.destroy();
        req.resume();
      }
    }
  });
  server.maxRequestsPerSocket = 1000;
  server.on("clientError", (_error, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  });
  let shutdownPromise;
  function shutdown(timeoutMs = 30_000) {
    if (shutdownPromise) return shutdownPromise;
    draining = true;
    if (!server.listening) return Promise.resolve({ forced: false });
    shutdownPromise = new Promise((resolve, reject) => {
      let forced = false;
      const timeout = setTimeout(() => {
        forced = true;
        for (const controller of controllers) controller.abort();
        server.closeAllConnections();
      }, timeoutMs);
      timeout.unref();
      server.close((error) => {
        clearTimeout(timeout);
        if (error) reject(error); else resolve({ forced });
      });
      server.closeIdleConnections();
    });
    return shutdownPromise;
  }
  return { server, shutdown };
}
