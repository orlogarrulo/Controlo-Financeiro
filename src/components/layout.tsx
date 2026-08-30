import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, Camera, Landmark, LayoutDashboard, Menu, Receipt, Users, Wallet, FileSpreadsheet, Banknote, Cloud, X, UserRound, ListChecks, LogOut, Moon, Sun, ClipboardCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getSeed, useFinance } from "@/lib/store";
import {
  clearOperatorSession,
  isCollaborator1,
  switchOperatorSession,
} from "@/lib/can-edit";

const NAV = [
  { to: "/", label: "Quadro", icon: LayoutDashboard },
  { to: "/capturar", label: "Nova despesa", icon: Camera, adminOnly: true },
  { to: "/lancamentos", label: "Lista despesas", icon: BookOpen },
  { to: "/alunos", label: "Matrículas", icon: Users },
  { to: "/mensalidades", label: "Propinas", icon: Receipt },
  { to: "/recibos", label: "Recibos", icon: FileSpreadsheet },
  { to: "/banco", label: "Banco BAI", icon: Landmark },
  { to: "/fundo", label: "Fundo", icon: Wallet },
  { to: "/salarios", label: "Salários", icon: Banknote },
  { to: "/google", label: "Google Sheets", icon: Cloud },
  { to: "/auditoria", label: "Auditoria", icon: ClipboardCheck, adminOnly: true },
  { to: "/pendencias", label: "Pendências", icon: ListChecks, adminOnly: true },
];

/** Atalhos da barra inferior (telemóvel) — 5 itens essenciais */
const BOTTOM = [
  { to: "/", label: "Quadro", icon: LayoutDashboard },
  { to: "/lancamentos", label: "Despesas", icon: BookOpen },
  { to: "/capturar", label: "Nova", icon: Camera, capture: true },
  { to: "/alunos", label: "Matrículas", icon: Users },
  { to: "/recibos", label: "Recibos", icon: FileSpreadsheet },
];

