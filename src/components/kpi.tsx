import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatKz, formatKzShort } from "@/lib/format";

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
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
      <p className="text-[11px] font-medium tracking-[0.12em] text-[var(--color-muted)] uppercase">{label}</p>
      <p
        className={cn(
          "mt-2 font-display text-2xl tracking-tight tabular-nums sm:text-[1.7rem]",
          tone === "forest" && "text-[var(--color-forest)]",
          tone === "clay" && "text-[var(--color-clay)]",
          tone === "amber" && "text-[var(--color-amber)]",
        )}
      >
        {display}
      </p>
      {hint ? <p className="mt-1 text-xs text-[var(--color-muted)]">{hint}</p> : null}
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
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {kicker ? (
          <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--color-forest)] uppercase">{kicker}</p>
        ) : null}
        <h1 className="font-display mt-1 text-3xl tracking-tight sm:text-4xl">{title}</h1>
        {/* Descrição só no ecrã — nunca na impressão (cabeçalho + dados apenas) */}
        {description ? (
          <p className="no-print mt-2 max-w-2xl text-sm text-[var(--color-muted)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="no-print flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
