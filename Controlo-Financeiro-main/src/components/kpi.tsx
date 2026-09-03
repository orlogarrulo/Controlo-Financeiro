import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatKz, formatKzShort } from "@/lib/format";
import { isCollaborator1 } from "@/lib/can-edit";
import { useFinance } from "@/lib/store";

export function Kpi({
  label,
  value,
  hint,
  tone = "ink",
  compact,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "ink" | "forest" | "clay" | "amber";
  compact?: boolean;
}) {
  const display =
    typeof value === "number" ? (compact ? formatKzShort(value) : formatKz(value)) : value;
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-card)] sm:p-4">
      <p className="text-[10px] font-medium tracking-[0.1em] text-[var(--color-muted)] uppercase sm:text-[11px] sm:tracking-[0.12em]">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 font-display text-xl tracking-tight tabular-nums sm:mt-2 sm:text-2xl sm:text-[1.7rem]",
          tone === "forest" && "text-[var(--color-forest)]",
          tone === "clay" && "text-[var(--color-clay)]",
          tone === "amber" && "text-[var(--color-amber)]",
        )}
      >
        {display}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-[var(--color-muted)] sm:text-xs">{hint}</p> : null}
    </div>
  );
}

export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  const activeOperator = useFinance((s) => s.activeOperator);
  const operators = useFinance((s) => s.operators);
  const showGuide = isCollaborator1(activeOperator, operators);

  return (
    <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {kicker ? (
          <p className="hidden text-[11px] font-medium tracking-[0.16em] text-[var(--color-forest)] uppercase sm:block">
            {kicker}
          </p>
        ) : null}
        <h1 className="font-display text-2xl tracking-tight sm:mt-1 sm:text-3xl sm:text-4xl">
          {title}
        </h1>
        {showGuide && description ? (
          <p className="no-print mt-1.5 hidden max-w-2xl text-sm text-[var(--color-muted)] sm:mt-2 sm:block">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="no-print flex w-full flex-row flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
