import { useEffect, useState } from "react";
import { Lock, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFinance, getSeed } from "@/lib/store";
import {
  EDIT_PIN,
  isCollaborator1,
  readSession,
  writeSession,
  type OperatorSession,
} from "@/lib/can-edit";

/**
 * Bloqueia a app até escolher colaborador.
 * Colaborador 1 exige PIN 1977 (campo só visível para ele).
 * Os outros entram sem código e sem ver o campo do PIN.
 */
export function OperatorGate({ children }: { children: React.ReactNode }) {
  const operators = useFinance((s) => s.operators);
  const setActiveOperator = useFinance((s) => s.setActiveOperator);
  const pushSession = useFinance((s) => s.pushSession);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<OperatorSession | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const escola = getSeed().escola;

  useEffect(() => {
    const s = readSession();
    if (s?.name) {
      setSession(s);
      setActiveOperator(s.name);
    }
    setReady(true);
  }, [setActiveOperator]);

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

  const isFirst = pick !== null && isCollaborator1(pick, operators);

  function confirm() {
    setErr("");
    if (!pick) {
      setErr("Escolha o membro da equipa.");
      return;
    }
    if (isCollaborator1(pick, operators)) {
      if (pin.trim() !== EDIT_PIN) {
        setErr("Código incorrecto.");
        return;
      }
      const s: OperatorSession = {
        name: pick,
        adminUnlocked: true,
        at: new Date().toISOString(),
      };
      writeSession(s);
      setActiveOperator(pick);
      pushSession("entrada", pick);
      setSession(s);
      return;
    }
    const s: OperatorSession = {
      name: pick,
      adminUnlocked: false,
      at: new Date().toISOString(),
    };
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
            src="/logo-escola.jpg"
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
          Escolha o membro da equipa para continuar. Sem esta escolha não há acesso aos dados.
        </p>

        <div className="mt-6 space-y-2">
          <Label className="text-xs text-[var(--color-muted)]">Membro da equipa</Label>
          {operators.map((name, i) => {
            const selected = pick === name;
            const needsPin = i === 0;
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
                {needsPin ? (
                  <span className="flex items-center gap-1 text-[10px] text-[var(--color-muted)]">
                    <Lock className="size-3" /> Código
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* PIN só visível quando Colaborador 1 está seleccionado */}
        {isFirst ? (
          <div className="mt-4 space-y-2">
            <Label htmlFor="pin-admin">Código do Colaborador 1</Label>
            <Input
              id="pin-admin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirm()}
            />
            <p className="text-[11px] text-[var(--color-muted)]">
              Permissão total de edição. O código não é mostrado aos outros membros.
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
