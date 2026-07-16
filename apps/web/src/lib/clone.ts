export function cloneData<T>(value: T): T {
  if (typeof window.structuredClone === "function") return window.structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
