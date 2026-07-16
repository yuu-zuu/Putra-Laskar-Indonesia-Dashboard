export function downloadCsv(fileName: string, rows: Array<Record<string, string | number>>): void {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0] ?? {});
  const csv = [
    columns.map(escapeCsv).join(","),
    ...rows.map((row) => columns.map((column) => escapeCsv(row[column] ?? "")).join(",")),
  ].join("\n");
  downloadBlob(fileName, new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
}

export interface SpreadsheetSheet {
  name: string;
  rows: Array<Record<string, string | number>>;
}

export async function downloadXlsx(fileName: string, sheets: SpreadsheetSheet[]): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const workbook: Array<import("write-excel-file/browser").Sheet<File | Blob | ArrayBuffer>> =
    sheets.map((sheet) => {
      const columns = Object.keys(sheet.rows[0] ?? {});
      const data: import("write-excel-file/browser").SheetData = [
        columns.map((column) => ({
          value: column,
          fontWeight: "bold",
          textColor: "#CDD6F4",
          backgroundColor: "#313244",
          alignVertical: "center",
          wrap: true,
        })),
        ...sheet.rows.map((row) =>
          columns.map((column) => spreadsheetCell(column, row[column] ?? "")),
        ),
      ];
      return {
        data,
        sheet: sanitizeSheetName(sheet.name),
        stickyRowsCount: 1,
        showGridLines: false,
        columns: columns.map((column) => ({ width: columnWidth(column, sheet.rows) })),
      };
    });
  await writeXlsxFile(workbook, { fontFamily: "Calibri", fontSize: 11 }).toFile(fileName);
}

function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function spreadsheetCell(
  column: string,
  value: string | number,
): import("write-excel-file/browser").Cell {
  if (typeof value !== "number") return { value, wrap: true, alignVertical: "top" };
  const isLiter = column.endsWith("_l") || column.includes("liter");
  return { value, type: Number, format: isLiter ? "#,##0.000" : "#,##0", align: "right" };
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/:?*[\]]/g, "-").slice(0, 31) || "Sheet";
}

function columnWidth(column: string, rows: Array<Record<string, string | number>>): number {
  const contentWidth = rows.reduce(
    (maximum, row) => Math.max(maximum, String(row[column] ?? "").length),
    column.length,
  );
  return Math.min(Math.max(contentWidth + 2, 12), 34);
}
