import type { AppLocale } from "@spbu/contracts";

let locale = "id-ID";
export function setFormattingLocale(next: AppLocale): void {
  locale = next === "id" ? "id-ID" : next === "en" ? "en-US" : "zh-CN";
}
const number = () =>
  new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const currency = (compact = false) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "IDR",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  });
export function formatLiter(value: number): string {
  return `${number().format(value)} L`;
}
export function formatNumber(value: number): string {
  return number().format(value);
}
export function formatCurrency(value: number): string {
  return currency().format(value);
}
export function formatCompactCurrency(value: number): string {
  return currency(true).format(value);
}
export function formatPercent(value: number): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(
    value,
  );
}
export function formatDate(value: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+07:00`));
}
export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
export function signed(value: number, formatter = (input: number) => formatNumber(input)): string {
  if (value === 0) return formatter(0);
  return `${value > 0 ? "+" : "−"}${formatter(Math.abs(value))}`;
}
