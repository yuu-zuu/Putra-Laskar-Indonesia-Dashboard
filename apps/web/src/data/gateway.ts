import type { CreateMeterReadingInput, DashboardResponse } from "@spbu/contracts";
import { mockDashboard } from "./mockData.js";
import { apiRequest } from "../lib/http.js";
import { createClientId } from "../lib/id.js";
import { cloneData } from "../lib/clone.js";

const useMocks = import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === "true";

export async function getDashboard(
  branchId: string,
  businessDate: string,
  trendDays = 30,
  signal?: AbortSignal,
): Promise<DashboardResponse> {
  if (useMocks) {
    await wait(220, signal);
    return cloneData({
      ...mockDashboard,
      summary: { ...mockDashboard.summary, businessDate },
    });
  }
  return apiRequest<DashboardResponse>(
    `/dashboard?branchId=${encodeURIComponent(branchId)}&date=${encodeURIComponent(businessDate)}&days=${trendDays}`,
    {},
    signal,
  );
}

export async function createMeterReading(input: CreateMeterReadingInput): Promise<{ id: string }> {
  if (useMocks) {
    await wait(300);
    return { id: createClientId() };
  }
  return apiRequest<{ id: string }>("/sales/meter-readings", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function isMockMode(): boolean {
  return useMocks;
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
