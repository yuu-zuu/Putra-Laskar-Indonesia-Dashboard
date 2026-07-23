export type Id = string;

export type ReconciliationStatus = "PENDING" | "MATCHED" | "EXPLAINED" | "ESCALATED" | "CLOSED";

export type PostingStatus = "DRAFT" | "POSTED" | "CANCELLED" | "REVERSED";

export type UserRole = "ADMIN" | "MANAGER" | "OPERATOR" | "FINANCE" | "AUDITOR";
export type AppLocale = "id" | "en" | "zh";

export interface AuthUser {
  id: Id;
  employeeId: string;
  email: string;
  displayName: string;
  role: UserRole;
  branchId: Id | null;
  locale: AppLocale;
  avatarObjectKey: string | null;
  onboardingCompletedAt: string | null;
}

export interface RegisterInput {
  employeeId: string;
  email: string;
  displayName: string;
  password: string;
  registrationCode: string;
}

export interface LoginInput {
  identifier: string;
  password: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface ManagedAccount {
  id: Id;
  employeeId: string;
  email: string;
  displayName: string;
  role: UserRole;
  branchId: Id | null;
  branchName: string | null;
  createdAt: string;
}

export interface CreateManagedAccountInput {
  employeeId: string;
  email: string;
  displayName: string;
  password: string;
  role: UserRole;
  branchId: Id | null;
}

export interface UpdateManagedAccountInput {
  role: UserRole;
  branchId: Id | null;
  reason: string;
}

export interface ResetManagedAccountPasswordInput {
  password: string;
  reason: string;
}

export interface Branch {
  id: Id;
  code: string;
  name: string;
  timezone: string;
  active: boolean;
}

export interface Product {
  id: Id;
  code: string;
  name: string;
  unit: string;
  active: boolean;
}

export interface CreateProductInput {
  code: string;
  name: string;
  unit: string;
}

export interface CreateBranchInput {
  code: string;
  name: string;
  timezone: string;
}
export interface UpdateBranchInput {
  name: string;
  timezone: string;
  active: boolean;
}

export interface CreateStockUnitInput {
  branchId: Id;
  productId: Id;
  code: string;
  name: string;
  capacityQty: number;
  lowStockThresholdQty: number;
}
export interface UpdateStockUnitInput {
  name: string;
  capacityQty: number;
  lowStockThresholdQty: number;
  active: boolean;
}

export interface StockUnit {
  id: Id;
  branchId: Id;
  code: string;
  name: string;
  productName: string;
  capacityQty: number;
  lowStockThresholdQty: number;
  active: boolean;
}

export interface MeterUnit {
  id: Id;
  branchId: Id;
  code: string;
  name: string;
  stockUnitId: Id;
  stockUnitName: string;
  active: boolean;
}

export interface CreateMeterUnitInput {
  branchId: Id;
  code: string;
  name: string;
  stockUnitId: Id;
  validFrom: string;
}

export interface UpdateMeterUnitInput {
  name: string;
  active: boolean;
}

export interface StockUnitSnapshot {
  id: Id;
  code: string;
  name: string;
  productName: string;
  openingQty: number;
  supplyQty: number;
  salesQty: number;
  returnQty: number;
  transferInQty: number;
  transferOutQty: number;
  gainQty: number;
  lossQty: number;
  closingQty: number;
  capacityQty: number;
  lowStockThresholdQty: number;
  updatedAt: string;
}

export interface TrendPoint {
  label: string;
  stockQty: number;
  salesQty: number;
  cashAmount: number;
}

export interface ReconciliationRow {
  id: Id;
  businessDate: string;
  meterUnitName: string;
  stockUnitName: string;
  meterStart: number;
  meterEnd: number;
  resetOffset: number;
  meterSalesQty: number;
  postedSalesQty: number;
  expectedSalesAmount: number;
  cashDepositAmount: number;
  literVariance: number;
  cashVariance: number;
  status: ReconciliationStatus;
  note: string | null;
}

export interface ActivityItem {
  id: Id;
  kind: "SUPPLY" | "SALE" | "ADJUSTMENT" | "EXPORT" | "SYSTEM";
  title: string;
  detail: string;
  occurredAt: string;
  actorName: string;
}

export interface DashboardSummary {
  businessDate: string;
  branch: Branch;
  closingStockQty: number;
  salesQty: number;
  salesAmount: number;
  cashDepositAmount: number;
  grossProfitAmount: number;
  literVariance: number;
  cashVariance: number;
  unresolvedCount: number;
  pendingApprovalCount: number;
}

export interface DashboardRangeSummary {
  startDate: string;
  endDate: string;
  days: number;
  closingStockQty: number;
  salesQty: number;
  salesAmount: number;
  cashDepositAmount: number;
  grossProfitAmount: number;
  literVariance: number;
  cashVariance: number;
  unresolvedCount: number;
  pendingApprovalCount: number;
}

export interface DashboardResponse {
  summary: DashboardSummary;
  rangeSummary: DashboardRangeSummary;
  stockUnits: StockUnitSnapshot[];
  trend: TrendPoint[];
  reconciliations: ReconciliationRow[];
  activities: ActivityItem[];
}

export interface CreateMeterReadingInput {
  branchId: Id;
  meterUnitId: Id;
  businessDate: string;
  meterStart: number;
  meterEnd: number;
  meterResetOffset: number;
  unitSellingPrice: number;
  cashDepositAmount: number;
  note: string | null;
  idempotencyKey: string;
}

export type InventoryMovementKind =
  | "OPENING"
  | "SUPPLY"
  | "SALES_RETURN"
  | "SUPPLIER_RETURN"
  | "GAIN"
  | "LOSS";

export interface CreateInventoryMovementInput {
  branchId: Id;
  stockUnitId: Id;
  businessDate: string;
  movementType: InventoryMovementKind;
  quantity: number;
  unitCost: number | null;
  unitSellingPrice: number | null;
  reference: string;
  reason: string;
  idempotencyKey: string;
}

export interface CreateStockTransferInput {
  branchId: Id;
  sourceStockUnitId: Id;
  destinationStockUnitId: Id;
  businessDate: string;
  quantity: number;
  reference: string;
  reason: string;
  idempotencyKey: string;
}

export interface InventoryMovementItem {
  id: Id;
  businessDate: string;
  stockUnitId: Id;
  stockUnitName: string;
  movementType: InventoryMovementKind | "SALE" | "TRANSFER_IN" | "TRANSFER_OUT" | "REVERSAL";
  quantityDelta: number;
  sourceType: string;
  reference: string | null;
  postedAt: string;
  actorName: string;
}

export interface UpdateReconciliationInput {
  status: ReconciliationStatus;
  note: string | null;
}

export interface CorrectMeterReadingInput {
  meterStart: number;
  meterEnd: number;
  meterResetOffset: number;
  cashDepositAmount: number;
  note: string | null;
  reason: string;
}

export interface ReconciliationRevision {
  id: Id;
  readingId: Id;
  revisionNo: number;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  reason: string;
  actorId: Id;
  actorName: string;
  createdAt: string;
}

export interface ReconciliationComment {
  id: Id;
  readingId: Id;
  parentId: Id | null;
  authorId: Id;
  authorName: string;
  authorRole: UserRole;
  message: string;
  createdAt: string;
}

export interface UserProfile {
  id: Id;
  employeeId: string;
  email: string;
  displayName: string;
  role: UserRole;
  branchId: Id | null;
  branchName: string | null;
  locale: AppLocale;
  avatarUrl: string | null;
  avatarObjectKey: string | null;
  avatarContentType: "image/jpeg" | "image/png" | "image/webp" | null;
  avatarSizeBytes: number | null;
  createdAt: string;
}

export interface UpdateProfileInput {
  displayName: string;
  locale: AppLocale;
  avatarObjectKey: string | null;
  avatarContentType: "image/jpeg" | "image/png" | "image/webp" | null;
  avatarSizeBytes: number | null;
  onboardingCompleted: boolean;
}

export interface AuditLogItem {
  id: string;
  branchId: Id | null;
  action: string;
  objectType: string;
  objectId: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
  actorId: Id | null;
  actorEmployeeId: string | null;
  actorName: string;
  actorRole: UserRole | null;
  outcome: "SUCCEEDED" | "FAILED" | "DENIED";
  requestId: string | null;
}

export interface AuditLogPage {
  items: AuditLogItem[];
  nextCursor: string | null;
}

export type BroadcastSeverity = "INFO" | "WARNING" | "CRITICAL";
export interface SystemBroadcast {
  id: Id;
  branchId: Id | null;
  title: string;
  message: string;
  severity: BroadcastSeverity;
  active: boolean;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  createdByName: string;
}
export interface CreateBroadcastInput {
  branchId: Id | null;
  title: string;
  message: string;
  severity: BroadcastSeverity;
  endsAt: string | null;
}

export interface PresignUploadInput {
  fileName: string;
  contentType: string;
  fileSize: number;
  scope: "opname" | "supply" | "adjustment" | "report";
}

export interface PresignUploadResponse {
  objectKey: string;
  putUrl: string;
  expiresAt: string;
  headers: Record<string, string>;
}
