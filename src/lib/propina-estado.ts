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
      bolsa: !!(prev as { bolsa?: boolean }).bolsa || !!(row as { bolsa?: boolean }).bolsa || undefined,
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


/** Converte mesKey/mesRef de documento em chave letiva (out…jun). */
function mesKeyToLetivo(mesKey: string): string {
  const k = (mesKey || "").trim().toLowerCase();
  if (!k) return "";
  if (["out", "nov", "dez", "jan", "fev", "mar", "abr", "mai", "jun"].includes(k)) return k;
  if (k.includes("2026-10") || k.includes("outubro") || /\bout\b/.test(k)) return "out";
  if (k.includes("2026-11") || k.includes("novembro") || /\bnov\b/.test(k)) return "nov";
  if (k.includes("2026-12") || k.includes("dezembro") || /\bdez\b/.test(k)) return "dez";
  if (k.includes("2027-01") || k.includes("janeiro") || /\bjan\b/.test(k)) return "jan";
  if (k.includes("2027-02") || k.includes("fevereiro") || /\bfev\b/.test(k)) return "fev";
  if (k.includes("2027-03") || k.includes("março") || k.includes("marco") || /\bmar\b/.test(k)) return "mar";
  if (k.includes("2027-04") || k.includes("abril") || /\babr\b/.test(k)) return "abr";
  if (k.includes("2027-05") || k.includes("maio") || /\bmai\b/.test(k)) return "mai";
  if (k.includes("2027-06") || k.includes("junho") || /\bjun\b/.test(k)) return "jun";
  // Setembro → Outubro (regra da app)
  if (k.includes("2026-09") || k.includes("setembro") || /\bset\b/.test(k)) return "out";
  return "";
}

function isRubricaPropina(s: string): boolean {
  const t = String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /propina|mensalidade|mensualite/.test(t) && !/atl|matricula|inscri|seguro|manual|caderno|uniforme/.test(t);
}

/**
 * Extrai mapa alunoId → (mes letivo → valor) a partir do Arquivo
 * (documentosAluno + faturasPropina). Fonte de verdade dos recibos.
 */
