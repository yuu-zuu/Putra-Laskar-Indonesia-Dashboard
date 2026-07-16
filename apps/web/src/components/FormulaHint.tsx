import type { FormulaDefinition } from "@spbu/contracts";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePreferences } from "../app/preferences.js";
import { useI18n } from "../app/i18n.js";
import { Icon } from "./Icon.js";
import { localizeFormula } from "../lib/formulaLocale.js";

export function FormulaHint({ formula }: { formula: FormulaDefinition }) {
  const tooltipId = useId();
  const { showFormulaDetails } = usePreferences();
  const { locale, l } = useI18n();
  const localized = localizeFormula(formula, locale);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 16, top: 16 });
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      if (trigger === undefined) return;
      const width = Math.min(360, window.innerWidth - 32);
      let left = Math.max(16, Math.min(window.innerWidth - width - 16, trigger.right - width));
      let top = trigger.bottom + 8;
      const height = tooltipRef.current?.offsetHeight ?? 260;
      if (top + height > window.innerHeight - 16) top = Math.max(16, trigger.top - height - 8);
      setPosition({ left, top });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  if (!showFormulaDetails) {
    return (
      <span className="formula-label" title={localized.expression}>
        {l("Rumus", "Formula", "公式")}
      </span>
    );
  }

  return (
    <span
      className="formula-hint"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        className="formula-trigger"
        type="button"
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="info" />
        <span>{l("Rumus", "Formula", "公式")}</span>
      </button>
      {open
        ? createPortal(
            <div
              ref={tooltipRef}
              className="formula-tooltip formula-tooltip-portal"
              id={tooltipId}
              role="tooltip"
              style={{ left: position.left, top: position.top }}
            >
              <strong>{localized.shortLabel}</strong>
              <code>{localized.expression}</code>
              <span>{localized.explanation}</span>
              <dl>
                {localized.variables.map((variable) => (
                  <div key={variable.symbol}>
                    <dt>{variable.symbol}</dt>
                    <dd>
                      {variable.label} ({variable.unit})
                    </dd>
                  </div>
                ))}
              </dl>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
