import type {
  DailyStockReportRow,
  MeterReconciliationReportRow,
  OperationalReportPackage,
  StockOpnameReportRow,
} from "../data/reportsGateway.js";

type XlsxCell = import("write-excel-file/browser").Cell;
type XlsxSheetData = import("write-excel-file/browser").SheetData;

const palette = {
  title: "#1E1E2E",
  section: "#313244",
  header: "#45475A",
  headerText: "#F5E0DC",
  accent: "#94E2D5",
  warning: "#F9E2AF",
  danger: "#F38BA8",
  success: "#A6E3A1",
  neutral: "#CDD6F4",
  soft: "#E6E1DC",
};

const literFormat = "#,##0.000";
const currencyFormat = '"Rp" #,##0';
const numberFormat = "#,##0";

export async function downloadOperationalReportXlsx(
  fileName: string,
  report: OperationalReportPackage,
  generatedBy: string,
): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const sheets = buildSheets(report, generatedBy);
  await writeXlsxFile(sheets, { fontFamily: "Calibri", fontSize: 10 }).toFile(fileName);
}

function buildSheets(report: OperationalReportPackage, generatedBy: string) {
  const summary = summarize(report);
  const unitSheets = uniqueUnits(report.dailyStock).map((unit) =>
    buildUnitSheet(report, unit.id, unit.code, unit.name),
  );
  return [
    buildSummarySheet(report, generatedBy, summary),
    ...unitSheets,
    buildMovementsSheet(report),
    buildReconciliationSheet(report),
    buildOpnameSheet(report),
    buildStockLayersSheet(report),
    buildFifoSheet(report),
    buildCashSheet(report),
    buildStagedSourceSheet(report),
    buildAuditSheet(report),
    buildMetadataSheet(report, generatedBy),
  ];
}

