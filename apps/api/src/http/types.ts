import type { IncomingMessage, ServerResponse } from "node:http";

export interface RequestContext {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  params: Record<string, string>;
  requestId: string;
}

export type Handler = (context: RequestContext) => Promise<void> | void;