export function AppShell({ children }: { children: ReactNode }) {
  const escola = getSeed().escola;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof document === "undefined") return "light";
    const saved = localStorage.getItem("cf-theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("cf-theme", theme);
  }, [theme]);
  function toggleTheme() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }
  const [open, setOpen] = useState(false);
  const [editOps, setEditOps] = useState(false);
  const activeOperator = useFinance((s) => s.activeOperator);
  const operators = useFinance((s) => s.operators);
  const setActiveOperator = useFinance((s) => s.setActiveOperator);
  const setOperatorName = useFinance((s) => s.setOperatorName);
  const isAdmin = isCollaborator1(activeOperator, operators);
  const navItems = NAV.filter((item) => !("adminOnly" in item && item.adminOnly) || isAdmin);

  const currentLabel =
    NAV.find((n) => n.to === pathname)?.label ||
    (pathname.startsWith("/") ? "Controlo" : "Controlo");

  return (
    <div className="min-h-dvh bg-[var(--color-bg)] text-[var(--color-ink)]">
      <div className="flex min-h-dvh">
        {/* Sidebar desktop */}
        <aside className="no-print sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-bg-elevated)] lg:flex">
          <Brand />
          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4">
            {navItems.map(({ to, label, icon }) => (
              <NavLink key={to} to={to} label={label} icon={icon} active={pathname === to} />
            ))}
          </nav>
          <div className="px-3 pb-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-10 w-full items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)] hover:bg-[var(--color-forest-soft)]"
              aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo escuro"}
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {theme === "dark" ? "Modo claro" : "Modo escuro"}
            </button>
          </div>
          <OperatorPanel
            operators={operators}
            activeOperator={activeOperator}
            setActiveOperator={setActiveOperator}
            setOperatorName={setOperatorName}
            editOps={editOps}
            setEditOps={setEditOps}
            isAdmin={isAdmin}
          />
          <p className="px-4 pb-5 text-[11px] leading-relaxed text-[var(--color-muted)]">
            {escola.ano} · Isenta de impostos
          </p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header telemóvel — uma só barra */}
          <header className="no-print sticky top-0 z-30 border-b border-[var(--color-line)] bg-[var(--color-bg)]/95 backdrop-blur-md lg:hidden">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <button
                type="button"
                className="flex size-11 shrink-0 items-center justify-center rounded-xl active:bg-[var(--color-forest-soft)]"
                onClick={() => setOpen(true)}
                aria-label="Abrir menu"
              >
                <Menu className="size-5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-medium tracking-[0.12em] text-[var(--color-forest)] uppercase">
                  {escola.nomeCurto}
                </p>
                <p className="truncate font-display text-base leading-tight">{currentLabel}</p>
              </div>
              <button
                type="button"
                className="flex size-11 shrink-0 items-center justify-center rounded-xl text-[var(--color-ink)] active:bg-[var(--color-forest-soft)]"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo escuro"}
                title={theme === "dark" ? "Modo claro" : "Modo escuro"}
              >
                {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
              </button>
              <span className="max-w-[5.5rem] truncate rounded-full bg-[var(--color-forest-soft)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-forest-deep)]">
                {activeOperator.replace(/^Colaborador\s*/i, "C")}
              </span>
            </div>
          </header>

          {/* Menu lateral telemóvel */}
          {open ? (
            <div className="no-print fixed inset-0 z-40 lg:hidden">
              <button
                type="button"
                className="absolute inset-0 bg-[var(--color-ink)]/45"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
              />
              <div className="absolute inset-y-0 left-0 flex w-[min(100%,20rem)] flex-col bg-[var(--color-bg-elevated)] shadow-[var(--shadow-card)]">
                <div className="flex items-center justify-between border-b border-[var(--color-line)] pr-2">
                  <Brand />
                  <button
                    type="button"
                    className="mr-2 flex size-11 items-center justify-center rounded-xl"
                    onClick={() => setOpen(false)}
                    aria-label="Fechar menu"
                  >
                    <X className="size-5" />
                  </button>
                </div>

                <div className="border-b border-[var(--color-line)] px-4 py-3">
                  <p className="mb-1.5 text-[10px] font-medium tracking-wide text-[var(--color-muted)] uppercase">
                    A trabalhar como
                  </p>
                  <select
                    className="h-11 w-full rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
                    value={activeOperator}
                    onChange={(e) => {
                      const name = e.target.value;
                      switchOperatorSession(name, operators);
                      setActiveOperator(name);
                    }}
                    aria-label="Colaborador ativo"
                  >
                    {operators.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 flex gap-3">
                    <button
                      type="button"
                      className="text-xs text-[var(--color-muted)] underline-offset-2 hover:underline"
                      onClick={() => {
                        try {
                          useFinance.getState().pushSession("saida");
                        } catch {
                          /* ignore */
                        }
                        clearOperatorSession();
                        setOpen(false);
                      }}
                    >
                      <span className="inline-flex items-center gap-1">
                        <LogOut className="size-3" /> Terminar sessão
                      </span>
                    </button>
                  </div>
                </div>

                <nav className="flex-1 overflow-y-auto px-3 py-3">
                  <p className="mb-2 px-2 text-[10px] font-medium tracking-wide text-[var(--color-muted)] uppercase">
                    Menu
                  </p>
                  <div className="flex flex-col gap-1">
                    {navItems.map(({ to, label, icon }) => (
                      <NavLink
                        key={to}
                        to={to}
                        label={label}
                        icon={icon}
                        active={pathname === to}
                        onClick={() => setOpen(false)}
                        large
                      />
                    ))}
                  </div>
                </nav>
                <p className="border-t border-[var(--color-line)] px-4 py-3 text-[11px] text-[var(--color-muted)]">
                  {escola.ano} · Isenta de impostos
                </p>
              </div>
            </div>
          ) : null}

          <main className="mobile-main mx-auto w-full max-w-6xl flex-1 px-3 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-4 sm:py-6 lg:px-8 lg:pb-10">
            {children}
          </main>
        </div>
      </div>

      {/* Barra inferior telemóvel */}
      <nav
        className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-line)] bg-[var(--color-bg-elevated)]/95 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className={cn("grid px-1 pt-1", isAdmin ? "grid-cols-5" : "grid-cols-4")}>
          {BOTTOM.filter((item) => isAdmin || !item.capture).map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to;
            const capture = Boolean(item.capture);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium",
                  active ? "text-[var(--color-forest)]" : "text-[var(--color-muted)]",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-2xl transition-colors",
                    active && !capture && "bg-[var(--color-forest-soft)]",
                    capture &&
                      "-mt-5 size-14 bg-[var(--color-forest)] text-[var(--color-forest-fg)] shadow-[var(--shadow-card)]",
                  )}
                >
                  <Icon className={capture ? "size-6" : "size-5"} />
                </span>
                <span className={cn(capture && "mt-0.5")}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function Brand() {
  const escola = getSeed().escola;
  return (
    <div className="flex items-center gap-3 px-4 py-4">
      <img
        src="/logo-escola.jpg"
        alt=""
        className="size-10 rounded-lg object-contain"
        width={40}
        height={40}
      />
      <div className="min-w-0">
        <p className="truncate text-[10px] font-medium tracking-[0.14em] text-[var(--color-forest)] uppercase">
          {escola.nomeCurto}
        </p>
        <p className="truncate text-sm font-medium leading-tight">Controlo Financeiro</p>
      </div>
    </div>
  );
}

