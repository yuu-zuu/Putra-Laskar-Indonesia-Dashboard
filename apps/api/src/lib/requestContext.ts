import { AsyncLocalStorage } from "node:async_hooks";

interface TraceContext {
  requestId: string;
}
const storage = new AsyncLocalStorage<TraceContext>();

export function withTraceContext<T>(requestId: string, operation: () => Promise<T>): Promise<T> {
  return storage.run({ requestId }, operation);
}
export function currentRequestId(): string | null {
  return storage.getStore()?.requestId ?? null;
}
