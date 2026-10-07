import { useEffect, useState } from "react";
import { Lock, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFinance, getSeed } from "@/lib/store";
import {
  isCollaborator1,
  IDLE_LOCK_MS,
  resolveOperatorPin,
  SESSION_END_EVENT,
  readSession,
  sessionStillActive,
  touchSessionActivity,
  wipeOperatorSession,
  writeSession,
  type OperatorSession,
} from "@/lib/can-edit";
import { escolaLogoSrc } from "@/lib/logo-escola";

/**
 * Bloqueia a app até escolher colaborador e validar o código de entrada.
 * Todos os colaboradores (C1–C5) precisam do PIN.
 * Cada reload/abertura limpa a sessão e volta a pedir o código.
 */
export function OperatorGate({ children }: { children: React.ReactNode }) {
  const operators = useFinance((s) => s.operators);
  const entryPinStored = useFinance((s) => s.uiPrefs?.entryPin);
  const setActiveOperator = useFinance((s) => s.setActiveOperator);
  const pushSession = useFinance((s) => s.pushSession);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<OperatorSession | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const escola = getSeed().escola;

  useEffect(() => {
    const forceGate = () => {
      wipeOperatorSession();
      setSession(null);
      setPin("");
      setPick(null);
      setErr("");
    };
    const existing = readSession();
    if (sessionStillActive(existing)) {
      setSession(existing);
      touchSessionActivity();
    } else if (existing) {
      wipeOperatorSession();
    }
    setReady(true);
    let lastTick = Date.now();
    let hiddenAt = 0;
    const onActivity = () => {
      if (document.visibilityState === "visible") touchSessionActivity();
    };
    const onHide = () => {
      hiddenAt = Date.now();
    };
    const onShow = () => {
      const gap = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      // Suspensão ou ecrã desligado: ao voltar pede o código.
      if (gap > 15000) forceGate();
    };
    const timer = window.setInterval(() => {
      const now = Date.now();
      if (now - lastTick > 20000) forceGate();
      lastTick = now;
      const cur = readSession();
      if (cur && !sessionStillActive(cur)) forceGate();
    }, 5000);
    window.addEventListener(SESSION_END_EVENT, forceGate);
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onHide();
      else onShow();
    });
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(SESSION_END_EVENT, forceGate);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--color-bg)] text-sm text-[var(--color-muted)]">
        A carregar…
      </div>
    );
  }

  if (session?.name) {
    return <>{children}</>;
  }

  function confirm() {
    setErr("");
    if (!pick) {
      setErr("Escolha o membro da equipa.");
      return;
    }
    const idx = operators.indexOf(pick);
    const expectedPin = resolveOperatorPin({ entryPin: entryPinStored, entryPins: useFinance.getState().uiPrefs?.entryPins }, idx);
    if (pin.trim() !== expectedPin) {
      setErr("Código incorrecto.");
      return;
    }
    const isFirst = isCollaborator1(pick, operators);
    const s: OperatorSession = {
      name: pick,
      adminUnlocked: isFirst,
      at: new Date().toISOString(),
    };
    s.lastActivity = Date.now();
    writeSession(s);
    setActiveOperator(pick);
    pushSession("entrada", pick);
    setSession(s);
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--color-bg)] px-4 text-[var(--color-ink)]">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex justify-center">
          <img
            src={escolaLogoSrc()}
            alt=""
            className="h-20 w-20 object-contain"
            width={80}
            height={80}
          />
        </div>
        <p className="text-center text-[10px] font-medium tracking-[0.18em] text-[var(--color-forest)] uppercase">
          {escola.nomeCurto} · Luanda
        </p>
        <h1 className="font-display mt-2 text-center text-2xl tracking-tight">Controlo Financeiro</h1>
        <p className="mt-2 text-center text-sm text-[var(--color-muted)]">
          Escolha o membro da equipa e introduza o código de entrada para continuar.
        </p>

        <div className="mt-6 space-y-2">
          <Label className="text-xs text-[var(--color-muted)]">Membro da equipa</Label>
          {operators.map((name) => {
            const selected = pick === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setPick(name);
                  setPin("");
                  setErr("");
                }}
                className={`flex w-full items-center gap-3 rounded-[var(--radius-md)] border px-3 py-3 text-left transition-colors ${
                  selected
                    ? "border-[var(--color-forest)] bg-[var(--color-forest-soft)]"
                    : "border-[var(--color-line)] hover:bg-[var(--color-bg)]"
                }`}
              >
                <UserRound className="size-4 text-[var(--color-forest)]" />
                <span className="flex-1 font-medium">{name}</span>
                <span className="flex items-center gap-1 text-[10px] text-[var(--color-muted)]">
                  <Lock className="size-3" /> Código
                </span>
              </button>
            );
          })}
        </div>

        {pick ? (
          <div className="mt-4 space-y-2">
            <Label htmlFor="pin-entrada">Código de entrada</Label>
            <Input
              id="pin-entrada"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirm()}
            />
            <p className="text-[11px] text-[var(--color-muted)]">
              Obrigatório para todos os colaboradores. Pode alterar o código dentro da app (Colaborador 1).
            </p>
          </div>
        ) : null}

        {err ? <p className="mt-3 text-sm text-red-700">{err}</p> : null}

        <Button className="mt-5 w-full" onClick={confirm} disabled={!pick}>
          Entrar
        </Button>

        <p className="mt-6 text-center text-[11px] text-[var(--color-muted)]">
          {escola.ano} · Isenta de impostos
        </p>
      </div>
    </div>
  );
}

// clearOperatorSession está em @/lib/can-edit
