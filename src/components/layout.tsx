import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Camera,
  Landmark,
  LayoutDashboard,
  Menu,
  Receipt,
  Users,
  Wallet,
  FileSpreadsheet,
  Banknote,
  Cloud,
  X,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { getSeed, useFinance } from "@/lib/store";

const NAV = [
  { to: "/", label: "Quadro", icon: LayoutDashboard },
  { to: "/capturar", label: "Capturar", icon: Camera },
  { to: "/lancamentos", label: "Lançamentos", icon: BookOpen },
  { to: "/alunos", label: "Alunos", icon: Users },
  { to: "/mensalidades", label: "Propinas", icon: Receipt },
  { to: "/banco", label: "Cartão BAI", icon: Landmark },
  { to: "/fundo", label: "Fundo", icon: Wallet },
  { to: "/salarios", label: "Salários", icon: Banknote },
  { to: "/recibos", label: "Recibos", icon: FileSpreadsheet },
  { to: "/google", label: "Google Sheets", icon: Cloud },
];

export function AppShell({ children }: { children: ReactNode }) {
  const escola = getSeed().escola;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [editOps, setEditOps] = useState(false);
  const activeOperator = useFinance((s) => s.activeOperator);
  const operators = useFinance((s) => s.operators);
  const setActiveOperator = useFinance((s) => s.setActiveOperator);
  const setOperatorName = useFinance((s) => s.setOperatorName);

  return (
    <div className="min-h-dvh bg-[var(--color-bg)] text-[var(--color-ink)]">
      <div className="flex min-h-dvh">
        <aside className="no-print sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-bg-elevated)] lg:flex">
          <Brand />
          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4">
            {NAV.map((item) => (
              <NavLink key={item.to} {...item} active={pathname === item.to} />
            ))}
          </nav>

          {/* Seleção do colaborador ativo (escritório, 5 pessoas) */}
          <div className="border-t border-[var(--color-line)] px-3 py-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium tracking-[0.12em] text-[var(--color-muted)] uppercase">
              <UserRound className="size-3" /> A trabalhar como
            </p>
            <select
              className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-2 text-xs"
              value={activeOperator}
              onChange={(e) => setActiveOperator(e.target.value)}
              aria-label="Colaborador ativo"
            >
              {operators.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="mt-1.5 text-[10px] text-[var(--color-forest)] underline-offset-2 hover:underline"
              onClick={() => setEditOps((v) => !v)}
            >
              {editOps ? "Fechar nomes" : "Renomear equipa"}
            </button>
            {editOps ? (
              <div className="mt-2 space-y-1.5">
                {operators.map((name, i) => (
                  <input
                    key={i}
                    className="h-8 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-xs"
                    value={name}
                    onChange={(e) => setOperatorName(i, e.target.value)}
                    aria-label={`Nome colaborador ${i + 1}`}
                  />
                ))}
                <p className="text-[10px] leading-snug text-[var(--color-muted)]">
                  Os registos novos ficam associados a quem está selecionado.
                </p>
              </div>
            ) : null}
          </div>

          <p className="px-4 pb-5 text-[11px] leading-relaxed text-[var(--color-muted)]">
            {escola.ano} · Isenta de impostos
          </p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-bg)]/90 px-4 py-3 backdrop-blur-md lg:hidden">
            <button
              type="button"
              className="flex size-11 items-center justify-center rounded-[var(--radius-sm)]"
              onClick={() => setOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu className="size-5" />
            </button>
            <span className="font-display text-base tracking-tight">Controlo Financeiro</span>
            <Link
              to="/capturar"
              className="flex size-11 items-center justify-center rounded-full bg-[var(--color-forest)] text-[var(--color-forest-fg)]"
              aria-label="Capturar despesa"
            >
              <Camera className="size-5" />
            </Link>
          </header>

          {/* Barra compacta: colaborador ativo (telemóvel) */}
          <div className="no-print flex items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-bg-elevated)] px-4 py-2 lg:hidden">
            <UserRound className="size-3.5 shrink-0 text-[var(--color-muted)]" />
            <select
              className="h-8 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-2 text-xs"
              value={activeOperator}
              onChange={(e) => setActiveOperator(e.target.value)}
              aria-label="Colaborador ativo"
            >
              {operators.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {open ? (
            <div className="no-print fixed inset-0 z-40 lg:hidden">
              <button
                type="button"
                className="absolute inset-0 bg-[var(--color-ink)]/40"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
              />
              <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-[var(--color-bg-elevated)] shadow-[var(--shadow-card)]">
                <div className="flex items-center justify-between pr-2">
                  <Brand />
                  <button
                    type="button"
                    className="mr-3 flex size-11 items-center justify-center"
                    onClick={() => setOpen(false)}
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <nav className="flex flex-col gap-0.5 px-3 pb-8">
                  {NAV.map((item) => (
                    <NavLink
                      key={item.to}
                      {...item}
                      active={pathname === item.to}
                      onClick={() => setOpen(false)}
                    />
                  ))}
                </nav>
              </div>
            </div>
          ) : null}

          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 lg:px-8 lg:pb-10">{children}</main>
        </div>
      </div>

      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-[var(--color-line)] bg-[var(--color-bg-elevated)]/95 px-1 py-1 backdrop-blur-md lg:hidden">
        {[NAV[0], NAV[2], NAV[1], NAV[3], NAV[4]].map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to;
          const capture = item.to === "/capturar";
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center gap-0.5 py-1.5 text-[10px]",
                active ? "text-[var(--color-forest)]" : "text-[var(--color-muted)]",
              )}
            >
              <span
                className={cn(
                  "flex size-10 items-center justify-center rounded-full",
                  capture &&
                    "-mt-4 size-12 bg-[var(--color-forest)] text-[var(--color-forest-fg)] shadow-[var(--shadow-card)]",
                )}
              >
                <Icon className={capture ? "size-5" : "size-4"} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Brand() {
  return (
    <div className="px-4 py-6">
      <p className="text-[10px] font-medium tracking-[0.18em] text-[var(--color-forest)] uppercase">
        École Consulaire
      </p>
      <p className="font-display mt-1 text-xl leading-tight tracking-tight">Controlo Financeiro</p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">Luanda · 2026/2027</p>
    </div>
  );
}

function NavLink({
  to,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm transition-colors",
        active
          ? "bg-[var(--color-forest)] text-[var(--color-forest-fg)]"
          : "text-[var(--color-ink-soft)] hover:bg-[var(--color-forest-soft)] hover:text-[var(--color-forest-deep)]",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </Link>
  );
}
