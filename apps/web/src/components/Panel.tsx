import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, eyebrow, action, children, className = "" }: PanelProps) {
  return (
    <section className={`panel ${className}`.trim()}>
      <header className="panel-header">
        <div>
          {eyebrow === undefined ? null : <p className="eyebrow">{eyebrow}</p>}
          <h2>{title}</h2>
        </div>
        {action === undefined ? null : <div className="panel-action">{action}</div>}
      </header>
      {children}
    </section>
  );
}
