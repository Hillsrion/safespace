import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import type { HandleDocumentRequestFunction, HandleErrorFunction, HandleDataRequestFunction } from "react-router";
import { ServerRouter } from "react-router";
import { SECURITY_HEADERS } from "./lib/security.server";
import { createPrivacySafeError } from "./lib/observability/privacy";

export const streamTimeout = 5000;

function reportFailure(error: unknown, request: Request): void {
  if (request.signal.aborted) return;
  // React Router's default entry logs raw errors, which can include report
  // content, database parameters and URLs. Do not forward the original error.
  console.error(JSON.stringify({
    level: "error", event: "server_render_failure", errorType: createPrivacySafeError(error).name,
  }));
}

export const handleError: HandleErrorFunction = (error, { request }) => reportFailure(error, request);

export const handleDataRequest: HandleDataRequestFunction = (response) => {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

const handleRequest: HandleDocumentRequestFunction = (request, status, headers, context) => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  if (request.method === "HEAD") return new Response(null, { status, headers });

  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const ready = isbot(request.headers.get("user-agent") ?? "") || context.isSpaMode ? "onAllReady" : "onShellReady";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", abortRequest);
    };
    const abortRequest = () => { abort(); cleanup(); };
    const { pipe, abort } = renderToPipeableStream(<ServerRouter context={context} url={request.url} />, {
      [ready]() {
        shellRendered = true;
        const body = new PassThrough();
        body.once("close", cleanup);
        body.once("finish", cleanup);
        headers.set("Content-Type", "text/html; charset=utf-8");
        resolve(new Response(createReadableStreamFromReadable(body), { status, headers }));
        pipe(body);
      },
      onShellError(error) { cleanup(); reject(error); },
      onError(error) {
        status = 500;
        // Pre-shell failures are reported by React Router's handleError hook.
        if (shellRendered) reportFailure(error, request);
      },
    });
    timer = setTimeout(abortRequest, streamTimeout + 1000);
    if (request.signal.aborted) abortRequest();
    else request.signal.addEventListener("abort", abortRequest, { once: true });
  });
};

export default handleRequest;
