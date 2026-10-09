/**
 * Aplicação de dados remotos ao store (nuvem ou outro separador) e construção do payload a enviar.
 * Sem React / sem servidor — testável em Node (scripts/sync-*.test.mjs).
 */
import type { Aluno } from "@/data/types";
import { nextIdForTurma } from "@/lib/classe-congo";
import {
  sanitizeFinancePayload,
  sliceFromStoreDetailed,
  type FinanceCloudPayload,
} from "@/lib/finance-merge";
import {
  alunosAll,
  FICHAS_PROTEGIDAS,
  normalizeNomeAluno,
  persistAlunosCensoLocal,
  SEED_ALUNO_IDS,
  isCanonicalAlunoId,
  isMovimentoNaoAluno,
  useFinance,
} from "@/lib/store";
import {
  FTS_KEY,
  idOf,
  mergeById,
  mergeFinanceSlices,
  parseTs,
  runWithoutStamp,
  type Tombstones,
  isPlaceholderAluno,
  LEGACY_TOMBSTONE_BASE_ISO,
} from "@/lib/sync-core";

export const CONTACTO_STORAGE_KEY = "ecc-escola-contacto-v1";

function alunoNomeKey(row: unknown): string {
  if (isPlaceholderAluno(row)) return "";
  const nome = String((row as { nome?: string })?.nome || "").trim();
  try {
    return normalizeNomeAluno(nome);
  } catch {
    return nome.toLowerCase();
  }
}

/**
 * Se o mesmo ID aponta para pessoas diferentes (colisão multi-PC),
 * reatribui um ID novo ao registo local e guarda idAnterior.
 * Cliente: o local é primário (ganha empates).
 */
export function resolveAlunoIdCollisions(
  local: unknown[],
  remote: unknown[],
): { merged: unknown[]; remapped: number } {
  const remoteById = new Map<string, unknown>();
  for (const row of remote || []) {
    const id = idOf(row);
    if (id) remoteById.set(id, row);
  }
  const taken = new Set<string>([...remoteById.keys(), ...(local || []).map((r) => idOf(r)).filter(Boolean)]);
  const outLocal: unknown[] = [];
  let remapped = 0;
  const remoteIdByName = new Map<string, string>();
  for (const [id, row] of remoteById) {
    const k = alunoNomeKey(row);
    if (k && !remoteIdByName.has(k)) remoteIdByName.set(k, id);
  }
  for (const row of local || []) {
    const id = idOf(row);
    const remoteRow = id ? remoteById.get(id) : undefined;
    if (!remoteRow) {
      outLocal.push(row);
      continue;
    }
    const ln = alunoNomeKey(row);
    const rn = alunoNomeKey(remoteRow);
    if (ln && rn && ln !== rn && remoteIdByName.has(ln) && remoteIdByName.get(ln) !== id) {
      // Esta pessoa já existe na nuvem com outro ID → cópia local desactualizada (não duplicar).
      continue;
    }
    if (ln && rn && ln !== rn) {
      const turmaForId =
        String((row as { turma?: string })?.turma || "").trim() ||
        String((remoteRow as { turma?: string })?.turma || "").trim() ||
        "AL";
      const newId = nextIdForTurma(turmaForId, taken);
      taken.add(newId);
      outLocal.push({ ...(row as object), id: newId, idAnterior: id, updatedAt: new Date().toISOString() });
      remapped += 1;
    } else {
      outLocal.push(row);
    }
  }
  return { merged: mergeById(outLocal, remote), remapped };
}

type DocLite = {
  alunoId?: string;
  alunoNome?: string;
  valor?: number;
  numero?: string;
  codigoVerificacao?: string;
  pagoEm?: string;
  emitidoEm?: string;
  modelo?: string;
};

const TURMA_MAP: Record<string, string> = {
  PS: "Maternelle PS", MS: "Maternelle MS", GS: "Maternelle GS",
  P1: "Maternelle P1", P2: "Maternelle P2", P3: "CI", P4: "CP", P5: "CE1",
  CM1: "CM1", CM2: "CM2",
  "6E": "6ème", "5E": "5ème", "4E": "4ème", "3E": "3ème",
};

