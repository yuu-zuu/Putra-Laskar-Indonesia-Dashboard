export interface RequestAbort {
  signal: AbortSignal | undefined;
  didTimeout: () => boolean;
  cleanup: () => void;
}

export function createRequestAbort(
  source: AbortSignal | undefined,
  timeoutMilliseconds: number,
): RequestAbort {
  if (typeof window.AbortController !== "function") {
    return { signal: source, didTimeout: () => false, cleanup: () => undefined };
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMilliseconds);
  const abortFromSource = () => {
    window.clearTimeout(timer);
    controller.abort();
  };
  if (source?.aborted) abortFromSource();
  else source?.addEventListener("abort", abortFromSource, { once: true });

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      window.clearTimeout(timer);
      source?.removeEventListener("abort", abortFromSource);
    },
  };
}
