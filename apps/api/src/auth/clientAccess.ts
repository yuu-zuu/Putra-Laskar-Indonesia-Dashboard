import type { IncomingMessage } from "node:http";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import {
  classifyRequestClient,
  isAllowedWebOriginForPolicy,
  type ClientAccessPolicy,
  type RequestClientKind,
} from "./clientPolicy.js";

const runtimePolicy: ClientAccessPolicy = {
  allowedWebOrigins: env.allowedWebOrigins,
  allowPrivateNetworkOrigins: env.allowPrivateNetworkOrigins,
  privateNetworkWebPorts: env.privateNetworkWebPorts,
  nativeClientKeyHashes: env.nativeClientKeyHashes,
  required: env.requireClientProvenance,
};

export function assertAllowedClient(request: IncomingMessage): RequestClientKind {
  const kind = classifyRequestClient(request.headers, runtimePolicy);
  if (kind === null) {
    throw new AppError(403, "CLIENT_NOT_ALLOWED", "Client request tidak diizinkan.");
  }
  return kind;
}

export function isAllowedWebOrigin(origin: string | undefined): boolean {
  if (origin === undefined) return false;
  return isAllowedWebOriginForPolicy(origin, runtimePolicy);
}
