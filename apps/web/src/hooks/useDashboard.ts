import type { DashboardResponse } from "@spbu/contracts";
import { useEffect, useState } from "react";
import { getDashboard } from "../data/gateway.js";
import { startSerializedPolling } from "../lib/polling.js";

interface DashboardState {
  data: DashboardResponse | null;
  loading: boolean;
  error: string | null;
}

export function useDashboard(
  branchId: string,
  businessDate: string,
  trendDays = 30,
): DashboardState & { reload: () => void } {
  const [state, setState] = useState<DashboardState>({ data: null, loading: true, error: null });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (branchId === "") {
      setState((current) => ({ ...current, data: null, loading: false, error: null }));
      return;
    }
    const controller = typeof window.AbortController === "function" ? new AbortController() : null;
    setState((current) => ({ ...current, loading: true, error: null }));
    const load = async () =>
      getDashboard(branchId, businessDate, trendDays, controller?.signal)
        .then((data) => setState({ data, loading: false, error: null }))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error.message : "Dashboard gagal dimuat.",
          });
        });
    const stopPolling = startSerializedPolling(load, 10_000);
    return () => {
      controller?.abort();
      stopPolling();
    };
  }, [branchId, businessDate, trendDays, revision]);

  return { ...state, reload: () => setRevision((value) => value + 1) };
}
