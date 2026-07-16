import type { FormulaDefinition } from "@spbu/contracts";
import type { ReactNode } from "react";
import { FormulaHint } from "./FormulaHint.js";

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  tone?: "blue" | "green" | "yellow" | "red" | "mauve";
  formula?: FormulaDefinition;
  icon?: ReactNode;
}

export function MetricCard({
  label,
  value,
  detail,
  tone = "blue",
  formula,
  icon,
}: MetricCardProps) {
  return (
    <article
      className={`metric-card metric-${tone}`}
      title={detail}
      aria-label={`${label}: ${value}. ${detail}`}
    >
      <div className="metric-label-row">
        <span>{label}</span>
        {formula === undefined ? icon : <FormulaHint formula={formula} />}
      </div>
      <strong className="metric-value">{value}</strong>
    </article>
  );
}
