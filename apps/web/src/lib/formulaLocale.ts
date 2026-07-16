import type { AppLocale, FormulaDefinition } from "@spbu/contracts";

type LocalizedText = Record<AppLocale, string>;
interface FormulaCopy {
  shortLabel: LocalizedText;
  expression: LocalizedText;
  explanation: LocalizedText;
  variables: Array<{
    symbol: LocalizedText;
    label: LocalizedText;
    unit: LocalizedText;
  }>;
}

const liter: LocalizedText = { id: "liter", en: "litres", zh: "升" };
const rupiah: LocalizedText = { id: "Rupiah", en: "rupiah", zh: "印尼盾" };

const formulaCopy: Record<string, FormulaCopy> = {
  "closing-stock": {
    shortLabel: { id: "Stock akhir", en: "Closing stock", zh: "期末库存" },
    expression: {
      id: "stokAkhir = stokAwal + pasokan + transferMasuk + returPenjualan + penyesuaianNaik − penjualan − transferKeluar − returPemasok − penyesuaianTurun",
      en: "closingStock = openingStock + supply + transferIn + salesReturn + gain − sales − transferOut − supplierReturn − loss",
      zh: "期末库存 = 期初库存 + 入库 + 转入 + 销售退回 + 盘盈 − 销售 − 转出 − 退回供应商 − 盘亏",
    },
    explanation: {
      id: "Stock akhir dihitung dari seluruh mutasi terposting pada satu unit stock dan tidak dapat diinput manual.",
      en: "Closing stock is calculated from every posted movement for one stock unit and cannot be entered manually.",
      zh: "期末库存由单个库存单元的所有已过账变动计算得出，不能手动输入。",
    },
    variables: [
      {
        symbol: { id: "stokAwal", en: "openingStock", zh: "期初库存" },
        label: {
          id: "Stock akhir terposting sebelumnya",
          en: "Previously posted closing stock",
          zh: "上次已过账的期末库存",
        },
        unit: liter,
      },
      {
        symbol: { id: "pasokan", en: "supply", zh: "入库" },
        label: { id: "Pasokan masuk", en: "Incoming supply", zh: "入库供应量" },
        unit: liter,
      },
      {
        symbol: { id: "penjualan", en: "sales", zh: "销售" },
        label: { id: "Penjualan terposting", en: "Posted sales", zh: "已过账销售量" },
        unit: liter,
      },
      {
        symbol: { id: "penyesuaian", en: "adjustment", zh: "调整" },
        label: {
          id: "Penyesuaian yang telah disetujui",
          en: "Approved adjustment",
          zh: "已批准的调整",
        },
        unit: liter,
      },
    ],
  },
  "meter-quantity": {
    shortLabel: { id: "Penjualan meter", en: "Meter sales", zh: "仪表销售量" },
    expression: {
      id: "penjualanMeter = bacaanAkhir − bacaanAwal + offsetReset",
      en: "meterSales = meterEnd − meterStart + resetOffset",
      zh: "仪表销售量 = 结束读数 − 起始读数 + 重置补偿",
    },
    explanation: {
      id: "Offset bernilai nol, kecuali terdapat reset atau penggantian meter yang terdokumentasi.",
      en: "The offset is zero unless a documented meter reset or replacement occurred.",
      zh: "除非有记录在案的仪表重置或更换，否则补偿值为零。",
    },
    variables: [
      {
        symbol: { id: "bacaanAkhir", en: "meterEnd", zh: "结束读数" },
        label: { id: "Bacaan akhir", en: "Closing reading", zh: "结束读数" },
        unit: liter,
      },
      {
        symbol: { id: "bacaanAwal", en: "meterStart", zh: "起始读数" },
        label: {
          id: "Bacaan awal terkonfirmasi",
          en: "Confirmed opening reading",
          zh: "已确认的起始读数",
        },
        unit: liter,
      },
      {
        symbol: { id: "offsetReset", en: "resetOffset", zh: "重置补偿" },
        label: {
          id: "Kompensasi reset atau penggantian",
          en: "Reset or replacement compensation",
          zh: "重置或更换补偿",
        },
        unit: liter,
      },
    ],
  },
  "liter-variance": {
    shortLabel: { id: "Selisih liter", en: "Litre variance", zh: "升数差异" },
    expression: {
      id: "selisihLiter = penjualanTerposting − penjualanMeter",
      en: "litreVariance = postedSales − meterSales",
      zh: "升数差异 = 已过账销售量 − 仪表销售量",
    },
    explanation: {
      id: "Nilai nol berarti penjualan terposting sama dengan pergerakan meter. Nilai selain nol harus ditinjau dan diberi catatan.",
      en: "Zero means posted sales match the meter movement. Any non-zero value requires review and a note.",
      zh: "零表示已过账销售量与仪表变动一致；任何非零值都需要审核并添加说明。",
    },
    variables: [
      {
        symbol: { id: "penjualanTerposting", en: "postedSales", zh: "已过账销售量" },
        label: { id: "Penjualan yang terposting", en: "Posted sales", zh: "已过账的销售量" },
        unit: liter,
      },
      {
        symbol: { id: "penjualanMeter", en: "meterSales", zh: "仪表销售量" },
        label: {
          id: "Penjualan dari bacaan meter",
          en: "Sales from meter readings",
          zh: "根据仪表读数计算的销售量",
        },
        unit: liter,
      },
    ],
  },
  "cash-variance": {
    shortLabel: { id: "Selisih kas", en: "Cash variance", zh: "现金差异" },
    expression: {
      id: "selisihKas = setoranKas − nilaiPenjualanSeharusnya",
      en: "cashVariance = cashDeposit − expectedSalesAmount",
      zh: "现金差异 = 现金存款 − 应收销售额",
    },
    explanation: {
      id: "Nilai penjualan seharusnya menggunakan biaya layer FIFO atau aturan harga yang berlaku, bukan angka tetap pada laporan.",
      en: "The expected amount uses FIFO-layer cost or the effective pricing rule, not a fixed value in the report.",
      zh: "应收金额使用 FIFO 层成本或当前有效的定价规则，而不是报告中的固定数值。",
    },
    variables: [
      {
        symbol: { id: "setoranKas", en: "cashDeposit", zh: "现金存款" },
        label: { id: "Setoran aktual", en: "Actual deposit", zh: "实际存款" },
        unit: rupiah,
      },
      {
        symbol: {
          id: "nilaiPenjualanSeharusnya",
          en: "expectedSalesAmount",
          zh: "应收销售额",
        },
        label: {
          id: "Nilai penjualan yang seharusnya",
          en: "Expected sales amount",
          zh: "应收销售金额",
        },
        unit: rupiah,
      },
    ],
  },
};

export function localizeFormula(formula: FormulaDefinition, locale: AppLocale): FormulaDefinition {
  const copy = formulaCopy[formula.id];
  if (copy === undefined) return formula;
  return {
    id: formula.id,
    shortLabel: copy.shortLabel[locale],
    expression: copy.expression[locale],
    explanation: copy.explanation[locale],
    variables: copy.variables.map((variable) => ({
      symbol: variable.symbol[locale],
      label: variable.label[locale],
      unit: variable.unit[locale],
    })),
  };
}
