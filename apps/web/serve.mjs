import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, join, normalize, relative as pathRelative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("./dist", import.meta.url)));
const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 4173);
const release = "2026.07.16-auth-trace.3";

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
  [".ico", "image/x-icon"],
]);

createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" }).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  } catch {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end("Bad request");
    return;
  }
  const requestedPath = normalize(pathname)
    .replace(/^([/\\]*\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "");
  let filePath = resolve(join(root, requestedPath || "index.html"));
  const relativePath = pathRelative(root, filePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = join(filePath, "index.html");
    const finalStat = await stat(filePath);
    response.writeHead(200, {
      "content-type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
      "content-length": finalStat.size,
      "cache-control": relativePath.startsWith(`assets${process.platform === "win32" ? "\\" : "/"}`)
        ? "public, max-age=31536000, immutable"
        : "no-cache",
      "x-pli-release": release,
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "cross-origin-opener-policy": "same-origin",
      "x-permitted-cross-domain-policies": "none",
      "referrer-policy": "no-referrer",
      "permissions-policy": "camera=(), microphone=(), geolocation=()",
      "content-security-policy":
        "default-src 'self'; connect-src 'self' http: https:; img-src 'self' data: blob: http: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self' blob:; font-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, host, () => console.info(`PLI web listening on http://${host}:${port}`));