function buildSummarySheet(
  report: OperationalReportPackage,
  generatedBy: string,
  summary: ReturnType<typeof summarize>,
) {
  const columns = 6;
  const data: XlsxSheetData = [
    bannerRow("LAPORAN OPERASIONAL PERTASHOP", columns, palette.title),
    bannerRow(
      `${report.branch.name} · ${report.branch.code}`,
      columns,
      palette.section,
    ),
    bannerRow(
      `Periode ${report.period.startDate} sampai ${report.period.endDate}`,
      columns,
      palette.section,
    ),
    blankRow(columns),
    sectionRow("RINGKASAN STOCK DAN PENJUALAN", columns),
    headerRow(["Indikator", "Liter", "Nilai", "Status", "Catatan", "Sumber"]),
    row([
      textCell("Stock awal periode"),
      literCell(summary.openingStockQty),
      emptyCell(),
      textCell("FINAL"),
      textCell("Saldo pembuka seluruh unit stock"),
      textCell("Ledger"),
    ]),
    row([
      textCell("Penerimaan / supply"),
      literCell(summary.supplyQty),
      emptyCell(),
      textCell("FINAL"),
      textCell("Akumulasi penerimaan dalam periode"),
      textCell("Inventory movement"),
    ]),
    row([
      textCell("Penjualan posting"),
      literCell(summary.postedSalesQty),
      currencyCell(summary.salesRevenueAmount),
      textCell(summary.pendingCostLayers > 0 ? "PROVISIONAL" : "FINAL"),
      textCell("Nilai penjualan berdasarkan alokasi FIFO"),
      textCell("FIFO allocation"),
    ]),
    row([
      textCell("Penjualan meter"),
      literCell(summary.meterSalesQty),
      currencyCell(summary.cashDepositAmount),
      textCell("FINAL"),
      textCell("Nilai merupakan setoran kas aktual"),
      textCell("Meter reading"),
    ]),
    row([
      textCell("Retur penjualan"),
      literCell(summary.salesReturnQty),
      emptyCell(),
      textCell("FINAL"),
      textCell("BBM kembali dari penjualan"),
      textCell("Inventory movement"),
    ]),
    row([
      textCell("Transfer masuk"),
      literCell(summary.transferInQty),
      emptyCell(),
      textCell("FINAL"),
      textCell("Transfer antar-unit masuk"),
      textCell("Inventory movement"),
    ]),
    row([
      textCell("Transfer keluar"),
      literCell(summary.transferOutQty),
      emptyCell(),
      textCell("FINAL"),
      textCell("Transfer antar-unit keluar"),
      textCell("Inventory movement"),
    ]),
    row([
      textCell("Gain / loss"),
      literCell(summary.gainQty - summary.lossQty),
      emptyCell(),
      textCell("FINAL"),
      textCell(`Gain ${formatCompact(summary.gainQty)} L · Loss ${formatCompact(summary.lossQty)} L`),
      textCell("Inventory movement"),
    ]),
    row([
      textCell("Stock akhir periode"),
      literCell(summary.closingStockQty),
      emptyCell(),
      textCell("FINAL"),
      textCell("Saldo akhir seluruh unit stock"),
      textCell("Ledger"),
    ]),
    blankRow(columns),
    sectionRow("RINGKASAN KEUANGAN DAN REKONSILIASI", columns),
    headerRow(["Indikator", "Liter", "Nilai", "Status", "Catatan", "Sumber"]),
    row([
      textCell("HPP FIFO"),
      emptyCell(),
      currencyCell(summary.cogsAmount),
      textCell(summary.pendingCostLayers > 0 ? "PROVISIONAL" : "FINAL"),
      textCell(`${summary.pendingCostLayers} layer masih menunggu HPP`),
      textCell("FIFO allocation"),
    ]),
    row([
      textCell("Laba kotor FIFO"),
      emptyCell(),
      currencyCell(summary.grossProfitAmount),
      textCell(summary.pendingCostLayers > 0 ? "PROVISIONAL" : "FINAL"),
      textCell("Pendapatan FIFO dikurangi HPP FIFO"),
      textCell("FIFO allocation"),
    ]),
    row([
      textCell("Selisih liter"),
      literCell(summary.literVariance),
      emptyCell(),
      statusCell(summary.literVariance === 0 ? "MATCHED" : "REVIEW"),
      textCell("Posting FIFO dikurangi penjualan meter"),
      textCell("Reconciliation"),
    ]),
    row([
      textCell("Selisih kas"),
      emptyCell(),
      currencyCell(summary.cashVariance),
      statusCell(summary.cashVariance === 0 ? "MATCHED" : "REVIEW"),
      textCell("Setoran aktual dikurangi nilai seharusnya"),
      textCell("Reconciliation"),
    ]),
    row([
      textCell("Biaya operasional"),
      emptyCell(),
      currencyCell(summary.expenseAmount),
      textCell("FINAL"),
      textCell("Pengeluaran terposting"),
      textCell("Expense"),
    ]),
    row([
      textCell("Pendapatan lain"),
      emptyCell(),
      currencyCell(summary.otherIncomeAmount),
      textCell("FINAL"),
      textCell("Pendapatan lain terposting"),
      textCell("Other income"),
    ]),
    row([
      textCell("Hasil operasional"),
      emptyCell(),
      currencyCell(summary.operatingResultAmount),
      textCell(summary.pendingCostLayers > 0 ? "PROVISIONAL" : "FINAL"),
      textCell("Laba kotor + pendapatan lain - biaya"),
      textCell("Calculated"),
    ]),
    blankRow(columns),
    sectionRow("KONTROL DATA", columns),
    headerRow(["Objek", "Jumlah", "Perlu review", "Status", "Catatan", "Sumber"]),
    row([
      textCell("Bacaan meter"),
      integerCell(report.meterReconciliations.length),
      integerCell(summary.pendingReconciliations),
      statusCell(summary.pendingReconciliations === 0 ? "OK" : "REVIEW"),
      textCell("PENDING / ESCALATED belum selesai"),
      textCell("Meter reading"),
    ]),
    row([
      textCell("Stock opname"),
      integerCell(report.stockOpnames.length),
      integerCell(summary.pendingOpnames),
      statusCell(summary.pendingOpnames === 0 ? "OK" : "REVIEW"),
      textCell("Saran adjustment belum final"),
      textCell("Stock opname"),
    ]),
    row([
      textCell("Baris sumber belum diposting"),
      integerCell(report.stagedSourceRows.length),
      integerCell(report.stagedSourceRows.length),
      statusCell(report.stagedSourceRows.length === 0 ? "OK" : "INCOMPLETE"),
      textCell("Lihat sheet Sumber Tertunda"),
      textCell("Historical source"),
    ]),
    blankRow(columns),
    row([
      textCell("Dibuat oleh"),
      textCell(generatedBy),
      textCell("Dibuat pada"),
      textCell(new Date().toISOString()),
      textCell("Zona waktu"),
      textCell(report.branch.timezone),
    ]),
  ];
  return sheet("Ringkasan", data, [30, 18, 20, 16, 42, 22], 6);
}

