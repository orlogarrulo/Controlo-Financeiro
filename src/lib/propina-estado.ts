/**
 * Estado único da propina (Outubro → Junho) para Propinas, Conta corrente e Relatórios.
 * Setembro não é propina: valor em "set" conta como Outubro.
 * Um pagamento na grelha conta sempre, mesmo sem mensalidade1.
 */
import type { Aluno, Mensalidade } from "@/data/types";
import { alunosAll, mesesOficiaisPagos, reporPropinasFromMatriculas, useFinance } from "@/lib/store";

export const ORDEM_PROPINA = ["out", "nov", "dez", "jan", "fev", "mar", "abr", "mai", "jun"] as const;

export const MES_ISO: Record<string, string> = {
  out: "2026-10",
  nov: "2026-11",
  dez: "2026-12",
  jan: "2027-01",
  fev: "2027-02",
  mar: "2027-03",
  abr: "2027-04",
  mai: "2027-05",
  jun: "2027-06",
};

export type MesPropinaPago = { mes: string; iso: string; valor: number; data?: string };

export function valorMesPagamento(
  pags: Record<string, number> | undefined,
  mes: string,
): number {
  if (!pags) return 0;
  const iso = MES_ISO[mes];
  let v = Number(pags[mes] || 0);
  if (iso) v = Math.max(v, Number(pags[iso] || 0));
  if (mes === "out") {
    v = Math.max(v, Number(pags.set || 0), Number(pags["2026-09"] || 0));
  }
  return v > 0 ? v : 0;
}

/** Uma linha de propina por aluno: funde pagamentos, não soma o mesmo mês duas vezes. */
export function fundirMensalidades(rows: Mensalidade[]): Mensalidade[] {
  const byId = new Map<string, Mensalidade>();
  for (const row of rows) {
    if (!row?.id) continue;
    const prev = byId.get(row.id);
    if (!prev) {
      byId.set(row.id, {
        ...row,
        pagamentos: normalizarPagamentos(row.pagamentos),
        pagamentosEm: { ...(row.pagamentosEm || {}) },
      });
      continue;
    }
    const pagamentos = normalizarPagamentos(prev.pagamentos);
    const extra = normalizarPagamentos(row.pagamentos);
    for (const [k, v] of Object.entries(extra)) {
      pagamentos[k] = Math.max(Number(pagamentos[k] || 0), Number(v) || 0);
    }
    byId.set(row.id, {
      ...prev,
      ...row,
      propina: Number(row.propina) || Number(prev.propina) || 0,
      pagamentos,
      pagamentosEm: { ...(prev.pagamentosEm || {}), ...(row.pagamentosEm || {}) },
    });
  }
  return [...byId.values()];
}

export function normalizarPagamentos(
  pags: Record<string, number> | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const mes of ORDEM_PROPINA) {
    const v = valorMesPagamento(pags, mes);
    if (v > 0) out[mes] = v;
  }
  return out;
}

export function mesesPagosPropina(
  aluno: Aluno,
  mensalidade: Mensalidade | undefined,
  recibos?: Map<string, number>,
): MesPropinaPago[] {
  const pags = normalizarPagamentos(mensalidade?.pagamentos);
  const em = mensalidade?.pagamentosEm || {};
  const mens1 = Number(aluno.mensalidade1) || 0;
  const mesesP = Math.max(0, Math.min(9, Number(aluno.mesesPropina) || 0));
  const tarifa =
    Number(mensalidade?.propina) ||
    Number(aluno.propina) ||
    (mens1 > 0 && mesesP > 1 ? Math.round(mens1 / mesesP) : 0) ||
    (mens1 > 0 ? mens1 : 0);
  const oficiais = new Set(mesesOficiaisPagos(aluno.id) || []);
  const out: MesPropinaPago[] = [];

  for (let i = 0; i < ORDEM_PROPINA.length; i++) {
    const mes = ORDEM_PROPINA[i];
    const raw = Number(pags[mes] || 0);
    const recibo = Number(recibos?.get(mes) || 0);
    const adiantado = mens1 > 0 && mesesP > 0 && i < mesesP;
    const outubroMatricula = mes === "out" && mens1 > 0 && mesesP === 0;
    const oficial = oficiais.has(mes);
    if (!(raw > 0 || recibo > 0 || adiantado || outubroMatricula || oficial)) continue;
    const base = raw > 0 ? raw : recibo > 0 ? recibo : tarifa;
    const valor =
      tarifa > 0 && base > tarifa * 1.5 && mesesP > 1 ? Math.round(mens1 / mesesP) || tarifa : base || tarifa;
    out.push({
      mes,
      iso: MES_ISO[mes] || mes,
      valor: valor > 0 ? valor : tarifa,
      data: em[mes] || (mes === "out" ? em.set : "") || "",
    });
  }
  return out;
}

export function outubroPago(meses: MesPropinaPago[]): boolean {
  return meses.some((m) => m.mes === "out" && m.valor > 0);
}

/** Grava a mesma grelha em Propinas e remove linhas duplicadas. Conta corrente e Relatórios leem isto. */
export function sincronizarPagamentosSeparadores(): { alunos: number; removidos: number } {
  const base = reporPropinasFromMatriculas();
  const state = useFinance.getState();
  const alunos = alunosAll(state.alunosExtra || [], state.alunosOverrides || {}, state.alunosDeletedIds || []);
  const byId = new Map(fundirMensalidades(state.mensalidades || []).map((m) => [m.id, m]));
  const next = alunos.map((a) => {
    const row = byId.get(a.id);
    const pagos = mesesPagosPropina(a, row);
    const pagamentos: Record<string, number> = {};
    const pagamentosEm: Record<string, string> = { ...(row?.pagamentosEm || {}) };
    for (const m of pagos) {
      pagamentos[m.mes] = m.valor;
      if (m.data) pagamentosEm[m.mes] = m.data;
    }
    delete pagamentos.set;
    delete pagamentosEm.set;
    return {
      id: a.id,
      nome: a.nome,
      turma: a.turma || "",
      propina: Number(row?.propina) || Number(a.propina) || 0,
      pagamentos,
      pagamentosEm,
      obs: row?.obs || "",
    };
  });
  const seen = new Set<string>();
  const cc = (state.contaCorrente || []).filter((c) => {
    const key = `${c.alunoId}|${c.mes}|${c.tipo}|${Math.round(Number(c.valor) || 0)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((c) =>
    c.mes === "set" ? { ...c, mes: "out", descricao: (c.descricao || "").replace(/[Ss]etembro/g, "Outubro") } : c,
  );
  useFinance.setState({ mensalidades: next, contaCorrente: cc });
  return { alunos: next.length, removidos: base.removidos + Math.max(0, (state.mensalidades || []).length - next.length) };
}
