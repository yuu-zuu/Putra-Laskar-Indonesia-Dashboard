import { apiRequest } from "../lib/http.js";
import { isMockMode } from "./gateway.js";

export interface OperationalReportPackage {
  branch: {
    id: string;
    code: string;
    name: string;
    timezone: string;
  };
  period: {
    startDate: string;
    endDate: string;
  };
  dailyStock: DailyStockReportRow[];
  meterReconciliations: MeterReconciliationReportRow[];
  movements: InventoryMovementReportRow[];
  stockOpnames: StockOpnameReportRow[];
  stockLayers: StockLayerReportRow[];
  fifoAllocations: FifoAllocationReportRow[];
  cashEntries: CashEntryReportRow[];
  auditLogs: AuditLogReportRow[];
  stagedSourceRows: StagedSourceReportRow[];
}

export interface DailyStockReportRow {
  businessDate: string;
  stockUnitId: string;
  stockUnitCode: string;
  stockUnitName: string;
  productCode: string;
  productName: string;
  openingQty: number;
  supplyQty: number;
  salesQty: number;
  salesReturnQty: number;
  transferInQty: number;
  transferOutQty: number;
  gainQty: number;
  lossQty: number;
  closingQty: number;
}

export interface MeterReconciliationReportRow {
  id: string;
  businessDate: string;
  stockUnitId: string;
  stockUnitCode: string;
  stockUnitName: string;
  meterUnitId: string;
  meterUnitCode: string;
  meterUnitName: string;
  meterStart: number;
  meterEnd: number;
  meterResetOffset: number;
  meterSalesQty: number;
  postedSalesQty: number;
  expectedSalesAmount: number;
  cashDepositAmount: number;
  literVariance: number;
  cashVariance: number;
  reconciliationStatus: string;
  postingStatus: string;
  note: string | null;
  createdAt: string;
  postedAt: string | null;
}

export interface InventoryMovementReportRow {
  id: string;
  businessDate: string;
  stockUnitCode: string;
  stockUnitName: string;
  productCode: string;
  productName: string;
  movementType: string;
  quantityDelta: number;
  sourceType: string;
  sourceId: string | null;
  reference: string | null;
  reason: string | null;
  postingStatus: string;
  postedByName: string | null;
  postedAt: string;
  createdAt: string;
}

export interface StockOpnameReportRow {
  id: string;
  businessDate: string;
  stockUnitId: string;
  stockUnitCode: string;
  stockUnitName: string;
  productCode: string;
  productName: string;
  systemQty: number;
  physicalQty: number;
  varianceQty: number;
  evidenceObjectKey: string | null;
  postingStatus: string;
  suggestedType: string | null;
  suggestedQty: number | null;
  approvedType: string | null;
  approvedQty: number | null;
  suggestionStatus: string | null;
  decisionReason: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface StockLayerReportRow {
  id: string;
  stockUnitCode: string;
  stockUnitName: string;
  productCode: string;
  productName: string;
  receivedAt: string;
  sequenceNo: number;
  initialQty: number;
  remainingQty: number;
  allocatedQty: number;
  unitCost: number;
  unitSellingPrice: number;
  costStatus: string;
  sourceType: string;
  sourceId: string | null;
}

export interface FifoAllocationReportRow {
  id: string;
  readingId: string;
  businessDate: string;
  meterUnitCode: string;
  meterUnitName: string;
  stockUnitCode: string;
  stockUnitName: string;
  productCode: string;
  productName: string;
  layerId: string;
  layerReceivedAt: string;
  quantity: number;
  unitCost: number;
  unitSellingPrice: number;
  cogsAmount: number;
  revenueAmount: number;
  grossProfitAmount: number;
  costStatus: string;
  layerSourceType: string;
  layerSourceId: string | null;
}

export interface CashEntryReportRow {
  entryType: "EXPENSE" | "OTHER_INCOME";
  businessDate: string;
  category: string;
  amount: number;
  note: string | null;
  postingStatus: string;
}

export interface AuditLogReportRow {
  id: number;
  occurredAt: string;
  actorName: string | null;
  action: string;
  objectType: string;
  objectId: string;
  reason: string | null;
  outcome: string;
  impactScope: string;
  requestId: string | null;
  metadata: Record<string, unknown>;
}

export interface StagedSourceReportRow {
  id: string;
  businessDate: string;
  stockUnitCode: string;
  stockUnitName: string;
  meterUnitCode: string | null;
  meterUnitName: string | null;
  sourceStatus: string;
  blockingReasons: string[];
  sourceFile: string;
  sourceSheet: string;
  sourceRow: number;
  rawData: Record<string, unknown>;
  resolutionNote: string | null;
  stagedAt: string;
}

export async function getOperationalReportPackage(
  branchId: string,
  startDate: string,
  endDate: string,
): Promise<OperationalReportPackage> {
  if (isMockMode()) {
    return {
      branch: { id: branchId, code: "DEMO", name: "Demo Branch", timezone: "Asia/Jakarta" },
      period: { startDate, endDate },
      dailyStock: [],
      meterReconciliations: [],
      movements: [],
      stockOpnames: [],
      stockLayers: [],
      fifoAllocations: [],
      cashEntries: [],
      auditLogs: [],
      stagedSourceRows: [],
    };
  }
  const params = new URLSearchParams({ branchId, startDate, endDate });
  return apiRequest<OperationalReportPackage>(`/reports/operational-package?${params.toString()}`);
}
