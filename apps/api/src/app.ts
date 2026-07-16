import type { IncomingMessage, ServerResponse } from "node:http";
import { currentUser } from "./auth/session.js";
import { assertAllowedClient, isAllowedWebOrigin } from "./auth/clientAccess.js";
import { sendEmpty, sendJson } from "./http/response.js";
import { Router, withParams } from "./http/router.js";
import type { RequestContext } from "./http/types.js";
import { writeAudit } from "./lib/audit.js";
import { AppError, asAppError } from "./lib/errors.js";
import { withTraceContext } from "./lib/requestContext.js";
import { createUuid } from "./lib/uuid.js";
import { registerRoutes } from "./routes/index.js";

const router = new Router();
registerRoutes(router);
const mutatingMethods = new Set(["POST", "PATCH", "DELETE"]);
const publicProbePaths = new Set(["/health", "/ready", "/api/health", "/api/ready"]);

export async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const startedAt = performance.now();
  const requestId = requestIdFrom(request);
  const method = (request.method ?? "GET").toUpperCase();
  let pathname = "/";
  let mutationReached = false;

  applyHeaders(response, requestId);
  applyCors(request, response);

  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    pathname = url.pathname;

    if (!publicProbePaths.has(pathname)) assertAllowedClient(request);
    if (method === "OPTIONS") {
      sendEmpty(response);
      return;
    }

    const route = router.match(method, pathname);
    if (route === null) {
      const allowedMethods = router.allowedMethods(pathname);
      if (allowedMethods.length > 0) {
        response.setHeader("allow", allowedMethods.join(", "));
        throw new AppError(405, "METHOD_NOT_ALLOWED", "Method tidak diizinkan untuk endpoint ini.");
      }
      throw new AppError(404, "NOT_FOUND", "Endpoint tidak ditemukan.");
    }

    mutationReached = mutatingMethods.has(method);
    const context: RequestContext = { request, response, url, params: {}, requestId };
    await withTraceContext(requestId, async () => {
      await route.handler(withParams(context, route.params));
    });
  } catch (error) {
    const appError = asAppError(error);
    if (mutationReached) await recordFailedMutation(request, pathname, method, requestId, appError);
    logFailure(error, appError, requestId, method, pathname);
    if (!response.headersSent) sendError(response, appError, requestId);
    else if (!response.writableEnded) response.end();
  } finally {
    console.info(
      JSON.stringify({
        level: "info",
        event: "request_complete",
        requestId,
        method,
        path: pathname,
        status: response.statusCode,
        durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      }),
    );
  }
}

async function recordFailedMutation(
  request: IncomingMessage,
  pathname: string,
  method: string,
  requestId: string,
  appError: AppError,
): Promise<void> {
  try {
    const user = await currentUser(request);
    if (user === null) return;
    await writeAudit({
      branchId: user.branchId,
      actorId: user.id,
      action: method,
      objectType: "api_request",
      objectId: pathname,
      reason: appError.message,
      outcome: appError.status === 401 || appError.status === 403 ? "DENIED" : "FAILED",
      requestId,
      metadata: { code: appError.code, status: appError.status },
    });
  } catch (auditError) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "failure_audit_write_failed",
        requestId,
        error: errorDetails(auditError),
      }),
    );
  }
}

function logFailure(
  error: unknown,
  appError: AppError,
  requestId: string,
  method: string,
  pathname: string,
): void {
  if (appError.status < 500) return;
  console.error(
    JSON.stringify({
      level: "error",
      event: "request_failed",
      requestId,
      method,
      path: pathname,
      status: appError.status,
      code: appError.code,
      error: errorDetails(error),
    }),
  );
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { message: String(error) };
  const cause = error.cause;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause:
      cause instanceof Error
        ? cause.message
        : typeof cause === "string" || typeof cause === "number" || typeof cause === "boolean"
          ? String(cause)
          : undefined,
  };
}

function sendError(response: ServerResponse, error: AppError, requestId: string): void {
  sendJson(response, error.status, {
    code: error.code,
    message: error.message,
    fieldErrors: error.fieldErrors ?? {},
    retryable: error.retryable,
    requestId,
  });
}

function requestIdFrom(request: IncomingMessage): string {
  const candidate = request.headers["x-request-id"]?.toString().trim();
  return candidate !== undefined && /^[A-Za-z0-9._:-]{8,128}$/.test(candidate)
    ? candidate
    : createUuid();
}

function applyHeaders(response: ServerResponse, requestId: string): void {
  response.setHeader("x-request-id", requestId);
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("cross-origin-opener-policy", "same-origin");
  response.setHeader("x-permitted-cross-domain-policies", "none");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
}

function applyCors(request: IncomingMessage, response: ServerResponse): void {
  const origin = request.headers.origin;
  if (origin !== undefined && isAllowedWebOrigin(origin)) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("access-control-allow-credentials", "true");
    if (request.headers["access-control-request-private-network"] === "true") {
      response.setHeader("access-control-allow-private-network", "true");
    }
  }
  response.setHeader("vary", "origin");
  response.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  response.setHeader(
    "access-control-allow-headers",
    "content-type,x-request-id,idempotency-key,x-pli-client-id,x-pli-client-key",
  );
  response.setHeader("access-control-max-age", "600");
}
