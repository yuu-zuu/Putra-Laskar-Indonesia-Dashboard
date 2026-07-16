import type { ServerResponse } from "node:http";

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  response.end(payload);
}

export function sendEmpty(response: ServerResponse, status = 204): void {
  response.writeHead(status, { "cache-control": "no-store" });
  response.end();
}
