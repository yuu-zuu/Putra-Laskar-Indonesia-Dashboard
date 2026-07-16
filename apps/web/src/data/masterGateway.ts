import type {
  CreateMeterUnitInput,
  CreateProductInput,
  CreateStockUnitInput,
  MeterUnit,
  Product,
  StockUnit,
  UpdateMeterUnitInput,
  UpdateStockUnitInput,
} from "@spbu/contracts";
import { apiRequest } from "../lib/http.js";
import { isMockMode } from "./gateway.js";
import { createClientId } from "../lib/id.js";
import { demoMeters, mockDashboard } from "./mockData.js";
import { cloneData } from "../lib/clone.js";
import { safeStorage } from "../lib/storage.js";

const meterStorageKey = "pli-demo-meter-units-v1";

export async function getMeterUnits(branchId: string, date: string): Promise<MeterUnit[]> {
  if (!isMockMode())
    return (
      await apiRequest<{ items: MeterUnit[] }>(
        `/meter-units?branchId=${encodeURIComponent(branchId)}&date=${encodeURIComponent(date)}`,
      )
    ).items;
  await wait();
  return readMockMeters().filter((meter) => meter.branchId === branchId);
}

export async function getStockUnits(branchId: string): Promise<StockUnit[]> {
  if (!isMockMode())
    return (
      await apiRequest<{ items: StockUnit[] }>(
        `/stock-units?branchId=${encodeURIComponent(branchId)}`,
      )
    ).items;
  return mockDashboard.stockUnits.map((unit) => ({
    id: unit.id,
    branchId,
    code: unit.code,
    name: unit.name,
    productName: unit.productName,
    capacityQty: unit.capacityQty,
    lowStockThresholdQty: unit.lowStockThresholdQty,
    active: true,
  }));
}

export async function createMeterUnit(input: CreateMeterUnitInput): Promise<MeterUnit> {
  if (!isMockMode())
    return apiRequest<MeterUnit>("/meter-units", { method: "POST", body: JSON.stringify(input) });
  await wait();
  const meters = readMockMeters();
  if (meters.some((meter) => meter.branchId === input.branchId && meter.code === input.code))
    throw new Error("Kode pompa/meter sudah digunakan.");
  const stock = mockDashboard.stockUnits.find((unit) => unit.id === input.stockUnitId);
  if (stock === undefined) throw new Error("Unit stock tidak ditemukan.");
  const meter: MeterUnit = {
    id: createClientId(),
    branchId: input.branchId,
    code: input.code,
    name: input.name,
    stockUnitId: input.stockUnitId,
    stockUnitName: stock.name,
    active: true,
  };
  safeStorage.setItem(meterStorageKey, JSON.stringify([...meters, meter]));
  return meter;
}
export async function getProducts(): Promise<Product[]> {
  if (isMockMode())
    return [
      {
        id: "20000000-0000-0000-0000-000000000001",
        code: "BBM",
        name: "Pertalite",
        unit: "LITER",
        active: true,
      },
    ];
  return (await apiRequest<{ items: Product[] }>("/products")).items;
}
export async function createProduct(input: CreateProductInput): Promise<Product> {
  if (isMockMode()) {
    return { id: createClientId(), ...input, active: true };
  }
  return apiRequest<Product>("/products", { method: "POST", body: JSON.stringify(input) });
}
export async function createStockUnit(input: CreateStockUnitInput): Promise<StockUnit> {
  if (isMockMode()) {
    const product = (await getProducts()).find((x) => x.id === input.productId);
    return {
      id: createClientId(),
      branchId: input.branchId,
      code: input.code,
      name: input.name,
      productName: product?.name ?? "Produk",
      capacityQty: input.capacityQty,
      lowStockThresholdQty: input.lowStockThresholdQty,
      active: true,
    };
  }
  return apiRequest<StockUnit>("/stock-units", { method: "POST", body: JSON.stringify(input) });
}
export async function updateStockUnit(id: string, input: UpdateStockUnitInput): Promise<StockUnit> {
  if (isMockMode()) throw new Error("Perubahan unit demo tidak disimpan.");
  return apiRequest<StockUnit>(`/stock-units/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function updateMeterUnit(id: string, input: UpdateMeterUnitInput): Promise<MeterUnit> {
  if (!isMockMode())
    return apiRequest<MeterUnit>(`/meter-units/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  await wait();
  const meters = readMockMeters();
  const meter = meters.find((candidate) => candidate.id === id);
  if (meter === undefined) throw new Error("Pompa/meter tidak ditemukan.");
  const updated = { ...meter, ...input };
  safeStorage.setItem(
    meterStorageKey,
    JSON.stringify(meters.map((candidate) => (candidate.id === id ? updated : candidate))),
  );
  return updated;
}

function readMockMeters(): MeterUnit[] {
  const stored = safeStorage.getItem(meterStorageKey);
  if (stored !== null) return JSON.parse(stored) as MeterUnit[];
  safeStorage.setItem(meterStorageKey, JSON.stringify(demoMeters));
  return cloneData(demoMeters);
}

function wait(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 140));
}
