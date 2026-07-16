export const VERCEL_API_PATH_PARAMETER = "__pli_api_path";

/**
 * Restore the public API path after Vercel rewrites it to the fixed gateway
 * Function. Vercel passes named rewrite parameters through the query string.
 */
export function restoreApiRequestUrl(request) {
  const rewrittenUrl = new URL(request.url ?? "/api/gateway", "http://vercel.internal");
  const capturedPath = rewrittenUrl.searchParams.get(VERCEL_API_PATH_PARAMETER);
  if (capturedPath === null || capturedPath === "") return;

  rewrittenUrl.searchParams.delete(VERCEL_API_PATH_PARAMETER);
  const canonicalPath = capturedPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  request.url = `/api/${canonicalPath}${rewrittenUrl.search}`;
}
