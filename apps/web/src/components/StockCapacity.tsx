import type { StockUnitSnapshot } from "@spbu/contracts";
import { formatLiter, formatPercent } from "../lib/format.js";

export function StockCapacity({
  unit,
  compact = false,
}: {
  unit: StockUnitSnapshot;
  compact?: boolean;
}) {
  const ratio = unit.capacityQty === 0 ? 0 : unit.closingQty / unit.capacityQty;
  const boundedRatio = Math.min(Math.max(ratio, 0), 1);
  const low = unit.closingQty <= unit.lowStockThresholdQty;
  return (
    <div className={`capacity ${low ? "capacity-low" : ""}`}>
      <div className="capacity-row">
        <span>{compact ? formatPercent(ratio) : `${formatLiter(unit.closingQty)} tersedia`}</span>
        <span>
          {compact ? formatLiter(unit.closingQty) : `${formatPercent(ratio)} dari kapasitas`}
        </span>
      </div>
      <div
        className="capacity-track"
        role="meter"
        aria-label={`Kapasitas ${unit.name}`}
        aria-valuemin={0}
        aria-valuemax={unit.capacityQty}
        aria-valuenow={unit.closingQty}
      >
        <span style={{ width: `${boundedRatio * 100}%` }} />
      </div>
      {low ? <small>Di bawah ambang {formatLiter(unit.lowStockThresholdQty)}</small> : null}
    </div>
  );
}
