import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { createClientId } from "../lib/id.js";
type Tone = "success" | "error" | "info";
interface Toast {
  id: string;
  message: string;
  tone: Tone;
  requestId: string | null;
}
const Context = createContext<
  ((message: string, tone?: Tone, requestId?: string | null) => void) | null
>(null);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Tone = "info", requestId?: string | null) => {
    const id = createClientId();
    setItems((current) => [
      ...current.slice(-3),
      { id, message, tone, requestId: requestId ?? null },
    ]);
    window.setTimeout(() => setItems((current) => current.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <Context value={push}>
      {children}
      <aside className="toast-stack" aria-live="polite">
        {items.map((item) => (
          <div className={`toast toast-${item.tone}`} key={item.id}>
            <strong>
              {item.tone === "error"
                ? "Tindakan gagal"
                : item.tone === "success"
                  ? "Berhasil"
                  : "Informasi"}
            </strong>
            <span>{item.message}</span>
            {item.requestId ? <small>Ref: {item.requestId}</small> : null}
            <button
              aria-label="Tutup"
              onClick={() => setItems((current) => current.filter((x) => x.id !== item.id))}
            >
              ×
            </button>
          </div>
        ))}
      </aside>
    </Context>
  );
}
export function useToast() {
  const value = useContext(Context);
  if (value === null) throw new Error("useToast must be inside ToastProvider");
  return value;
}
