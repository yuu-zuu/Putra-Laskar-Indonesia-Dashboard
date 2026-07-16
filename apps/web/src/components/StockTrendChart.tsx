import type { TrendPoint } from "@spbu/contracts";
import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatCompactCurrency, formatDate, formatLiter } from "../lib/format.js";
import { useI18n } from "../app/i18n.js";

const width = 760;
const height = 260;
const pad = { top: 22, right: 22, bottom: 46, left: 54 };

export function StockTrendChart({ data }: { data: TrendPoint[] }) {
  const { locale, l } = useI18n();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  if (data.length === 0)
    return (
      <p className="empty-state">
        {l("Belum ada data tren.", "No trend data yet.", "暂无趋势数据。")}
      </p>
    );
  const maxStock = Math.max(...data.map((point) => point.stockQty), 1);
  const maxSales = Math.max(...data.map((point) => point.salesQty), 1);
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const x = (index: number) => pad.left + (index / Math.max(data.length - 1, 1)) * chartWidth;
  const stockY = (value: number) => pad.top + chartHeight - (value / maxStock) * chartHeight;
  const salesY = (value: number) =>
    pad.top + chartHeight - (value / maxSales) * (chartHeight * 0.48);
  const line = data
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${stockY(point.stockQty)}`)
    .join(" ");
  const barWidth = Math.min(24, chartWidth / (data.length * 2.4));
  const tickInterval = Math.max(1, Math.ceil(data.length / 7));
  const activePoint = activeIndex === null ? undefined : data[activeIndex];
  const detail = (point: TrendPoint) =>
    `${formatDate(point.label)} · ${l("stok", "stock", "库存")} ${formatLiter(point.stockQty)} · ${l("penjualan", "sales", "销售")} ${formatLiter(point.salesQty)} · ${l("kas", "cash", "现金")} ${formatCompactCurrency(point.cashAmount)}`;
  const selectFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * width;
    const index = Math.round(((pointerX - pad.left) / chartWidth) * Math.max(data.length - 1, 1));
    setActiveIndex(Math.max(0, Math.min(data.length - 1, index)));
  };
  const navigate = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Escape") return setActiveIndex(null);
    if (event.key === "Home") return setActiveIndex(0);
    if (event.key === "End") return setActiveIndex(data.length - 1);
    const current = activeIndex ?? data.length - 1;
    setActiveIndex(
      Math.max(0, Math.min(data.length - 1, current + (event.key === "ArrowLeft" ? -1 : 1))),
    );
  };

  return (
    <figure className="trend-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        tabIndex={0}
        aria-keyshortcuts="ArrowLeft ArrowRight Home End Escape"
        aria-labelledby="trend-title trend-desc trend-active-detail"
        onFocus={() => setActiveIndex((current) => current ?? data.length - 1)}
        onBlur={() => setActiveIndex(null)}
        onKeyDown={navigate}
        onPointerDown={selectFromPointer}
        onPointerMove={(event) => {
          if (event.pointerType === "mouse" || event.pointerType === "pen") {
            selectFromPointer(event);
          }
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setActiveIndex(null);
        }}
      >
        <title id="trend-title">
          {l(
            `Tren stok dan penjualan ${data.length} hari`,
            `${data.length}-day stock and sales trend`,
            `${data.length} 天库存与销售趋势`,
          )}
        </title>
        <desc id="trend-desc">
          {l(
            "Garis menunjukkan stok akhir; batang memakai skala penjualan terpisah.",
            "The line shows closing stock; bars use a separate sales scale.",
            "折线显示期末库存；柱形使用独立销售刻度。",
          )}
        </desc>
        {[0, 0.5, 1].map((step) => {
          const y = pad.top + step * chartHeight;
          const value = maxStock * (1 - step);
          return (
            <g key={step}>
              <line className="chart-grid" x1={pad.left} x2={width - pad.right} y1={y} y2={y} />
              <text className="chart-axis" x={pad.left - 10} y={y + 4} textAnchor="end">
                {Math.round(value / 1000)}k
              </text>
            </g>
          );
        })}
        <text className="chart-axis chart-axis-label" x={pad.left} y={13}>
          {l("Stock (L)", "Stock (L)", "库存（升）")}
        </text>
        <text className="chart-axis chart-axis-label" x={width - pad.right} y={13} textAnchor="end">
          {l("Penjualan (L)", "Sales (L)", "销售（升）")}: {formatLiter(maxSales)}
        </text>
        {data.map((point, index) => (
          <g key={point.label}>
            <rect
              className={`chart-bar ${activeIndex === index ? "chart-bar-active" : ""}`}
              x={x(index) - barWidth / 2}
              y={salesY(point.salesQty)}
              width={barWidth}
              height={pad.top + chartHeight - salesY(point.salesQty)}
              rx="0"
            >
              <title>{`${formatDate(point.label)}: ${l("penjualan", "sales", "销售")} ${formatLiter(point.salesQty)}, ${l("kas", "cash", "现金")} ${formatCompactCurrency(point.cashAmount)}`}</title>
            </rect>
            {index % tickInterval === 0 || index === data.length - 1 ? (
              <text className="chart-axis" x={x(index)} y={height - 17} textAnchor="middle">
                {new Intl.DateTimeFormat(
                  locale === "id" ? "id-ID" : locale === "en" ? "en-US" : "zh-CN",
                  data.length > 14 ? { day: "2-digit", month: "short" } : { weekday: "short" },
                ).format(new Date(`${point.label}T00:00:00+07:00`))}
              </text>
            ) : null}
          </g>
        ))}
        <path className="chart-line" d={line} />
        {data.map((point, index) => (
          <circle
            className={`chart-dot ${activeIndex === index ? "chart-dot-active" : ""}`}
            key={point.label}
            cx={x(index)}
            cy={stockY(point.stockQty)}
            r="4"
          >
            <title>{`${formatDate(point.label)}: ${l("stok", "stock", "库存")} ${formatLiter(point.stockQty)}`}</title>
          </circle>
        ))}
        {activePoint === undefined || activeIndex === null ? null : (
          <ChartTooltip
            point={activePoint}
            pointX={x(activeIndex)}
            stockPointY={stockY(activePoint.stockQty)}
            stockLabel={l("Stok", "Stock", "库存")}
            salesLabel={l("Penjualan", "Sales", "销售")}
            cashLabel={l("Kas", "Cash", "现金")}
          />
        )}
      </svg>
      <output className="sr-only" id="trend-active-detail" aria-live="polite">
        {activePoint === undefined
          ? l("Pilih titik grafik.", "Select a chart point.", "请选择图表点。")
          : detail(activePoint)}
      </output>
      <figcaption>
        <span>
          <i className="legend-line" />
          {l("Stock akhir", "Closing stock", "期末库存")}
        </span>
        <span>
          <i className="legend-bar" />
          {l("Penjualan", "Sales", "销售")}
        </span>
      </figcaption>
    </figure>
  );
}

function ChartTooltip({
  point,
  pointX,
  stockPointY,
  stockLabel,
  salesLabel,
  cashLabel,
}: {
  point: TrendPoint;
  pointX: number;
  stockPointY: number;
  stockLabel: string;
  salesLabel: string;
  cashLabel: string;
}) {
  const tooltipWidth = 210;
  const tooltipHeight = 88;
  const tooltipX = Math.max(
    pad.left,
    Math.min(width - pad.right - tooltipWidth, pointX > width / 2 ? pointX - 222 : pointX + 12),
  );
  const tooltipY = Math.max(
    pad.top + 5,
    Math.min(height - pad.bottom - tooltipHeight, stockPointY - 42),
  );
  return (
    <g className="chart-tooltip" aria-hidden="true">
      <line
        className="chart-cursor"
        x1={pointX}
        x2={pointX}
        y1={pad.top}
        y2={height - pad.bottom}
      />
      <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} />
      <text x={tooltipX + 12} y={tooltipY + 18}>
        <tspan className="chart-tooltip-title">{formatDate(point.label)}</tspan>
        <tspan x={tooltipX + 12} dy="18">{`${stockLabel}: ${formatLiter(point.stockQty)}`}</tspan>
        <tspan x={tooltipX + 12} dy="16">{`${salesLabel}: ${formatLiter(point.salesQty)}`}</tspan>
        <tspan
          x={tooltipX + 12}
          dy="16"
        >{`${cashLabel}: ${formatCompactCurrency(point.cashAmount)}`}</tspan>
      </text>
    </g>
  );
}