function buildUnitSheet(
  report: OperationalReportPackage,
  stockUnitId: string,
  stockUnitCode: string,
  stockUnitName: string,
) {
  const daily = report.dailyStock.filter((item) => item.stockUnitId === stockUnitId);
  const reconciliation = new Map(
    report.meterReconciliations
      .filter((item) => item.stockUnitId === stockUnitId)
      .map((item) => [item.businessDate, item]),
  );
  const opname = new Map(
    report.stockOpnames
      .filter((item) => item.stockUnitId === stockUnitId)
      .map((item) => [item.businessDate, item]),
  );
  const headers = [
    "Tanggal",
    "Stock Awal",
    "Supply",
    "Retur",
    "Transfer Masuk",
    "Transfer Keluar",
    "Gain",
    "Loss",
    "Total Tersedia",
    "Meter Awal",
    "Meter Akhir",
    "Reset",
    "Penjualan Meter",
    "Penjualan Posting",
    "Setoran",
    "Nilai Seharusnya",
    "Selisih Liter",
    "Selisih Kas",
    "Stock Akhir",
    "Stock Sistem Opname",
    "Stock Fisik",
    "Selisih Opname",
    "Status Rekonsiliasi",
    "Status Opname",
    "Keterangan",
  ];
  const rows: XlsxSheetData = [
    bannerRow(
      `LAPORAN HARIAN OPERATOR PERTASHOP ${report.branch.code} ${report.branch.name}`,
      headers.length,
      palette.title,
    ),
    bannerRow(
      `Periode ${report.period.startDate} sampai ${report.period.endDate}`,
      headers.length,
      palette.section,
    ),
    bannerRow(`${stockUnitName} · ${stockUnitCode}`, headers.length, palette.section),
    blankRow(headers.length),
    headerRow(headers),
    ...daily.map((day) => {
      const meter = reconciliation.get(day.businessDate);
      const counted = opname.get(day.businessDate);
      const totalAvailable =
        day.openingQty + day.supplyQty + day.salesReturnQty + day.transferInQty + day.gainQty;
      return row([
        textCell(day.businessDate),
        literCell(day.openingQty),
        literCell(day.supplyQty),
        literCell(day.salesReturnQty),
        literCell(day.transferInQty),
        literCell(day.transferOutQty),
        literCell(day.gainQty),
        literCell(day.lossQty),
        literCell(totalAvailable),
        optionalLiterCell(meter?.meterStart),
        optionalLiterCell(meter?.meterEnd),
        optionalLiterCell(meter?.meterResetOffset),
        optionalLiterCell(meter?.meterSalesQty),
        optionalLiterCell(meter?.postedSalesQty),
        optionalCurrencyCell(meter?.cashDepositAmount),
        optionalCurrencyCell(meter?.expectedSalesAmount),
        optionalVarianceCell(meter?.literVariance, literFormat),
        optionalVarianceCell(meter?.cashVariance, currencyFormat),
        literCell(day.closingQty),
        optionalLiterCell(counted?.systemQty),
        optionalLiterCell(counted?.physicalQty),
        optionalVarianceCell(counted?.varianceQty, literFormat),
        statusCell(meter?.reconciliationStatus ?? ""),
        statusCell(counted?.suggestionStatus ?? ""),
        textCell(combineNotes(meter, counted)),
      ]);
    }),
    blankRow(headers.length),
    totalRow(headers.length, daily, reconciliation, opname),
  ];
  const widths = [
    13, 14, 12, 11, 15, 15, 10, 10, 16, 14, 14, 11, 16, 17, 18, 18, 14, 18, 14, 19, 14, 15,
    20, 18, 36,
  ];
  return sheet(sanitizeSheetName(stockUnitName), rows, widths, 5);
}