/** recibosSalario antigos (sem _fts.pago): "pago" de qualquer lado ganha (semântica anterior). */
function fixRecibosPago(merged: unknown[], local: unknown[], remote: unknown[]): unknown[] {
  const L = new Map((local || []).map((r) => [idOf(r), r as Record<string, unknown>]));
  const R = new Map((remote || []).map((r) => [idOf(r), r as Record<string, unknown>]));
  return merged.map((row) => {
    const id = idOf(row);
    const l = L.get(id);
    const r = R.get(id);
    if (!l || !r) return row;
    const lf = l[FTS_KEY] as Record<string, number> | undefined;
    const rf = r[FTS_KEY] as Record<string, number> | undefined;
    if ((lf && typeof lf.pago === "number") || (rf && typeof rf.pago === "number")) return row;
    const pago = Boolean(l.pago || r.pago);
    return (row as Record<string, unknown>).pago === pago ? row : { ...(row as object), pago };
  });
}

/** Instante estável de um documento (para fichas materializadas): emitidoEm/pagoEm, senão base legada. */
function stableDocIso(d: DocLite | undefined): string {
  for (const v of [d?.emitidoEm, d?.pagoEm]) {
    const t = Date.parse(String(v || ""));
    if (Number.isFinite(t) && t > 0) return new Date(t).toISOString();
  }
  return LEGACY_TOMBSTONE_BASE_ISO;
}

/**
 * Funde o payload da nuvem no store local (o local ganha empates) e aplica as regras
 * específicas (Arquivo → ficha, 4E-04, censo local). Não carimba nada (runWithoutStamp).
 */
