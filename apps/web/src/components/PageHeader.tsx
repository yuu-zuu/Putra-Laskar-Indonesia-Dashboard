import type { ReactNode } from "react";
import { InfoHint } from "./InfoHint.js";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <div className="page-title-row">
          <h1>{title}</h1>
          {description === undefined ? null : <InfoHint text={description} />}
        </div>
      </div>
      {actions === undefined ? null : <div className="page-actions">{actions}</div>}
    </header>
  );
}