function totalRow(
  columnCount: number,
  daily: DailyStockReportRow[],
  reconciliation: Map<string, MeterReconciliationReportRow>,
  opname: Map<string, StockOpnameReportRow>,
): XlsxCell[] {
  const meterRows = [...reconciliation.values()];
  const opnameRows = [...opname.values()];
  const cells: XlsxCell[] = [
    totalLabelCell("TOTAL PERIODE"),
    literCell(daily[0]?.openingQty ?? 0),
    literCell(sum(daily, "supplyQty")),
    literCell(sum(daily, "salesReturnQty")),
    literCell(sum(daily, "transferInQty")),
    literCell(sum(daily, "transferOutQty")),
    literCell(sum(daily, "gainQty")),
    literCell(sum(daily, "lossQty")),
    emptyCell(),
    emptyCell(),
    emptyCell(),
    literCell(sum(meterRows, "meterResetOffset")),
    literCell(sum(meterRows, "meterSalesQty")),
    literCell(sum(meterRows, "postedSalesQty")),
    currencyCell(sum(meterRows, "cashDepositAmount")),
    currencyCell(sum(meterRows, "expectedSalesAmount")),
    varianceCell(sum(meterRows, "literVariance"), literFormat),
    varianceCell(sum(meterRows, "cashVariance"), currencyFormat),
    literCell(daily.at(-1)?.closingQty ?? 0),
    emptyCell(),
    emptyCell(),
    varianceCell(sum(opnameRows, "varianceQty"), literFormat),
    emptyCell(),
    emptyCell(),
    textCell("Stock awal tidak dijumlahkan sebagai throughput; total hanya untuk kontrol."),
  ];
  return padRow(cells, columnCount);
}

function buildMovementsSheet(report: OperationalReportPackage) {
  const headers = [
    "Tanggal",
    "Unit Stock",
    "Produk",
    "Jenis Mutasi",
    "Perubahan Liter",
    "Status",
    "Referensi",
    "Alasan",
    "Sumber",
    "Source ID",
    "Diposting Oleh",
    "Posted At",
    "Created At",
    "Movement ID",
  ];
  const rows: XlsxSheetData = report.movements.map((item) =>
    row([
      textCell(item.businessDate),
      textCell(`${item.stockUnitName} · ${item.stockUnitCode}`),
      textCell(`${item.productName} · ${item.productCode}`),
      textCell(item.movementType),
      varianceCell(item.quantityDelta, literFormat),
      statusCell(item.postingStatus),
      textCell(item.reference ?? ""),
      textCell(item.reason ?? ""),
      textCell(item.sourceType),
      textCell(item.sourceId ?? ""),
      textCell(item.postedByName ?? ""),
      textCell(item.postedAt),
      textCell(item.createdAt),
      textCell(item.id),
    ]),
  );
  return dataSheet(
    "Mutasi Stock",
    `MUTASI STOCK · ${report.branch.name}`,
    report,
    headers,
    rows,
    [13, 25, 20, 18, 16, 13, 20, 36, 22, 38, 22, 24, 24, 38],
  );
}

function buildReconciliationSheet(report: OperationalReportPackage) {
  const headers = [
    "Tanggal",
    "Meter",
    "Unit Stock",
    "Meter Awal",
    "Meter Akhir",
    "Reset",
    "Penjualan Meter",
    "Penjualan Posting",
    "Selisih Liter",
    "Nilai Seharusnya",
    "Setoran",
    "Selisih Kas",
    "Status Rekonsiliasi",
    "Status Posting",
    "Catatan",
    "Created At",
    "Posted At",
    "Reading ID",
  ];
  const rows = report.meterReconciliations.map((item) =>
    row([
      textCell(item.businessDate),
      textCell(`${item.meterUnitName} · ${item.meterUnitCode}`),
      textCell(`${item.stockUnitName} · ${item.stockUnitCode}`),
      literCell(item.meterStart),
      literCell(item.meterEnd),
      literCell(item.meterResetOffset),
      literCell(item.meterSalesQty),
      literCell(item.postedSalesQty),
      varianceCell(item.literVariance, literFormat),
      currencyCell(item.expectedSalesAmount),
      currencyCell(item.cashDepositAmount),
      varianceCell(item.cashVariance, currencyFormat),
      statusCell(item.reconciliationStatus),
      statusCell(item.postingStatus),
      textCell(item.note ?? ""),
      textCell(item.createdAt),
      textCell(item.postedAt ?? ""),
      textCell(item.id),
    ]),
  );
  return dataSheet(
    "Rekonsiliasi Meter",
    `REKONSILIASI METER · ${report.branch.name}`,
    report,
    headers,
    rows,
    [13, 24, 24, 14, 14, 12, 16, 17, 15, 19, 18, 18, 20, 16, 38, 24, 24, 38],
  );
}

