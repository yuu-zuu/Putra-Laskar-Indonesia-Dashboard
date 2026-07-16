export interface FormulaVariable {
  symbol: string;
  label: string;
  unit: string;
}

export interface FormulaDefinition {
  id: string;
  shortLabel: string;
  expression: string;
  explanation: string;
  variables: FormulaVariable[];
}

export const formulas = {
  closingStock: {
    id: "closing-stock",
    shortLabel: "Stock akhir",
    expression:
      "closing = opening + supply + transferIn + salesReturn + gain − sales − transferOut − supplierReturn − loss",
    explanation:
      "Stock akhir dihitung dari seluruh mutasi terposting pada satu unit stock. Nilainya tidak boleh diinput manual.",
    variables: [
      { symbol: "opening", label: "Stock akhir terposting sebelumnya", unit: "liter" },
      { symbol: "supply", label: "Supply masuk", unit: "liter" },
      { symbol: "sales", label: "Penjualan terposting", unit: "liter" },
      { symbol: "gain/loss", label: "Adjustment yang telah disetujui", unit: "liter" },
    ],
  },
  meterQuantity: {
    id: "meter-quantity",
    shortLabel: "Penjualan meter",
    expression: "Q = meterEnd − meterStart + resetOffset",
    explanation:
      "Offset bernilai nol kecuali ada reset atau penggantian meter yang terdokumentasi.",
    variables: [
      { symbol: "meterEnd", label: "Bacaan akhir", unit: "liter" },
      { symbol: "meterStart", label: "Bacaan awal terkonfirmasi", unit: "liter" },
      { symbol: "resetOffset", label: "Kompensasi reset/penggantian", unit: "liter" },
    ],
  },
  literVariance: {
    id: "liter-variance",
    shortLabel: "Selisih liter",
    expression: "literVariance = postedSalesQty − meterSalesQty",
    explanation:
      "Nilai nol berarti kuantitas penjualan terposting sama dengan pergerakan meter. Nilai non-nol memerlukan catatan dan review.",
    variables: [
      { symbol: "postedSalesQty", label: "Penjualan yang terposting", unit: "liter" },
      { symbol: "meterSalesQty", label: "Penjualan hasil bacaan meter", unit: "liter" },
    ],
  },
  cashVariance: {
    id: "cash-variance",
    shortLabel: "Selisih kas",
    expression: "cashVariance = cashDeposit − expectedSalesAmount",
    explanation:
      "Expected amount menggunakan harga layer FIFO atau price rule efektif, bukan harga yang di-hardcode pada laporan.",
    variables: [
      { symbol: "cashDeposit", label: "Setoran aktual", unit: "Rupiah" },
      { symbol: "expectedSalesAmount", label: "Nilai penjualan yang seharusnya", unit: "Rupiah" },
    ],
  },
} satisfies Record<string, FormulaDefinition>;

export interface ClosingStockInput {
  openingQty: number;
  supplyQty: number;
  transferInQty: number;
  salesReturnQty: number;
  gainQty: number;
  salesQty: number;
  transferOutQty: number;
  supplierReturnQty: number;
  lossQty: number;
}

export function calculateClosingStock(input: ClosingStockInput): number {
  return (
    input.openingQty +
    input.supplyQty +
    input.transferInQty +
    input.salesReturnQty +
    input.gainQty -
    input.salesQty -
    input.transferOutQty -
    input.supplierReturnQty -
    input.lossQty
  );
}

export function calculateMeterQuantity(
  meterStart: number,
  meterEnd: number,
  resetOffset = 0,
): number {
  return meterEnd - meterStart + resetOffset;
}

export function calculateLiterVariance(postedSalesQty: number, meterSalesQty: number): number {
  return postedSalesQty - meterSalesQty;
}

export function calculateCashVariance(
  cashDepositAmount: number,
  expectedSalesAmount: number,
): number {
  return cashDepositAmount - expectedSalesAmount;
}
