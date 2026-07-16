import type {
  CreateMeterUnitInput,
  MeterUnit,
  StockUnit,
  UpdateMeterUnitInput,
} from "@spbu/contracts";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as gateway from "../data/masterGateway.js";
import { useBranches } from "./branches.js";
import { startSerializedPolling } from "../lib/polling.js";

interface MeterUnitsContextValue {
  meters: MeterUnit[];
  stockUnits: StockUnit[];
  loading: boolean;
  error: string | null;
  createMeter: (input: CreateMeterUnitInput) => Promise<void>;
  updateMeter: (id: string, input: UpdateMeterUnitInput) => Promise<void>;
  reload: () => Promise<void>;
}

const MeterUnitsContext = createContext<MeterUnitsContextValue | null>(null);

export function MeterUnitsProvider({ children }: { children: ReactNode }) {
  const { activeBranch } = useBranches();
  const [meters, setMeters] = useState<MeterUnit[]>([]);
  const [stockUnits, setStockUnits] = useState<StockUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const branchId = activeBranch?.id ?? null;

  const reload = async () => {
    if (branchId === null) {
      setMeters([]);
      setStockUnits([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextMeters, nextStockUnits] = await Promise.all([
        gateway.getMeterUnits(branchId, new Date().toISOString().slice(0, 10)),
        gateway.getStockUnits(branchId),
      ]);
      setMeters(nextMeters);
      setStockUnits(nextStockUnits);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Master pompa gagal dimuat.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return startSerializedPolling(reload, 10_000);
  }, [branchId]);

  const value = useMemo<MeterUnitsContextValue>(
    () => ({
      meters,
      stockUnits,
      loading,
      error,
      reload,
      createMeter: async (input) => {
        const created = await gateway.createMeterUnit(input);
        setMeters((current) => [...current, created]);
      },
      updateMeter: async (id, input) => {
        const updated = await gateway.updateMeterUnit(id, input);
        setMeters((current) => current.map((meter) => (meter.id === id ? updated : meter)));
      },
    }),
    [meters, stockUnits, loading, error, branchId],
  );
  return <MeterUnitsContext value={value}>{children}</MeterUnitsContext>;
}

export function useMeterUnits(): MeterUnitsContextValue {
  const context = useContext(MeterUnitsContext);
  if (context === null) throw new Error("useMeterUnits must be used inside MeterUnitsProvider");
  return context;
}