function buildOpnameSheet(report: OperationalReportPackage) {
  const headers = [
    "Tanggal",
    "Unit Stock",
    "Produk",
    "Stock Sistem",
    "Stock Fisik",
    "Selisih",
    "Status Posting",
    "Saran",
    "Qty Saran",
    "Keputusan",
    "Qty Disetujui",
    "Status Review",
    "Alasan Keputusan",
    "Diputuskan Oleh",
    "Diputuskan At",
    "Evidence Object",
    "Created At",
    "Opname ID",
  ];
  const rows = report.stockOpnames.map((item) =>
    row([
      textCell(item.businessDate),
      textCell(`${item.stockUnitName} · ${item.stockUnitCode}`),
      textCell(`${item.productName} · ${item.productCode}`),
      literCell(item.systemQty),
      literCell(item.physicalQty),
      varianceCell(item.varianceQty, literFormat),
      statusCell(item.postingStatus),
      textCell(item.suggestedType ?? ""),
      optionalLiterCell(item.suggestedQty ?? undefined),
      textCell(item.approvedType ?? ""),
      optionalLiterCell(item.approvedQty ?? undefined),
      statusCell(item.suggestionStatus ?? ""),
      textCell(item.decisionReason ?? ""),
      textCell(item.decidedByName ?? ""),
      textCell(item.decidedAt ?? ""),
      textCell(item.evidenceObjectKey ?? ""),
      textCell(item.createdAt),
      textCell(item.id),
    ]),
  );
  return dataSheet(
    "Stock Opname",
    `STOCK OPNAME · ${report.branch.name}`,
    report,
    headers,
    rows,
    [13, 24, 20, 14, 14, 14, 16, 14, 13, 14, 15, 18, 36, 22, 24, 34, 24, 38],
  );
}

function buildStockLayersSheet(report: OperationalReportPackage) {
  const headers = [
    "Unit Stock",
    "Produk",
    "Received At",
    "Sequence",
    "Qty Awal",
    "Qty Terpakai",
    "Qty Tersisa",
    "HPP / Liter",
    "Harga Jual / Liter",
    "Status HPP",
    "Sumber",
    "Source ID",
    "Layer ID",
  ];
  const rows = report.stockLayers.map((item) =>
    row([
      textCell(`${item.stockUnitName} · ${item.stockUnitCode}`),
      textCell(`${item.productName} · ${item.productCode}`),
      textCell(item.receivedAt),
      integerCell(item.sequenceNo),
      literCell(item.initialQty),
      literCell(item.allocatedQty),
      literCell(item.remainingQty),
      currencyCell(item.unitCost),
      currencyCell(item.unitSellingPrice),
      statusCell(item.costStatus),
      textCell(item.sourceType),
      textCell(item.sourceId ?? ""),
      textCell(item.id),
    ]),
  );
  return dataSheet(
    "Layer Stock & HPP",
    `LAYER STOCK DAN HPP · ${report.branch.name}`,
    report,
    headers,
    rows,
    [25, 20, 24, 10, 14, 14, 14, 17, 19, 14, 22, 38, 38],
  );
}

function buildFifoSheet(report: OperationalReportPackage) {
  const headers = [
    "Tanggal",
    "Meter",
    "Unit Stock",
    "Produk",
    "Qty Alokasi",
    "HPP / Liter",
    "Harga Jual / Liter",
    "COGS",
    "Pendapatan",
    "Laba Kotor",
    "Status HPP",
    "Layer Received At",
    "Sumber Layer",
    "Layer Source ID",
    "Reading ID",
    "Layer ID",
    "Allocation ID",
  ];
  const rows = report.fifoAllocations.map((item) =>
    row([
      textCell(item.businessDate),
      textCell(`${item.meterUnitName} · ${item.meterUnitCode}`),
      textCell(`${item.stockUnitName} · ${item.stockUnitCode}`),
      textCell(`${item.productName} · ${item.productCode}`),
      literCell(item.quantity),
      currencyCell(item.unitCost),
      currencyCell(item.unitSellingPrice),
      currencyCell(item.cogsAmount),
      currencyCell(item.revenueAmount),
      currencyCell(item.grossProfitAmount),
      statusCell(item.costStatus),
      textCell(item.layerReceivedAt),
      textCell(item.layerSourceType),
      textCell(item.layerSourceId ?? ""),
      textCell(item.readingId),
      textCell(item.layerId),
      textCell(item.id),
    ]),
  );
  return dataSheet(
    "Alokasi FIFO",
    `ALOKASI FIFO DAN LABA KOTOR · ${report.branch.name}`,
    report,
    headers,
    rows,
    [13, 24, 24, 20, 14, 17, 19, 18, 18, 18, 14, 24, 22, 38, 38, 38, 38],
  );
}

