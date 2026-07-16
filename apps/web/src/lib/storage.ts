const memoryStorage = new Map<string, string>();

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return window.localStorage?.getItem(key) ?? memoryStorage.get(key) ?? null;
    } catch {
      return memoryStorage.get(key) ?? null;
    }
  },
  setItem(key: string, value: string): boolean {
    memoryStorage.set(key, value);
    try {
      window.localStorage?.setItem(key, value);
      return window.localStorage !== undefined;
    } catch {
      return false;
    }
  },
  removeItem(key: string): boolean {
    memoryStorage.delete(key);
    try {
      window.localStorage?.removeItem(key);
      return window.localStorage !== undefined;
    } catch {
      return false;
    }
  },
};