function OperatorPanel({
  operators,
  activeOperator,
  setActiveOperator,
  setOperatorName,
  editOps,
  setEditOps,
  isAdmin,
}: {
  operators: string[];
  activeOperator: string;
  setActiveOperator: (n: string) => void;
  setOperatorName: (i: number, n: string) => void;
  editOps: boolean;
  setEditOps: (fn: (v: boolean) => boolean) => void;
  isAdmin: boolean;
}) {
  return (
    <div className="border-t border-[var(--color-line)] px-3 py-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium tracking-[0.12em] text-[var(--color-muted)] uppercase">
        <UserRound className="size-3" /> A trabalhar como
      </p>
      {!isAdmin ? (
        <p className="mb-2 rounded-lg bg-[var(--color-forest-soft)] px-2 py-1.5 text-[10px] leading-snug text-[var(--color-forest-deep)]">
          Modo consulta: só visualizar e imprimir. Edição reservada ao Colaborador 1.
        </p>
      ) : null}
      <div className="mb-2 flex flex-col gap-1">
        <button
          type="button"
          className="text-left text-[11px] text-[var(--color-muted)] underline-offset-2 hover:underline"
          onClick={() => {
            try {
              useFinance.getState().pushSession("saida");
            } catch {
              /* ignore */
            }
            clearOperatorSession();
          }}
        >
          Terminar sessão
        </button>
        <button
          type="button"
          className="text-left text-[11px] text-[var(--color-muted)] underline-offset-2 hover:underline"
          onClick={() => clearOperatorSession()}
        >
          Trocar colaborador
        </button>
      </div>
      <select
        className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-2 text-xs"
        value={activeOperator}
        onChange={(e) => {
          const name = e.target.value;
          switchOperatorSession(name, operators);
          setActiveOperator(name);
        }}
        aria-label="Colaborador ativo"
      >
        {operators.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      {isAdmin ? (
        <button
          type="button"
          className="mt-1.5 text-[10px] text-[var(--color-forest)] underline-offset-2 hover:underline"
          onClick={() => setEditOps((v) => !v)}
        >
          {editOps ? "Fechar nomes" : "Renomear equipa"}
        </button>
      ) : null}
      {isAdmin && editOps ? (
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
        </div>
      ) : null}
    </div>
  );
}

function NavLink({
  to,
  label,
  icon: Icon,
  active,
  onClick,
  large,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
  onClick?: () => void;
  large?: boolean;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl text-sm transition-colors",
        large ? "px-3 py-3.5 text-[15px]" : "px-3 py-2.5",
        active
          ? "bg-[var(--color-forest)] text-[var(--color-forest-fg)]"
          : "text-[var(--color-ink-soft)] hover:bg-[var(--color-forest-soft)] hover:text-[var(--color-forest-deep)]",
      )}
    >
      <Icon className={cn("shrink-0", large ? "size-5" : "size-4")} />
      {label}
    </Link>
  );
}