function buildCashSheet(report: OperationalReportPackage) {
  const headers = ["Tanggal", "Jenis", "Kategori", "Jumlah", "Status", "Catatan"];
  const rows = report.cashEntries.map((item) =>
    row([
      textCell(item.businessDate),
      textCell(item.entryType),
      textCell(item.category),
      currencyCell(item.amount),
      statusCell(item.postingStatus),
      textCell(item.note ?? ""),
    ]),
  );
  return dataSheet(
    "Kas Lain",
    `PENGELUARAN DAN PENDAPATAN LAIN · ${report.branch.name}`,
    report,
    headers,
    rows,
    [13, 18, 28, 18, 15, 44],
  );
}

function buildStagedSourceSheet(report: OperationalReportPackage) {
  const headers = [
    "Tanggal",
    "Unit Stock",
    "Meter",
    "Status Sumber",
    "Alasan Blocking",
    "File",
    "Sheet",
    "Baris",
    "Data Mentah",
    "Catatan Resolusi",
    "Staged At",
    "Source ID",
  ];
  const rows = report.stagedSourceRows.map((item) =>
    row([
      textCell(item.businessDate),
      textCell(`${item.stockUnitName} · ${item.stockUnitCode}`),
      textCell(
        item.meterUnitName === null
          ? ""
          : `${item.meterUnitName} · ${item.meterUnitCode ?? ""}`,
      ),
      statusCell(item.sourceStatus),
      textCell(item.blockingReasons.join("; ")),
      textCell(item.sourceFile),
      textCell(item.sourceSheet),
      integerCell(item.sourceRow),
      textCell(JSON.stringify(item.rawData)),
      textCell(item.resolutionNote ?? ""),
      textCell(item.stagedAt),
      textCell(item.id),
    ]),
  );
  return dataSheet(
    "Sumber Tertunda",
    `SUMBER BELUM DIPOSTING · ${report.branch.name}`,
    report,
    headers,
    rows,
    [13, 24, 24, 18, 42, 36, 22, 10, 70, 38, 24, 38],
  );
}

function buildAuditSheet(report: OperationalReportPackage) {
  const headers = [
    "Waktu",
    "Pelaku",
    "Aksi",
    "Object Type",
    "Object ID",
    "Outcome",
    "Impact Scope",
    "Alasan",
    "Request ID",
    "Metadata",
    "Audit ID",
  ];
  const rows = report.auditLogs.map((item) =>
    row([
      textCell(item.occurredAt),
      textCell(item.actorName ?? "System"),
      textCell(item.action),
      textCell(item.objectType),
      textCell(item.objectId),
      statusCell(item.outcome),
      textCell(item.impactScope),
      textCell(item.reason ?? ""),
      textCell(item.requestId ?? ""),
      textCell(JSON.stringify(item.metadata)),
      integerCell(item.id),
    ]),
  );
  return dataSheet(
    "Audit Log",
    `AUDIT LOG · ${report.branch.name}`,
    report,
    headers,
    rows,
    [25, 22, 18, 24, 38, 14, 14, 38, 34, 70, 12],
  );
}

function buildMetadataSheet(report: OperationalReportPackage, generatedBy: string) {
  const data: XlsxSheetData = [
    bannerRow("METADATA LAPORAN", 2, palette.title),
    headerRow(["Field", "Value"]),
    row([textCell("branch_id"), textCell(report.branch.id)]),
    row([textCell("branch_code"), textCell(report.branch.code)]),
    row([textCell("branch_name"), textCell(report.branch.name)]),
    row([textCell("timezone"), textCell(report.branch.timezone)]),
    row([textCell("period_start"), textCell(report.period.startDate)]),
    row([textCell("period_end"), textCell(report.period.endDate)]),
    row([textCell("generated_by"), textCell(generatedBy)]),
    row([textCell("generated_at"), textCell(new Date().toISOString())]),
    row([textCell("report_version"), textCell("2026-07-detailed-v1")]),
    row([textCell("data_mode"), textCell("api-operational-package")]),
    row([
      textCell("hpp_note"),
      textCell("Laba dan COGS bersifat provisional selama masih terdapat layer HPP PENDING."),
    ]),
    row([
      textCell("sounding_note"),
      textCell(
        "Database saat ini menyimpan stock fisik hasil konversi, tetapi belum menyimpan angka sounding mentah (cm).",
      ),
    ]),
  ];
  return sheet("Metadata", data, [24, 80], 2);
}

