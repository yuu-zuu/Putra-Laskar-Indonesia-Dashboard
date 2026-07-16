export function startSerializedPolling(
  task: () => Promise<void> | void,
  intervalMs: number,
): () => void {
  let stopped = false;
  let running = false;
  let timer: number | undefined;

  const schedule = () => {
    if (stopped) return;
    timer = window.setTimeout(() => void run(), intervalMs);
  };
  const run = async () => {
    if (stopped || running) return;
    if (document.visibilityState === "hidden") {
      schedule();
      return;
    }
    running = true;
    try {
      await task();
    } finally {
      running = false;
      schedule();
    }
  };
  const onVisibilityChange = () => {
    if (document.visibilityState !== "visible" || stopped) return;
    if (timer !== undefined) window.clearTimeout(timer);
    void run();
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  void run();
  return () => {
    stopped = true;
    if (timer !== undefined) window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
