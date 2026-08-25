/** PIN só do Colaborador 1 — não mostrar aos outros. */
export const EDIT_PIN = "1977";

export function isCollaborator1(activeOperator: string, operators: string[]): boolean {
  return Boolean(operators[0] && activeOperator === operators[0]);
}

/** Sessão: colaborador escolhido neste browser. */
export const SESSION_KEY = "ecc-operator-session";

export type OperatorSession = {
  name: string;
  /** true só se Colaborador 1 validou o PIN 1977 */
  adminUnlocked: boolean;
  at: string;
};

export function readSession(): OperatorSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OperatorSession;
  } catch {
    return null;
  }
}

export function writeSession(s: OperatorSession | null) {
  if (!s) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function clearOperatorSession() {
  writeSession(null);
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}