function dataSheet(
  name: string,
  title: string,
  report: OperationalReportPackage,
  headers: string[],
  rows: XlsxSheetData,
  widths: number[],
) {
  const data: XlsxSheetData = [
    bannerRow(title, headers.length, palette.title),
    bannerRow(
      `Periode ${report.period.startDate} sampai ${report.period.endDate}`,
      headers.length,
      palette.section,
    ),
    blankRow(headers.length),
    headerRow(headers),
    ...(rows.length === 0
      ? [row([textCell("Tidak ada data pada periode ini."), ...emptyCells(headers.length - 1)])]
      : rows),
  ];
  return sheet(name, data, widths, 4);
}

function sheet(
  name: string,
  data: XlsxSheetData,
  widths: number[],
  stickyRowsCount: number,
): import("write-excel-file/browser").Sheet<File | Blob | ArrayBuffer> {
  return {
    data,
    sheet: sanitizeSheetName(name),
    stickyRowsCount,
    showGridLines: false,
    columns: widths.map((width) => ({ width })),
  };
}

function summarize(report: OperationalReportPackage) {
  const units = uniqueUnits(report.dailyStock);
  const openingStockQty = units.reduce((total, unit) => {
    const first = report.dailyStock.find((item) => item.stockUnitId === unit.id);
    return total + (first?.openingQty ?? 0);
  }, 0);
  const closingStockQty = units.reduce((total, unit) => {
    const rows = report.dailyStock.filter((item) => item.stockUnitId === unit.id);
    return total + (rows.at(-1)?.closingQty ?? 0);
  }, 0);
  const supplyQty = sum(report.dailyStock, "supplyQty");
  const postedSalesQty = sum(report.dailyStock, "salesQty");
  const salesReturnQty = sum(report.dailyStock, "salesReturnQty");
  const transferInQty = sum(report.dailyStock, "transferInQty");
  const transferOutQty = sum(report.dailyStock, "transferOutQty");
  const gainQty = sum(report.dailyStock, "gainQty");
  const lossQty = sum(report.dailyStock, "lossQty");
  const meterSalesQty = sum(report.meterReconciliations, "meterSalesQty");
  const cashDepositAmount = sum(report.meterReconciliations, "cashDepositAmount");
  const literVariance = sum(report.meterReconciliations, "literVariance");
  const cashVariance = sum(report.meterReconciliations, "cashVariance");
  const salesRevenueAmount = sum(report.fifoAllocations, "revenueAmount");
  const cogsAmount = sum(report.fifoAllocations, "cogsAmount");
  const grossProfitAmount = sum(report.fifoAllocations, "grossProfitAmount");
  const expenseAmount = report.cashEntries
    .filter((item) => item.entryType === "EXPENSE" && item.postingStatus === "POSTED")
    .reduce((total, item) => total + item.amount, 0);
  const otherIncomeAmount = report.cashEntries
    .filter((item) => item.entryType === "OTHER_INCOME" && item.postingStatus === "POSTED")
    .reduce((total, item) => total + item.amount, 0);
  return {
    openingStockQty,
    closingStockQty,
    supplyQty,
    postedSalesQty,
    salesReturnQty,
    transferInQty,
    transferOutQty,
    gainQty,
    lossQty,
    meterSalesQty,
    cashDepositAmount,
    literVariance,
    cashVariance,
    salesRevenueAmount,
    cogsAmount,
    grossProfitAmount,
    expenseAmount,
    otherIncomeAmount,
    operatingResultAmount: grossProfitAmount + otherIncomeAmount - expenseAmount,
    pendingCostLayers: report.stockLayers.filter((item) => item.costStatus === "PENDING").length,
    pendingReconciliations: report.meterReconciliations.filter((item) =>
      ["PENDING", "ESCALATED"].includes(item.reconciliationStatus),
    ).length,
    pendingOpnames: report.stockOpnames.filter(
      (item) => item.suggestionStatus !== null && !["POSTED", "REJECTED", "CANCELLED"].includes(item.suggestionStatus),
    ).length,
  };
}