export function applyRemotePayload(raw: FinanceCloudPayload, opts?: { authoritative?: boolean }): void {
  const p = sanitizeFinancePayload(raw);
  const local = useFinance.getState();
  // Primeira abertura depois do restauro Neon: a nuvem manda. A cache do browser
  // (que chegou a gravar fichas falsas e recibos trocados) não volta a ganhar.
  const merged = mergeFinanceSlices(
    (opts?.authoritative ? p : local) as unknown as Record<string, unknown>,
    (opts?.authoritative ? p : p) as unknown as Record<string, unknown>,
  ) as unknown as typeof local & { tombstones: Tombstones };

  // Alunos: nuvem (censo + extra) vs local, com resolução de colisões de ID.
  const remoteAlunos = mergeById((p.alunosExtra as unknown[]) || [], (p.alunosCenso as unknown[]) || []);
  const { merged: alunosMerged, remapped } = resolveAlunoIdCollisions(
    opts?.authoritative ? [] : local.alunosExtra || [],
    remoteAlunos,
  );
  if (remapped > 0) {
    console.warn(`[cloud] ${remapped} matrícula(s) com ID colidido foram reatribuídas (anti-sobreposição)`);
  }
  const docsAll = (merged.documentosAluno as unknown as DocLite[]) || [];
  const idsComDocumento = new Set(docsAll.map((d) => String(d.alunoId || "").trim()).filter(Boolean));
  // Quem tem recibo no Arquivo continua visível (alunosAll ignora a lista para esses IDs), mas
  // o ID mantém-se na lista/tombstone: antes era retirado a cada pull e o sanear voltava a
  // pô-lo → tombstone novo + push a cada ciclo (ping-pong entre PCs).
  const deletedAlunos = new Set(merged.alunosDeletedIds || []);
  const byId = new Map<string, Record<string, unknown>>();
  for (const a of alunosMerged as { id?: string }[]) {
    const id = String(a?.id || "").trim();
    if (!id) continue;
    byId.set(id, a as Record<string, unknown>);
  }
  for (const d of docsAll) {
    const id = String(d.alunoId || "").trim();
    if (!id || SEED_ALUNO_IDS.has(id) || byId.has(id)) continue;
    // Códigos de movimento (…-OUT, BAI-MAT-…-1) não são alunos.
    if (!isCanonicalAlunoId(id)) continue;
    // Recibo não cria matrícula. Aluno novo só em Nova matrícula.
    continue;
    const nome = String(d.alunoNome || "").trim() || id;
    if (/^aluno\s/i.test(nome)) continue;
    const pref = id.split("-")[0] || "";
    byId.set(id, {
      id,
      nome,
      turma: TURMA_MAP[pref] || "",
      grupo: ["6E", "5E", "4E", "3E"].includes(pref)
        ? "Collège"
        : pref.startsWith("P") || ["PS", "MS", "GS"].includes(pref)
          ? "Maternelle"
          : "Primaire",
      liquido: Number(d.valor) || 0,
      bruto: Number(d.valor) || 0,
      recibo: d.numero || d.codigoVerificacao || "",
      dataPag: d.pagoEm || d.emitidoEm || "",
      statusPag: "pago",
      inscricao: 0, seguro: 0, manuais: 0, cadernos: 0, uniforme: 0, extras: 0, curso: 0,
      mensalidade1: 0, propina: 0,
      obs: "Materializado do Arquivo (recibo de matrícula)",
      // Data do documento (estável): não anula tombstones posteriores nem muda a cada pull.
      updatedAt: stableDocIso(d),
      // Stub: campos com tempo 0 — qualquer cópia real ganha campo a campo.
      [FTS_KEY]: { "*": 0 },
      createdAt: stableDocIso(d),
    });
  }
  for (const d of docsAll) {
    const id = String(d.alunoId || "").trim();
    if (!id || !byId.has(id)) continue;
    const cur = byId.get(id)!;
    const nomeDoc = String(d.alunoNome || "").trim();
    const nomeCur = String(cur.nome || "").trim();
    if (nomeDoc && (!nomeCur || nomeCur === id || /^aluno\s/i.test(nomeCur))) {
      byId.set(id, {
        ...cur,
        nome: nomeDoc,
        liquido: Number(cur.liquido) > 0 ? cur.liquido : Number(d.valor) || 0,
        recibo: cur.recibo || d.numero || d.codigoVerificacao || "",
        statusPag: cur.statusPag || "pago",
      });
    }
  }
  // Garantir 4E-04 Nildo no merge da nuvem
  if (!byId.has("4E-04")) {
    const dN = docsAll.find((d) => d.alunoId === "4E-04");
    // Nome canónico (FICHAS_PROTEGIDAS): o recibo antigo no Arquivo é do Lucas (ID reutilizado).
    const nomeN = FICHAS_PROTEGIDAS["4E-04"]?.nome || String(dN?.alunoNome || "").trim() || "Nildo Azael Fortunato José";
    byId.set("4E-04", {
      id: "4E-04",
      nome: nomeN,
      turma: "4ème",
      grupo: "Collège",
      liquido: Number(dN?.valor) > 0 ? Number(dN?.valor) : 202000,
      bruto: Number(dN?.valor) > 0 ? Number(dN?.valor) : 202000,
      recibo: dN?.numero || dN?.codigoVerificacao || "REC-EF051-2026-10",
      dataPag: dN?.pagoEm || dN?.emitidoEm || "2026-09-23",
      statusPag: "pago",
      inscricao: 0, seguro: 0, manuais: 0, cadernos: 0, uniforme: 0, extras: 0, curso: 0,
      mensalidade1: 0, propina: 0,
      obs: "Ficha forçada (4E-04 · Nildo)",
      updatedAt: stableDocIso(dN),
      [FTS_KEY]: { "*": 0 },
      createdAt: stableDocIso(dN),
    });
  } else {
    const cur = byId.get("4E-04")!;
    const dN = docsAll.find((d) => d.alunoId === "4E-04");
    // Antes: nome do 1.º documento (recibo antigo do Lucas) → colisão de ID a cada pull, que
    // gerava uma ficha "Lucas" nova no servidor e outra no cliente (ping-pong sem fim).
    const nomeN =
      FICHAS_PROTEGIDAS["4E-04"]?.nome || String(dN?.alunoNome || cur.nome || "").trim() || "Nildo Azael Fortunato José";
    byId.set("4E-04", { ...cur, nome: nomeN, turma: cur.turma || "4ème", statusPag: cur.statusPag || "pago" });
  }

  // Fichas falsas (código de movimento, «Aluno CM2-02-3») não entram no censo partilhado.
  for (const [id, row] of Array.from(byId.entries())) {
    const nome = String(row.nome || "").trim();
    if (!isCanonicalAlunoId(id) || isMovimentoNaoAluno(id) || !nome || /^aluno\s/i.test(nome)) {
      byId.delete(id);
    }
  }
  if (opts?.authoritative) {
    const nomes = new Set<string>();
    for (const [id, row] of Array.from(byId.entries())) {
      const nome = String(row.nome || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      if (!nome || nomes.has(nome)) {
        byId.delete(id);
        continue;
      }
      nomes.add(nome);
    }
  }

  const recibos = fixRecibosPago(
    (merged.recibosSalario as unknown[]) || [],
    (local.recibosSalario as unknown[]) || [],
    (p.recibosSalario as unknown[]) || [],
  );

  runWithoutStamp(() => {
    useFinance.setState({
      extras: merged.extras,
      alunosExtra: Array.from(byId.values()) as never[],
      alunosOverrides: merged.alunosOverrides,
      alunosDeletedIds: Array.from(deletedAlunos).filter((id) => id !== "4E-04"),
      mensalidades: merged.mensalidades,
      fundoExtra: merged.fundoExtra,
      fundoAtmExtra: merged.fundoAtmExtra,
      // Extrato BAI importado passa a persistir na nuvem (antes era filtrado em cada pull).
      movimentosBaiExtra: merged.movimentosBaiExtra,
      movimentosBaiDeletedIds: merged.movimentosBaiDeletedIds,
      baiOverride: Boolean(merged.baiOverride),
      baiOverrideUpdatedAt: merged.baiOverrideUpdatedAt,
      fotos: merged.fotos || {},
      operators: (merged.operators?.length ? merged.operators : local.operators) as string[],
      operatorsUpdatedAt: merged.operatorsUpdatedAt,
      auditLog: merged.auditLog,
      sessionLog: merged.sessionLog,
      salariosExtra: merged.salariosExtra,
      salariosOverrides: merged.salariosOverrides,
      salariosDeletedIds: merged.salariosDeletedIds,
      recibosSalario: recibos as never[],
      documentosAlunoDeletedIds: merged.documentosAlunoDeletedIds,
      faturasPropina: merged.faturasPropina,
      uiPrefs: merged.uiPrefs || {},
      escolaContacto: merged.escolaContacto,
      inboxItems: merged.inboxItems,
      crmEnvios: merged.crmEnvios,
      codigosRecibo: merged.codigosRecibo,
      documentosAluno: merged.documentosAluno,
      contaCorrente: merged.contaCorrente,
      tombstones: merged.tombstones,
    });
  });
  applyAlunoFotoTombstones();
  mirrorEscolaContactoToLocal();
  try {
    const st = useFinance.getState();
    persistAlunosCensoLocal(alunosAll(st.alunosExtra || [], st.alunosOverrides || {}, st.alunosDeletedIds || []));
  } catch (e) {
    console.warn("[censo-local] apply", e);
  }
}

/** Payload a enviar (slice sem fotos + censo completo). */
export function buildPushPayload(): FinanceCloudPayload {
  const state = useFinance.getState();
  const { payload } = sliceFromStoreDetailed(state as never);
  const censo = alunosAll(state.alunosExtra || [], state.alunosOverrides || {}, state.alunosDeletedIds || []).map(
    (a) => {
      const { foto: _omit, ...rest } = a as Aluno & { foto?: string };
      return rest;
    },
  );
  payload.alunosCenso = censo;
  // alunosExtra: TODOS os extras locais (inclui _fts/updatedAt) — o censo leva os campos fundidos.
  payload.alunosExtra = payload.alunosExtra || [];
  persistAlunosCensoLocal(censo as never);
  return payload;
}

/**
 * Outro separador gravou o localStorage: fundir em memória (o que chega ganha empates
 * — garante convergência entre separadores). Devolve true se o estado mudou.
 */
export function applyPeerState(peer: Record<string, unknown>): boolean {
  if (!peer || typeof peer !== "object") return false;
  const local = useFinance.getState() as unknown as Record<string, unknown>;
  const merged = mergeFinanceSlices(peer, local) as Record<string, unknown>;
  const { merged: alunos } = resolveAlunoIdCollisions(
    (peer.alunosExtra as unknown[]) || [],
    (local.alunosExtra as unknown[]) || [],
  );
  merged.alunosExtra = alunos;
  const keys = [
    "extras", "alunosExtra", "alunosOverrides", "alunosDeletedIds", "mensalidades", "fundoExtra",
    "fundoAtmExtra", "movimentosBaiExtra", "movimentosBaiDeletedIds", "baiOverride", "baiOverrideUpdatedAt",
    "fotos", "operators", "operatorsUpdatedAt", "auditLog", "sessionLog", "salariosExtra", "salariosOverrides",
    "salariosDeletedIds", "recibosSalario", "faturasPropina", "uiPrefs", "escolaContacto", "inboxItems",
    "crmEnvios", "codigosRecibo", "documentosAluno", "documentosAlunoDeletedIds", "contaCorrente", "tombstones",
  ];
  const patch: Record<string, unknown> = {};
  for (const k of keys) {
    if (merged[k] === undefined) continue;
    if (JSON.stringify(merged[k]) !== JSON.stringify(local[k])) patch[k] = merged[k];
  }
  if (!Object.keys(patch).length) return false;
  runWithoutStamp(() => useFinance.setState(patch as never));
  return true;
}

/* ───────────── fotos de alunos (tabela aluno_fotos) + tombstones ───────────── */

function fotoTombs(): Record<string, string> {
  return (useFinance.getState().tombstones || {}).alunoFotos || {};
}

/** Remove fotos locais apagadas noutro PC (tombstone mais recente que a foto local). */
export function applyAlunoFotoTombstones(): void {
  const tombs = fotoTombs();
  if (!Object.keys(tombs).length) return;
  const st = useFinance.getState();
  let changed = false;
  const extras = (st.alunosExtra || []).map((a) => {
    const t = parseTs(tombs[a.id]);
    const rec = a as Aluno & { foto?: string; fotoUpdatedAt?: string };
    if (t && rec.foto && parseTs(rec.fotoUpdatedAt) <= t) {
      changed = true;
      const { foto: _f, ...rest } = rec;
      return rest as Aluno;
    }
    return a;
  });
  const overrides = { ...(st.alunosOverrides || {}) } as Record<string, Record<string, unknown>>;
  for (const [id, ov] of Object.entries(overrides)) {
    const t = parseTs(tombs[id]);
    if (t && ov?.foto && parseTs(ov.fotoUpdatedAt) <= t) {
      const { foto: _f, ...rest } = ov;
      overrides[id] = rest;
      changed = true;
    }
  }
  if (changed) runWithoutStamp(() => useFinance.setState({ alunosExtra: extras, alunosOverrides: overrides as never }));
}

/** Aplica fotos da tabela `aluno_fotos` (ignora as apagadas depois do upload). */
export function applyRemoteFotos(meta: Record<string, { dataUrl: string; updatedAt?: string }>): void {
  const tombs = fotoTombs();
  const state = useFinance.getState();
  const overrides = { ...(state.alunosOverrides || {}) } as Record<string, Record<string, unknown>>;
  let extras = [...(state.alunosExtra || [])];
  let changed = false;
  for (const [id, m] of Object.entries(meta || {})) {
    const dataUrl = m?.dataUrl;
    if (!id || !dataUrl) continue;
    const t = parseTs(tombs[id]);
    if (t && parseTs(m.updatedAt) <= t) continue;
    const extraIdx = extras.findIndex((a) => a.id === id);
    if (extraIdx >= 0) {
      if ((extras[extraIdx] as { foto?: string }).foto !== dataUrl) {
        extras = extras.map((a, i) => (i === extraIdx ? { ...a, foto: dataUrl } : a));
        changed = true;
      }
    } else {
      const prev = overrides[id] || {};
      if (prev.foto !== dataUrl) {
        overrides[id] = { ...prev, foto: dataUrl };
        changed = true;
      }
    }
  }
  if (changed) {
    runWithoutStamp(() =>
      useFinance.setState({ alunosOverrides: overrides as never, alunosExtra: extras as never }),
    );
  }
}

/** Fotos locais que faltam/diferem na nuvem e NÃO foram apagadas depois. */
export function localFotosToUpload(remote: Record<string, { dataUrl: string }>): { id: string; dataUrl: string }[] {
  const tombs = fotoTombs();
  const state = useFinance.getState();
  const localMap = new Map<string, { dataUrl: string; at: number }>();
  for (const a of state.alunosExtra || []) {
    const rec = a as Aluno & { foto?: string; fotoUpdatedAt?: string };
    if (rec?.id && typeof rec.foto === "string" && rec.foto.startsWith("data:image")) {
      localMap.set(rec.id, { dataUrl: rec.foto, at: parseTs(rec.fotoUpdatedAt) });
    }
  }
  for (const [id, ov] of Object.entries(state.alunosOverrides || {})) {
    const o = ov as { foto?: string; fotoUpdatedAt?: string };
    if (typeof o?.foto === "string" && o.foto.startsWith("data:image")) {
      localMap.set(id, { dataUrl: o.foto, at: parseTs(o.fotoUpdatedAt) });
    }
  }
  const out: { id: string; dataUrl: string }[] = [];
  for (const [id, { dataUrl, at }] of localMap) {
    if (remote?.[id]?.dataUrl === dataUrl) continue;
    const t = parseTs(tombs[id]);
    if (t && at <= t) continue;
    out.push({ id, dataUrl });
  }
  return out;
}

/* ───────────── contacto / IBAN da escola ───────────── */

function stripMeta(o: Record<string, unknown> | undefined): Record<string, unknown> {
  const { updatedAt: _u, [FTS_KEY]: _f, ...rest } = (o || {}) as Record<string, unknown>;
  return rest;
}

/** Nuvem → localStorage (lido por alunos.tsx / documento-matricula.ts). */
export function mirrorEscolaContactoToLocal(): void {
  if (typeof localStorage === "undefined") return;
  const c = useFinance.getState().escolaContacto;
  if (!c || !Object.keys(stripMeta(c)).length) return;
  try {
    const raw = localStorage.getItem(CONTACTO_STORAGE_KEY);
    const cur = raw ? JSON.parse(raw) : {};
    const next = { ...cur, ...stripMeta(c) };
    if (JSON.stringify(next) !== JSON.stringify(cur)) localStorage.setItem(CONTACTO_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/** Primeira vez: o contacto que só existia neste PC passa para o store (e daí para a nuvem). */
export function seedEscolaContactoFromLocal(): void {
  if (typeof localStorage === "undefined") return;
  const st = useFinance.getState();
  if (st.escolaContacto && Object.keys(stripMeta(st.escolaContacto)).length) return;
  try {
    const raw = localStorage.getItem(CONTACTO_STORAGE_KEY);
    if (!raw) return;
    const c = JSON.parse(raw);
    if (c && typeof c === "object" && Object.keys(c).length) st.setEscolaContacto(c);
  } catch {
    /* ignore */
  }
}
