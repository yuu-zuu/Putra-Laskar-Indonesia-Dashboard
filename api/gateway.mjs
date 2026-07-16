import { handleRequest } from "../apps/api/dist/app.js";
import { restoreApiRequestUrl } from "../scripts/vercelRoute.mjs";

export default function gateway(request, response) {
  restoreApiRequestUrl(request);
  return handleRequest(request, response);
}