function uniqueUnits(rows: DailyStockReportRow[]) {
  const seen = new Map<string, { id: string; code: string; name: string }>();
  for (const item of rows) {
    if (!seen.has(item.stockUnitId)) {
      seen.set(item.stockUnitId, {
        id: item.stockUnitId,
        code: item.stockUnitCode,
        name: item.stockUnitName,
      });
    }
  }
  return [...seen.values()];
}

function combineNotes(
  meter: MeterReconciliationReportRow | undefined,
  opname: StockOpnameReportRow | undefined,
): string {
  return [meter?.note, opname?.decisionReason]
    .filter((value): value is string => value !== null && value !== undefined && value !== "")
    .join(" · ");
}

function sum<T extends object>(rows: T[], key: keyof T): number {
  return rows.reduce((total, row) => {
    const value = row[key];
    return total + (typeof value === "number" && Number.isFinite(value) ? value : 0);
  }, 0);
}

function row(cells: XlsxCell[]): XlsxCell[] {
  return cells;
}

function padRow(cells: XlsxCell[], columns: number): XlsxCell[] {
  return cells.length >= columns ? cells : [...cells, ...emptyCells(columns - cells.length)];
}

function bannerRow(text: string, columns: number, backgroundColor: string): XlsxCell[] {
  return Array.from({ length: columns }, (_, index) => ({
    value: index === 0 ? text : "",
    fontWeight: "bold",
    textColor: palette.headerText,
    backgroundColor,
    alignVertical: "center",
    wrap: true,
  }));
}

function sectionRow(text: string, columns: number): XlsxCell[] {
  return bannerRow(text, columns, palette.section);
}

function headerRow(headers: string[]): XlsxCell[] {
  return headers.map((header) => ({
    value: header,
    fontWeight: "bold",
    textColor: palette.headerText,
    backgroundColor: palette.header,
    align: "center",
    alignVertical: "center",
    wrap: true,
  }));
}

function blankRow(columns: number): XlsxCell[] {
  return emptyCells(columns);
}

function emptyCells(count: number): XlsxCell[] {
  return Array.from({ length: count }, () => emptyCell());
}

function emptyCell(): XlsxCell {
  return { value: "" };
}

function textCell(value: string): XlsxCell {
  return { value, wrap: true, alignVertical: "top" };
}

function totalLabelCell(value: string): XlsxCell {
  return {
    value,
    fontWeight: "bold",
    textColor: palette.headerText,
    backgroundColor: palette.section,
    wrap: true,
  };
}

function numberCell(value: number, format: string): XlsxCell {
  return { value, type: Number, format, align: "right", alignVertical: "top" };
}

function integerCell(value: number): XlsxCell {
  return numberCell(value, numberFormat);
}

function literCell(value: number): XlsxCell {
  return numberCell(value, literFormat);
}

function currencyCell(value: number): XlsxCell {
  return numberCell(value, currencyFormat);
}

function optionalLiterCell(value: number | undefined): XlsxCell {
  return value === undefined ? emptyCell() : literCell(value);
}

function optionalCurrencyCell(value: number | undefined): XlsxCell {
  return value === undefined ? emptyCell() : currencyCell(value);
}

function varianceCell(value: number, format: string): XlsxCell {
  return {
    ...numberCell(value, format),
    ...(value < 0 ? { textColor: palette.danger } : value > 0 ? { textColor: palette.success } : {}),
  };
}

function optionalVarianceCell(value: number | undefined, format: string): XlsxCell {
  return value === undefined ? emptyCell() : varianceCell(value, format);
}

function statusCell(value: string): XlsxCell {
  const normalized = value.toUpperCase();
  const backgroundColor =
    normalized === "MATCHED" || normalized === "FINAL" || normalized === "POSTED" || normalized === "OK"
      ? palette.success
      : normalized === "PENDING" || normalized === "PROVISIONAL" || normalized === "REVIEW"
        ? palette.warning
        : normalized === "" || normalized === "CLOSED"
          ? palette.soft
          : palette.danger;
  return {
    value,
    backgroundColor,
    ...(value === "" ? {} : { fontWeight: "bold" as const }),
    align: "center",
    alignVertical: "center",
    wrap: true,
  };
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/:?*[\]]/g, "-").slice(0, 31) || "Sheet";
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(value);
}