export function recibosPropinaFromArquivo(state?: {
  documentosAluno?: {
    id?: string;
    alunoId?: string;
    tipo?: string;
    modelo?: string;
    valor?: number;
    mesKey?: string;
    mesRef?: string;
    numero?: string;
    codigoVerificacao?: string;
    linhas?: { key?: string; label?: string; value?: number; on?: boolean }[];
  }[];
  faturasPropina?: {
    alunoId?: string;
    mesKey?: string;
    mesRef?: string;
    valor?: number;
    numero?: string;
  }[];
}): Map<string, Map<string, number>> {
  const st = state || (useFinance.getState() as typeof state);
  const byAluno = new Map<string, Map<string, number>>();
  const add = (alunoId: string, mes: string, valor: number) => {
    if (!alunoId || !mes || !(valor > 0)) return;
    let m = byAluno.get(alunoId);
    if (!m) {
      m = new Map();
      byAluno.set(alunoId, m);
    }
    m.set(mes, Math.max(m.get(mes) || 0, valor));
  };

  for (const d of st?.documentosAluno || []) {
    if (!d.alunoId || d.tipo !== "recibo") continue;
    const modelo = (d.modelo || "").trim();
    if (modelo === "atl_explicacao" || modelo === "atl_actividades" || modelo === "secretaria") continue;

    const linhas = d.linhas || [];
    let valorPropina = 0;
    let mesLetivo = mesKeyToLetivo(d.mesKey || d.mesRef || "");

    if (linhas.length > 0) {
      for (const l of linhas) {
        if (l.on === false) continue;
        if (!isRubricaPropina(String(l.key || "")) && !isRubricaPropina(String(l.label || ""))) continue;
        const v = Number(l.value) || 0;
        if (v > 0) valorPropina += v;
      }
      if (valorPropina <= 0) continue;
    } else if (modelo === "propina_mes") {
      const num = String(d.numero || d.codigoVerificacao || "").toUpperCase();
      const ref = String(d.mesRef || d.mesKey || "").toLowerCase();
      const parece =
        /^PROP-/.test(num) ||
        /PROPINA|MENSALIDADE|REC-PROP/.test(num) ||
        /propina|mensalidade/.test(ref);
      if (!parece) continue;
      valorPropina = Number(d.valor) || 0;
    } else {
      // liquidacao: propina só se houver linha de propina (já tratado acima)
      continue;
    }
    if (valorPropina <= 0) continue;
    if (!mesLetivo) mesLetivo = "out";
    add(d.alunoId, mesLetivo, valorPropina);
  }

  for (const f of st?.faturasPropina || []) {
    if (!f.alunoId) continue;
    const mes = mesKeyToLetivo(f.mesKey || f.mesRef || "") || "out";
    const v = Number(f.valor) || 0;
    if (v > 0) add(f.alunoId, mes, v);
  }

  return byAluno;
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
  const bolsaMeses = new Set<string>();
  if (aluno.bolsa || (mensalidade as { bolsa?: boolean } | undefined)?.bolsa) {
    const lista = aluno.bolsaMeses && aluno.bolsaMeses.length
      ? aluno.bolsaMeses
      : [...ORDEM_PROPINA];
    for (const m of lista) bolsaMeses.add(m === "set" ? "out" : m);
  }
  const out: MesPropinaPago[] = [];

  for (let i = 0; i < ORDEM_PROPINA.length; i++) {
    const mes = ORDEM_PROPINA[i];
    const raw = Number(pags[mes] || 0);
    const recibo = Number(recibos?.get(mes) || 0);
    const adiantado = mens1 > 0 && mesesP > 0 && i < mesesP;
    const outubroMatricula = mes === "out" && mens1 > 0 && mesesP === 0;
    const oficial = oficiais.has(mes);
    const bolsa = bolsaMeses.has(mes);
    if (!(raw > 0 || recibo > 0 || adiantado || outubroMatricula || oficial || bolsa)) continue;
    if (bolsa && !(raw > 0 || recibo > 0)) {
      out.push({
        mes,
        iso: MES_ISO[mes] || mes,
        valor: 0,
        data: em[mes] || (mes === "out" ? em.set : "") || "",
      });
      continue;
    }
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
  // Arquivo = fonte de verdade dos recibos de propina
  const recibosArquivo = recibosPropinaFromArquivo(state as never);
  const next = alunos.map((a) => {
    const row = byId.get(a.id);
    const recibos = recibosArquivo.get(a.id);
    const pagos = mesesPagosPropina(a, row, recibos);
    const pagamentos: Record<string, number> = {};
    const pagamentosEm: Record<string, string> = { ...(row?.pagamentosEm || {}) };
    for (const m of pagos) {
      pagamentos[m.mes] = m.valor;
      if (m.data) pagamentosEm[m.mes] = m.data;
    }
    // Garantir meses só vindos do Arquivo mesmo se grelha estava a 0
    if (recibos) {
      for (const [mes, val] of recibos) {
        if (val > 0) pagamentos[mes] = Math.max(Number(pagamentos[mes] || 0), val);
      }
    }
    // Bolsa: garantir chave dos meses isentos (valor 0) e flag
    const isBolsa = !!(a.bolsa || row?.bolsa);
    if (isBolsa) {
      const lista = a.bolsaMeses && a.bolsaMeses.length ? a.bolsaMeses : [...ORDEM_PROPINA];
      for (const mes of lista) {
        const k = mes === "set" ? "out" : mes;
        if (!(Number(pagamentos[k] || 0) > 0)) pagamentos[k] = 0;
      }
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
      bolsa: isBolsa || undefined,
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


const MESES_BOLSA_DEFAULT = ["out", "nov", "dez", "jan", "fev", "mar", "abr", "mai", "jun"] as const;

/**
 * Marca aluno com bolsa e regista propinas Out→Jun (ou lista dada) como pagas sem cobrança.
 * - aluno.bolsa = true
 * - mensalidade.bolsa = true
 * - pagamentos[mes] = 0 (isento); status pago via flag bolsa
 * - opcionalmente gera entrada simbólica 0 no Arquivo via sincronização
 */
export function aplicarBolsaPropina(
  alunoId: string,
  meses: string[] = [...MESES_BOLSA_DEFAULT],
): { ok: boolean; message: string } {
  if (!alunoId) return { ok: false, message: "ID do aluno em falta" };
  const st = useFinance.getState();
  const alunos = alunosAll(st.alunosExtra || [], st.alunosOverrides || {}, st.alunosDeletedIds || []);
  const aluno = alunos.find((a) => a.id === alunoId);
  if (!aluno) return { ok: false, message: "Aluno não encontrado" };

  const mesSet = new Set(
    (meses.length ? meses : [...MESES_BOLSA_DEFAULT]).map((m) => (m === "set" ? "out" : m)),
  );
  const hoje = new Date().toISOString().slice(0, 10);

  // Override aluno
  const ov = { ...(st.alunosOverrides || {}) };
  const prev = ov[alunoId] || {};
  ov[alunoId] = {
    ...prev,
    bolsa: true,
    bolsaMeses: [...mesSet],
    obs: [((prev as { obs?: string }).obs || aluno.obs || "").replace(/\s*·\s*Bolsa escolar.*/i, ""), "Bolsa escolar · propina isenta Out→Jun"]
      .filter(Boolean)
      .join(" · "),
  };

  // Mensalidade row
  const mens = fundirMensalidades(st.mensalidades || []);
  const byId = new Map(mens.map((m) => [m.id, m]));
  const row = byId.get(alunoId) || {
    id: alunoId,
    nome: aluno.nome,
    turma: aluno.turma || "",
    propina: Number(aluno.propina) || 0,
    pagamentos: {},
    pagamentosEm: {},
    obs: "",
  };
  const pagamentos = { ...(row.pagamentos || {}) };
  const pagamentosEm = { ...(row.pagamentosEm || {}) };
  // Valor 0 = isento; a flag bolsa faz contar como pago
  for (const mes of mesSet) {
    pagamentos[mes] = 0;
    if (!pagamentosEm[mes]) pagamentosEm[mes] = hoje;
  }
  const obsBolsa = "Bolsa escolar · propina isenta (Out→Jun)";
  const obs = (row.obs || "").includes("Bolsa escolar")
    ? row.obs
    : [row.obs, obsBolsa].filter(Boolean).join(" · ");

  byId.set(alunoId, {
    ...row,
    bolsa: true,
    pagamentos: normalizarPagamentos({ ...pagamentos, ...Object.fromEntries([...mesSet].map((m) => [m, 0])) }),
    pagamentosEm,
    obs: obs || obsBolsa,
  });

  // normalizarPagamentos remove zeros — forçar meses bolsa com 0 explícito após normalizar
  const finalRow = byId.get(alunoId)!;
  const pagsForced: Record<string, number> = { ...(finalRow.pagamentos || {}) };
  for (const mes of mesSet) {
    // Usar 0; mesesPagosPropina e estado leem bolsa
    pagsForced[mes] = 0;
  }
  byId.set(alunoId, { ...finalRow, bolsa: true, pagamentos: pagsForced });

  useFinance.setState({
    alunosOverrides: ov,
    mensalidades: [...byId.values()],
  });

  // Re-sync separadores
  try {
    sincronizarPagamentosSeparadores();
  } catch {
    /* ignore */
  }

  return {
    ok: true,
    message: `Bolsa aplicada a ${aluno.nome}: ${[...mesSet].join(", ")} marcados como pagos (isento).`,
  };
}

/** Remove flag bolsa (não apaga pagamentos já registados com valor > 0). */
export function removerBolsaPropina(alunoId: string): { ok: boolean; message: string } {
  const st = useFinance.getState();
  const ov = { ...(st.alunosOverrides || {}) };
  const prev = { ...(ov[alunoId] || {}) } as Record<string, unknown>;
  delete prev.bolsa;
  delete prev.bolsaMeses;
  if (typeof prev.obs === "string") {
    prev.obs = prev.obs.replace(/\s*·\s*Bolsa escolar[^·]*/gi, "").trim();
  }
  ov[alunoId] = prev as never;
  const mens = (st.mensalidades || []).map((m) => {
    if (m.id !== alunoId) return m;
    const { bolsa: _b, ...rest } = m as typeof m & { bolsa?: boolean };
    return {
      ...rest,
      bolsa: false,
      obs: (m.obs || "").replace(/\s*·\s*Bolsa escolar[^·]*/gi, "").trim(),
    };
  });
  useFinance.setState({ alunosOverrides: ov, mensalidades: mens });
  return { ok: true, message: "Bolsa removida" };
}
