import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import seedJson from "@/data/seed.json";
import type {
  Aluno,
  CrmEnvio,
  CodigoRecibo,
  ContaCorrenteMov,
  DocumentoAluno,
  DocumentoAlunoEstado,
  FaturaPropina,
  FundoAtm,
  FundoPagamento,
  Lancamento,
  Mensalidade,
  MovimentoBai,
  Origem,
  Salario,
  ReciboSalario,
  Seed,
} from "@/data/types";
import { DEFAULT_OPERATORS, MESES_LETIVOS, MESES_PROPINA_ADIANTADOS } from "@/data/types";
import { assertCanEdit } from "@/lib/can-edit";
import { aplicarSentido, montanteAbs } from "@/lib/inbox-sentido";
import {
  grupoFromTurma,
  resolveTurmaOficial,
  turmaFromId,
  nextIdForTurma,
  tarifaPropinaAluno,
} from "@/lib/classe-congo";

const seed = seedJson as Seed;
export const SEED_ALUNO_IDS = new Set((seed.alunos || []).map((a) => a.id));

/** Censo local (nuvem → seed virtual). Sem isto, um PC novo só vê os 19 do seed.json. */
export const ALUNOS_CENSO_LOCAL_KEY = "ecc-alunos-censo-v1";

function alunosCensoLocal(): Aluno[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(ALUNOS_CENSO_LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Aluno[];
    return Array.isArray(parsed) ? parsed.filter((a) => a && typeof a.id === "string") : [];
  } catch {
    return [];
  }
}

export function persistAlunosCensoLocal(alunos: Aluno[]) {
  if (typeof localStorage === "undefined") return;
  try {
    const seedIds = new Set((seed.alunos || []).map((a) => a.id));
    const seedNomes = new Set(
      (seed.alunos || []).map((a) => normalizeNomeAluno(a.nome)).filter(Boolean),
    );
    const seenIds = new Set<string>();
    const seenNomes = new Set<string>(seedNomes);
    const extras: Aluno[] = [];
    for (const a of alunos || []) {
      if (!a?.id || seedIds.has(a.id) || seenIds.has(a.id)) continue;
      const nn = normalizeNomeAluno(a.nome);
      if (nn && seenNomes.has(nn)) continue;
      seenIds.add(a.id);
      if (nn) seenNomes.add(nn);
      extras.push(a);
    }
    localStorage.setItem(ALUNOS_CENSO_LOCAL_KEY, JSON.stringify(extras));
  } catch (e) {
    console.warn("[censo-local]", e);
  }
}

/** Bloqueia mutações para Colaboradores 2–5 (só C1 edita). */
function requireEdit(get: () => { activeOperator: string; operators: string[] }) {
  assertCanEdit(get().activeOperator || "", get().operators || []);
}

/** Meses de propina já pagos na ficha (campo ou inferência mensalidade1 / líquido).
 *  Política 2026-27: a 1.ª propina (Outubro) paga-se na matrícula. */
function inferMesesAdiantados(a: Aluno): number {
  const prop = tarifaPropinaAluno(a);
  const mens = Number(a.mensalidade1) || 0;
  const saved = Number(a.mesesPropina) || 0;
  if (saved > 0) return Math.min(9, saved);
  if (prop > 0 && mens > 0) {
    const ratio = Math.round(mens / prop);
    if (ratio >= 2 && ratio <= 9 && Math.abs(mens - prop * ratio) <= prop * 0.02) return ratio;
    if (mens + 1 >= prop * 0.5) return 1;
  }
  const matriculado =
    (a.statusPag && a.statusPag !== "pendente") ||
    Number(a.liquido) > 0 ||
    Boolean(a.dataPag) ||
    Number(a.inscricao) > 0;
  if (matriculado) return 1;
  return 0;
}

/** Adiantamento da matrícula nunca é Setembro — a 1.ª propina é Outubro. */
function moverSetembroParaOutubro(
  pagamentos: Record<string, number>,
  pagamentosEm: Record<string, string> = {},
): void {
  const setVal = Number(pagamentos.set) || 0;
  if (setVal > 0 && !(Number(pagamentos.out) > 0)) {
    pagamentos.out = setVal;
    if (pagamentosEm.set) pagamentosEm.out = pagamentosEm.set;
  }
  delete pagamentos.set;
  delete pagamentosEm.set;
}

/** Numeração interna mensal: PREFIXO-AAAA-MM-001 (reinicia cada mês). */
export function nextMonthlyDoc(
  prefix: string,
  existing: { docInterno?: string; id?: string; data?: string }[],
  dataIso?: string,
): string {
  const d = dataIso || new Date().toISOString().slice(0, 10);
  const ym = d.slice(0, 7); // YYYY-MM
  const re = new RegExp("^" + prefix + "-" + ym + "-(\d{3})");
  let max = 0;
  const keys = new Set<string>();
  for (const e of existing) {
    const key = e.docInterno || e.id || "";
    keys.add(key);
    const mm = key.match(re);
    if (mm) max = Math.max(max, Number(mm[1]));
  }
  let n = max + 1;
  let id = prefix + "-" + ym + "-" + String(n).padStart(3, "0");
  while (keys.has(id)) {
    n += 1;
    id = prefix + "-" + ym + "-" + String(n).padStart(3, "0");
  }
  return id;
}

export type CapturaInput = {
  data: string;
  tipo: "entrada" | "despesa";
  categoria: string;
  descricao: string;
  fornecedor: string;
  fatura: string;
  valor: number;
  pagamento: string;
  origem: Origem;
  observacoes: string;
  foto?: string;
  /** normal | adiantamento | liquidacao — liquidação não debita BAI/fundo de novo */
  natureza?: import("@/data/types").NaturezaLancamento;
  /** ID do adiantamento que esta liquidação fecha */
  linkedId?: string;
};

type ExtraState = {
  extras: Lancamento[];
  alunosExtra: Aluno[];
  /** Sobrescritas de campos de alunos do seed ou extras (por id). */
  alunosOverrides: Record<string, Partial<Aluno>>;
  mensalidades: Mensalidade[];
  fundoExtra: FundoPagamento[];
  /** Levantamentos ATM registados na app (somam ao fundo). */
  fundoAtmExtra: FundoAtm[];
  /** Movimentos BAI importados (CSV) — substituem ou complementam o seed. */
  movimentosBaiExtra: MovimentoBai[];
  /** Se true, usa só movimentosBaiExtra (import completo do extrato). */
  baiOverride: boolean;
  fotos: Record<string, string>;
  /** Nome do colaborador ativo neste browser (escritório, até 5). */
  activeOperator: string;
  /** Lista editável dos 5 nomes do escritório. */
  operators: string[];
  /** Registo de auditoria local: quem fez o quê. */
  auditLog: { at: string; by: string; action: string; detail: string }[];
  /** Entradas e saídas de sessão dos colaboradores. */
  sessionLog: { at: string; by: string; action: "entrada" | "saida"; detail: string }[];
  /** Funcionários / folhas de salário adicionados na app. */
  salariosExtra: Salario[];
  salariosDeletedIds: string[];
  /** IDs de alunos do seed (ou extras) que foram apagados — não voltam a aparecer. */
  alunosDeletedIds: string[];
  /** IDs de movimentos BAI apagados (seed ou extra) — exclusão estável sem congelar o extrato. */
  movimentosBaiDeletedIds: string[];
  recibosSalario: ReciboSalario[];
  faturasPropina: { numero: string; alunoId?: string; mes?: string; valor?: number }[];
  /** Sobrescritas de salários do seed (por id). */
  salariosOverrides: Record<string, Partial<Salario>>;
  /**
   * Preferências de UI partilhadas na nuvem (ex.: mês de referência dos recibos de honorários).
   * Permite o mesmo mês em PC e telemóvel após sincronizar.
   */
  uiPrefs: {
    salariosMesKey?: string;
    salariosMesLabel?: string;
    salariosFilterMes?: string;
  };
  /** Caixa de entrada de reconciliação (atrasados). */
  inboxItems: import("@/data/types").InboxMovimento[];
  /** Histórico de envios de faturas/propinas aos encarregados (CRM). */
  crmEnvios: CrmEnvio[];
  /** Códigos únicos de recibos emitidos (anti-falsificação). */
  codigosRecibo: CodigoRecibo[];
  /** Arquivo do aluno: faturas e recibos emitidos (histórico por aluno). */
  documentosAluno: DocumentoAluno[];
  /** Créditos / aplicações / reembolsos por aluno (conta corrente). */
  contaCorrente: ContaCorrenteMov[];
};

type Store = ExtraState & {
  addCaptura: (input: CapturaInput) => Lancamento;
  addAluno: (aluno: Aluno) => void;
  updateAluno: (id: string, patch: Partial<Aluno>) => void;
  setMensalidade: (id: string, mes: string, valor: number) => void;
  /** Garante que todos os alunos activos têm linha em Propinas (backfill). */
  syncPropinasFromMatriculas: () => number;
  /**
   * Repõe Propinas = 1 linha por aluno activo em Matrículas.
   * Remove órfãos / IDs duplicados e funde pagamentos.
   */
  reporPropinasFromMatriculas: () => { alunos: number; removidos: number };
  detectarIrmaosEAplicarDescontos: () => number;
  /**
   * Alinha a marca Campus Cidade dentro de cada família (pai, mãe ou campo família).
   * Se a maioria dos irmãos for Campus Cidade → todos; senão → todos Nova Vida.
   * Corrige casos como Mutapayi em que só um filho aparecia no filtro «nova vida».
   */
  alinharCampusPorFamilia: () => {
    familiasMistas: number;
    alunosAlterados: number;
    campus: number;
    novaVida: number;
  };
  /**
   * Funde um censo (JSON de outro PC / backup) no cadastro local.
   * Alunos cujo ID já existe no seed recebem override; os outros vão para alunosExtra.
   * Nunca apaga matrículas que já estejam neste dispositivo.
   */
  importCensoAlunos: (alunos: Aluno[], mensalidades?: Mensalidade[]) => number;

  confirmPropinaBai: (id: string, mes: string) => { ok: boolean; message: string };
  /**
   * Aplica saldo credor à propina de um mês sem criar movimento BAI
   * (o dinheiro já entrou no recebimento original).
   */
  aplicarCreditoPropina: (id: string, mes: string) => { ok: boolean; message: string; aplicado: number };
  saldoCreditoAluno: (id: string) => number;
  setFoto: (id: string, dataUrl: string) => void;
  removeExtra: (id: string) => void;
  updateExtra: (id: string, patch: Partial<Lancamento>) => void;
  resetLocal: () => void;
  setActiveOperator: (name: string) => void;
  setOperatorName: (index: number, name: string) => void;
  pushAudit: (action: string, detail: string) => void;
  pushSession: (action: "entrada" | "saida", detail?: string) => void;
  addFundoPagamento: (p: Omit<import("@/data/types").FundoPagamento, "id"> & { id?: string }) => import("@/data/types").FundoPagamento;
  updateFundoPagamento: (id: string, patch: Partial<import("@/data/types").FundoPagamento>) => void;
  removeFundoPagamento: (id: string) => void;
  /**
   * Cria um bloco de levantamento no Fundo SEM debitar o BAI.
   * Use quando o levantamento já existe no extrato BAI e só falta o bloco para associar pagamentos em dinheiro.
   */
  addFundoAtm: (input: { data: string; valor: number; id?: string; obs?: string }) => string;
  /** Apaga bloco ATM do Fundo. Nunca altera o extrato BAI. */
  removeFundoAtm: (id: string) => void;
  importBaiMovimentos: (rows: MovimentoBai[], replace: boolean) => void;
  /** Apaga um movimento do extrato BAI e recalcula saldos em cadeia. */
  deleteBaiMovimento: (id: string) => void;
  removeAluno: (id: string) => void;
  /**
   * Eliminação definitiva: remove ficha, propinas, documentos, códigos de recibo,
   * faturas, conta corrente, CRM, foto e movimentos BAI gerados pela matrícula.
   * Não fica só “oculto” — não volta pelo recuperarAlunosOcultos.
   */
  purgeAlunoCompleto: (id: string) => { ok: boolean; message: string };
  /** Tira o ID da lista de apagados e reconstroi a ficha se ainda houver rasto. */
  restoreAluno: (id: string) => boolean;
  /** Varre propinas, BAI, overrides e IDs apagados; repõe fichas ocultas. */
  recuperarAlunosOcultos: () => { restaurados: number; detalhes: string[] };
  /** Força 4E-04 Nildo (recibo Arquivo) — ID reutilizado após realinhamento. */
  forcarFichaNildo4E04: () => { ok: boolean; message: string };
  sanearAlunosDuplicados: () => { removidos: number; detalhes: string[] };
  reabrirAlunosUnicos: () => { restaurados: number; detalhes: string[] };
  importLancamentos: (rows: CapturaInput[]) => number;
  addRecibosSalario: (rows: ReciboSalario[]) => void;
  updateReciboSalario: (
    id: string,
    patch: Partial<Pick<ReciboSalario, "mes" | "mesKey" | "dataPag" | "diasTrab" | "diasUteis" | "liquido">>,
  ) => void;
  setReciboSalarioPago: (id: string, pago: boolean, dataPag?: string) => void;
  addAdiantamentoSalario: (input: {
    funcionarioId: string;
    valor: number;
    dataPag: string;
    mesKey: string;
    mesLabel: string;
    nota?: string;
  }) => ReciboSalario;
  /** Alinha botões pago com movimentos BAI já existentes (multi-PC / cloud). */
  reconcileSalariosBai: () => boolean;
  /** Recria no BAI os débitos em falta para recibos já marcados como pagos. */
  ensureSalariosBaiFromRecibos: () => number;
  /** Remove todos os débitos SALARIO-APP / APP-SAL-* do extrato BAI. */
  limparDebitosSalarioBai: () => number;
  setUiPrefs: (patch: Partial<{ salariosMesKey?: string; salariosMesLabel?: string; salariosFilterMes?: string }>) => void;
  addInboxItems: (rows: import("@/data/types").InboxMovimento[]) => void;
  updateInboxItem: (id: string, patch: Partial<import("@/data/types").InboxMovimento>) => void;
  removeInboxItem: (id: string) => void;
  clearInboxReconciliados: () => void;
  processarInbox: () => { ordenados: number; duplicados: number; ligados: number; avisos: number };
  /** Envia itens Inbox para o extrato BAI, recalcula saldo e limpa da Inbox os já tratados. */
  syncInboxParaBai: (ids?: string[]) => {
    criados: number;
    duplicados: number;
    ignorados: number;
    removidos: number;
    pendentes: number;
  };
  /** Recria recibos do mês como pagos a partir da lista de funcionários. */
  restaurarRecibosPagos: (staff: { id: string; nome: string; funcao?: string; salario: number; diasUteis?: number; diasTrab?: number; outrosDesc?: number; iban?: string }[], mes: string, mesKey: string, dataPag?: string) => number;
  removeReciboSalario: (id: string) => void;
  /** Cria movimentos BAI em falta a partir de despesas (cartão/transferência) já registadas. */
  syncBaiFromExtras: () => number;
  /** Movimento manual no extrato BAI (entrada ou saída bancária sem despesa). */
  addBaiMovimentoManual: (input: {
    data: string;
    valor: number;
    tipo: "entrada" | "saida";
    descricao: string;
    banco?: string;
    observacoes?: string;
  }) => void;
  addSalario: (s: Salario) => void;
  updateSalario: (id: string, patch: Partial<Salario>) => void;
  removeSalario: (id: string) => void;
  /** Regista envio de fatura/propina ao encarregado (CRM). */
  addCrmEnvio: (e: Omit<CrmEnvio, "id" | "enviadoEm" | "confirmado"> & { id?: string; enviadoEm?: string; confirmado?: boolean }) => void;
  updateCrmEnvio: (id: string, patch: Partial<CrmEnvio>) => void;
  removeCrmEnvio: (id: string) => void;
  addCodigoRecibo: (c: Omit<CodigoRecibo, "id" | "codigo" | "emitidoEm"> & { id?: string; codigo?: string; emitidoEm?: string }) => CodigoRecibo;
  findCodigoRecibo: (codigo: string) => CodigoRecibo | undefined;
  findCodigoReciboAlunoMes: (alunoId: string, mesKey: string) => CodigoRecibo | undefined;
  incrementCodigoReciboVia: (id: string) => CodigoRecibo | undefined;
  /** Arquivo do aluno */
  addDocumentoAluno: (
    d: Omit<DocumentoAluno, "id" | "emitidoEm" | "estado"> & {
      id?: string;
      emitidoEm?: string;
      estado?: DocumentoAlunoEstado;
    },
  ) => DocumentoAluno;
  updateDocumentoAluno: (id: string, patch: Partial<DocumentoAluno>) => void;
  findDocumentoPorNumero: (numero: string) => DocumentoAluno | undefined;
  /** Cria recibo a partir do n.º de fatura (Arquivo). */
  gerarReciboDeFatura: (faturaNumero: string) => DocumentoAluno | undefined;
};

const initialMensalidades: Mensalidade[] = seed.mensalidades;


/** Mês lectivo → mês civil 0-11 (ano lectivo set–jun). */
const MES_LETIVO_IDX: Record<string, number> = {
  set: 8, out: 9, nov: 10, dez: 11, jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
};

/**
 * Prazo de pagamento da propina do mês lectivo:
 * - Outubro (1.ª fatura): até 20 de setembro (antes do início das aulas)
 * - Restantes: do dia 30 do mês de referência até ao dia 10 do mês seguinte
 *   Ex.: propina de novembro → 30/11 a 10/12
 */
export function limitePropina(mesLetivo: string, refYear?: number): { inicio: Date; fim: Date } {
  const idx = MES_LETIVO_IDX[mesLetivo] ?? 8;
  const now = new Date();
  let y = refYear ?? now.getFullYear();
  // Ajuste ano lectivo
  if (["set", "out", "nov", "dez"].includes(mesLetivo) && now.getMonth() < 8) y -= 1;
  if (["jan", "fev", "mar", "abr", "mai", "jun"].includes(mesLetivo) && now.getMonth() >= 8) y += 1;
  // 1.ª propina (outubro): limite 20 de setembro
  if (mesLetivo === "out") {
    const inicio = new Date(y, 8, 1); // 1 set
    const fim = new Date(y, 8, 20); // 20 set
    inicio.setHours(0, 0, 0, 0);
    fim.setHours(23, 59, 59, 999);
    return { inicio, fim };
  }
  // Dia 30 do mês de referência (meses com menos dias usam o último dia)
  const lastDay = new Date(y, idx + 1, 0).getDate();
  const diaInicio = Math.min(30, lastDay);
  const inicio = new Date(y, idx, diaInicio);
  const fim = new Date(y, idx + 1, 10); // dia 10 do mês seguinte
  inicio.setHours(0, 0, 0, 0);
  fim.setHours(23, 59, 59, 999);
  return { inicio, fim };
}

export function propinaNoPrazo(mesLetivo: string, dataIso: string): boolean {
  const d = new Date(dataIso + "T12:00:00");
  const { inicio, fim } = limitePropina(mesLetivo);
  return d >= inicio && d <= fim;
}

export type EstadoPropinaMes =
  | "pago"
  | "pago_multa"
  | "em_prazo"
  | "atraso"
  | "futuro";

/** Estado do mês: pago / pago c/ multa / em prazo / atraso / futuro. */
export function estadoPropinaMes(
  mesLetivo: string,
  valorPago: number,
  dataPagamento?: string,
  hoje = new Date(),
): EstadoPropinaMes {
  // Setembro não é mês de propina neste ano lectivo (1.ª = Outubro).
  if (mesLetivo === "set" && !(valorPago > 0)) return "futuro";
  const { inicio, fim } = limitePropina(mesLetivo);
  const h = new Date(hoje);
  h.setHours(12, 0, 0, 0);

  if (valorPago > 0) {
    const dataRef = dataPagamento || h.toISOString().slice(0, 10);
    return propinaNoPrazo(mesLetivo, dataRef) ? "pago" : "pago_multa";
  }
  // Sem pagamento
  if (h < inicio) return "futuro"; // ainda não abriu a janela (antes do dia 30)
  if (h <= fim) return "em_prazo"; // dentro da janela, ainda pode pagar sem multa
  return "atraso"; // passou o dia 10 → pendente com multa
}

export const useFinance = create<Store>()(
  persist(
    (set, get) => ({
      extras: [],
      alunosExtra: [],
      alunosOverrides: {},
      mensalidades: initialMensalidades,
      fundoExtra: [],
      fundoAtmExtra: [],
      movimentosBaiExtra: [],
      baiOverride: false,
      fotos: {},
      activeOperator: DEFAULT_OPERATORS[0],
      operators: [...DEFAULT_OPERATORS],
      auditLog: [],
      sessionLog: [],
      salariosExtra: [],
      salariosDeletedIds: [],
      alunosDeletedIds: [],
      movimentosBaiDeletedIds: [],
      recibosSalario: [],
      faturasPropina: [],
      salariosOverrides: {},
      uiPrefs: {},
      inboxItems: [],
      crmEnvios: [],
      codigosRecibo: [],
      documentosAluno: [],
      contaCorrente: [],
      setUiPrefs: (patch) => {
        set({ uiPrefs: { ...(get().uiPrefs || {}), ...patch } });
      },
      addInboxItems: (rows) => {
        requireEdit(get);
        const existing = get().inboxItems || [];
        const ids = new Set(existing.map((r) => r.id));
        const merged = [...existing];
        for (const r of rows) {
          if (ids.has(r.id)) {
            const i = merged.findIndex((x) => x.id === r.id);
            if (i >= 0) merged[i] = { ...merged[i], ...r };
          } else {
            merged.push(r);
            ids.add(r.id);
          }
        }
        set({ inboxItems: merged });
        get().pushAudit("inbox_add", `${rows.length} item(ns)`);
      },
      updateInboxItem: (id, patch) => {
        requireEdit(get);
        set({
          inboxItems: (get().inboxItems || []).map((r) =>
            r.id === id ? { ...r, ...patch } : r,
          ),
        });
      },
      removeInboxItem: (id) => {
        requireEdit(get);
        set({ inboxItems: (get().inboxItems || []).filter((r) => r.id !== id) });
      },
      clearInboxReconciliados: () => {
        requireEdit(get);
        set({
          inboxItems: (get().inboxItems || []).filter(
            (r) => r.status !== "reconciliado" && r.status !== "duplicado" && r.status !== "ignorado",
          ),
        });
      },
      processarInbox: () => {
        requireEdit(get);
        let items = [...(get().inboxItems || [])];
        // 1) Ordenar cronologicamente
        items.sort((a, b) => (a.data || "").localeCompare(b.data || "") || a.id.localeCompare(b.id));
        const ordenados = items.length;

        // 2) Duplicados: mesma data + valor ±1 Kz + texto parecido
        const norm = (s: string) =>
          (s || "")
            .toLowerCase()
            .replace(/[^a-z0-9à-ú\s]/gi, " ")
            .replace(/\s+/g, " ")
            .trim();
        let duplicados = 0;
        for (let i = 0; i < items.length; i++) {
          if (items[i].status === "duplicado" || items[i].status === "ignorado") continue;
          const vi = Math.abs(Number(items[i].valor) || Number(items[i].saida) || Number(items[i].entrada) || 0);
          for (let j = i + 1; j < items.length; j++) {
            if (items[j].status === "duplicado") continue;
            const vj = Math.abs(Number(items[j].valor) || Number(items[j].saida) || Number(items[j].entrada) || 0);
            const sameDay = items[i].data === items[j].data;
            const sameVal = Math.abs(vi - vj) < 1;
            const ti = norm(items[i].descricao);
            const tj = norm(items[j].descricao);
            const textClose =
              ti &&
              tj &&
              (ti === tj ||
                (ti.length >= 8 && tj.length >= 8 && (ti.includes(tj) || tj.includes(ti))));
            if (sameDay && sameVal && textClose) {
              items[j] = {
                ...items[j],
                status: "duplicado",
                observacoes: `Duplicado de ${items[i].id}`,
              };
              duplicados += 1;
            }
          }
        }

        // 3) Ligar a salários / propinas / despesas / extrato BAI
        const recibos = get().recibosSalario || [];
        const extras = get().extras || [];
        const mens = get().mensalidades || [];
        const baiMovs = movimentosAll(
          get().movimentosBaiExtra || [],
          get().baiOverride,
          get().movimentosBaiDeletedIds || [],
        );
        let ligados = 0;

        const suggestTipo = (desc: string, valor: number): import("@/data/types").InboxTipo => {
          const d = (desc || "").toLowerCase();
          if (/sal[aá]rio|honor[aá]rio|rh-20|app-sal/i.test(d)) return "salario";
          if (/a\s*reembolsar|abatimento\s*(à|a)?\s*d[ií]vida|acerto\s*s[oó]ci/i.test(d)) return "abatimento_socio";
          if (/propina|mensalidade|prop-|frais|scolarit/i.test(d)) return "propina";
          if (/comiss[aã]o.*fecho|fecho.*comiss/i.test(d)) return "comissao_fecho_tpa";
          if (/alug(?:uer)?\s*tpa|comiss[aã]o\s*alug/i.test(d)) return "taxa_aluguer_tpa";
          if (/comiss[aã]o.*transf|iva\s*sobre\s*comis/i.test(d)) return "comissao_transferencia";
          if (/tpa|multicaixa|cart[aã]o/i.test(d)) return "tpa";
          if (/transf|transfer/i.test(d)) return "transferencia";
          if (/dep[oó]sito|deposito/i.test(d)) return "deposito";
          if (/despesa|fornec|compra|factura|fatura/i.test(d)) return "despesa";
          if (valor < 0 || /pagamento|pagamento/i.test(d)) return "despesa";
          return "desconhecido";
        };

        /** Dia civil ±1 (ISO YYYY-MM-DD) para tolerar D+1 de transferências. */
        const nearDay = (a?: string, b?: string) => {
          if (!a || !b) return true;
          if (a === b) return true;
          const da = new Date(a + "T12:00:00");
          const db = new Date(b + "T12:00:00");
          if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
          return Math.abs(da.getTime() - db.getTime()) <= 86400000 * 1.5;
        };

        items = items.map((it) => {
          if (it.status === "duplicado" || it.status === "ignorado") return it;
          const valor = Math.abs(Number(it.valor) || Number(it.saida) || Number(it.entrada) || 0);
          const entradaInbox = Number(it.entrada) || (Number(it.valor) > 0 ? Number(it.valor) : 0);
          const saidaInbox = Number(it.saida) || (Number(it.valor) < 0 ? Math.abs(Number(it.valor)) : 0);
          let tipo = it.tipo && it.tipo !== "desconhecido" ? it.tipo : suggestTipo(it.descricao, Number(it.valor) || -valor);
          let linkId = it.linkId;
          let linkLabel = it.linkLabel;
          let status = it.status === "reconciliado" ? it.status : ("classificado" as const);

          // 3a) Extrato BAI — data ±1 dia + valor (entrada ou saída)
          if (!linkId && valor > 0) {
            const matchBai = baiMovs.find((m) => {
              if (it.data && m.data && it.data !== m.data) return false;
              const me = Number(m.entrada) || 0;
              const ms = Number(m.saida) || 0;
              if (saidaInbox > 0 && Math.abs(ms - saidaInbox) < 0.02) return true;
              if (entradaInbox > 0 && Math.abs(me - entradaInbox) < 0.02) return true;
              return false;
            });
            if (matchBai) {
              linkId = matchBai.id;
              const sentido = (Number(matchBai.saida) || 0) > 0 ? "saída" : "entrada";
              linkLabel = `BAI ${matchBai.id} · ${sentido} ${matchBai.descricao || ""}`.slice(0, 120);
              status = "reconciliado";
              if (tipo === "desconhecido") {
                if ((Number(matchBai.saida) || 0) > 0) tipo = "despesa";
                else if (/tpa|multicaixa/i.test(matchBai.descricao || "")) tipo = "tpa";
                else if (/transf/i.test(matchBai.descricao || "")) tipo = "transferencia";
                else tipo = "deposito";
              }
              ligados += 1;
            }
          }

          // 3b) Salários (recibos pagos)
          if (!linkId && (tipo === "salario" || /sal|honor|rh-/i.test(it.descricao))) {
            const match = recibos.find(
              (r) =>
                r.pago &&
                Math.abs((r.liquido || 0) - valor) < 1 &&
                (!it.data || !r.dataPag || r.dataPag.slice(0, 7) === it.data.slice(0, 7) || r.mesKey === it.data.slice(0, 7)),
            );
            if (match) {
              linkId = match.id;
              linkLabel = `Recibo ${match.id} · ${match.nome}`;
              status = "reconciliado";
              tipo = "salario";
              ligados += 1;
            }
          }

          // 3c) Lista de despesas (extras)
          if (!linkId && (tipo === "despesa" || tipo === "desconhecido" || tipo === "tpa" || tipo === "transferencia")) {
            const match = extras.find(
              (e: { id?: string; valor?: number; data?: string; descricao?: string; docInterno?: string }) =>
                Math.abs((Number(e.valor) || 0) - valor) < 1 &&
                nearDay(it.data, e.data),
            ) as { id?: string; docInterno?: string; descricao?: string } | undefined;
            if (match?.id) {
              linkId = match.id;
              linkLabel = `Despesa ${match.docInterno || match.id}`;
              status = "reconciliado";
              if (tipo === "desconhecido") tipo = "despesa";
              ligados += 1;
            }
          }

          // 3d) Propinas (mensalidades) — classificação + ligação por valor/mês se possível
          if (!linkId && tipo === "propina") {
            const matchM = mens.find(
              (m: { id?: string; valor?: number; data?: string; mes?: string }) =>
                Math.abs((Number(m.valor) || 0) - valor) < 1 &&
                nearDay(it.data, m.data),
            ) as { id?: string; mes?: string } | undefined;
            if (matchM?.id) {
              linkId = matchM.id;
              linkLabel = `Propina ${matchM.mes || matchM.id}`;
              status = "reconciliado";
              ligados += 1;
            } else {
              status = status === "reconciliado" ? status : "classificado";
            }
          }

          const sent = aplicarSentido(tipo, it.descricao, valor, it);
          return {
            ...it,
            tipo,
            entrada: sent.entrada,
            saida: sent.saida,
            valor: sent.valor,
            status:
              status === "por_classificar" && tipo !== "desconhecido"
                ? "classificado"
                : status,
            linkId,
            linkLabel,
          };
        });

        // 4) Avisos: informação semelhante (não exacta) — valor ±2% e data ±3 dias, ou texto próximo
        let avisos = 0;
        const textClose = (a: string, b: string) => {
          const na = norm(a);
          const nb = norm(b);
          if (!na || !nb) return false;
          return na === nb || na.includes(nb) || nb.includes(na);
        };
        const dayDiff = (a?: string, b?: string) => {
          if (!a || !b) return 99;
          const da = new Date(a + "T12:00:00");
          const db = new Date(b + "T12:00:00");
          if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 99;
          return Math.abs(da.getTime() - db.getTime()) / 86400000;
        };
        items = items.map((it) => {
          if (it.status === "duplicado" || it.status === "ignorado" || it.status === "reconciliado") {
            return it;
          }
          if (it.observacoes && /AVISO:/i.test(it.observacoes)) return it;
          const valor = Math.abs(Number(it.valor) || Number(it.saida) || Number(it.entrada) || 0);
          if (valor <= 0) return it;
          const hints: string[] = [];
          // BAI semelhante
          for (const m of baiMovs) {
            const mv = Math.max(Number(m.entrada) || 0, Number(m.saida) || 0);
            if (mv <= 0) continue;
            const vClose = Math.abs(mv - valor) / valor <= 0.02 || Math.abs(mv - valor) < 2;
            const dClose = dayDiff(it.data, m.data) <= 3;
            const tClose = textClose(it.descricao, m.descricao || "");
            if (vClose && (dClose || tClose) && !(Math.abs(mv - valor) < 1 && dayDiff(it.data, m.data) <= 1.5)) {
              hints.push(`BAI ${m.id} (${m.data}, ${mv} Kz)`);
            }
          }
          // Despesas semelhantes
          for (const e of extras as { id?: string; valor?: number; data?: string; descricao?: string }[]) {
            const ev = Number(e.valor) || 0;
            if (ev <= 0) continue;
            const vClose = Math.abs(ev - valor) / valor <= 0.02 || Math.abs(ev - valor) < 2;
            const dClose = dayDiff(it.data, e.data) <= 3;
            const tClose = textClose(it.descricao, e.descricao || "");
            if (vClose && (dClose || tClose) && !(Math.abs(ev - valor) < 1 && (it.data === e.data))) {
              hints.push(`Despesa ${e.id}`);
            }
          }
          if (hints.length) {
            avisos += 1;
            const msg = `AVISO: possível correspondência — ${hints.slice(0, 3).join("; ")}`;
            return {
              ...it,
              observacoes: it.observacoes ? `${it.observacoes} · ${msg}` : msg,
              status: it.status === "por_classificar" ? "classificado" : it.status,
            };
          }
          return it;
        });

        set({ inboxItems: items });
        get().pushAudit(
          "inbox_processar",
          `${ordenados} ordenados · ${duplicados} duplicados · ${ligados} ligados · ${avisos} avisos`,
        );
        return { ordenados, duplicados, ligados, avisos };
      },
      syncInboxParaBai: (ids) => {
        requireEdit(get);
        const items = (get().inboxItems || []).filter((it) => {
          if (it.status === "ignorado") return false;
          if (ids && ids.length && !ids.includes(it.id)) return false;
          const v = Math.abs(Number(it.valor) || Number(it.entrada) || Number(it.saida) || 0);
          return v > 0;
        });
        const existing = movimentosAll(
          get().movimentosBaiExtra || [],
          get().baiOverride,
          get().movimentosBaiDeletedIds || [],
        );
        const fp = (data: string, entrada: number, saida: number, desc: string) =>
          `${data}|${Math.round(entrada * 100)}|${Math.round(saida * 100)}|${(desc || "")
            .toLowerCase()
            .replace(/[^a-z0-9à-ú]+/gi, " ")
            .trim()
            .slice(0, 16)}`;
        const fps = new Set(existing.map((m) => fp(m.data, Number(m.entrada) || 0, Number(m.saida) || 0, m.descricao || "")));
        const idsExist = new Set(existing.map((m) => m.id));
        let criados = 0;
        let duplicados = 0;
        let ignorados = 0;
        const patched = [...(get().inboxItems || [])];
        const limpar = new Set<string>();
        for (const it of items) {
          const sent0 = aplicarSentido(it.tipo, it.descricao, montanteAbs(it), it);
          let entrada = sent0.entrada;
          let saida = sent0.saida;
          if (entrada <= 0 && saida <= 0) {
            const n = montanteAbs(it);
            if (n > 0) {
              const credit =
                it.tipo === "deposito" ||
                it.tipo === "propina" ||
                /dep[oó]sito|entrada|recebid|fecho\s*tpa/i.test(it.descricao || "");
              if (credit) entrada = n;
              else saida = n;
            }
          }
          if (entrada <= 0 && saida <= 0) {
            ignorados += 1;
            continue;
          }
          const key = fp(it.data, entrada, saida, it.descricao);
          if (fps.has(key) || (it.linkId && idsExist.has(it.linkId))) {
            duplicados += 1;
            limpar.add(it.id);
            continue;
          }
          const movId = `APP-INB-${it.id}`.replace(/\s+/g, "").slice(0, 48);
          const abatSocio =
            it.tipo === "abatimento_socio" ||
            isAbatimentoDividaSocio({
              descricao: it.descricao,
              observacoes: it.observacoes,
            });
          const descBai = abatSocio && !/a\s*reembolsar/i.test(it.descricao || "")
            ? `${it.descricao || "Uso do cartão"} · A reembolsar`
            : it.descricao || "Movimento Inbox → BAI";
          const ok = pushBaiMovimento(get, set, {
            id: movId,
            data: it.data,
            entrada,
            saida,
            banco: entrada > 0 ? "INBOX-ENTRADA" : abatSocio ? "INBOX-SOCIO" : "INBOX-SAIDA",
            descricao: descBai,
            observacoes: [
              `Sync Inbox ${it.id}`,
              abatSocio ? "A reembolsar" : "",
              it.observacoes || "",
            ]
              .filter(Boolean)
              .join(" · "),
          });
          if (!ok) {
            duplicados += 1;
            limpar.add(it.id);
            continue;
          }
          fps.add(key);
          idsExist.add(movId);
          criados += 1;
          limpar.add(it.id);
        }
        for (const it of get().inboxItems || []) {
          if (it.status === "reconciliado" || it.status === "duplicado") limpar.add(it.id);
        }
        const kept = patched.filter((r) => !limpar.has(r.id));
        set({
          inboxItems: kept,
          movimentosBaiExtra: sortAndRecalcBai(get().movimentosBaiExtra || []),
        });
        get().pushAudit(
          "inbox_sync_bai",
          `${criados} criados no BAI · ${duplicados} já existiam · ${limpar.size} saíram da Inbox · ${kept.length} pendente(s)`,
        );
        return {
          criados,
          duplicados,
          ignorados,
          removidos: limpar.size,
          pendentes: kept.length,
        };
      },
      setActiveOperator: (name) => set({ activeOperator: name }),
      setOperatorName: (index, name) => {
        requireEdit(get);
        const ops = [...get().operators];
        if (index < 0 || index >= ops.length) return;
        const prev = ops[index];
        ops[index] = name.trim() || prev;
        const patch: Partial<ExtraState> = { operators: ops };
        if (get().activeOperator === prev) patch.activeOperator = ops[index];
        set(patch);
      },
      pushAudit: (action, detail) => {
        const by = get().activeOperator || "—";
        const entry = { at: new Date().toISOString(), by, action, detail };
        set({ auditLog: [entry, ...get().auditLog].slice(0, 500) });
      },
      pushSession: (action, detail = "") => {
        const by = get().activeOperator || "—";
        const entry = {
          at: new Date().toISOString(),
          by,
          action,
          detail: detail || (action === "entrada" ? "Início de sessão" : "Fim de sessão"),
        };
        set({ sessionLog: [entry, ...get().sessionLog].slice(0, 1000) });
      },
      addFundoPagamento: (p) => {
        requireEdit(get);
        const id = p.id || `RM-${Date.now().toString(36).slice(-6).toUpperCase()}`;
        const by = get().activeOperator || "—";
        const row = {
          id,
          data: p.data,
          descricao: p.descricao,
          valor: p.valor,
          recebeu: p.recebeu || "",
          obs: p.obs || "",
          atm: p.atm || "",
          criadoPor: by,
          createdAt: new Date().toISOString(),
        };
        set({ fundoExtra: [...get().fundoExtra, row] });
        get().pushAudit("fundo_criar", id);
        return row;
      },
      updateFundoPagamento: (id, patch) => {
        requireEdit(get);
        const inExtra = get().fundoExtra.some((x) => x.id === id);
        if (inExtra) {
          set({
            fundoExtra: get().fundoExtra.map((x) => (x.id === id ? { ...x, ...patch } : x)),
          });
        } else {
          const base = seed.fundoPagamentos.find((x) => x.id === id);
          if (base) {
            set({
              fundoExtra: [
                ...get().fundoExtra.filter((x) => x.id !== id),
                { ...base, ...patch, id },
              ],
            });
          }
        }
        get().pushAudit("fundo_editar", id);
      },
      removeFundoPagamento: (id) => {
        requireEdit(get);
        set({ fundoExtra: get().fundoExtra.filter((x) => x.id !== id) });
        get().pushAudit("fundo_apagar", id);
      },
      addFundoAtm: (input) => {
        requireEdit(get);
        const valor = Number(input.valor) || 0;
        if (valor <= 0) throw new Error("Indique um valor de levantamento maior que zero.");
        const data = input.data || new Date().toISOString().slice(0, 10);
        const id =
          input.id?.trim() ||
          `ATM-MAN-${data.replace(/-/g, "")}-${Math.round(valor)}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
        const existing = fundoAtmAll(get().fundoAtmExtra || []);
        if (existing.some((a) => a.id === id)) {
          throw new Error(`Já existe o bloco ATM ${id}.`);
        }
        const row: FundoAtm = { id, data, valor };
        set({ fundoAtmExtra: [...(get().fundoAtmExtra || []), row] });
        get().pushAudit(
          "fundo_atm_manual",
          `${id} · ${valor} · ${data}${input.obs ? ` · ${input.obs}` : ""} (sem débito BAI)`,
        );
        return id;
      },
      removeFundoAtm: (id) => {
        requireEdit(get);
        const extra = get().fundoAtmExtra || [];
        const inExtra = extra.some((a) => a.id === id);
        // Se o bloco veio do seed, "apagar" = sobrescrever com valor 0 via extra negativo? 
        // Preferimos registar exclusão colocando-o fora da lista unificada:
        // fundoAtmAll = seed filtrado por ids em extra + extra. Para esconder seed, 
        // marcamos com valor 0 e filtramos no all, ou removemos só de extra.
        if (inExtra) {
          set({ fundoAtmExtra: extra.filter((a) => a.id !== id) });
        } else {
          // Bloco só no seed: registar exclusão como extra com valor 0 e flag via id especial
          // Simples: adicionar stub excluído e filtrar em fundoAtmAll
          const tombstone: FundoAtm = { id, data: "1970-01-01", valor: 0 };
          set({
            fundoAtmExtra: [...extra.filter((a) => a.id !== id), tombstone],
          });
        }
        // Desligar pagamentos deste bloco (mantêm-se no histórico, sem origem ATM)
        const pags = get().fundoExtra || [];
        if (pags.some((p) => p.atm === id)) {
          set({
            fundoExtra: pags.map((p) => (p.atm === id ? { ...p, atm: "" } : p)),
          });
        }
        get().pushAudit("fundo_atm_apagar", `${id} (sem alteração BAI)`);
      },
      addCaptura: (input) => {
        requireEdit(get);
        const extras = get().extras;
        const prefix =
          input.tipo === "entrada"
            ? input.origem === "inscricao" || input.origem === "propina"
              ? "ENT"
              : "ENT"
            : input.origem === "socio"
              ? "SOC"
              : input.origem === "fundo"
                ? "CX"
                : input.origem === "cartao" || input.origem === "banco"
                  ? "BAI"
                  : "FRM";
        const id = nextMonthlyDoc(prefix, [...seed.lancamentosSocio, ...extras], input.data);
        const by = get().activeOperator || "—";
        const now = new Date().toISOString();
        const natureza = input.natureza || "normal";
        const row: Lancamento = {
          id,
          data: input.data,
          categoria: input.categoria,
          descricao: input.descricao,
          fornecedor: input.fornecedor,
          fatura: input.fatura,
          docInterno: id,
          tipo: input.tipo,
          valor: input.valor,
          pagamento: input.pagamento,
          observacoes: input.observacoes,
          origem: input.origem || "formulario",
          fonte: "Formulário / Foto",
          ficheiro: Boolean(input.foto),
          foto: input.foto,
          natureza,
          linkedId: input.linkedId,
          createdAt: now,
          criadoPor: by,
        };
        set({ extras: [...extras, row] });
        if (input.foto) set({ fotos: { ...get().fotos, [id]: input.foto } });
        // Liquidação de adiantamento: classifica a despesa mas NÃO debita BAI/fundo de novo
        // (o dinheiro já saiu no registo do adiantamento)
        // Sai da conta BAI (cartão TPA, transferência ou levantamento ATM)
        const saiDaContaBai =
          natureza !== "liquidacao" &&
          (input.origem === "cartao" || input.origem === "banco") &&
          input.tipo === "despesa" &&
          input.valor > 0;
        const entradaNaContaBai =
          input.origem === "cartao" && input.tipo === "entrada" && input.valor > 0;
        const isLevantamento =
          saiDaContaBai &&
          (/levantamento|atm/i.test(input.pagamento || "") ||
            /levantamento|atm/i.test(input.categoria || "") ||
            /levantamento|atm/i.test(input.descricao || "") ||
            input.pagamento === "Levantamento ATM BAI");

        if (saiDaContaBai) {
          const movs = movimentosAll(get().movimentosBaiExtra, get().baiOverride, get().movimentosBaiDeletedIds || []);
          const last = movs[movs.length - 1];
          const prevSaldo = last?.saldo ?? seed.escola.saldoInicialBai ?? 0;
          const saida = Number(input.valor) || 0;
          const tipoBai = isLevantamento
            ? "ATM"
            : input.origem === "banco"
              ? "TRANSF"
              : "CARTAO";
          const abatimento = isAbatimentoDividaSocio({
            descricao: input.descricao,
            observacoes: input.observacoes,
            categoria: input.categoria,
          });
          const descBase =
            input.descricao ||
            input.categoria ||
            (isLevantamento
              ? "Levantamento ATM BAI"
              : input.origem === "banco"
                ? "Transferência conta BAI"
                : "Despesa cartão BAI");
          const mov: MovimentoBai = {
            id: `APP-${id}`,
            linha: (last?.linha ?? 0) + 1,
            data: input.data,
            banco: `${tipoBai}-APP`,
            descricao: abatimento && !/a\s*reembolsar/i.test(descBase)
              ? `${descBase} · A reembolsar`
              : descBase,
            entrada: 0,
            saida,
            saldo: prevSaldo - saida,
            observacoes: [
              `Lançamento ${id}`,
              input.fornecedor ? String(input.fornecedor) : "",
              abatimento ? "A reembolsar" : "",
              input.observacoes && !abatimento ? String(input.observacoes).slice(0, 120) : "",
            ]
              .filter(Boolean)
              .join(" · "),
          };
          set({ movimentosBaiExtra: [...get().movimentosBaiExtra, mov] });
          get().pushAudit("bai_saida_app", `${mov.id} · -${saida} · ${tipoBai}`);

          // Levantamento: dinheiro sai do BAI e entra no fundo de maneio
          if (isLevantamento) {
            const atmId = `ATM-${id}`;
            const atmRow: FundoAtm = {
              id: atmId,
              data: input.data,
              valor: saida,
            };
            set({ fundoAtmExtra: [...(get().fundoAtmExtra || []), atmRow] });
            get().pushAudit("fundo_atm_app", `${atmId} · +${saida}`);
          }
        }
        if (entradaNaContaBai) {
          const movs = movimentosAll(get().movimentosBaiExtra, get().baiOverride, get().movimentosBaiDeletedIds || []);
          const last = movs[movs.length - 1];
          const prevSaldo = last?.saldo ?? seed.escola.saldoInicialBai ?? 0;
          const entrada = Number(input.valor) || 0;
          const mov: MovimentoBai = {
            id: `APP-${id}`,
            linha: (last?.linha ?? 0) + 1,
            data: input.data,
            banco: "CARTAO-APP",
            descricao: input.descricao || input.categoria || "Entrada conta BAI",
            entrada,
            saida: 0,
            saldo: prevSaldo + entrada,
            observacoes: `Lançamento ${id}`,
          };
          set({ movimentosBaiExtra: [...get().movimentosBaiExtra, mov] });
          get().pushAudit("bai_entrada_app", `${mov.id} · +${entrada}`);
        }
        get().pushAudit("criar_lancamento", `${id} · ${row.descricao} · ${row.valor}`);
        return row;
      },
      addAluno: (aluno) => {
        requireEdit(get);
        const by = get().activeOperator || "—";
        const now = new Date().toISOString();
        const row = {
          ...aluno,
          criadoPor: by,
          createdAt: aluno.createdAt || now,
          updatedAt: now,
        };
        // Garantir que o novo ID não fica na lista de apagados
        const deleted = (get().alunosDeletedIds || []).filter((id) => id !== row.id);
        const extras = [
          ...(get().alunosExtra || []).filter((a) => a.id !== row.id),
          row,
        ];
        set({ alunosExtra: extras, alunosDeletedIds: deleted });
        persistAlunosCensoLocal(extras);
        get().pushAudit("criar_aluno", `${row.id} · ${row.nome}`);

        // Sincronizar com Propinas: criar linha de mensalidade se ainda não existir
        const jaTemPropina = (get().mensalidades || []).some((m) => m.id === row.id);
        if (!jaTemPropina) {
          const propMes = tarifaPropinaAluno(row);
          const nMeses = Math.min(
            Math.max(0, Number(row.mesesPropina) || 0),
            MESES_PROPINA_ADIANTADOS.length,
          );
          const pagamentos: Record<string, number> = {};
          const pagamentosEm: Record<string, string> = {};
          // Meses já liquidados no acto da matrícula → marcados em Propinas (sem novo BAI)
          if (nMeses > 0 && propMes > 0) {
            for (let i = 0; i < nMeses; i++) {
              const mesKey = MESES_PROPINA_ADIANTADOS[i];
              pagamentos[mesKey] = propMes;
              if (row.dataPag) pagamentosEm[mesKey] = row.dataPag;
            }
            // Legado: mapping antigo começava em "set" — remover se igual à propina adiantada
            moverSetembroParaOutubro(pagamentos, pagamentosEm);
          }
          set({
            mensalidades: [
              ...(get().mensalidades || []),
              {
                id: row.id,
                nome: row.nome,
                turma: row.turma || "",
                propina: propMes,
                pagamentos,
                pagamentosEm,
                obs: row.obs || "",
              } as import("@/data/types").Mensalidade,
            ],
          });
          get().pushAudit("propina_sync_matricula", `${row.id} · ${row.nome}`);
        }

        // Entradas BAI por rubrica (só cartão / transferência — dinheiro não debita extrato)
        const viaBai = (met: string) => {
          const m = (met || "").toLowerCase();
          // Depósito em dinheiro na conta da escola = entrada no extrato BAI
          if (/dep[oó]sito/i.test(m)) return true;
          if (/cart[aã]o|multicaixa|transfer|tpa/i.test(m)) return true;
          // "Dinheiro (em mão)" não entra no BAI
          if (/em m[aã]o|caixa/i.test(m)) return false;
          if (m.includes("dinheiro") && !/dep[oó]sito|conta|bai|banco/i.test(m)) return false;
          return /bai|banco|conta/i.test(m);
        };
        const bancoDe = (met: string) => {
          const m = met || "";
          if (/dep[oó]sito/i.test(m)) return "DEPOSITO-APP";
          if (/transfer/i.test(m)) return "TRANSF-APP";
          return "CARTAO-APP";
        };
        const dataPag = row.dataPag || new Date().toISOString().slice(0, 10);
        const mp = row.metodosPagamento || {};
        const defMet = row.metodoPagamento || "Dinheiro";
        const m = (k: keyof NonNullable<typeof mp>, fallback = defMet) =>
          (mp as Record<string, string | undefined>)[k] || fallback;
        const parcelas: { key: string; label: string; valor: number; met: string }[] = [
          { key: "INS", label: "Inscrição", valor: Number(row.inscricao) || 0, met: m("inscricao") },
          { key: "SEG", label: "Seguro", valor: Number(row.seguro) || 0, met: m("seguro") },
          { key: "MAN", label: "Manuais", valor: Number(row.manuais) || 0, met: m("manuais") },
          { key: "CAD", label: "Cadernos", valor: Number(row.cadernos) || 0, met: m("cadernos") },
          { key: "ATL", label: "ATL", valor: Number(row.extras) || 0, met: m("atl") },
          { key: "UNI", label: "Uniforme", valor: Number(row.uniforme) || 0, met: m("uniforme") },
          { key: "MES", label: "Mensalidade/propina", valor: Number(row.mensalidade1) || 0, met: m("mensalidade") },
          { key: "TRP", label: "Transporte", valor: Number(row.transporte) || 0, met: m("transporte") },
          { key: "ALI", label: "Alimentação", valor: Number(row.alimentacao) || 0, met: m("alimentacao") },
          { key: "CUR", label: "Curso", valor: Number(row.curso) || 0, met: m("curso") },
          {
            key: "CAR",
            label: "Cartão de estudante",
            valor: Number(row.cartaoEstudante) || 0,
            met: m("cartaoEstudante"),
          },
        ];
        // Se não há split e método único via BAI, um só movimento (compatibilidade)
        const mets = new Set(parcelas.filter((p) => p.valor > 0).map((p) => p.met));
        if (mets.size <= 1 && viaBai([...mets][0] || row.metodoPagamento || "")) {
          const valor = Number(row.liquido) || 0;
          const met = [...mets][0] || row.metodoPagamento || "";
          if (valor > 0) {
            const ok = pushBaiMovimento(get, set, {
              id: `APP-MAT-${row.id}`,
              data: dataPag,
              entrada: valor,
              banco: bancoDe(met),
              descricao: `Matrícula ${row.nome} (${row.id})`,
              observacoes: `Método: ${met} · recibo ${row.recibo || ""}`,
            });
            if (ok) get().pushAudit("bai_entrada_matricula", `${row.id} · +${valor}`);
          }
        } else {
          for (const p of parcelas) {
            if (!(p.valor > 0) || !viaBai(p.met)) continue;
            const ok = pushBaiMovimento(get, set, {
              id: `APP-MAT-${row.id}-${p.key}`,
              data: dataPag,
              entrada: p.valor,
              banco: bancoDe(p.met),
              descricao: `Matrícula ${p.label} · ${row.nome} (${row.id})`,
              observacoes: `Método: ${p.met} · recibo ${row.recibo || ""}`,
            });
            if (ok) get().pushAudit("bai_entrada_matricula", `${row.id}-${p.key} · +${p.valor}`);
          }
        }
      },
      updateAluno: (id, patch) => {
        requireEdit(get);
        const ops = get().operators;
        const by = get().activeOperator || "—";
        // Apenas o Colaborador 1 (primeiro da lista) pode editar alunos
        if (by !== ops[0]) {
          throw new Error("Apenas o Colaborador 1 pode editar dados de alunos.");
        }
        const inExtra = get().alunosExtra.some((a) => a.id === id);
        if (inExtra) {
          set({
            alunosExtra: get().alunosExtra.map((a) =>
              a.id === id
                ? { ...a, ...patch, editadoPor: by, updatedAt: new Date().toISOString() }
                : a,
            ),
          });
        } else {
          const prev = get().alunosOverrides[id] ?? {};
          set({
            alunosOverrides: {
              ...get().alunosOverrides,
              [id]: { ...prev, ...patch, editadoPor: by, updatedAt: new Date().toISOString() },
            },
          });
        }
        get().pushAudit("editar_aluno", `${id} · ${Object.keys(patch).join(", ")}`);
        // Manter Propinas alinhada com a matrícula (criar linha se faltar)
        const mens = get().mensalidades || [];
        const tem = mens.some((m) => m.id === id);
        if (!tem) {
          const src =
            get().alunosExtra.find((a) => a.id === id) ||
            (getSeed().alunos || []).find((a) => a.id === id);
          const merged = { ...(src || {}), ...(get().alunosOverrides[id] || {}), ...patch } as Aluno;
          set({
            mensalidades: [
              ...mens,
              {
                id,
                nome: String(merged.nome || id),
                turma: String(merged.turma || ""),
                propina: Number(merged.propina) || 0,
                pagamentos: {},
                obs: String(merged.obs || ""),
              },
            ],
          });
        } else if (
          patch.propina != null ||
          patch.nome != null ||
          patch.turma != null ||
          patch.mesesPropina != null ||
          patch.dataPag != null
        ) {
          const src =
            get().alunosExtra.find((a) => a.id === id) ||
            (getSeed().alunos || []).find((a) => a.id === id);
          const merged = {
            ...(src || {}),
            ...(get().alunosOverrides[id] || {}),
            ...patch,
          } as Aluno;
          const propMes = Number(merged.propina) || 0;
          const nMeses = Math.min(
            Math.max(0, Number(merged.mesesPropina) || 0),
            MESES_PROPINA_ADIANTADOS.length,
          );
          set({
            mensalidades: mens.map((m) => {
              if (m.id !== id) return m;
              const pagamentos = { ...(m.pagamentos || {}) };
              const pagamentosEm = { ...((m as { pagamentosEm?: Record<string, string> }).pagamentosEm || {}) };
              // Marcar meses já liquidados na matrícula (sem apagar pagamentos posteriores manuais)
              if (nMeses > 0 && propMes > 0) {
                for (let i = 0; i < nMeses; i++) {
                  const mesKey = MESES_PROPINA_ADIANTADOS[i];
                  if (!pagamentos[mesKey] || pagamentos[mesKey] <= 0) {
                    pagamentos[mesKey] = propMes;
                    if (merged.dataPag) pagamentosEm[mesKey] = String(merged.dataPag);
                  }
                }
              }
              return {
                ...m,
                propina: patch.propina != null ? Number(patch.propina) : m.propina,
                nome: patch.nome != null ? String(patch.nome) : m.nome,
                turma: patch.turma != null ? String(patch.turma) : m.turma,
                pagamentos,
                pagamentosEm,
              };
            }),
          });
        }
      },
      setMensalidade: (id, mes, valor) => {
        requireEdit(get);
        const nextVal = Number(valor) || 0;
        set({
          mensalidades: get().mensalidades.map((m) =>
            m.id === id ? { ...m, pagamentos: { ...m.pagamentos, [mes]: nextVal } } : m,
          ),
        });
        get().pushAudit("propina", `${id} · ${mes} · ${nextVal}`);
      },
      /** Cria em Propinas as linhas em falta e marca meses já pagos na matrícula. */
      syncPropinasFromMatriculas: () => {
        const alunos = alunosAll(
          get().alunosExtra || [],
          get().alunosOverrides || {},
          get().alunosDeletedIds || [],
        );
        const mens = [...(get().mensalidades || [])];
        const byId = new Map(mens.map((m) => [m.id, m]));
        let added = 0;
        let updated = 0;
        for (const a of alunos) {
          const propMes = tarifaPropinaAluno(a);
          const nMeses = Math.min(
            Math.max(0, inferMesesAdiantados(a)),
            MESES_PROPINA_ADIANTADOS.length,
          );
          const pagamentos: Record<string, number> = {};
          const pagamentosEm: Record<string, string> = {};
          if (nMeses > 0 && propMes > 0) {
            for (let i = 0; i < nMeses; i++) {
              const mesKey = MESES_PROPINA_ADIANTADOS[i];
              pagamentos[mesKey] = propMes;
              if (a.dataPag) pagamentosEm[mesKey] = String(a.dataPag);
            }
          }
          const existing = byId.get(a.id);
          if (!existing) {
            mens.push({
              id: a.id,
              nome: a.nome,
              turma: a.turma || "",
              propina: propMes,
              pagamentos,
              pagamentosEm,
              obs: a.obs || "",
            } as import("@/data/types").Mensalidade);
            added += 1;
          } else if (nMeses <= 0) {
            const nextPag = { ...(existing.pagamentos || {}) };
            const nextEm = { ...((existing as { pagamentosEm?: Record<string, string> }).pagamentosEm || {}) };
            let changed = false;
            const dataPag = String(a.dataPag || "");
            for (const mesKey of MESES_PROPINA_ADIANTADOS) {
              const em = String(nextEm[mesKey] || "");
              const v = Number(nextPag[mesKey] || 0);
              const auto = (dataPag && em === dataPag) || (propMes > 0 && v === propMes);
              if (auto && v > 0) {
                delete nextPag[mesKey];
                delete nextEm[mesKey];
                changed = true;
              }
            }
            if (changed) {
              const idx = mens.findIndex((row) => row.id === a.id);
              if (idx >= 0) {
                mens[idx] = { ...mens[idx], pagamentos: nextPag, pagamentosEm: nextEm };
                updated += 1;
              }
            }
          } else if (nMeses > 0 && propMes > 0) {
            // Preencher apenas meses ainda a zero (não sobrescrever pagamentos manuais)
            const nextPag = { ...(existing.pagamentos || {}) };
            const nextEm = { ...((existing as { pagamentosEm?: Record<string, string> }).pagamentosEm || {}) };
            let changed = false;
            for (const [k, v] of Object.entries(pagamentos)) {
              if (k === "set") continue;
              if (!nextPag[k] || nextPag[k] <= 0) {
                nextPag[k] = v;
                if (pagamentosEm[k]) nextEm[k] = pagamentosEm[k];
                changed = true;
              }
            }
            moverSetembroParaOutubro(nextPag, nextEm);
            // Corrigir legado: mesesPropina contava a partir de "set"; agora a 1.ª é "out"
            if (
              nextPag.set === propMes &&
              nMeses > 0 &&
              !(MESES_PROPINA_ADIANTADOS as readonly string[]).slice(0, nMeses).includes("set")
            ) {
              // Só remove "set" se "out" ficou (ou vai ficar) marcado pelo adiantamento
              if (nextPag.out === propMes || pagamentos.out === propMes) {
                delete nextPag.set;
                delete nextEm.set;
                changed = true;
              }
            }
            if (changed) {
              const idx = mens.findIndex((m) => m.id === a.id);
              if (idx >= 0) {
                mens[idx] = { ...mens[idx], pagamentos: nextPag, pagamentosEm: nextEm, propina: propMes || mens[idx].propina };
                updated += 1;
              }
            }
          }
        }
        if (added || updated) {
          set({ mensalidades: mens });
          get().pushAudit(
            "propina_backfill",
            `${added} criado(s), ${updated} actualizado(s) com meses pagos na matrícula`,
          );
        }
        const pruned = reporPropinasFromMatriculas();
        return added + updated + pruned.removidos;
      },
      reporPropinasFromMatriculas: () => reporPropinasFromMatriculas(),
      detectarIrmaosEAplicarDescontos: () => {
        const alunos = alunosAll(
          get().alunosExtra || [],
          get().alunosOverrides || {},
          get().alunosDeletedIds || [],
        );
        const norm = (s?: string) =>
          (s || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
        const byPai = new Map<string, string[]>();
        const byMae = new Map<string, string[]>();
        for (const a of alunos) {
          const p = norm(a.pai);
          const m = norm(a.mae);
          if (p.length > 4) {
            const list = byPai.get(p) || [];
            list.push(a.id);
            byPai.set(p, list);
          }
          if (m.length > 4) {
            const list = byMae.get(m) || [];
            list.push(a.id);
            byMae.set(m, list);
          }
        }
        const nivelPorId = new Map<string, 0 | 2 | 3>();
        const applyGroup = (ids: string[]) => {
          const uniq = [...new Set(ids)];
          if (uniq.length < 2) return;
          const nivel: 0 | 2 | 3 = uniq.length >= 3 ? 3 : 2;
          for (const id of uniq) {
            const prev = nivelPorId.get(id) || 0;
            if (nivel > prev) nivelPorId.set(id, nivel);
          }
        };
        for (const ids of byPai.values()) applyGroup(ids);
        for (const ids of byMae.values()) applyGroup(ids);

        let updated = 0;
        const overrides = { ...(get().alunosOverrides || {}) };
        const extras = [...(get().alunosExtra || [])];
        for (const a of alunos) {
          if (a.transferidoCampusCidade) {
            // Garantir 0 para transferidos
            if ((a.irmaosNivel || 0) !== 0) {
              const inExtra = extras.some((e) => e.id === a.id);
              if (inExtra) {
                for (let i = 0; i < extras.length; i++) {
                  if (extras[i].id === a.id) {
                    extras[i] = { ...extras[i], irmaosNivel: 0 };
                    updated += 1;
                  }
                }
              } else {
                overrides[a.id] = { ...(overrides[a.id] || {}), irmaosNivel: 0 };
                updated += 1;
              }
            }
            continue;
          }
          const detected = nivelPorId.get(a.id) || 0;
          const current = (Number(a.irmaosNivel) || 0) as 0 | 2 | 3;
          // Só sobe ou preenche se estava 0; não reduz ajuste manual superior
          if (detected > 0 && current === 0) {
            const inExtra = extras.some((e) => e.id === a.id);
            if (inExtra) {
              for (let i = 0; i < extras.length; i++) {
                if (extras[i].id === a.id) {
                  extras[i] = { ...extras[i], irmaosNivel: detected };
                  updated += 1;
                }
              }
            } else {
              overrides[a.id] = {
                ...(overrides[a.id] || {}),
                irmaosNivel: detected,
              };
              updated += 1;
            }
          }
        }
        if (updated > 0) {
          set({ alunosOverrides: overrides, alunosExtra: extras });
          get().pushAudit("irmaos_detect", `${updated} aluno(s) com desconto de irmãos`);
        }
        return updated;
      },

      alinharCampusPorFamilia: () => {
        const alunos = alunosAll(
          get().alunosExtra || [],
          get().alunosOverrides || {},
          get().alunosDeletedIds || [],
        );
        const norm = (s?: string) =>
          (s || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
        const groups = new Map<string, string[]>();
        const addTo = (key: string, id: string) => {
          if (!key || key.length < 3) return;
          const list = groups.get(key) || [];
          if (!list.includes(id)) list.push(id);
          groups.set(key, list);
        };
        for (const a of alunos) {
          const fam = norm(a.familia);
          const pai = norm(a.pai);
          const mae = norm(a.mae);
          if (fam) addTo(`fam:${fam}`, a.id);
          if (pai.length > 4) addTo(`pai:${pai}`, a.id);
          if (mae.length > 4) addTo(`mae:${mae}`, a.id);
          const parts = norm(a.nome).split(" ").filter(Boolean);
          if (parts.length >= 1) {
            const last = parts[parts.length - 1];
            if (last.length >= 4) addTo(`sn:${last}`, a.id);
          }
          if (parts.length >= 2) {
            const last2 = `${parts[parts.length - 2]} ${parts[parts.length - 1]}`;
            if (last2.length >= 6) addTo(`sn2:${last2}`, a.id);
          }
        }
        const byId = new Map(alunos.map((a) => [a.id, a]));
        const target = new Map<string, boolean>();
        let familiasMistas = 0;
        for (const ids of groups.values()) {
          if (ids.length < 2) continue;
          let campus = 0;
          let nova = 0;
          for (const id of ids) {
            const a = byId.get(id);
            if (!a) continue;
            if (a.transferidoCampusCidade) campus += 1;
            else nova += 1;
          }
          if (campus === 0 || nova === 0) continue;
          familiasMistas += 1;
          const wantCampus = campus > nova;
          for (const id of ids) target.set(id, wantCampus);
        }
        let alunosAlterados = 0;
        const overrides = { ...(get().alunosOverrides || {}) };
        const extras = [...(get().alunosExtra || [])];
        for (const [id, want] of target) {
          const a = byId.get(id);
          if (!a) continue;
          if (Boolean(a.transferidoCampusCidade) === want) continue;
          const inExtra = extras.some((e) => e.id === id);
          if (inExtra) {
            for (let i = 0; i < extras.length; i++) {
              if (extras[i].id === id) {
                extras[i] = { ...extras[i], transferidoCampusCidade: want };
              }
            }
          } else {
            overrides[id] = {
              ...(overrides[id] || {}),
              transferidoCampusCidade: want,
            };
          }
          alunosAlterados += 1;
        }
        if (alunosAlterados > 0) {
          set({ alunosOverrides: overrides, alunosExtra: extras });
        }
        const after = alunosAll(
          get().alunosExtra || [],
          get().alunosOverrides || {},
          get().alunosDeletedIds || [],
        );
        const nCampus = after.filter((a) => a.transferidoCampusCidade).length;
        return {
          familiasMistas,
          alunosAlterados,
          campus: nCampus,
          novaVida: after.length - nCampus,
        };
      },

      importCensoAlunos: (incoming, mensIncoming = []) => {
        requireEdit(get);
        const seedIds = new Set(seed.alunos.map((a) => a.id));
        const deleted = new Set(get().alunosDeletedIds || []);
        const extras = [...(get().alunosExtra || [])];
        const extraIds = new Set(extras.map((a) => a.id));
        const overrides = { ...(get().alunosOverrides || {}) };
        let fused = 0;

        const norm = (n: string) =>
          (n || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
        const extraNames = new Set(extras.map((a) => norm(a.nome)));
        for (const a of seed.alunos) extraNames.add(norm(a.nome));

        for (const raw of incoming || []) {
          if (!raw?.id || !raw?.nome) continue;
          if (deleted.has(raw.id)) continue;
          const clean: Aluno = { ...raw };
          delete (clean as { foto?: string }).foto;
          if (seedIds.has(clean.id)) {
            const prev = overrides[clean.id] || {};
            overrides[clean.id] = { ...prev, ...clean, id: clean.id };
            fused += 1;
            continue;
          }
          const idx = extras.findIndex((x) => x.id === clean.id);
          if (idx >= 0) {
            extras[idx] = { ...extras[idx], ...clean, id: clean.id };
            fused += 1;
            continue;
          }
          if (extraNames.has(norm(clean.nome))) {
            fused += 1;
            continue;
          }
          extras.push(clean);
          extraIds.add(clean.id);
          extraNames.add(norm(clean.nome));
          fused += 1;
        }

        const mens = [...(get().mensalidades || [])];
        const mensIds = new Set(mens.map((m) => m.id));
        for (const m of mensIncoming || []) {
          if (!m?.id) continue;
          const i = mens.findIndex((x) => x.id === m.id);
          if (i >= 0) {
            mens[i] = {
              ...mens[i],
              ...m,
              pagamentos: { ...(mens[i].pagamentos || {}), ...(m.pagamentos || {}) },
              pagamentosEm: { ...(mens[i].pagamentosEm || {}), ...(m.pagamentosEm || {}) },
            };
          } else if (!mensIds.has(m.id)) {
            mens.push(m);
            mensIds.add(m.id);
          }
        }

        set({
          alunosExtra: extras,
          alunosOverrides: overrides,
          mensalidades: mens,
        });
        get().pushAudit("import_censo", `${fused} aluno(s) · ${incoming.length} no ficheiro`);
        return fused;
      },
      /** Confirma o valor da propina no mês e regista entrada no Banco BAI (id estável por aluno+mês).
       *  Se o valor digitado for maior que a tarifa, a diferença fica como crédito
       *  na conta corrente — o BAI recebe o valor integral uma só vez. */
      confirmPropinaBai: (id, mes) => {
        requireEdit(get);
        if (mes === "set") {
          const row0 = get().mensalidades.find((m) => m.id === id);
          const vSet = Number(row0?.pagamentos?.set || 0);
          if (vSet > 0) {
            set({
              mensalidades: get().mensalidades.map((m) =>
                m.id === id
                  ? {
                      ...m,
                      pagamentos: { ...m.pagamentos, out: m.pagamentos.out || vSet, set: 0 },
                      pagamentosEm: { ...(m.pagamentosEm || {}), out: m.pagamentosEm?.out || m.pagamentosEm?.set || "" },
                    }
                  : m,
              ),
            });
          }
          mes = "out";
        }
        const row = get().mensalidades.find((m) => m.id === id);
        if (!row) return { ok: false, message: "Aluno não encontrado em Propinas." };
        const valorDigitado = Number(row.pagamentos?.[mes] || 0);
        if (valorDigitado <= 0) return { ok: false, message: "Indique um valor pago maior que zero antes de salvar." };
        const tarifa =
          Number(row.propina) ||
          tarifaPropinaAluno({
            propina: row.propina,
            turma: row.turma,
          }) ||
          valorDigitado;
        const excedente = tarifa > 0 ? Math.max(0, Math.round(valorDigitado - tarifa)) : 0;
        const alocado = excedente > 0 ? tarifa : valorDigitado;
        const movId = `APP-PROP-${id}-${mes}`;
        const hoje = new Date().toISOString().slice(0, 10);
        const ccPrev = (get().contaCorrente || []).filter(
          (c) => !(c.alunoId === id && c.mes === mes && c.tipo === "credito" && c.baiId === movId),
        );
        let ccNext = ccPrev;
        if (excedente > 0) {
          const seq = ccPrev.filter((c) => c.alunoId === id).length + 1;
          ccNext = [
            ...ccPrev,
            {
              id: `CC-${id}-${mes}-${Date.now()}`,
              alunoId: id,
              data: hoje,
              tipo: "credito" as const,
              valor: excedente,
              mes,
              descricao: `Excedente propina ${mes} (recebido ${valorDigitado} · tarifa ${tarifa})`,
              doc: `CC-${id}-${String(seq).padStart(4, "0")}`,
              baiId: movId,
              criadoPor: get().activeOperator,
            },
          ];
        }
        // Remove movimento anterior do mesmo aluno/mês (re-sincronizar)
        set({
          movimentosBaiExtra: (get().movimentosBaiExtra || []).filter((m) => m.id !== movId),
          mensalidades: get().mensalidades.map((m) =>
            m.id === id
              ? {
                  ...m,
                  pagamentos: { ...m.pagamentos, [mes]: alocado },
                  pagamentosEm: { ...(m.pagamentosEm || {}), [mes]: hoje },
                }
              : m,
          ),
          contaCorrente: ccNext,
        });
        const ok = pushBaiMovimento(get, set, {
          id: movId,
          data: hoje,
          entrada: valorDigitado,
          banco: "PROPINA-APP",
          descricao:
            excedente > 0
              ? `Propina ${mes} ${alocado} + crédito ${excedente} · ${row.nome}`
              : `Propina ${mes} · ${row.nome}`,
          observacoes: `Aluno ${id} · confirmado Departamento de Finanças${
            excedente > 0 ? ` · crédito ${excedente} Kz` : ""
          }`,
        });
        if (!ok) return { ok: false, message: "Não foi possível registar no BAI." };
        get().pushAudit(
          "bai_entrada_propina",
          `${id} · ${mes} · recebido ${valorDigitado} · alocado ${alocado}${
            excedente > 0 ? ` · crédito ${excedente}` : ""
          }`,
        );
        const pontual = propinaNoPrazo(mes, hoje);
        const base = pontual
          ? `Propina ${mes} · ${row.nome}: ${alocado} Kz no prazo (Pago).`
          : `Propina ${mes} · ${row.nome}: ${alocado} Kz fora do prazo (Pago c/ multa).`;
        return {
          ok: true,
          message:
            excedente > 0
              ? `${base} Recebido ${valorDigitado} Kz no BAI. Crédito ${excedente} Kz na conta corrente (sem 2.ª entrada).`
              : `${base} ${valorDigitado} Kz no BAI.`,
        };
      },
      saldoCreditoAluno: (id) => saldoCreditoDe(get().contaCorrente || [], id),
      aplicarCreditoPropina: (id, mes) => {
        requireEdit(get);
        const row = get().mensalidades.find((m) => m.id === id);
        if (!row) return { ok: false, message: "Aluno não encontrado em Propinas.", aplicado: 0 };
        const tarifa =
          Number(row.propina) ||
          tarifaPropinaAluno({ propina: row.propina, turma: row.turma }) ||
          0;
        const ja = Number(row.pagamentos?.[mes] || 0);
        const falta = Math.max(0, tarifa - ja);
        const saldo = saldoCreditoDe(get().contaCorrente || [], id);
        if (saldo <= 0) return { ok: false, message: "Este aluno não tem crédito disponível.", aplicado: 0 };
        if (falta <= 0) return { ok: false, message: "Este mês já está liquidado. Nada a aplicar.", aplicado: 0 };
        const aplicado = Math.min(saldo, falta);
        const hoje = new Date().toISOString().slice(0, 10);
        const seq = (get().contaCorrente || []).filter((c) => c.alunoId === id).length + 1;
        const mov: ContaCorrenteMov = {
          id: `CC-APL-${id}-${mes}-${Date.now()}`,
          alunoId: id,
          data: hoje,
          tipo: "aplicacao",
          valor: aplicado,
          mes,
          descricao: `Aplicação de crédito à propina ${mes}`,
          doc: `CC-${id}-${String(seq).padStart(4, "0")}`,
          criadoPor: get().activeOperator,
        };
        set({
          mensalidades: get().mensalidades.map((m) =>
            m.id === id
              ? {
                  ...m,
                  pagamentos: { ...m.pagamentos, [mes]: ja + aplicado },
                  pagamentosEm: { ...(m.pagamentosEm || {}), [mes]: hoje },
                }
              : m,
          ),
          contaCorrente: [...(get().contaCorrente || []), mov],
        });
        get().pushAudit("cc_aplicar", `${id} · ${mes} · ${aplicado}`);
        return {
          ok: true,
          aplicado,
          message: `Aplicados ${aplicado} Kz de crédito a ${mes} · ${row.nome}. Sem movimento BAI (já recebido).`,
        };
      },
      setFoto: (id, dataUrl) => {
        requireEdit(get);
        set({ fotos: { ...get().fotos, [id]: dataUrl } });
      },
      updateExtra: (id, patch) => {
        requireEdit(get);
        const by = get().activeOperator || "—";
        set({
          extras: get().extras.map((e) =>
            e.id === id
              ? { ...e, ...patch, editadoPor: by, updatedAt: new Date().toISOString() }
              : e,
          ),
        });
        get().pushAudit("editar_lancamento", `${id}`);
      },
      removeExtra: (id) => {
        requireEdit(get);
        get().pushAudit("apagar_lancamento", id);
        set({ extras: get().extras.filter((e) => e.id !== id) });
      },
      addRecibosSalario: (rows: ReciboSalario[]) => {
        requireEdit(get);
        const prev = get().recibosSalario || [];
        const ids = new Set(prev.map((r) => r.id));
        const merged = [...prev];
        for (const r of rows) {
          if (ids.has(r.id)) {
            const i = merged.findIndex((x) => x.id === r.id);
            if (i >= 0) merged[i] = r;
          } else {
            merged.push(r);
            ids.add(r.id);
          }
        }
        set({ recibosSalario: merged });
        get().pushAudit("recibos_salario", `${rows.length} recibo(s)`);
      },
      removeReciboSalario: (id) => {
        requireEdit(get);
        const prev = (get().recibosSalario || []).find((r) => r.id === id);
        if (!prev) return;
        set({
          recibosSalario: (get().recibosSalario || []).filter((r) => r.id !== id),
        });
        // Se estava pago, remover movimento BAI associado
        const movId = `APP-SAL-${id}`;
        set({
          movimentosBaiExtra: (get().movimentosBaiExtra || []).filter((m) => m.id !== movId),
        });
        get().pushAudit("recibo_salario_apagar", `${id} · ${prev.nome} · ${prev.mes}`);
      },
      /** Alterar mês de referência / data de pagamento do recibo (ex.: Agosto pago em Setembro). */
      updateReciboSalario: (
        id: string,
        patch: Partial<Pick<ReciboSalario, "mes" | "mesKey" | "dataPag" | "diasTrab" | "diasUteis" | "liquido">>,
      ) => {
        requireEdit(get);
        const prev = (get().recibosSalario || []).find((r) => r.id === id);
        if (!prev) return;
        set({
          recibosSalario: (get().recibosSalario || []).map((r) =>
            r.id === id ? { ...r, ...patch } : r,
          ),
        });
        // Se já estava pago no BAI, actualizar descrição / data do movimento
        const movId = `APP-SAL-${id}`;
        const movs = get().movimentosBaiExtra || [];
        if (movs.some((m) => m.id === movId)) {
          const mes = patch.mes ?? prev.mes;
          const data = patch.dataPag ?? prev.dataPag;
          set({
            movimentosBaiExtra: sortAndRecalcBai(
              movs.map((m) =>
                m.id === movId
                  ? {
                      ...m,
                      data: data || m.data,
                      descricao: `Honorários / salário · ${prev.nome} · ${mes}`,
                    }
                  : m,
              ),
            ),
          });
        }
        get().pushAudit(
          "recibo_salario_editar",
          `${id} · ${Object.keys(patch).join(", ")} · ${patch.mes || prev.mes}`,
        );
      },
      setReciboSalarioPago: (id: string, pago: boolean, dataPag?: string) => {
        requireEdit(get);
        const prev = (get().recibosSalario || []).find((r) => r.id === id);
        const movId = `APP-SAL-${id}`;
        const jaNoBai = (get().movimentosBaiExtra || []).some((m) => m.id === movId);

        set({
          recibosSalario: (get().recibosSalario || []).map((r) =>
            r.id === id
              ? { ...r, pago, dataPag: dataPag || r.dataPag || new Date().toISOString().slice(0, 10) }
              : r,
          ),
        });

        // Marcar pago → debita BAI só se o movimento ainda NÃO existir (não duplica)
        if (prev && pago && prev.liquido > 0) {
          if (!jaNoBai) {
            const saida = Number(prev.liquido) || 0;
            const mov: MovimentoBai = {
              id: movId,
              linha: 0,
              data: dataPag || prev.dataPag || new Date().toISOString().slice(0, 10),
              banco: "SALARIO-APP",
              descricao: `Honorários / salário · ${prev.nome} · ${prev.mes}`,
              entrada: 0,
              saida,
              saldo: 0,
              observacoes: `Recibo ${id} · pago → debita BAI`,
            };
            set({
              movimentosBaiExtra: sortAndRecalcBai([
                ...(get().movimentosBaiExtra || []),
                mov,
              ]),
            });
            get().pushAudit("bai_saida_salario", `${movId} · -${saida}`);
          }
          // Se já estava no extrato: só alinha o botão, sem novo lançamento
        }

        // Desmarcar pago → remove débito BAI
        if (prev && !pago) {
          if (jaNoBai) {
            set({
              movimentosBaiExtra: sortAndRecalcBai(
                (get().movimentosBaiExtra || []).filter((m) => m.id !== movId),
              ),
            });
            get().pushAudit("bai_estorno_salario", movId);
          }
        }
        get().pushAudit("recibo_salario_pago", `${id} · ${pago}`);
      },
      addAdiantamentoSalario: ({ funcionarioId, valor, dataPag, mesKey, mesLabel, nota }) => {
        requireEdit(get);
        const v = Math.round(Number(valor) || 0);
        if (v <= 0) throw new Error("Indique o valor do adiantamento.");
        const staff = salariosAll(
          get().salariosExtra || [],
          get().salariosOverrides || {},
          get().salariosDeletedIds || [],
        ).find((s) => s.id === funcionarioId);
        if (!staff) throw new Error("Funcionário não encontrado.");
        const id = `AD-${funcionarioId}-${Date.now().toString(36)}`;
        const row: ReciboSalario = {
          id,
          funcionarioId,
          nome: staff.nome,
          funcao: staff.funcao,
          mes: `Adiantamento · ${mesLabel}`,
          mesKey,
          diasUteis: 0,
          diasTrab: 0,
          salarioBruto: v,
          descontoDias: 0,
          outrosDesc: 0,
          liquido: v,
          dataPag: dataPag || new Date().toISOString().slice(0, 10),
          pago: true,
          iban: staff.iban,
          criadoEm: new Date().toISOString(),
          tipo: "adiantamento",
          nota: nota || undefined,
        };
        set({ recibosSalario: [...(get().recibosSalario || []), row] });
        const movId = `APP-SAL-${id}`;
        const mov: MovimentoBai = {
          id: movId,
          linha: 0,
          data: row.dataPag,
          banco: "SALARIO-APP",
          descricao: `Adiantamento honorários · ${staff.nome} · ${mesLabel}`,
          entrada: 0,
          saida: v,
          saldo: 0,
          observacoes: nota
            ? `Adiantamento ${id} · ${nota}`
            : `Adiantamento ${id} · descontar na folha de ${mesLabel}`,
        };
        set({
          movimentosBaiExtra: sortAndRecalcBai([...(get().movimentosBaiExtra || []), mov]),
        });
        get().pushAudit("adiantamento_salario", `${staff.nome} · ${v} · ${mesLabel}`);
        return row;
      },
      reconcileSalariosBai: () => {
        const recibos = get().recibosSalario || [];
        const movs = get().movimentosBaiExtra || [];
        if (!recibos.length) return false;
        const byId = new Set(movs.map((m) => m.id));
        let changed = false;
        const next = recibos.map((r) => {
          const movId = `APP-SAL-${r.id}`;
          const has =
            byId.has(movId) ||
            movs.some(
              (m) =>
                (m.observacoes || "").includes(r.id) ||
                ((m.banco || "").toUpperCase().includes("SALARIO") &&
                  (m.descricao || "").includes(r.nome)),
            );
          if (has && !r.pago) {
            changed = true;
            return { ...r, pago: true };
          }
          return r;
        });
        if (changed) {
          set({ recibosSalario: next });
          get().pushAudit("reconcile_recibos_bai", "pago alinhado com extrato BAI");
        }
        return changed;
      },
      ensureSalariosBaiFromRecibos: () => {
        const recibos = get().recibosSalario || [];
        let extra = [...(get().movimentosBaiExtra || [])];
        const existing = new Set(extra.map((m) => m.id));
        let added = 0;
        for (const r of recibos) {
          if (!r.pago || !(r.liquido > 0)) continue;
          const movId = `APP-SAL-${r.id}`;
          if (existing.has(movId)) continue;
          extra.push({
            id: movId,
            linha: 0,
            data: r.dataPag || r.criadoEm?.slice(0, 10) || new Date().toISOString().slice(0, 10),
            banco: "SALARIO-APP",
            descricao: `Honorários / salário · ${r.nome} · ${r.mes}`,
            entrada: 0,
            saida: Number(r.liquido) || 0,
            saldo: 0,
            observacoes: `Recibo ${r.id} · pago → debita BAI`,
          });
          existing.add(movId);
          added += 1;
        }
        if (added > 0) {
          set({ movimentosBaiExtra: sortAndRecalcBai(extra) });
          get().pushAudit("bai_ensure_salarios", `${added} movimento(s) restaurado(s)`);
        }
        return added;
      },
      limparDebitosSalarioBai: () => {
        const before = get().movimentosBaiExtra || [];
        const next = before.filter((m) => {
          const id = String(m.id || "");
          const banco = String(m.banco || "").toUpperCase();
          const desc = `${m.descricao || ""} ${m.observacoes || ""}`;
          if (id.startsWith("APP-SAL-")) return false;
          if (banco === "SALARIO-APP" || banco.includes("SALARIO")) return false;
          if (/Honorários\s*\/\s*salário|Recibo\s+RH-/i.test(desc)) return false;
          return true;
        });
        const removed = before.length - next.length;
        // Sempre recalcular saldo da cadeia extra
        set({ movimentosBaiExtra: sortAndRecalcBai(next) });
        if (removed > 0) {
          get().pushAudit("bai_limpar_salarios", `${removed} débito(s) salário removido(s) · saldo recalculado`);
        }
        return removed;
      },
      restaurarRecibosPagos: (staff, mes, mesKey, dataPag) => {
        const data = dataPag || new Date().toISOString().slice(0, 10);
        const existing = get().recibosSalario || [];
        // NÃO apagar recibos de outros funcionários do mesmo mês — só preencher em falta
        const byFunc = new Set(
          existing.filter((r) => r.mesKey === mesKey).map((r) => r.funcionarioId),
        );
        const toAdd = staff.filter((f) => !byFunc.has(f.id));
        const kept = existing;
        const baseNum = existing.filter((r) => r.mesKey === mesKey).length;
        const created: ReciboSalario[] = toAdd.map((f, i) => {
          const diasU = f.diasUteis ?? 22;
          const diasT = f.diasTrab ?? 22;
          const outros = f.outrosDesc ?? 0;
          const falta = Math.max(0, diasU - diasT);
          const descDias = diasU > 0 ? (f.salario / diasU) * falta : 0;
          const liquido = Math.max(0, f.salario - descDias - outros);
          return {
            id: `RH-${mesKey}-${String(baseNum + i + 1).padStart(3, "0")}`,
            funcionarioId: f.id,
            nome: f.nome,
            funcao: f.funcao || "",
            mes,
            mesKey,
            diasUteis: diasU,
            diasTrab: diasT,
            salarioBruto: f.salario,
            descontoDias: descDias,
            outrosDesc: outros,
            liquido,
            dataPag: data,
            pago: true,
            iban: f.iban,
            criadoEm: new Date().toISOString(),
          };
        });
        set({ recibosSalario: [...kept, ...created] }); // kept = todos os existentes
        get().pushAudit("recibos_restaurar_pagos", `${created.length} · ${mes}`);
        // extrato limpo + recriar débitos dos pagos
        get().limparDebitosSalarioBai();
        get().ensureSalariosBaiFromRecibos();
        return created.length;
      },
      

      addBaiMovimentoManual: (input) => {
        requireEdit(get);
        const valor = Number(input.valor) || 0;
        if (valor <= 0) throw new Error("Indique um valor positivo.");
        const id = `APP-MAN-${Date.now().toString(36).toUpperCase()}`;
        const ok = pushBaiMovimento(get, set, {
          id,
          data: input.data,
          entrada: input.tipo === "entrada" ? valor : 0,
          saida: input.tipo === "saida" ? valor : 0,
          banco: input.banco || (input.tipo === "entrada" ? "ENTRADA-APP" : "SAIDA-APP"),
          descricao: input.descricao || (input.tipo === "entrada" ? "Entrada manual BAI" : "Saída manual BAI"),
          observacoes: input.observacoes || "Movimentação manual · Banco BAI",
        });
        if (!ok) throw new Error("Movimento já existia.");
        get().pushAudit(
          input.tipo === "entrada" ? "bai_entrada_manual" : "bai_saida_manual",
          `${id} · ${valor}`,
        );
      },
      syncBaiFromExtras: () => {
        requireEdit(get);
        // Despesas (cartão/transferência) NÃO são recriadas no extrato BAI —
        // evitam duplicar saídas já reflectidas no banco. Ficam na lista de despesas.
        // Apenas salários pagos sem movimento BAI são sincronizados.
        const existing = new Set((get().movimentosBaiExtra || []).map((m) => m.id));
        let movs = movimentosAll(get().movimentosBaiExtra, get().baiOverride, get().movimentosBaiDeletedIds || []);
        let last = movs[movs.length - 1];
        let saldo = last?.saldo ?? seed.escola.saldoInicialBai ?? 0;
        let linha = last?.linha ?? 0;
        const toAdd: MovimentoBai[] = [];

        // Limpar do extra quaisquer Sync lançamento / *-APP de despesas (legado)
        const cleanedExtra = (get().movimentosBaiExtra || []).filter((m) => {
          const id = String(m.id || "");
          const banco = String(m.banco || "");
          const obs = String(m.observacoes || "");
          if (id.startsWith("APP-SAL-") || banco === "SALARIO-APP") return true;
          if (banco.endsWith("-APP") && /Sync lançamento/i.test(obs)) return false;
          if (/Sync lançamento/i.test(obs)) return false;
          return true;
        });
        if (cleanedExtra.length !== (get().movimentosBaiExtra || []).length) {
          set({ movimentosBaiExtra: sortAndRecalcBai(cleanedExtra) });
        }

        for (const r of get().recibosSalario || []) {
          if (!r.pago || !(r.liquido > 0)) continue;
          const movId = `APP-SAL-${r.id}`;
          if (existing.has(movId)) continue;
          if (movs.some((m) => m.id === movId)) continue;
          const saida = Number(r.liquido) || 0;
          saldo = saldo - saida;
          linha += 1;
          toAdd.push({
            id: movId,
            linha,
            data: r.dataPag || r.criadoEm?.slice(0, 10) || new Date().toISOString().slice(0, 10),
            banco: "SALARIO-APP",
            descricao: `Honorários ${r.nome} · ${r.mes}`,
            entrada: 0,
            saida,
            saldo,
            observacoes: `Sync recibo ${r.id}`,
          });
          existing.add(movId);
        }
        if (toAdd.length) {
          set({
            movimentosBaiExtra: sortAndRecalcBai([
              ...(get().movimentosBaiExtra || []).filter((m) => {
                const banco = String(m.banco || "");
                const obs = String(m.observacoes || "");
                if (m.id.startsWith("APP-SAL-") || banco === "SALARIO-APP") return true;
                if (/Sync lançamento/i.test(obs)) return false;
                return true;
              }),
              ...toAdd,
            ]),
          });
          get().pushAudit("bai_sync_extras", `${toAdd.length} salários`);
        } else {
          set({
            movimentosBaiExtra: sortAndRecalcBai(
              (get().movimentosBaiExtra || []).filter((m) => {
                const banco = String(m.banco || "");
                const obs = String(m.observacoes || "");
                if (String(m.id || "").startsWith("APP-SAL-") || banco === "SALARIO-APP") return true;
                if (/Sync lançamento/i.test(obs)) return false;
                return true;
              }),
            ),
          });
        }
        return toAdd.length;
      },
      importBaiMovimentos: (rows, replace) => {
        requireEdit(get);
        const fp = (m: MovimentoBai) =>
          `${m.data}|${Number(m.entrada) || 0}|${Number(m.saida) || 0}|${(m.banco || "").trim()}`;
        let merged = [...rows];
        if (replace) {
          const ids = new Set(merged.map((m) => m.id));
          const fps = new Set(merged.map(fp));
          for (const s of seed.movimentosBai) {
            if (ids.has(s.id) || fps.has(fp(s))) continue;
            if ((s.linha || 0) > 62 || /Transf pelo NI|Fecho TPA/i.test(`${s.banco} ${s.descricao}`)) {
              merged.push(s);
              ids.add(s.id);
              fps.add(fp(s));
            }
          }
        } else {
          // modo extra: juntar ao que já existe
          const prev = get().movimentosBaiExtra || [];
          const ids = new Set(merged.map((m) => m.id));
          for (const p of prev) {
            if (!ids.has(p.id)) merged.push(p);
          }
        }
        merged = sortAndRecalcBai(merged);
        set({
          movimentosBaiExtra: merged,
          baiOverride: replace,
        });
        get().pushAudit(
          "import_bai",
          `${merged.length} movimentos BAI (${replace ? "substituição+secretaria" : "extra"})`,
        );
      },
      deleteBaiMovimento: (id) => {
        requireEdit(get);
        const deletedSet = new Set([...(get().movimentosBaiDeletedIds || []), id]);
        const current = movimentosAll(
          get().movimentosBaiExtra,
          get().baiOverride,
          Array.from(deletedSet),
        );
        const target = current.find((m) => m.id === id) ||
          (get().movimentosBaiExtra || []).find((m) => m.id === id);
        if (!target && !seed.movimentosBai.some((m) => m.id === id)) {
          throw new Error("Movimento BAI não encontrado.");
        }
        // Soft-delete: marca o ID e remove só dos extras (não congela o extrato inteiro)
        set({
          movimentosBaiDeletedIds: Array.from(deletedSet),
          movimentosBaiExtra: sortAndRecalcBai(
            (get().movimentosBaiExtra || []).filter((m) => m.id !== id),
          ),
        });
        const t = target || seed.movimentosBai.find((m) => m.id === id)!;
        get().pushAudit(
          "bai_apagar",
          `${id} · ${t.descricao || ""} · E:${t.entrada || 0} S:${t.saida || 0}`,
        );
      },
      removeAluno: (id) => {
        requireEdit(get);
        const ops = get().operators;
        const by = get().activeOperator || "—";
        if (by !== ops[0]) {
          throw new Error("Apenas o Colaborador 1 pode apagar alunos.");
        }
        const deleted = Array.from(new Set([...(get().alunosDeletedIds || []), id]));
        set({
          alunosDeletedIds: deleted,
          alunosExtra: (get().alunosExtra || []).filter((a) => a.id !== id),
          mensalidades: get().mensalidades.filter((m) => m.id !== id),
        });
        // limpar override se existir
        const ov = { ...(get().alunosOverrides || {}) };
        delete ov[id];
        set({ alunosOverrides: ov });
        get().pushAudit("apagar_aluno", id);
      },
      purgeAlunoCompleto: (id) => {
        requireEdit(get);
        const ops = get().operators;
        const by = get().activeOperator || "—";
        if (by !== ops[0]) {
          return { ok: false, message: "Apenas o Colaborador 1 pode eliminar alunos definitivamente." };
        }
        const idTrim = String(id || "").trim();
        if (!idTrim) return { ok: false, message: "ID em falta." };

        const idUp = idTrim.toUpperCase();
        const fotos = { ...(get().fotos || {}) };
        delete fotos[idTrim];

        const ov = { ...(get().alunosOverrides || {}) };
        delete ov[idTrim];

        // Marcar como apagado para seed não voltar; extras removidos de vez
        const deleted = Array.from(
          new Set([...(get().alunosDeletedIds || []).filter((x) => x !== idTrim), idTrim]),
        );

        const baiExtra = (get().movimentosBaiExtra || []).filter((m) => {
          const blob = `${m.id || ""} ${m.descricao || ""} ${m.observacoes || ""}`.toUpperCase();
          // Só remove movimentos gerados pela app para esta matrícula
          if (String(m.id || "").toUpperCase().startsWith(`APP-MAT-${idUp}`)) return false;
          if (blob.includes(`(${idUp})`) && /MATR[IÍ]CULA/i.test(blob)) return false;
          return true;
        });

        set({
          alunosExtra: (get().alunosExtra || []).filter((a) => a.id !== idTrim),
          alunosOverrides: ov,
          alunosDeletedIds: deleted,
          mensalidades: (get().mensalidades || []).filter((m) => m.id !== idTrim),
          fotos,
          documentosAluno: (get().documentosAluno || []).filter((d) => d.alunoId !== idTrim),
          codigosRecibo: (get().codigosRecibo || []).filter((c) => c.alunoId !== idTrim),
          faturasPropina: (get().faturasPropina || []).filter((f) => f.alunoId !== idTrim),
          contaCorrente: (get().contaCorrente || []).filter((c) => c.alunoId !== idTrim),
          crmEnvios: (get().crmEnvios || []).filter((r) => r.alunoId !== idTrim),
          movimentosBaiExtra: baiExtra,
        });

        // Censo local: tirar este ID
        try {
          const still = (get().alunosExtra || []).filter((a) => a.id !== idTrim);
          persistAlunosCensoLocal(still);
        } catch {
          /* ignore */
        }

        get().pushAudit("purge_aluno", `${idTrim} · eliminação definitiva`);
        // Recontar Propinas / lista alinhada com Matrículas
        try {
          reporPropinasFromMatriculas();
        } catch {
          /* ignore */
        }
        const n = alunosAll(
          get().alunosExtra || [],
          get().alunosOverrides || {},
          get().alunosDeletedIds || [],
        ).length;
        return {
          ok: true,
          message: `Aluno ${idTrim} eliminado por completo. Cadastro activo: ${n} aluno(s).`,
        };
      },
      restoreAluno: (id) => {
        requireEdit(get);
        if (!id) return false;
        const deleted = (get().alunosDeletedIds || []).filter((x) => x !== id);
        const extras = [...(get().alunosExtra || [])];
        const ov = { ...(get().alunosOverrides || {}) };
        const mens = get().mensalidades || [];
        const seedHit = seed.alunos.find((a) => a.id === id);
        const extraHit = extras.find((a) => a.id === id);
        if (!extraHit && !seedHit) {
          const m = mens.find((x) => x.id === id);
          const patch = ov[id] || {};
          extras.push({
            id,
            nome: String(patch.nome || m?.nome || id),
            turma: String(patch.turma || m?.turma || turmaFromId(id) || ""),
            grupo: String(patch.grupo || ""),
            inscricao: Number(patch.inscricao || 0),
            manuais: Number(patch.manuais || 0),
            uniforme: Number(patch.uniforme || 0),
            seguro: Number(patch.seguro || 0),
            extras: Number(patch.extras || 0),
            curso: Number(patch.curso || 0),
            mensalidade1: Number(patch.mensalidade1 || m?.propina || 0),
            dataPag: String(patch.dataPag || ""),
            bruto: Number(patch.bruto || 0),
            descPct: Number(patch.descPct || 0),
            liquido: Number(patch.liquido || 0),
            encarregado: String(patch.encarregado || ""),
            telefone: String(patch.telefone || ""),
            bi: String(patch.bi || ""),
            familia: String(patch.familia || ""),
            recibo: String(patch.recibo || ""),
            obs: "Reposto automaticamente (rasto no sistema)",
            propina: Number(patch.propina || m?.propina || 0),
            statusPag: (patch.statusPag as Aluno["statusPag"]) || "registado",
          });
        }
        set({ alunosDeletedIds: deleted, alunosExtra: extras });
        get().pushAudit("restaurar_aluno", id);
        return true;
      },
      recuperarAlunosOcultos: () => recuperarAlunosOcultos(),
      forcarFichaNildo4E04: () => forcarFichaNildo4E04(),
      sanearAlunosDuplicados: () => sanearAlunosDuplicados(),
      reabrirAlunosUnicos: () => reabrirAlunosUnicos(),
      importLancamentos: (rows) => {
        requireEdit(get);
        let n = 0;
        for (const r of rows) {
          get().addCaptura(r);
          n++;
        }
        get().pushAudit("import_lancamentos", `${n} lançamentos CSV`);
        return n;
      },
      addSalario: (s) => {
        requireEdit(get);
        const by = get().activeOperator || "—";
        const row = { ...s };
        set({ salariosExtra: [...get().salariosExtra, row] });
        get().pushAudit("criar_salario", `${row.id} · ${row.nome} · ${row.mes}`);
      },
      updateSalario: (id, patch) => {
        requireEdit(get);
        const ops = get().operators;
        const by = get().activeOperator || "—";
        if (by !== ops[0]) {
          throw new Error("Apenas o Colaborador 1 pode editar salários.");
        }
        const inExtra = get().salariosExtra.some((r) => r.id === id);
        if (inExtra) {
          set({
            salariosExtra: get().salariosExtra.map((r) =>
              r.id === id ? { ...r, ...patch } : r,
            ),
          });
        } else {
          const prev = get().salariosOverrides[id] ?? {};
          set({
            salariosOverrides: {
              ...get().salariosOverrides,
              [id]: { ...prev, ...patch },
            },
          });
        }
        get().pushAudit("editar_salario", `${id} · ${Object.keys(patch).join(", ")}`);
      },
      removeSalario: (id) => {
        requireEdit(get);
        const ops = get().operators;
        const by = get().activeOperator || "—";
        if (by !== ops[0]) {
          throw new Error("Apenas o Colaborador 1 pode apagar registos de funcionários.");
        }
        const prevName =
          get().salariosExtra.find((r) => r.id === id)?.nome ||
          seed.salarios.find((r) => r.id === id)?.nome ||
          id;
        const deleted = Array.from(
          new Set([...(get().salariosDeletedIds || []), id]),
        );
        set({
          salariosExtra: get().salariosExtra.filter((r) => r.id !== id),
          salariosDeletedIds: deleted,
        });
        get().pushAudit("apagar_salario", `${id} · ${prevName}`);
      },
            nextFaturaNumero: (mesKey) => {
        const key = mesKey || new Date().toISOString().slice(0, 7);
        const existing = get().faturasPropina || [];
        let max = 0;
        // Conta todas as PROP- do mês e também sequência global do prefixo
        const reMes = new RegExp(`^PROP-${key}-(\d{3,})$`);
        const reAny = /^PROP-\d{4}-\d{2}-(\d{3,})$/;
        for (const f of existing) {
          const n = String(f.numero || "");
          const m1 = n.match(reMes);
          if (m1) max = Math.max(max, Number(m1[1]));
          const m2 = n.match(reAny);
          if (m2 && n.includes(key)) max = Math.max(max, Number(m2[1]));
        }
        return `PROP-${key}-${String(max + 1).padStart(3, "0")}`;
      },
      addFaturaPropina: (f) => {
        requireEdit(get);
        set({ faturasPropina: [...(get().faturasPropina || []), f] });
        get().pushAudit("emitir_fatura_propina", `${f.numero} · ${f.alunoNome} · ${f.mesRef}`);
      },
      addCrmEnvio: (e) => {
        requireEdit(get);
        const id = e.id || `CRM-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const row: CrmEnvio = {
          id,
          alunoId: e.alunoId,
          alunoNome: e.alunoNome,
          mesKey: e.mesKey,
          canal: e.canal,
          enviadoEm: e.enviadoEm || new Date().toISOString(),
          confirmado: e.confirmado ?? false,
          faturaNumero: e.faturaNumero,
          valor: e.valor,
          criadoPor: e.criadoPor || get().activeOperator,
        };
        set({ crmEnvios: [...(get().crmEnvios || []), row] });
        get().pushAudit("crm_envio", `${row.canal} · ${row.alunoNome} · ${row.mesKey}`);
      },
      updateCrmEnvio: (id, patch) => {
        requireEdit(get);
        set({
          crmEnvios: (get().crmEnvios || []).map((r) =>
            r.id === id ? { ...r, ...patch } : r,
          ),
        });
      },
      removeCrmEnvio: (id) => {
        requireEdit(get);
        set({ crmEnvios: (get().crmEnvios || []).filter((r) => r.id !== id) });
      },
      addCodigoRecibo: (c) => {
        // Qualquer colaborador pode registar código ao imprimir recibo (não é edição financeira).
        // Formato estável: RC-YYYYMM-XXXX-NN (só A-Z e 0-9 — legível em PDF/OCR).
        let mes = (c.mesKey || "").replace(/\D/g, "").slice(0, 6);
        if (mes.length < 6) {
          mes = new Date().toISOString().slice(0, 7).replace(/-/g, "");
        }
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem I,O,0,1 (confusão visual)
        let rand = "";
        for (let i = 0; i < 4; i++) {
          rand += alphabet[Math.floor(Math.random() * alphabet.length)];
        }
        const chk = String(
          (rand.charCodeAt(0) + rand.charCodeAt(1) + Math.round(c.valor || 0)) % 100,
        ).padStart(2, "0");
        let codigo = (c.codigo || `RC-${mes}-${rand}-${chk}`).trim().toUpperCase();
        // Sanitizar códigos externos / legados
        codigo = codigo.replace(/[^A-Z0-9\-]/g, "");
        const existing = (get().codigosRecibo || []).find(
          (r) => (r.codigo || "").toUpperCase() === codigo,
        );
        if (existing) return existing;
        const row: CodigoRecibo = {
          id: c.id || `RCOD-${Date.now().toString(36)}-${rand}`,
          codigo,
          alunoId: c.alunoId,
          alunoNome: c.alunoNome,
          mesKey: c.mesKey,
          valor: c.valor,
          rubricas: c.rubricas,
          emitidoEm: c.emitidoEm || new Date().toISOString(),
          criadoPor: c.criadoPor || get().activeOperator,
          vias: 1,
          lastPrintedAt: new Date().toISOString(),
        };
        set({ codigosRecibo: [...(get().codigosRecibo || []), row] });
        get().pushAudit("recibo_codigo", `${row.codigo} · ${row.alunoNome} · ${row.mesKey}`);
        return row;
      },
      findCodigoRecibo: (codigo) => {
        const list = get().codigosRecibo || [];
        const raw = (codigo || "").trim().toUpperCase();
        if (!raw) return undefined;
        // 1) Exacto
        let found = list.find((r) => (r.codigo || "").toUpperCase() === raw);
        if (found) return found;
        // 2) Sem hífens / espaços
        const compact = (s: string) => s.replace(/[\s\-_.]/g, "").toUpperCase();
        const want = compact(raw);
        found = list.find((r) => compact(r.codigo || "") === want);
        if (found) return found;
        // 3) Sufixo / inclusão parcial (leitura incompleta do PDF)
        if (want.length >= 6) {
          found = list.find((r) => {
            const c = compact(r.codigo || "");
            return c.endsWith(want) || want.endsWith(c) || c.includes(want);
          });
        }
        return found;
      },
      findCodigoReciboAlunoMes: (alunoId, mesKey) => {
        const list = get().codigosRecibo || [];
        return list
          .filter((r) => r.alunoId === alunoId && r.mesKey === mesKey)
          .sort((a, b) => (b.emitidoEm || "").localeCompare(a.emitidoEm || ""))[0];
      },
      incrementCodigoReciboVia: (id) => {
        // Qualquer colaborador pode imprimir 2.ª via
        let updated: CodigoRecibo | undefined;
        set({
          codigosRecibo: (get().codigosRecibo || []).map((r) => {
            if (r.id !== id) return r;
            updated = {
              ...r,
              vias: (r.vias || 1) + 1,
              lastPrintedAt: new Date().toISOString(),
            };
            return updated;
          }),
        });
        return updated;
      },

      addDocumentoAluno: (d) => {
        const id =
          d.id ||
          `DOC-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const row: DocumentoAluno = {
          ...d,
          id,
          emitidoEm: d.emitidoEm || new Date().toISOString(),
          estado: d.estado || "emitido",
          linhas: d.linhas || [],
        };
        set({ documentosAluno: [...(get().documentosAluno || []), row] });
        get().pushAudit(
          "documento_aluno",
          `${row.tipo} ${row.numero} · ${row.alunoNome} · ${row.valor}`,
        );
        return row;
      },
      updateDocumentoAluno: (id, patch) => {
        set({
          documentosAluno: (get().documentosAluno || []).map((r) =>
            r.id === id ? { ...r, ...patch } : r,
          ),
        });
      },
      findDocumentoPorNumero: (numero) => {
        const k = (numero || "").trim().toUpperCase().replace(/\s+/g, "");
        if (!k) return undefined;
        return (get().documentosAluno || []).find(
          (r) => (r.numero || "").toUpperCase().replace(/\s+/g, "") === k,
        );
      },
      gerarReciboDeFatura: (faturaNumero) => {
        const fat = get().findDocumentoPorNumero(faturaNumero);
        if (!fat || fat.tipo !== "fatura") return undefined;
        const ja = (get().documentosAluno || []).find(
          (r) =>
            r.tipo === "recibo" &&
            (r.faturaId === fat.id ||
              (r.faturaNumero || "").toUpperCase() === fat.numero.toUpperCase()),
        );
        if (ja) return ja;
        const mes =
          (fat.mesKey || "").replace(/-/g, "").slice(0, 6) ||
          new Date().toISOString().slice(0, 7).replace(/-/g, "");
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let rand = "";
        for (let i = 0; i < 4; i++) rand += alphabet[Math.floor(Math.random() * alphabet.length)];
        const codigo = `RC-${mes}-${rand}-${String((rand.charCodeAt(0) + Math.round(fat.valor || 0)) % 100).padStart(2, "0")}`;
        // Registar código de verificação
        get().addCodigoRecibo({
          alunoId: fat.alunoId,
          alunoNome: fat.alunoNome,
          mesKey: fat.mesKey || new Date().toISOString().slice(0, 7),
          valor: fat.valor,
          rubricas: (fat.linhas || [])
            .filter((l) => l.on !== false && l.value > 0)
            .map((l) => l.label)
            .join(", "),
          codigo,
        });
        const numeroRecibo = `REC-${fat.numero.replace(/[^\w\-]/g, "")}`;
        const recibo = get().addDocumentoAluno({
          tipo: "recibo",
          modelo: fat.modelo,
          numero: numeroRecibo,
          alunoId: fat.alunoId,
          alunoNome: fat.alunoNome,
          mesKey: fat.mesKey,
          mesRef: fat.mesRef,
          valor: fat.valor,
          linhas: fat.linhas || [],
          estado: "emitido",
          faturaId: fat.id,
          faturaNumero: fat.numero,
          codigoVerificacao: codigo,
          pagoEm: new Date().toISOString().slice(0, 10),
          criadoPor: get().activeOperator,
        });
        get().updateDocumentoAluno(fat.id, {
          estado: fat.estado === "arquivado" ? "arquivado" : "confirmado",
          pagoEm: recibo.pagoEm,
        });
        return recibo;
      },

      resetLocal: () => {
        requireEdit(get);
        set({
          extras: [],
          alunosExtra: [],
          alunosOverrides: {},
          alunosDeletedIds: [],
          mensalidades: initialMensalidades,
          fundoExtra: [],
          fundoAtmExtra: [],
          movimentosBaiExtra: [],
          movimentosBaiDeletedIds: [],
          baiOverride: false,
          fotos: {},
          auditLog: [],
          sessionLog: [],
          salariosExtra: [],
          salariosOverrides: {},
          salariosDeletedIds: [],
          recibosSalario: [],
          faturasPropina: [],
          inboxItems: [],
          crmEnvios: [],
          codigosRecibo: [],
          documentosAluno: [],
          contaCorrente: [],
        });
      },
      resetLocalStorage: () => {
        requireEdit(get);
        try {
          const keys = ["ecc-financeiro-v1", "ecc-financeiro-v2", "ecc-financeiro-v3"];
          for (const k of keys) {
            try {
              localStorage.removeItem(k);
            } catch {
              /* ignore */
            }
          }
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && k.startsWith("ecc-financeiro")) {
              try {
                localStorage.removeItem(k);
              } catch {
                /* ignore */
              }
            }
          }
        } catch {
          /* ignore */
        }
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      },
    }),
    {
      name: "ecc-financeiro-v3"
,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      version: 4,
      migrate: (persisted: unknown) => {
        // Seed manda: limpa override BAI, extras de alunos (duplicados) e volta ao cadastro do seed
        const s = (persisted || {}) as Record<string, unknown>;
        const extra = Array.isArray(s.movimentosBaiExtra)
          ? (s.movimentosBaiExtra as { id?: string; banco?: string }[])
          : [];
        const keepExtra = extra.filter((m) => {
          const id = String(m?.id || "");
          const banco = String(m?.banco || "");
          // Só salários / propinas / ATM manual — NÃO sync de lançamentos (duplicam saídas)
          if (id.startsWith("APP-SAL-") || banco === "SALARIO-APP" || banco === "PROPINA-APP") return true;
          if (id.startsWith("ATM-MAN-")) return true;
          return false;
        });
        let extras = Array.isArray(s.alunosExtra) ? [...(s.alunosExtra as unknown[])] : [];
        let overrides =
          s.alunosOverrides && typeof s.alunosOverrides === "object"
            ? (s.alunosOverrides as Record<string, unknown>)
            : {};
        // Recuperar censo de chaves antigas (v1/v2) se o v3 as tiver esvaziado
        if (extras.length === 0 && typeof localStorage !== "undefined") {
          for (const key of ["ecc-financeiro-v2", "ecc-financeiro-v1"]) {
            try {
              const raw = localStorage.getItem(key);
              if (!raw) continue;
              const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
              const st = (parsed.state || parsed) as Record<string, unknown>;
              const oldExtra = Array.isArray(st.alunosExtra) ? (st.alunosExtra as unknown[]) : [];
              if (oldExtra.length > extras.length) extras = oldExtra;
              const oldOv = st.alunosOverrides;
              if (oldOv && typeof oldOv === "object" && Object.keys(overrides).length === 0) {
                overrides = oldOv as Record<string, unknown>;
              }
            } catch {
              /* ignore */
            }
          }
        }
        return {
          ...s,
          movimentosBaiExtra: keepExtra,
          baiOverride: false,
          movimentosBaiDeletedIds: [],
          alunosExtra: extras,
          alunosOverrides: overrides,
          alunosDeletedIds: Array.isArray(s.alunosDeletedIds) ? s.alunosDeletedIds : [],
          contaCorrente: Array.isArray(s.contaCorrente) ? s.contaCorrente : [],
        };
      },
      partialize: (s) => ({
        extras: s.extras,
        alunosExtra: s.alunosExtra,
        alunosOverrides: s.alunosOverrides,
        alunosDeletedIds: s.alunosDeletedIds || [],
        mensalidades: s.mensalidades,
        fundoExtra: s.fundoExtra,
        fundoAtmExtra: s.fundoAtmExtra,
        movimentosBaiExtra: s.movimentosBaiExtra,
        movimentosBaiDeletedIds: s.movimentosBaiDeletedIds || [],
        baiOverride: s.baiOverride,
        fotos: s.fotos,
        activeOperator: s.activeOperator,
        operators: s.operators,
        auditLog: s.auditLog,
        sessionLog: s.sessionLog,
        salariosExtra: s.salariosExtra,
        salariosDeletedIds: s.salariosDeletedIds,
        recibosSalario: s.recibosSalario || [],
        salariosOverrides: s.salariosOverrides,
        faturasPropina: s.faturasPropina,
        uiPrefs: s.uiPrefs || {},
        inboxItems: s.inboxItems || [],
        crmEnvios: s.crmEnvios || [],
        codigosRecibo: s.codigosRecibo || [],
        documentosAluno: s.documentosAluno || [],
        contaCorrente: s.contaCorrente || [],
      }),
    },
  ),
);

export function getSeed(): Seed {
  const extra = alunosCensoLocal();
  if (!extra.length) return seed;
  const ids = new Set((seed.alunos || []).map((a) => a.id));
  const nomes = new Set(
    (seed.alunos || []).map((a) => normalizeNomeAluno(a.nome)).filter(Boolean),
  );
  const more = extra.filter((a) => {
    if (!a?.id || ids.has(a.id)) return false;
    const nn = normalizeNomeAluno(a.nome);
    if (nn && nomes.has(nn)) return false;
    ids.add(a.id);
    if (nn) nomes.add(nn);
    return true;
  });
  if (!more.length) return seed;
  const mensExtra: Mensalidade[] = more.map((a) => ({
    id: a.id,
    nome: a.nome,
    turma: a.turma || "",
    propina: Number(a.propina) || 0,
    pagamentos: {},
    obs: "",
  }));
  const mensIds = new Set((seed.mensalidades || []).map((m) => m.id));
  return {
    ...seed,
    alunos: [...seed.alunos, ...more],
    mensalidades: [
      ...(seed.mensalidades || []),
      ...mensExtra.filter((m) => !mensIds.has(m.id)),
    ],
  };
}

/** Card invoices already booked as socio FAT (avoid double-count). */
const LINKED_CARD = new Set(["CX-001"]); // Tamaco panfletos = FAT-050

/**
 * Ledger unificado: seed + extras da app (matrículas novas, fundo extra, capturas).
 * Lê o estado actual do store para incluir alunosExtra e fundoExtra — evita
 * trabalho duplicado e totais desfasados entre separadores / dispositivos.
 */
export function buildLedger(extras: Lancamento[]): Lancamento[] {
  const socio = seed.lancamentosSocio;
  const card: Lancamento[] = seed.faturasCartao
    .filter((c) => !LINKED_CARD.has(c.id) && !/ATM|Levantamento/i.test(c.descricao + c.banco))
    .map((c) => ({
      id: c.id,
      data: c.data,
      categoria: guessCategoria(c.descricao),
      descricao: c.descricao,
      fornecedor: c.fornecedor,
      fatura: c.fatura,
      docInterno: c.id,
      tipo: "despesa" as const,
      valor: c.valor,
      pagamento: "Cartão Multicaixa",
      observacoes: c.observacoes,
      origem: "cartao" as const,
      fonte: "Cartão BAI Express",
    }));

  // Fundo: seed + pagamentos registados na app (fundoExtra)
  let fundoSource = seed.fundoPagamentos as FundoPagamento[];
  let alunosSource = seed.alunos as Aluno[];
  try {
    const st = useFinance.getState();
    fundoSource = fundoPagAll(st.fundoExtra || []);
    alunosSource = alunosAll(
      st.alunosExtra || [],
      st.alunosOverrides || {},
      st.alunosDeletedIds || [],
    );
  } catch {
    /* SSR / testes sem store */
  }

  const fundo: Lancamento[] = fundoSource.map((p) => ({
    id: p.id,
    data: p.data,
    categoria: guessCategoria(p.descricao),
    descricao: p.descricao,
    fornecedor: p.recebeu,
    fatura: "",
    docInterno: p.id,
    tipo: "despesa" as const,
    valor: p.valor,
    pagamento: "Dinheiro",
    observacoes: p.obs,
    origem: "fundo" as const,
    fonte: "Fundo de Maneio",
  }));

  // Matrículas: seed + alunosExtra (todas as matrículas activas)
  const insc: Lancamento[] = alunosSource
    .filter((a) => a.liquido > 0)
    .map((a) => ({
      id: a.recibo || a.id,
      data: a.dataPag || "",
      categoria: "Inscrição / Matrícula",
      descricao: `Inscrição ${a.nome}`,
      fornecedor: a.encarregado || a.pai || a.mae || "",
      fatura: "",
      docInterno: a.recibo || a.id,
      tipo: "entrada" as const,
      valor: a.liquido,
      pagamento: a.metodoPagamento || "",
      observacoes: a.obs,
      origem: "inscricao" as const,
      fonte: "Controlo de Propinas",
    }));

  const bankOps: Lancamento[] = seed.movimentosBai
    .filter((m) => {
      if (m.saida <= 0) return false;
      const t = `${m.banco} ${m.descricao} ${m.observacoes}`;
      if (/ATM|Levantamento/i.test(t)) return false;
      if (/TPA-MCX|Serviço Especial/i.test(m.banco)) return false;
      return true;
    })
    .map((m) => ({
      id: m.id,
      data: m.data,
      categoria: /Comiss|IVA|Juros|Imposto|Selo/i.test(m.banco)
        ? "Comissões Bancárias"
        : /Evento|50 anos/i.test(m.observacoes)
          ? "Evento 50 Anos"
          : /Curso Intensivo/i.test(m.observacoes)
            ? "Curso Intensivo"
            : "Outras Despesas",
      descricao: m.observacoes || m.descricao || m.banco,
      fornecedor: "BAI Express",
      fatura: "",
      docInterno: m.id,
      tipo: "despesa" as const,
      valor: m.saida,
      pagamento: /Transf/i.test(m.banco) ? "Transferência" : "Cartão Multicaixa",
      observacoes: m.banco,
      origem: "banco" as const,
      fonte: "Movimentos BAI",
    }));

  return [...socio, ...card, ...fundo, ...insc, ...bankOps, ...extras].sort((a, b) => {
    const dc = (a.data || "9999").localeCompare(b.data || "9999");
    if (dc !== 0) return dc;
    // Mesmo dia: ordem estável por id / doc (lançamentos fora de ordem cronológica de criação)
    return (a.docInterno || a.id || "").localeCompare(b.docInterno || b.id || "");
  });
}

function guessCategoria(desc: string): string {
  const d = desc.toLowerCase();
  if (/pintor|tinta|pincel/.test(d)) return "Pintura Exterior";
  if (/serralh/.test(d)) return "Serralharia";
  if (/panfleto|lona|vinil|gráfica|grafica/.test(d)) return "Panfletos / Publicidade";
  if (/higiene|limpeza|esfregona|sheltox/.test(d)) return "Limpeza / Higiene";
  if (/cartucho|tinteiro|impress/.test(d)) return "Material de Escritório";
  if (/internet|zap|telemóvel|sim/.test(d)) return "Internet / Telefone";
  if (/sonangol|combust|gasóleo|gás/.test(d)) return "Combustível";
  if (/transporte|táxi|taxi/.test(d)) return "Transporte s/ Fatura";
  if (/peixe|pão|arroz|funcionár/.test(d)) return "Alimentação Pessoal";
  if (/evento|50 anos/.test(d)) return "Evento 50 Anos";
  if (/salário|salario/.test(d)) return "Salários";
  return "Outras Despesas";
}


/** Gastos extraordinários autorizados (cartão/conta) a favor da sócia — abatem a dívida. */
export function isAbatimentoDividaSocio(blob: {
  descricao?: string;
  observacoes?: string;
  categoria?: string;
  fonte?: string;
}): boolean {
  const t = `${blob.descricao || ""} ${blob.observacoes || ""} ${blob.categoria || ""} ${blob.fonte || ""}`.toLowerCase();
  return /a\s*reembolsar|abatimento\s*(à|a)?\s*d[ií]vida|acerto\s*s[oó]ci/.test(t);
}

/**
 * Controlo da dívida à sócia:
 * - Base = entradas do sócio (empréstimo / adiantamento)
 * - Abatimentos = gastos no cartão/conta marcados «A reembolsar» (uso autorizado)
 * - Ainda devido = base − abatimentos
 */
export function computeDividaSocio(
  extras: Lancamento[] = [],
  movimentosBaiExtra: MovimentoBai[] = [],
  baiOverride = false,
  movimentosBaiDeletedIds: string[] = [],
): {
  base: number;
  abatimentos: number;
  aindaDevido: number;
  linhasAbatimento: { id: string; data: string; descricao: string; valor: number; origem: string }[];
} {
  const base = seed.lancamentosSocio
    .filter((l) => l.tipo === "entrada")
    .reduce((s, l) => s + l.valor, 0);

  const linhas: { id: string; data: string; descricao: string; valor: number; origem: string }[] = [];
  const seenIds = new Set<string>();
  const seenFp = new Set<string>(); // data|valor — evita contar CX e BAI em duplicado

  /** Preferir descrição específica; «A reembolsar» sozinho vira detalhe disponível. */
  const labelAbatimento = (parts: {
    descricao?: string;
    observacoes?: string;
    categoria?: string;
    fornecedor?: string;
  }): string => {
    const d = (parts.descricao || "").trim();
    const o = (parts.observacoes || "").trim();
    const cat = (parts.categoria || "").trim();
    const forn = (parts.fornecedor || "").trim();
    const onlyReemb = (s: string) => /^a\s*reembolsar\b/i.test(s) && s.replace(/a\s*reembolsar/ig, "").replace(/[·\-–|,;]/g, "").trim().length < 2;
    const clean = (s: string) =>
      s
        .replace(/\s*[·|]\s*A\s*reembolsar\s*/gi, " ")
        .replace(/^A\s*reembolsar\s*[·|\-–]?\s*/i, "")
        .replace(/\s+/g, " ")
        .trim();
    const specific =
      (d && !onlyReemb(d) ? clean(d) : "") ||
      (o && !onlyReemb(o) ? clean(o) : "") ||
      (cat && !/^outras/i.test(cat) ? cat : "") ||
      forn;
    if (specific) {
      return /a\s*reembolsar/i.test(specific) ? specific : `${specific} · A reembolsar`;
    }
    return "A reembolsar";
  };

  const push = (id: string, data: string, descricao: string, valor: number, origem: string) => {
    if (!id || valor <= 0 || seenIds.has(id)) return;
    const fp = `${(data || "").slice(0, 10)}|${Number(valor).toFixed(2)}`;
    if (seenFp.has(fp)) return;
    seenIds.add(id);
    seenFp.add(fp);
    linhas.push({ id, data, descricao, valor, origem });
  };

  // 1) Movimentos BAI (fonte de verdade da saída do cartão/conta)
  const bai = movimentosAll(movimentosBaiExtra, baiOverride, movimentosBaiDeletedIds);
  for (const m of bai) {
    const sai = Number(m.saida) || 0;
    if (sai <= 0) continue;
    if (isAbatimentoDividaSocio({ descricao: m.descricao, observacoes: m.observacoes })) {
      push(
        m.id,
        m.data,
        labelAbatimento({ descricao: m.descricao, observacoes: m.observacoes }),
        sai,
        "banco",
      );
    }
  }

  // 2) Faturas cartão seed (só se não houver já linha BAI na mesma data/valor)
  for (const c of seed.faturasCartao || []) {
    if (isAbatimentoDividaSocio(c)) {
      push(
        c.id,
        c.data,
        labelAbatimento({
          descricao: c.descricao,
          observacoes: c.observacoes,
          fornecedor: c.fornecedor,
        }),
        Number(c.valor) || 0,
        "cartao",
      );
    }
  }

  // 3) Lançamentos extras da app (Nova despesa) marcados
  for (const l of extras) {
    if (l.tipo !== "despesa") continue;
    if (!isAbatimentoDividaSocio(l)) continue;
    push(
      l.id,
      l.data,
      labelAbatimento({
        descricao: l.descricao,
        observacoes: l.observacoes,
        categoria: l.categoria,
        fornecedor: l.fornecedor,
      }),
      Number(l.valor) || 0,
      l.origem || "cartao",
    );
  }

  // 4) Lançamentos socio seed explicitamente abatimento (raro)
  for (const l of seed.lancamentosSocio || []) {
    if (l.tipo !== "despesa") continue;
    if (!isAbatimentoDividaSocio(l)) continue;
    push(
      l.id,
      l.data,
      labelAbatimento({
        descricao: l.descricao,
        observacoes: l.observacoes,
        categoria: l.categoria,
        fornecedor: l.fornecedor,
      }),
      Number(l.valor) || 0,
      "socio",
    );
  }

  linhas.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  const abatimentos = linhas.reduce((s, r) => s + r.valor, 0);
  return {
    base,
    abatimentos,
    aindaDevido: Math.max(0, base - abatimentos),
    linhasAbatimento: linhas,
  };
}

export type Totals = {
  alunos: number;
  inscricoesLiquido: number;
  inscricoesSemMensal: number;
  propinasRecebidas: number;
  descontos: number;
  socioEntradas: number;
  socioDespesas: number;
  /** Gastos cartão/conta marcados «A reembolsar» — abatem a dívida à sócia */
  socioAbatimentos: number;
  /** Ainda devido à sócia = entradas − abatimentos */
  socioAindaDevido: number;
  custosOperacionais: number;
  custosTotais: number;
  proveitos: number;
  resultado: number;
  saldoBai: number;
  fundoLevantado: number;
  fundoGasto: number;
  fundoRestante: number;
  pendentesSeguro: number;
  pendentesData: number;
  docsSemFicheiro: number;
};

export function computeTotals(
  extras: Lancamento[],
  mensalidades: Mensalidade[],
  alunosExtra: Aluno[],
  alunosOverrides: Record<string, Partial<Aluno>> = {},
  movimentosBaiExtra: MovimentoBai[] = [],
  baiOverride = false,
  fundoAtmExtra: FundoAtm[] = [],
  alunosDeletedIds: string[] = [],
  movimentosBaiDeletedIds: string[] = [],
  fundoExtra: FundoPagamento[] = [],
): Totals {
  const alunos = alunosAll(alunosExtra, alunosOverrides, alunosDeletedIds);
  const inscricoesLiquido = alunos.reduce((s, a) => s + a.liquido, 0);
  const mensal1 = alunos.reduce((s, a) => s + (a.mensalidade1 || 0), 0);
  const propinasRecebidas =
    mensal1 +
    mensalidades.reduce((s, m) => {
      const paid = MESES_LETIVOS.reduce((x, k) => x + (m.pagamentos[k] || 0), 0);
      if (m.id === "P3-07") return s + Math.max(0, paid - (m.pagamentos.set || 0));
      return s + paid;
    }, 0);
  const descontos = alunos.reduce((s, a) => s + (a.bruto - a.liquido), 0);
  const socioEntradas = seed.lancamentosSocio
    .filter((l) => l.tipo === "entrada")
    .reduce((s, l) => s + l.valor, 0);
  const socioDespesas = seed.lancamentosSocio
    .filter((l) => l.tipo === "despesa")
    .reduce((s, l) => s + l.valor, 0);
  const divSocio = computeDividaSocio(
    extras,
    movimentosBaiExtra,
    baiOverride,
    movimentosBaiDeletedIds,
  );
  const socioAbatimentos = divSocio.abatimentos;
  const socioAindaDevido = divSocio.aindaDevido;

  const ledger = buildLedger(extras);
  const custosOperacionais = ledger
    .filter((l) => {
      if (l.tipo !== "despesa" || l.origem === "socio") return false;
      // Levantamento ATM = mudança de forma de dinheiro, não custo
      const blob = `${l.pagamento} ${l.categoria} ${l.descricao}`;
      if (/levantamento\s*atm/i.test(blob)) return false;
      // Abatimento à dívida da sócia ≠ custo operacional da escola
      if (isAbatimentoDividaSocio(l)) return false;
      return true;
    })
    .reduce((s, l) => s + l.valor, 0);
  const extraEntradas = extras.filter((l) => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0);

  const proveitos = inscricoesLiquido - mensal1 + propinasRecebidas + extraEntradas;
  const custosTotais = socioDespesas + custosOperacionais;
  const baiRows = movimentosAll(movimentosBaiExtra, baiOverride, movimentosBaiDeletedIds);
  const lastBai = baiRows[baiRows.length - 1];
  // Fundo: levantamentos ATM (BAI + blocos) aumentam o fundo; gastos = seed + fundoExtra
  const blocos = fundoAtmAll(fundoAtmExtra);
  const blocoKeys = new Set(blocos.map((a) => `${a.data}|${Number(a.valor) || 0}`));
  let fundoLevantado = blocos.reduce((s, a) => s + (Number(a.valor) || 0), 0);
  for (const m of baiRows) {
    const sai = Number(m.saida) || 0;
    if (sai <= 0) continue;
    const blob = `${m.banco || ""} ${m.descricao || ""}`;
    if (!/ATM|Levantamento/i.test(blob)) continue;
    if (blocoKeys.has(`${m.data}|${sai}`)) continue;
    if (blocos.some((b) => b.id === m.id)) continue;
    fundoLevantado += sai;
  }
  // Gastos do fundo: seed + fundoExtra (app) + lançamentos com origem fundo
  const fundoIds = new Set(fundoPagAll(fundoExtra).map((p) => p.id));
  const fundoGasto =
    fundoPagAll(fundoExtra).reduce((s, p) => s + (Number(p.valor) || 0), 0) +
    extras
      .filter((e) => e.origem === "fundo" && !fundoIds.has(e.id))
      .reduce((s, e) => s + e.valor, 0);

  return {
    alunos: alunos.length,
    inscricoesLiquido,
    inscricoesSemMensal: inscricoesLiquido - mensal1,
    propinasRecebidas,
    descontos,
    socioEntradas,
    socioDespesas,
    socioAbatimentos,
    socioAindaDevido,
    custosOperacionais,
    custosTotais,
    proveitos,
    resultado: proveitos - custosTotais,
    saldoBai: lastBai?.saldo ?? 0,
    fundoLevantado,
    fundoGasto,
    fundoRestante: fundoLevantado - fundoGasto,
    pendentesSeguro: alunos.filter((a) => a.seguro === 0).length,
    pendentesData: alunos.filter((a) => !a.dataPag).length,
    docsSemFicheiro: seed.lancamentosSocio.filter((l) => !l.ficheiro).length,
  };
}


/**
 * Alinha turma + grupo das matrículas.
 *
 * REGRA DE OURO: a turma da tabela segue a idade (sistema Congo) quando
 * o prefixo do ID é incompatível (P1-07 nascido em 2015 ≠ Maternelle P1).
 * Se a turma gravada for compatível com a idade (±1 ano), mantém-se.
 *
 * Esta função:
 * 1) Corrige turmas incompatíveis com a data de nascimento.
 * 2) Só preenche turma vazia com a sugestão por data de nascimento.
 * 3) Normaliza o campo grupo.
 *
 * @returns número de alunos corrigidos
 */
export function recalcularClassesMatriculas(): number {
  const state = useFinance.getState();
  const extras = [...(state.alunosExtra || [])];
  const overrides = { ...(state.alunosOverrides || {}) } as Record<string, Partial<Aluno>>;
  let changed = 0;

  const applyPatch = (id: string, patch: Partial<Aluno>, isExtra: boolean, idx: number) => {
    if (isExtra) {
      extras[idx] = { ...extras[idx], ...patch };
    } else {
      overrides[id] = { ...(overrides[id] || {}), ...patch };
    }
    changed += 1;
  };

  /** Decide a turma correcta. Idade incompatível com o ID (ex. 13 anos em P1) manda. */
  const resolveTurma = (a: { id?: string; turma?: string; dataNascimento?: string }): string | null => {
    const resolved = resolveTurmaOficial(a);
    return resolved || null;
  };

  // 1) Alunos extra (criados na app)
  extras.forEach((a, idx) => {
    if (!a?.id) return;
    const resolved = resolveTurma(a);
    if (!resolved) {
      const g = grupoFromTurma(a.turma || "");
      if (a.grupo !== g) {
        applyPatch(a.id, { grupo: g }, true, idx);
      }
      return;
    }
    const g = grupoFromTurma(resolved);
    const needTurma = a.turma !== resolved;
    const needGrupo = a.grupo !== g;
    if (!needTurma && !needGrupo) return;
    const patch: Partial<Aluno> = {};
    if (needTurma) {
      patch.turma = resolved;
      // Não alterar propina automaticamente ao restaurar do ID —
      // o valor cobrado pode ter sido negociado.
    }
    if (needGrupo || needTurma) patch.grupo = g;
    applyPatch(a.id, patch, true, idx);
  });

  // 2) Seed + overrides
  for (const a of seed.alunos || []) {
    if (!a?.id) continue;
    const merged = { ...a, ...(overrides[a.id] || {}) } as Aluno;
    const resolved = resolveTurma(merged);
    if (!resolved) {
      const g = grupoFromTurma(merged.turma || "");
      if (merged.grupo !== g) {
        overrides[a.id] = { ...(overrides[a.id] || {}), grupo: g };
        changed += 1;
      }
      continue;
    }
    const g = grupoFromTurma(resolved);
    const needTurma = merged.turma !== resolved;
    const needGrupo = merged.grupo !== g;
    if (!needTurma && !needGrupo) continue;
    const patch: Partial<Aluno> = { ...(overrides[a.id] || {}) };
    if (needTurma) patch.turma = resolved;
    patch.grupo = g;
    overrides[a.id] = patch;
    changed += 1;
  }

  if (changed > 0) {
    useFinance.setState({
      alunosExtra: extras,
      alunosOverrides: overrides,
    });
    try {
      useFinance.getState().pushAudit?.(
        "recalcular_classes",
        `${changed} matrícula(s) · turma da matrícula preservada (Congo-Brazzaville)`,
      );
    } catch {
      /* audit opcional */
    }
  }
  changed += realinharIdsPorTurma();
  return changed;
}

/**
 * Quando a turma oficial já não corresponde ao prefixo do ID
 * (P1-07 em CM2, 4E-02 com 5 anos em P3), emite um ID novo da turma
 * e actualiza propinas, extrato BAI, fotos e overrides.
 */
export function realinharIdsPorTurma(): number {
  const state = useFinance.getState();
  let extras = [...(state.alunosExtra || [])];
  let overrides = { ...(state.alunosOverrides || {}) } as Record<string, Partial<Aluno>>;
  let deleted = [...(state.alunosDeletedIds || [])];
  let mensalidades = [...(state.mensalidades || [])];
  let faturas = [...(state.faturasPropina || [])];
  let fotos = { ...(state.fotos || {}) } as Record<string, string>;
  let baiExtra = [...(state.movimentosBaiExtra || [])];
  let baiDeleted = [...(state.movimentosBaiDeletedIds || [])];

  const seedIds = new Set((seed.alunos || []).map((a) => a.id));
  const taken = new Set<string>([
    ...(seed.alunos || []).map((a) => a.id),
    ...extras.map((a) => a.id),
    ...deleted,
  ]);

  const rewriteBlob = (s: string, from: string, to: string) =>
    (s || "").split(from).join(to);

  const applyRename = (oldId: string, newId: string) => {
    extras = extras.map((a) =>
      a.id === oldId ? { ...a, id: newId, idAnterior: oldId } : a,
    );
    if (overrides[oldId]) {
      const prev = overrides[oldId];
      delete overrides[oldId];
      overrides[newId] = { ...prev, idAnterior: oldId };
    }
    mensalidades = mensalidades.map((m) =>
      m.id === oldId ? { ...m, id: newId } : m,
    );
    faturas = faturas.map((f) =>
      (f as { alunoId?: string }).alunoId === oldId
        ? { ...f, alunoId: newId }
        : f,
    );
    if (fotos[oldId] && !fotos[newId]) {
      fotos[newId] = fotos[oldId];
    }
    delete fotos[oldId];
    baiExtra = baiExtra.map((m) => ({
      ...m,
      id: rewriteBlob(m.id, oldId, newId),
      descricao: rewriteBlob(m.descricao || "", oldId, newId),
      observacoes: rewriteBlob(m.observacoes || "", oldId, newId),
    }));
    baiDeleted = baiDeleted.map((id) => rewriteBlob(id, oldId, newId));
    if (!deleted.includes(oldId)) deleted.push(oldId);
    taken.delete(oldId);
    taken.add(newId);
  };

  let remapped = 0;

  // Extras
  for (const a of [...extras]) {
    if (!a?.id) continue;
    const turma = resolveTurmaOficial(a);
    if (!turma) continue;
    const fromId = turmaFromId(a.id);
    if (fromId === turma) continue;
    const newId = nextIdForTurma(turma, taken);
    if (newId === a.id) continue;
    extras = extras.map((row) =>
      row.id === a.id ? { ...row, turma, grupo: grupoFromTurma(turma) } : row,
    );
    applyRename(a.id, newId);
    remapped += 1;
  }

  // Seed cujo prefixo já não bate certo: clonar para extra com ID novo e esconder o seed
  for (const raw of seed.alunos || []) {
    if (!raw?.id || deleted.includes(raw.id)) continue;
    const merged = { ...raw, ...(overrides[raw.id] || {}) } as Aluno;
    const turma = resolveTurmaOficial(merged);
    if (!turma) continue;
    const fromId = turmaFromId(raw.id);
    if (fromId === turma) continue;
    const newId = nextIdForTurma(turma, taken);
    extras.push({
      ...merged,
      id: newId,
      idAnterior: raw.id,
      turma,
      grupo: grupoFromTurma(turma),
    });
    if (overrides[raw.id]) {
      overrides[newId] = { ...overrides[raw.id], idAnterior: raw.id };
      delete overrides[raw.id];
    }
    applyRename(raw.id, newId);
    remapped += 1;
  }

  if (remapped === 0) return 0;

  useFinance.setState({
    alunosExtra: extras,
    alunosOverrides: overrides,
    alunosDeletedIds: deleted,
    mensalidades,
    faturasPropina: faturas,
    fotos,
    movimentosBaiExtra: baiExtra,
    movimentosBaiDeletedIds: baiDeleted,
  });
  try {
    useFinance.getState().pushAudit?.(
      "realinhar_ids",
      `${remapped} ID(s) alinhados à turma oficial`,
    );
  } catch {
    /* audit opcional */
  }
  return remapped;
}


const ID_ALUNO_RE = /\b(?:P[123]|CP[12]|CE[12]|CM[12]|[3-6]E)-\d{2}\b/gi;

function collectTraceIds(state: {
  alunosExtra?: Aluno[];
  alunosOverrides?: Record<string, Partial<Aluno>>;
  mensalidades?: Mensalidade[];
  fotos?: Record<string, string>;
  faturasPropina?: FaturaPropina[];
  movimentosBaiExtra?: MovimentoBai[];
  alunosDeletedIds?: string[];
  documentosAluno?: { alunoId?: string }[];
  codigosRecibo?: { alunoId?: string }[];
}): string[] {
  const ids = new Set<string>();
  const add = (raw?: string) => {
    const id = String(raw || "").trim();
    if (id) ids.add(id);
  };
  for (const a of state.alunosExtra || []) {
    add(a.id);
    add(a.idAnterior);
  }
  for (const id of Object.keys(state.alunosOverrides || {})) add(id);
  for (const m of state.mensalidades || []) add(m.id);
  for (const id of Object.keys(state.fotos || {})) add(id);
  for (const f of state.faturasPropina || []) add(f.alunoId);
  for (const d of state.documentosAluno || []) add(d.alunoId);
  for (const c of state.codigosRecibo || []) add(c.alunoId);
  for (const id of state.alunosDeletedIds || []) add(id);
  const bai = [...(seed.movimentosBai || []), ...(state.movimentosBaiExtra || [])];
  for (const m of bai) {
    const blob = `${m.id || ""} ${m.descricao || ""} ${m.observacoes || ""}`;
    const found = blob.match(ID_ALUNO_RE);
    if (found) for (const id of found) add(id.toUpperCase());
  }
  return Array.from(ids);
}

function parseBaiMatricula(id: string, movimentos: MovimentoBai[]): {
  nome?: string;
  liquido?: number;
  dataPag?: string;
  recibo?: string;
  metodo?: string;
} {
  const idUp = id.toUpperCase();
  const idEsc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // "Matrícula Nome Completo (P2-03)" — nome pode ter várias linhas / "e "
  const re = new RegExp(
    `Matr[ií]cula\\s+([\\s\\S]+?)\\s*\\(${idEsc}\\)`,
    "i",
  );
  for (const m of movimentos) {
    const desc = String(m.descricao || "");
    const obs = String(m.observacoes || "");
    const mid = String(m.id || "");
    const blob = `${desc} ${obs} ${mid}`;
    if (!blob.toUpperCase().includes(idUp)) continue;
    const mm = desc.match(re) || blob.match(re);
    const rec = blob.match(/recibo\s*(EF\/\d+)/i);
    const met = blob.match(/M[eé]todo:\s*([^·\n]+)/i);
    const entrada = Number(m.entrada) || 0;
    if (mm || entrada > 0 || mid.toUpperCase().includes(idUp)) {
      let nome = mm?.[1]?.replace(/\s+/g, " ").trim();
      // limpar sufixos de parcela "Inscrição · Nome"
      if (nome && /·/.test(nome)) {
        const parts = nome.split("·");
        nome = parts[parts.length - 1].trim();
      }
      return {
        nome: nome || undefined,
        liquido: entrada > 0 ? entrada : undefined,
        dataPag: m.data || undefined,
        recibo: rec?.[1],
        metodo: met?.[1]?.trim(),
      };
    }
  }
  return {};
}

/** Lista todos os IDs de matrícula referidos no extrato BAI com dados de ficha. */
function scanBaiMatriculas(movimentos: MovimentoBai[]): {
  id: string;
  nome: string;
  liquido: number;
  dataPag: string;
  recibo: string;
  metodo: string;
}[] {
  const out: {
    id: string;
    nome: string;
    liquido: number;
    dataPag: string;
    recibo: string;
    metodo: string;
  }[] = [];
  const seen = new Set<string>();
  const reLine =
    /Matr[ií]cula\s+(.+?)\s*\(([A-Za-z0-9]+-\d{2,})\)/i;
  for (const m of movimentos) {
    const desc = String(m.descricao || "");
    const obs = String(m.observacoes || "");
    const blob = `${desc} ${obs}`;
    const rec = blob.match(/recibo\s*(EF\/\d+)/i);
    const met = blob.match(/M[eé]todo:\s*([^·\n]+)/i);
    const mm = desc.match(reLine) || blob.match(reLine);
    if (mm) {
      let nome = (mm[1] || "").replace(/\s+/g, " ").trim();
      if (/·/.test(nome)) nome = nome.split("·").pop()!.trim();
      const id = (mm[2] || "").toUpperCase();
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push({
          id,
          nome: nome || `Aluno ${id}`,
          liquido: Number(m.entrada) || 0,
          dataPag: m.data || "",
          recibo: rec?.[1] || "",
          metodo: met?.[1]?.trim() || "",
        });
      }
    }
    const idFromApp = String(m.id || "").match(/^APP-MAT-([A-Za-z0-9]+-\d+)/i);
    if (idFromApp) {
      const id = idFromApp[1].toUpperCase();
      if (!seen.has(id)) {
        seen.add(id);
        const nomeM = desc.match(/Matr[ií]cula\s+(.+?)\s*\(/i);
        let nome = (nomeM?.[1] || "").replace(/\s+/g, " ").trim();
        if (/·/.test(nome)) nome = nome.split("·").pop()!.trim();
        out.push({
          id,
          nome: nome || `Aluno ${id}`,
          liquido: Number(m.entrada) || 0,
          dataPag: m.data || "",
          recibo: rec?.[1] || "",
          metodo: met?.[1]?.trim() || "",
        });
      }
    }
  }
  return out;
}

function stubAlunoFromTrace(
  id: string,
  ov: Partial<Aluno> | undefined,
  mens: Mensalidade | undefined,
  faturaNome?: string,
  bai?: { nome?: string; liquido?: number; dataPag?: string; recibo?: string; metodo?: string },
): Aluno {
  const turma = String(ov?.turma || mens?.turma || turmaFromId(id) || "");
  const liquido = Number(ov?.liquido || bai?.liquido || 0);
  return {
    id,
    nome: String(ov?.nome || mens?.nome || faturaNome || bai?.nome || `Aluno ${id}`),
    turma,
    grupo: String(ov?.grupo || grupoFromTurma(turma)),
    inscricao: Number(ov?.inscricao || 0),
    manuais: Number(ov?.manuais || 0),
    uniforme: Number(ov?.uniforme || 0),
    seguro: Number(ov?.seguro || 0),
    extras: Number(ov?.extras || 0),
    curso: Number(ov?.curso || 0),
    mensalidade1: Number(ov?.mensalidade1 || mens?.propina || 0),
    dataPag: String(ov?.dataPag || bai?.dataPag || ""),
    bruto: Number(ov?.bruto || liquido || 0),
    descPct: Number(ov?.descPct || 0),
    liquido,
    encarregado: String(ov?.encarregado || ""),
    telefone: String(ov?.telefone || ""),
    bi: String(ov?.bi || ""),
    familia: String(ov?.familia || ""),
    recibo: String(ov?.recibo || bai?.recibo || ""),
    metodoPagamento: String(ov?.metodoPagamento || bai?.metodo || ""),
    obs:
      ov?.obs ||
      (bai?.nome
        ? `Recuperado do extrato BAI (matrícula ${id}${bai.recibo ? ` · ${bai.recibo}` : ""})`
        : "Recuperado automaticamente (propinas / arquivo / BAI)"),
    propina: Number(ov?.propina || mens?.propina || 0),
    statusPag: (ov?.statusPag as Aluno["statusPag"]) || (liquido > 0 ? "pago" : "registado"),
    dataNascimento: ov?.dataNascimento,
    idAnterior: ov?.idAnterior,
    transferidoCampusCidade: ov?.transferidoCampusCidade,
    createdAt: ov?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Reabre fichas que o realinhamento ou o merge da nuvem esconderam
 * (ID antigo em alunosDeletedIds sem substituto, ou só restava a linha de propinas).
 */

/** Normaliza nome para comparação (sem acentos, minúsculas, espaços colapsados). */
export function normalizeNomeAluno(n: string): string {
  return (n || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function mergePagamentosMes(
  a: Record<string, number> = {},
  b: Record<string, number> = {},
): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    const nv = Number(v) || 0;
    if (nv > (Number(out[k]) || 0)) out[k] = nv;
  }
  return out;
}

/**
 * Fonte de verdade = Matrículas (alunosAll).
 * Propinas fica com exactamente 1 linha por aluno activo.
 */
export function reporPropinasFromMatriculas(): { alunos: number; removidos: number } {
  const state = useFinance.getState();
  const alunos = alunosAll(
    state.alunosExtra || [],
    state.alunosOverrides || {},
    state.alunosDeletedIds || [],
  );
  const old = [...(state.mensalidades || [])];
  const byId = new Map<string, Mensalidade>();
  for (const m of old) {
    if (!m?.id) continue;
    const prev = byId.get(m.id);
    if (!prev) {
      byId.set(m.id, m);
      continue;
    }
    byId.set(m.id, {
      ...prev,
      ...m,
      pagamentos: mergePagamentosMes(prev.pagamentos, m.pagamentos),
      pagamentosEm: { ...(prev.pagamentosEm || {}), ...(m.pagamentosEm || {}) },
    });
  }
  const activeIds = new Set(alunos.map((a) => a.id));
  const leftovers = old.filter((m) => m?.id && !activeIds.has(m.id));
  const cc = [...(state.contaCorrente || [])].map((c) =>
    c.mes === "set" && (c.tipo === "pagamento" || c.tipo === "aplicacao")
      ? { ...c, mes: "out", descricao: (c.descricao || "").replace(/[Ss]etembro/g, "Outubro") }
      : c,
  );
  const next: Mensalidade[] = alunos.map((a) => {
    let row = byId.get(a.id);
    if (!row) {
      const nn = normalizeNomeAluno(a.nome);
      row = leftovers.find((m) => normalizeNomeAluno(m.nome) === nn);
    }
    const tarifa = tarifaPropinaAluno(a) || Number(row?.propina) || 0;
    const pagamentos = { ...(row?.pagamentos || {}) };
    const pagamentosEm = { ...(row?.pagamentosEm || {}) };
    const nAdiant = inferMesesAdiantados(a);
    moverSetembroParaOutubro(pagamentos, pagamentosEm);
    if (nAdiant > 0 && tarifa > 0) {
      for (let i = 0; i < nAdiant; i++) {
        const mesKey = MESES_PROPINA_ADIANTADOS[i];
        if (!pagamentos[mesKey] || pagamentos[mesKey] <= 0) {
          pagamentos[mesKey] = tarifa;
          pagamentosEm[mesKey] = String(a.dataPag || new Date().toISOString().slice(0, 10));
        }
      }
      moverSetembroParaOutubro(pagamentos, pagamentosEm);
      const jaCc = cc.some(
        (c) => c.alunoId === a.id && c.mes === "out" && (c.tipo === "pagamento" || c.tipo === "aplicacao"),
      );
      if (!jaCc && (pagamentos.out || 0) > 0) {
        const seq = cc.filter((c) => c.alunoId === a.id).length + 1;
        cc.push({
          id: `CC-OUT-${a.id}`,
          alunoId: a.id,
          data: pagamentosEm.out || new Date().toISOString().slice(0, 10),
          tipo: "pagamento",
          valor: Number(pagamentos.out) || tarifa,
          mes: "out",
          descricao: "Propina Outubro paga antecipadamente na matrícula",
          doc: `CC-${a.id}-${String(seq).padStart(4, "0")}`,
        });
      }
    }
    return {
      id: a.id,
      nome: a.nome,
      turma: a.turma || "",
      propina: tarifa,
      pagamentos,
      pagamentosEm,
      obs: row?.obs || a.obs || "",
    };
  });
  const removidos = Math.max(0, old.length - next.length);
  useFinance.setState({ mensalidades: next, contaCorrente: cc });
  try {
    useFinance.getState().pushAudit?.(
      "propina_repor",
      `${next.length} aluno(s) · Outubro adiantado · removidas ${removidos} linha(s)`,
    );
  } catch {
    /* optional */
  }
  return { alunos: next.length, removidos };
}

/**
 * Colapsa fichas duplicadas (mesmo nome normalizado ou cadeia idAnterior).
 * Mantém a ficha "melhor" (ID alinhado à turma, mais dados) e esconde as outras.
 * Resolve o caso 52 → 48 após realinhamentos + recuperação agressiva.
 */
export function sanearAlunosDuplicados(): { removidos: number; detalhes: string[] } {
  const state = useFinance.getState();
  let extras = [...(state.alunosExtra || [])];
  let deleted = [...(state.alunosDeletedIds || [])];
  const overrides = { ...(state.alunosOverrides || {}) };
  const detalhes: string[] = [];

  const visible = alunosAll(extras, overrides, deleted);
  const byName = new Map<string, Aluno[]>();
  for (const a of visible) {
    const key = normalizeNomeAluno(a.nome);
    if (!key) continue;
    const list = byName.get(key) || [];
    list.push(a);
    byName.set(key, list);
  }

  const score = (a: Aluno): number => {
    let s = 0;
    const fromId = turmaFromId(a.id);
    if (fromId && fromId === (a.turma || "").trim()) s += 50;
    if (a.dataNascimento) s += 20;
    if (a.idAnterior) s += 10; // já realinhado
    if ((a.propina || a.mensalidade1 || 0) > 0) s += 5;
    if ((a.obs || "").length > 0) s += 2;
    // IDs mais "novos" (maior sufixo numérico) ligeiramente preferidos
    const m = String(a.id || "").match(/(\d+)$/);
    if (m) s += Math.min(Number(m[1]), 30);
    return s;
  };

  const toDelete = new Set<string>();

  for (const [nome, list] of byName) {
    if (list.length < 2) continue;
    list.sort((a, b) => score(b) - score(a));
    const keep = list[0];
    for (const dup of list.slice(1)) {
      const stub =
        !dup.dataNascimento &&
        !(dup.telefone || "").trim() &&
        !(dup.encarregado || "").trim();
      const cadeia = Boolean(keep.idAnterior === dup.id || dup.idAnterior === keep.id);
      if (!stub && !cadeia) continue;
      toDelete.add(dup.id);
      detalhes.push(`Duplicado «${nome}»: manter ${keep.id}, esconder ${dup.id}`);
    }
  }

  // Cadeias idAnterior: só esconder X se NÃO houver recibo no Arquivo de outro aluno em X
  // (ex.: 3E-05 tinha idAnterior 4E-04, mas 4E-04 foi reutilizado pelo Nildo)
  const docs = state.documentosAluno || [];
  const nomeNoArquivo = (id: string) => {
    const d = docs.find((x) => x.alunoId === id);
    return normalizeNomeAluno(String(d?.alunoNome || ""));
  };
  for (const a of [...extras, ...(seed.alunos || [])]) {
    const prev = a.idAnterior;
    if (!prev || prev === a.id) continue;
    const nomePrevDoc = nomeNoArquivo(prev);
    const nomeNovo = normalizeNomeAluno(a.nome);
    if (nomePrevDoc && nomePrevDoc !== nomeNovo) {
      // ID reutilizado por outro aluno — não apagar
      continue;
    }
    toDelete.add(prev);
  }

  if (toDelete.size === 0) {
    return { removidos: 0, detalhes: [] };
  }

  for (const id of toDelete) {
    if (!deleted.includes(id)) deleted.push(id);
    // Só esconder via deletedIds — NUNCA apagar de alunosExtra (preserva Otchaly e novas matrículas)
  }

  useFinance.setState({
    alunosExtra: extras,
    alunosDeletedIds: Array.from(new Set(deleted)),
  });

  try {
    useFinance.getState().pushAudit?.(
      "sanear_duplicados",
      `${toDelete.size} ficha(s): ${detalhes.slice(0, 8).join(" · ")}`,
    );
  } catch {
    /* optional */
  }

  return { removidos: toDelete.size, detalhes };
}

/** Reabre o aluno que falta neste PC: deletedIds + linha de Propinas + BAI APP-PROP/APP-MAT. */
export function reabrirAlunosUnicos(): { restaurados: number; detalhes: string[] } {
  const state = useFinance.getState();
  const extras = [...(state.alunosExtra || [])];
  const overrides = { ...(state.alunosOverrides || {}) };
  let deleted = [...(state.alunosDeletedIds || [])];
  const mensalidades = state.mensalidades || [];
  const detalhes: string[] = [];
  const visiveis = alunosAll(extras, overrides, deleted);
  const nomes = new Set(visiveis.map((a) => normalizeNomeAluno(a.nome)).filter(Boolean));
  const idsVis = new Set(visiveis.map((a) => a.id));

  const keepDeleted: string[] = [];
  for (const id of deleted) {
    const extra = extras.find((a) => a.id === id);
    const seedHit = seed.alunos.find((a) => a.id === id);
    const mens = mensalidades.find((m) => m.id === id);
    const fonteNome = extra?.nome || seedHit?.nome || mens?.nome || overrides[id]?.nome;
    if (!extra && !seedHit && !mens && !overrides[id]) {
      keepDeleted.push(id);
      continue;
    }
    const nn = normalizeNomeAluno(String(fonteNome || ""));
    if (idsVis.has(id) || (nn && nomes.has(nn))) {
      keepDeleted.push(id);
      continue;
    }
    deleted = deleted.filter((x) => x !== id);
    if (!extra && !seedHit) {
      extras.push(
        stubAlunoFromTrace(id, overrides[id], mens, undefined, undefined),
      );
    }
    detalhes.push(`Reaberto ${id} · ${fonteNome || id}`);
    if (nn) nomes.add(nn);
    idsVis.add(id);
  }

  for (const m of mensalidades) {
    if (!m?.id || idsVis.has(m.id)) continue;
    const nn = normalizeNomeAluno(m.nome);
    if (!nn || nomes.has(nn)) continue;
    if (deleted.includes(m.id)) deleted = deleted.filter((x) => x !== m.id);
    if (!extras.some((a) => a.id === m.id) && !seed.alunos.some((a) => a.id === m.id)) {
      extras.push(stubAlunoFromTrace(m.id, overrides[m.id], m, undefined, undefined));
    }
    detalhes.push(`Encontrado em Propinas ${m.id} · ${m.nome}`);
    nomes.add(nn);
    idsVis.add(m.id);
  }

  const bai = [...(seed.movimentosBai || []), ...(state.movimentosBaiExtra || [])];
  for (const mov of bai) {
    const blob = `${mov.id || ""} ${mov.descricao || ""} ${mov.observacoes || ""}`;
    const app = String(mov.id || "").match(/^APP-(?:PROP|MAT)-([A-Za-z0-9]+-\d+)/i);
    const obs = String(mov.observacoes || "").match(/\bAluno\s+([A-Za-z0-9]+-\d+)/i);
    const id = (app?.[1] || obs?.[1] || "").toUpperCase();
    if (!id || idsVis.has(id)) continue;
    let nome = "";
    const pn = String(mov.descricao || "").match(/Propina\s+\w+\s+·\s+(.+)$/i);
    const mn = String(mov.descricao || "").match(/Matr[ií]cula\s+(.+?)\s*\(/i);
    nome = (pn?.[1] || mn?.[1] || "").replace(/\s+/g, " ").trim();
    const nn = normalizeNomeAluno(nome);
    if (nn && nomes.has(nn)) continue;
    if (!nn && !mensalidades.some((x) => x.id === id)) continue;
    if (deleted.includes(id)) deleted = deleted.filter((x) => x !== id);
    const mens = mensalidades.find((x) => x.id === id);
    if (!extras.some((a) => a.id === id) && !seed.alunos.some((a) => a.id === id)) {
      extras.push(
        stubAlunoFromTrace(id, overrides[id], mens, nome || undefined, {
          nome: nome || undefined,
          liquido: Number(mov.entrada) || 0,
          dataPag: mov.data,
        }),
      );
    }
    detalhes.push(`Encontrado no BAI ${id} · ${nome || id}`);
    if (nn) nomes.add(nn);
    idsVis.add(id);
  }

  if (detalhes.length === 0) return { restaurados: 0, detalhes: [] };
  useFinance.setState({
    alunosExtra: extras,
    alunosDeletedIds: Array.from(new Set(deleted)),
  });
  try {
    useFinance.getState().pushAudit?.(
      "reabrir_unicos",
      `${detalhes.length}: ${detalhes.slice(0, 8).join(" · ")}`,
    );
  } catch {
    /* optional */
  }
  return { restaurados: detalhes.length, detalhes };
}


/**
 * Força a ficha 4E-04 · Nildo Azael Fortunato José (recibo no Arquivo).
 * O seed tinha 4E-04 como idAnterior de 3E-05 (Lucas); o ID foi reutilizado.
 */
export function forcarFichaNildo4E04(): { ok: boolean; message: string } {
  const ID = "4E-04";
  const state = useFinance.getState();
  const docs = (state.documentosAluno || []).filter((d) => d.alunoId === ID);
  docs.sort((a, b) =>
    String(b.emitidoEm || "").localeCompare(String(a.emitidoEm || "")),
  );
  const d = docs[0];
  const nome =
    String(d?.alunoNome || "").trim() || "Nildo Azael Fortunato José";
  const liquido = Number(d?.valor) > 0 ? Number(d?.valor) : 202000;
  const recibo = String(d?.numero || d?.codigoVerificacao || "").trim();
  const dataPag = String(d?.pagoEm || d?.emitidoEm || "2026-09-23");

  let extras = [...(state.alunosExtra || [])].filter((a) => a.id !== ID);
  const deleted = (state.alunosDeletedIds || []).filter((x) => x !== ID);
  const ov = { ...(state.alunosOverrides || {}) };
  delete ov[ID];

  const ficha: Aluno = {
    id: ID,
    nome,
    turma: "4ème",
    grupo: "Collège",
    inscricao: 0,
    manuais: 0,
    cadernos: 0,
    uniforme: 0,
    seguro: 0,
    extras: 0,
    curso: 0,
    mensalidade1: 0,
    propina: 0,
    dataPag,
    bruto: liquido,
    descPct: 0,
    liquido,
    encarregado: "",
    telefone: "",
    bi: "",
    familia: nome.split(" ").slice(-2).join(" ") || nome,
    recibo: recibo || "REC-EF051-2026-10",
    obs: "Ficha forçada a partir do Arquivo (4E-04 · Nildo). ID reutilizado após realinhamento 3E-05.",
    statusPag: "pago",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  extras.push(ficha);
  useFinance.setState({
    alunosExtra: extras,
    alunosDeletedIds: deleted,
    alunosOverrides: ov,
  });
  try {
    persistAlunosCensoLocal(extras);
  } catch {
    /* ignore */
  }
  try {
    reporPropinasFromMatriculas();
  } catch {
    /* ignore */
  }
  // Garantir Outubro pago nas propinas do Nildo
  try {
    const st = useFinance.getState();
    const prop = 75000;
    const mens = [...(st.mensalidades || [])];
    const ix = mens.findIndex((m) => m.id === ID);
    const pag = { out: prop, nov: 0, dez: 0, jan: 0, fev: 0, mar: 0, abr: 0, mai: 0, jun: 0 };
    const pagEm = { out: dataPag.slice(0, 10) };
    if (ix >= 0) {
      mens[ix] = {
        ...mens[ix],
        nome,
        turma: "4ème",
        propina: Number(mens[ix].propina) || prop,
        pagamentos: { ...(mens[ix].pagamentos || {}), ...pag },
        pagamentosEm: { ...(mens[ix].pagamentosEm || {}), ...pagEm },
      };
    } else {
      mens.push({
        id: ID,
        nome,
        turma: "4ème",
        propina: prop,
        pagamentos: pag,
        pagamentosEm: pagEm,
        obs: "Outubro pago na matrícula",
      } as Mensalidade);
    }
    useFinance.setState({ mensalidades: mens });
  } catch {
    /* ignore */
  }
  try {
    useFinance.getState().pushAudit?.("forcar_ficha", `${ID} · ${nome}`);
  } catch {
    /* ignore */
  }
  return { ok: true, message: `${nome} (${ID}) forçado nas Matrículas · Outubro pago.` };
}

/** Meses correctos a marcar pagos (matrícula liquidada + mesesPropina). */
export const MESES_PAGOS_MATRICULA: Record<string, string[]> = {
  "P3-02": ["out"],
  "P3-03": ["out"],
  "P2-01": ["out"],
  "P1-01": ["out"],
  "P1-04": ["out"],
  "P1-03": ["out"],
  "CM1-01": ["out"],
  "P3-07": ["out"],
  "5E-02": ["out"],
  "6E-01": ["out"],
  "4E-04": ["out"],
  "P1-06": ["out", "nov", "dez"],
  "CP2-01": ["out", "nov", "dez"],
  "CM2-06": ["out", "nov", "dez"],
  "5E-03": ["out", "nov", "dez", "jan", "fev", "mar", "abr", "mai"],
  "3E-05": ["out", "nov", "dez", "jan", "fev", "mar", "abr", "mai"],
  "CP2-04": ["out", "nov", "dez", "jan", "fev", "mar", "abr", "mai", "jun"],
  "CE1-02": ["out", "nov", "dez", "jan", "fev", "mar", "abr", "mai", "jun"],
};

/** IDs com excedente real (valor acima da tarifa). */
export const IDS_EXCEDENTE_REAL = new Set<string>(["P1-04"]);

export function mesesOficiaisPagos(id: string): string[] | null {
  return MESES_PAGOS_MATRICULA[id] ? [...MESES_PAGOS_MATRICULA[id]] : null;
}

const TODOS_MESES_PROP = ["out", "nov", "dez", "jan", "fev", "mar", "abr", "mai", "jun"] as const;

/**
 * Acerto definitivo:
 * - Remove Rockia P1-05 de tudo
 * - Alinha Propinas aos meses realmente pagos na matrícula
 * - Garante Nildo 4E-04 + Outubro pago
 */
export function acertarPropinasECenso(): { ok: boolean; message: string } {
  const st = useFinance.getState();

  // 1) Eliminar P1-05 Rockia
  const idRock = "P1-05";
  const deleted = Array.from(
    new Set([...(st.alunosDeletedIds || []).filter((x) => x !== idRock), idRock]),
  );
  const ov = { ...(st.alunosOverrides || {}) };
  delete ov[idRock];
  const fotos = { ...(st.fotos || {}) };
  delete fotos[idRock];

  let mens = (st.mensalidades || []).filter((m) => m.id !== idRock);
  let extras = (st.alunosExtra || []).filter((a) => a.id !== idRock);

  // 2) Forçar Nildo
  try {
    forcarFichaNildo4E04();
  } catch {
    /* ignore */
  }
  const st2 = useFinance.getState();
  mens = (st2.mensalidades || []).filter((m) => m.id !== idRock);
  extras = (st2.alunosExtra || []).filter((a) => a.id !== idRock);

  // 3a) William P3-07 e irmão Manuel 5E-02: só 1 mês (Outubro)
  const soOutubroIds = new Set(["P3-07", "5E-02"]);
  mens = mens.map((m) => {
    if (!soOutubroIds.has(m.id)) return m;
    const prop = Number(m.propina) || 170000;
    const oldPag = m.pagamentos || {};
    const oldEm = m.pagamentosEm || {};
    const outVal = Number(oldPag.out) > 0 ? Number(oldPag.out) : prop;
    const z: Record<string, number> = {};
    for (const k of TODOS_MESES_PROP) z[k] = 0;
    z.out = outVal;
    return {
      ...m,
      pagamentos: z,
      pagamentosEm: { out: oldEm.out || "" },
      obs: ((m.obs || "") + " · Corrigido: só Outubro pago").trim(),
    };
  });
  try {
    const ovW = { ...(useFinance.getState().alunosOverrides || {}) };
    for (const id of soOutubroIds) {
      const prev = ovW[id] || {};
      ovW[id] = { ...prev, mesesPropina: 1 };
    }
    useFinance.setState({ alunosOverrides: ovW });
  } catch { /* ignore */ }

  // 3) Alinhar pagamentos de propina
  const alunosMap = new Map<string, Aluno>();
  try {
    for (const a of alunosAll(st2.alunosExtra || [], st2.alunosOverrides || {}, deleted)) {
      alunosMap.set(a.id, a);
    }
  } catch {
    /* ignore */
  }

  mens = mens.map((m) => {
    const should = MESES_PAGOS_MATRICULA[m.id];
    const prop = Number(m.propina) || Number(alunosMap.get(m.id)?.propina) || 0;
    const oldPag = m.pagamentos || {};
    const oldEm = m.pagamentosEm || {};
    const dataRef = String(alunosMap.get(m.id)?.dataPag || oldEm.out || "").slice(0, 10);
    const newPag: Record<string, number> = {};
    const newEm: Record<string, string> = {};
    for (const k of TODOS_MESES_PROP) {
      if (should && should.includes(k)) {
        let val = Number(oldPag[k]) || 0;
        if (val <= 0) val = prop;
        // descontos família Mutapayi
        if (m.id === "CM2-06" || m.id === "CP2-01") val = val > 0 ? val : 63750;
        if (m.id === "P1-06") val = val > 0 ? val : 144500;
        newPag[k] = val;
        newEm[k] = oldEm[k] || dataRef || "";
      } else {
        newPag[k] = 0;
      }
    }
    // Se não está na lista de pagos correctos → zerar todos (não inventar Outubro)
    if (!should) {
      for (const k of TODOS_MESES_PROP) newPag[k] = 0;
    }
    return { ...m, pagamentos: newPag, pagamentosEm: newEm };
  });

  // Garantir linha de propinas para quem está na lista e falta
  for (const [id, months] of Object.entries(MESES_PAGOS_MATRICULA)) {
    if (mens.some((m) => m.id === id)) continue;
    const a = alunosMap.get(id);
    const prop = Number(a?.propina) || 0;
    const pag: Record<string, number> = {};
    const pagEm: Record<string, string> = {};
    for (const k of TODOS_MESES_PROP) {
      pag[k] = months.includes(k) ? prop : 0;
      if (months.includes(k)) pagEm[k] = String(a?.dataPag || "").slice(0, 10);
    }
    mens.push({
      id,
      nome: a?.nome || id,
      turma: a?.turma || "",
      propina: prop,
      pagamentos: pag,
      pagamentosEm: pagEm,
      obs: "Acerto automático meses pagos na matrícula",
    } as Mensalidade);
  }

  // Crédito/excedente real confirmado: só Hallan P1-04 (5 000 Kz).
  // Irmãos Bunga/Janota/Mutapayi têm MESES ADIANTADOS (tarifa × N), não excedente.
  const EXCEDENTE_REAL = new Set(["P1-04"]);
  const ccLimpa = (st2.contaCorrente || []).filter((c) => {
    if (c.alunoId === idRock) return false;
    if (c.tipo === "credito" && !EXCEDENTE_REAL.has(c.alunoId)) return false;
    return true;
  });

  useFinance.setState({
    alunosDeletedIds: deleted,
    alunosOverrides: ov,
    alunosExtra: extras,
    mensalidades: mens,
    fotos,
    documentosAluno: (st2.documentosAluno || []).filter((d) => d.alunoId !== idRock),
    codigosRecibo: (st2.codigosRecibo || []).filter((c) => c.alunoId !== idRock),
    faturasPropina: (st2.faturasPropina || []).filter((f) => f.alunoId !== idRock),
    contaCorrente: ccLimpa,
    crmEnvios: (st2.crmEnvios || []).filter((r) => r.alunoId !== idRock),
  });

  try {
    persistAlunosCensoLocal(extras);
  } catch {
    /* ignore */
  }
  try {
    useFinance.getState().pushAudit?.(
      "acertar_propinas_censo",
      `P1-05 removida · Nildo Outubro · ${Object.keys(MESES_PAGOS_MATRICULA).length} fichas alinhadas`,
    );
  } catch {
    /* ignore */
  }

  return {
    ok: true,
    message: `Acerto: Rockia P1-05 eliminada · Nildo Outubro pago · ${Object.keys(MESES_PAGOS_MATRICULA).length} alunos com meses correctos em Propinas.`,
  };
}

/**
 * Remove extras criados por recuperação agressiva (stubs) que inflavam o censo 53→56.
 * Mantém 4E-04 Nildo e qualquer extra com dados reais de matrícula.
 */
export function pruneExtrasFantasma(): { removidos: number } {
  const state = useFinance.getState();
  const docs = state.documentosAluno || [];
  const hasLiq = (id: string) =>
    docs.some(
      (d) =>
        d.alunoId === id &&
        (d.modelo === "liquidacao_matricula" ||
          /REC-EF|liquidacao|matr/i.test(String(d.numero || "") + String(d.modelo || ""))),
    );
  const seedIds = new Set((seed.alunos || []).map((a) => a.id));
  const replaced = new Set<string>();
  for (const a of [...(state.alunosExtra || []), ...(seed.alunos || [])]) {
    if (a.idAnterior && a.idAnterior !== a.id) replaced.add(a.idAnterior);
  }
  // 4E-04 Nildo: não é fantasma
  replaced.delete("4E-04");

  let removidos = 0;
  const next = (state.alunosExtra || []).filter((a) => {
    if (a.id === "4E-04") return true;
    if (seedIds.has(a.id)) return false; // não deve estar em extras
    const obs = String(a.obs || "");
    const stub =
      /Materializado|Recuperado do extrato|Recuperado automaticamente|reposto a partir/i.test(
        obs,
      );
    if (!stub) return true;
    // Stub sem liquidação de matrícula, ou ID "substituído" por realinhamento
    if (replaced.has(a.id) && !hasLiq(a.id)) {
      removidos += 1;
      return false;
    }
    if (stub && !hasLiq(a.id) && !(Number(a.liquido) > 0 && a.recibo)) {
      removidos += 1;
      return false;
    }
    return true;
  });
  if (removidos > 0) {
    useFinance.setState({ alunosExtra: next });
    try {
      persistAlunosCensoLocal(next);
    } catch {
      /* ignore */
    }
  }
  return { removidos };
}

export function recuperarAlunosOcultos(): { restaurados: number; detalhes: string[] } {
  const state = useFinance.getState();
  let extras = [...(state.alunosExtra || [])];
  const overrides = { ...(state.alunosOverrides || {}) };
  let deleted = [...(state.alunosDeletedIds || [])];
  const mensalidades = state.mensalidades || [];
  const faturas = state.faturasPropina || [];
  const detalhes: string[] = [];
  // Arquivo manda: IDs com documento saem de apagados imediatamente
  const docIds = new Set(
    (state.documentosAluno || []).map((d) => String(d.alunoId || "").trim()).filter(Boolean),
  );
  // 4E-04 Nildo: nunca manter em apagados (ID reutilizado)
  docIds.add("4E-04");
  if (docIds.size) {
    const before = deleted.length;
    deleted = deleted.filter((id) => !docIds.has(id));
    if (deleted.length < before) {
      detalhes.push(`IDs com recibo no Arquivo removidos da lista de apagados (${before - deleted.length})`);
    }
  }

  /** Há substituto realinhado (novo ID com idAnterior = oldId)? */
  const hasReplacement = (oldId: string) => {
    // 4E-04 reutilizado pelo Nildo: NÃO tratar como ID antigo de 3E-05
    const docNome = normalizeNomeAluno(
      String(
        (state.documentosAluno || []).find((d) => d.alunoId === oldId)?.alunoNome ||
          "",
      ),
    );
    if (docNome && /nildo/i.test(docNome)) return false;
    if (oldId === "4E-04") {
      // Se o Arquivo ou extras já têm Nildo neste ID, não é "substituído"
      const noExtra = extras.find((a) => a.id === oldId);
      if (noExtra && /nildo/i.test(noExtra.nome || "")) return false;
      if (docNome) return false;
    }
    const fromExtras = extras.some((a) => a.idAnterior === oldId && a.id !== oldId);
    const fromSeed = (seed.alunos || []).some(
      (a) => a.idAnterior === oldId && a.id !== oldId,
    );
    if (!fromExtras && !fromSeed) return false;
    // Só é substituto se o nome no Arquivo for o mesmo do aluno "novo" (realinhamento real)
    if (docNome) {
      const novo = [...extras, ...(seed.alunos || [])].find(
        (a) => a.idAnterior === oldId && a.id !== oldId,
      );
      if (novo && normalizeNomeAluno(novo.nome) !== docNome) return false;
    }
    return true;
  };

  // Nunca reabrir IDs que já têm substituto — causa dos 52 vs 48
  const keptDeleted: string[] = [];
  for (const id of deleted) {
    if (hasReplacement(id)) {
      keptDeleted.push(id);
      continue;
    }
    const isSeed = seed.alunos.some((a) => a.id === id);
    // Seed eliminado definitivamente: manter apagado (não ressuscitar P1-05 se 4E-05 existe ou foi purged)
    if (isSeed) {
      keptDeleted.push(id);
      continue;
    }
    if (extras.some((a) => a.id === id)) {
      // extra na lista de apagados: reabrir só se não houver homónimo visível
      const ex = extras.find((a) => a.id === id)!;
      const nomeJaVisivel = alunosAll(
        extras.filter((a) => a.id !== id),
        overrides,
        keptDeleted,
      ).some((a) => normalizeNomeAluno(a.nome) === normalizeNomeAluno(ex.nome));
      if (nomeJaVisivel) {
        keptDeleted.push(id);
        continue;
      }
      detalhes.push(`Extra ${id} estava na lista de apagados — reaberto`);
      continue;
    }
    keptDeleted.push(id);
  }
  deleted = keptDeleted;

  const visibleList = alunosAll(extras, overrides, deleted);
  const visible = new Set(visibleList.map((a) => a.id));
  const visibleNames = new Set(
    visibleList.map((a) => normalizeNomeAluno(a.nome)).filter(Boolean),
  );

  // Traces: NÃO incluir alunosDeletedIds como fonte de reconstrução
  // (IDs apagados com substituto voltavam como stubs fantasma)
  const docs = state.documentosAluno || [];
  const codigos = state.codigosRecibo || [];
  const traces = collectTraceIds({
    alunosExtra: extras,
    alunosOverrides: overrides,
    mensalidades,
    fotos: state.fotos,
    faturasPropina: faturas,
    movimentosBaiExtra: state.movimentosBaiExtra,
    alunosDeletedIds: [], // crítico: não ressuscitar a partir da lista de apagados
    documentosAluno: docs,
    codigosRecibo: codigos,
  });

  // IDs que o utilizador eliminou de vez — nunca reabrir neste ciclo
  const purgedLocked = new Set(keptDeleted);

  for (const id of traces) {
    if (visible.has(id)) continue;
    if (purgedLocked.has(id)) continue;
    if (deleted.includes(id) && hasReplacement(id)) continue;
    if (seed.alunos.some((a) => a.id === id) && !deleted.includes(id)) {
      visible.add(id);
      continue;
    }
    if (extras.some((a) => a.id === id)) {
      // ficha extra existe mas estava filtered por deleted — só reabrir sem homónimo
      const ex = extras.find((a) => a.id === id)!;
      const nn = normalizeNomeAluno(ex.nome);
      if (nn && visibleNames.has(nn)) continue;
      deleted = deleted.filter((x) => x !== id);
      visible.add(id);
      if (nn) visibleNames.add(nn);
      detalhes.push(`ID ${id} reaberto (ficha extra ainda existia)`);
      continue;
    }
    const ov = overrides[id];
    const mens = mensalidades.find((m) => m.id === id);
    const fat = faturas.find((f) => f.alunoId === id);
    const docAluno = docs
      .filter((d) => d.alunoId === id)
      .sort((a, b) => String(b.emitidoEm || "").localeCompare(String(a.emitidoEm || "")))[0];
    const baiAll = [
      ...(seed.movimentosBai || []),
      ...(state.movimentosBaiExtra || []),
    ];
    const baiInfo = parseBaiMatricula(id, baiAll);
    if (
      !ov &&
      !mens &&
      !fat &&
      !docAluno &&
      !baiInfo.nome &&
      !(baiInfo.liquido && baiInfo.liquido > 0)
    ) {
      continue;
    }
    const stubNome = normalizeNomeAluno(
      String(
        ov?.nome ||
          mens?.nome ||
          fat?.alunoNome ||
          docAluno?.alunoNome ||
          baiInfo.nome ||
          "",
      ),
    );
    // Homónimo com outro ID: mesmo assim repor ESTE id (Nildo 4E-04 ≠ outro aluno).
    // Nunca meter na lista de apagados por coincidência de nome.
    const nomeFonte =
      fat?.alunoNome || docAluno?.alunoNome || baiInfo.nome;
    const baiMerged = {
      ...baiInfo,
      nome: baiInfo.nome || docAluno?.alunoNome || fat?.alunoNome,
      liquido: baiInfo.liquido || (docAluno?.valor ? Number(docAluno.valor) : undefined),
      dataPag: baiInfo.dataPag || docAluno?.pagoEm || docAluno?.emitidoEm,
      recibo: baiInfo.recibo || docAluno?.numero || docAluno?.codigoVerificacao,
    };
    const stub = stubAlunoFromTrace(id, ov, mens, nomeFonte, baiMerged);
    if (docAluno?.modelo === "liquidacao_matricula" || (docAluno?.valor || 0) > 0) {
      stub.statusPag = "pago";
      if (!stub.liquido && docAluno?.valor) stub.liquido = Number(docAluno.valor) || 0;
      if (!stub.bruto) stub.bruto = stub.liquido;
    }
    extras.push(stub);
    deleted = deleted.filter((x) => x !== id);
    visible.add(id);
    if (stubNome) visibleNames.add(stubNome);
    const label =
      ov?.nome ||
      mens?.nome ||
      fat?.alunoNome ||
      docAluno?.alunoNome ||
      baiInfo.nome ||
      "sem nome";
    detalhes.push(
      docAluno
        ? `ID ${id} reconstruído a partir do Arquivo (${label} · ${docAluno.numero || ""})`
        : baiInfo.nome && !ov && !mens
          ? `ID ${id} reconstruído a partir do BAI (${label})`
          : `ID ${id} reconstruído (${label})`,
    );
  }

  // BAI: NÃO recriar fichas em massa (causava 53→56 com IDs antigos).
  // Apenas reabrir se já existir em extras.
  const baiMovs = movimentosAll(
    state.movimentosBaiExtra || [],
    state.baiOverride,
    state.movimentosBaiDeletedIds || [],
  );
  for (const b of scanBaiMatriculas(baiMovs)) {
    if (visible.has(b.id)) continue;
    if (extras.some((a) => a.id === b.id)) {
      deleted = deleted.filter((x) => x !== b.id);
      visible.add(b.id);
    }
  }

  // ——— Rede de segurança: todo recibo/fatura no Arquivo com alunoId sem ficha → recriar ———
  for (const d of docs) {
    const id = String(d.alunoId || "").trim();
    if (!id || visible.has(id)) continue;
    if (seed.alunos.some((a) => a.id === id) && !deleted.includes(id)) {
      visible.add(id);
      continue;
    }
    // Tirar de apagados: tem documento oficial, não pode ficar oculto
    deleted = deleted.filter((x) => x !== id);
    if (extras.some((a) => a.id === id)) {
      visible.add(id);
      detalhes.push(`ID ${id} reaberto (existia em extras + Arquivo)`);
      continue;
    }
    const stub = stubAlunoFromTrace(
      id,
      overrides[id],
      mensalidades.find((m) => m.id === id),
      d.alunoNome,
      {
        nome: d.alunoNome,
        liquido: Number(d.valor) || 0,
        dataPag: d.pagoEm || d.emitidoEm,
        recibo: d.numero || d.codigoVerificacao,
      },
    );
    if ((Number(d.valor) || 0) > 0 || d.modelo === "liquidacao_matricula") {
      stub.statusPag = "pago";
      stub.liquido = Number(d.valor) || stub.liquido || 0;
      stub.bruto = stub.bruto || stub.liquido;
    }
    extras.push(stub);
    visible.add(id);
    detalhes.push(
      `ID ${id} reposto do Arquivo (${d.alunoNome || "?"} · ${d.numero || d.id})`,
    );
  }

  // Materializar só liquidação de matrícula; não recriar propinas/faturas avulsas (inflava o censo)
  let materializados = 0;
  for (const d of docs) {
    const id = String(d.alunoId || "").trim();
    if (!id) continue;
    const isMat =
      d.modelo === "liquidacao_matricula" ||
      /liquidacao|matr[ií]cula|REC-EF/i.test(String(d.numero || "") + String(d.modelo || ""));
    if (!isMat && id !== "4E-04") continue;
    if (hasReplacement(id) && id !== "4E-04") continue;
    deleted = deleted.filter((x) => x !== id);
    const nomeDoc = String(d.alunoNome || "").trim();
    const exIdx = extras.findIndex((a) => a.id === id);
    if (exIdx >= 0) {
      const cur = extras[exIdx];
      const nomeCur = String(cur.nome || "").trim();
      if (nomeDoc && (!nomeCur || nomeCur === id || /^aluno\s/i.test(nomeCur) || nomeDoc.length > nomeCur.length)) {
        extras[exIdx] = {
          ...cur,
          nome: nomeDoc,
          liquido: Number(cur.liquido) > 0 ? cur.liquido : Number(d.valor) || 0,
          bruto: Number(cur.bruto) > 0 ? cur.bruto : Number(d.valor) || 0,
          recibo: cur.recibo || d.numero || d.codigoVerificacao || "",
          dataPag: cur.dataPag || d.pagoEm || d.emitidoEm || "",
          statusPag: cur.statusPag || "pago",
          turma: cur.turma || turmaFromId(id) || "",
          updatedAt: new Date().toISOString(),
        };
        materializados += 1;
      }
    } else if (!seed.alunos.some((a) => a.id === id)) {
      const stub = stubAlunoFromTrace(id, overrides[id], mensalidades.find((m) => m.id === id), nomeDoc, {
        nome: nomeDoc,
        liquido: Number(d.valor) || 0,
        dataPag: d.pagoEm || d.emitidoEm,
        recibo: d.numero || d.codigoVerificacao,
      });
      stub.turma = stub.turma || turmaFromId(id) || "";
      stub.statusPag = "pago";
      extras.push(stub);
      materializados += 1;
      detalhes.push(`Materializado: ${id} · ${nomeDoc}`);
    }
  }

  if (detalhes.length || materializados) {
    useFinance.setState({
      alunosExtra: extras,
      alunosDeletedIds: deleted,
    });
    try {
      persistAlunosCensoLocal(extras);
    } catch {
      /* ignore */
    }
    try {
      useFinance.getState().pushAudit?.(
        "recuperar_alunos",
        `${detalhes.length} rasto(s): ${detalhes.slice(0, 6).join(" · ")}`,
      );
    } catch {
      /* audit opcional */
    }
  }
  // Sempre garantir Nildo 4E-04 (ID reutilizado)
  try {
    forcarFichaNildo4E04();
  } catch {
    /* ignore */
  }
  return { restaurados: detalhes.length, detalhes };
}

export function alunosAll(
  extras: Aluno[] = [],
  overrides: Record<string, Partial<Aluno>> = {},
  deletedIds: string[] = [],
): Aluno[] {
  // Fonte estável: seed + extras − apagados.
  // Quem tem recibo no Arquivo NÃO conta como apagado (Nildo 4E-04, etc.).
  let docIds = new Set<string>();
  try {
    docIds = new Set(
      (useFinance.getState().documentosAluno || [])
        .map((d) => String(d.alunoId || "").trim())
        .filter(Boolean),
    );
  } catch {
    docIds = new Set();
  }
  const deleted = new Set(
    (deletedIds || []).filter((id) => !docIds.has(id)),
  );

  const apply = (a: Aluno): Aluno => {
    const o = overrides[a.id];
    const merged = o ? { ...a, ...o, id: a.id } : { ...a };
    const resolved = resolveTurmaOficial(merged);
    if (resolved && merged.turma !== resolved) {
      merged.turma = resolved;
    }
    const g = grupoFromTurma(merged.turma || "");
    if (merged.grupo !== g) merged.grupo = g;
    // Enriquecer nome a partir do Arquivo se a ficha estiver incompleta
    if (docIds.has(merged.id)) {
      try {
        const docs = (useFinance.getState().documentosAluno || []).filter(
          (d) => d.alunoId === merged.id,
        );
        docs.sort((a, b) =>
          String(b.emitidoEm || "").localeCompare(String(a.emitidoEm || "")),
        );
        const d = docs[0];
        if (d) {
          const nomeDoc = String(d.alunoNome || "").trim();
          const nomeCur = String(merged.nome || "").trim();
          if (
            nomeDoc &&
            (!nomeCur ||
              nomeCur === merged.id ||
              /^aluno\s/i.test(nomeCur) ||
              nomeDoc.length > nomeCur.length + 5)
          ) {
            merged.nome = nomeDoc;
          }
          if (!(Number(merged.liquido) > 0) && Number(d.valor) > 0) {
            merged.liquido = Number(d.valor);
            merged.bruto = merged.bruto || Number(d.valor);
            merged.statusPag = merged.statusPag || "pago";
          }
          if (!merged.recibo) {
            merged.recibo = d.numero || d.codigoVerificacao || merged.recibo;
          }
          if (!merged.turma) {
            merged.turma = turmaFromId(merged.id) || merged.turma || "";
          }
        }
      } catch {
        /* ignore */
      }
    }
    return merged;
  };

  const out: Aluno[] = [];
  const seenIds = new Set<string>();

  const push = (a: Aluno) => {
    if (!a?.id || seenIds.has(a.id)) return;
    if (deleted.has(a.id)) return;
    seenIds.add(a.id);
    out.push(apply(a));
  };

  for (const a of seed.alunos) push(a);
  for (const a of extras) push(a);
  // Sem stubs sintéticos a partir de todos os documentos (isso inflava 53→56).
  // Nildo 4E-04 entra só via forcarFichaNildo4E04 → alunosExtra.
  return out;
}

/**Ids que NÃO têm substituto (idAnterior) nem homónimo visível.
 * IDs reaisinhados (P1-07→CM2-xx) não devem aparecer como «repor».
 */
export function idsApagadosSemSubstituto(): string[] {
  const state = useFinance.getState();
  const extras = state.alunosExtra || [];
  const overrides = state.alunosOverrides || {};
  const deleted = state.alunosDeletedIds || [];
  const visible = alunosAll(extras, overrides, deleted);
  const visibleIds = new Set(visible.map((a) => a.id));
  const visibleNames = new Set(visible.map((a) => normalizeNomeAluno(a.nome)).filter(Boolean));
  const replaced = new Set<string>();
  for (const a of extras) {
    if (a.idAnterior && a.idAnterior !== a.id) replaced.add(a.idAnterior);
  }
  for (const ov of Object.values(overrides)) {
    const prev = (ov as { idAnterior?: string } | undefined)?.idAnterior;
    if (prev) replaced.add(prev);
  }
  return deleted.filter((id) => {
    // IDs antigos (P1-07, 4E-02, …) já não existem no seed oficial — não são «faltas».
    const seedHit = seed.alunos.find((a) => a.id === id);
    if (!seedHit) return false;
    if (visibleIds.has(id) || replaced.has(id)) return false;
    const extra = extras.find((a) => a.id === id);
    const nome = normalizeNomeAluno(
      extra?.nome || seedHit.nome || String((overrides[id] as { nome?: string } | undefined)?.nome || ""),
    );
    if (nome && visibleNames.has(nome)) return false;
    return true;
  });
}

export function salariosAll(
  extra: Salario[] = [],
  overrides: Record<string, Partial<Salario>> = {},
  deletedIds: string[] = [],
): Salario[] {
  const deleted = new Set(deletedIds);
  const fromSeed = seed.salarios
    .filter((s) => !deleted.has(s.id))
    .map((s) => {
      const o = overrides[s.id];
      const merged = o ? { ...s, ...o } : { ...s };
      // Correcção: empregadas de limpeza — salário mensal 90.000 (não ½ mês a 45.000)
      const fn = (merged.funcao || "").toLowerCase();
      if (fn.includes("limpez") && (merged.salario === 45000 || merged.diasTrab === 11)) {
        merged.salario = 90000;
        if ((merged.diasTrab || 0) < 22 && (merged.diasUteis || 22) >= 22) {
          merged.diasTrab = 22;
          merged.diasUteis = 22;
        }
      }
      return merged;
    });
  const extraIds = new Set(extra.map((s) => s.id));
  return [
    ...fromSeed.filter((s) => !extraIds.has(s.id)),
    ...extra
      .filter((s) => !deleted.has(s.id))
      .map((s) => {
        const fn = (s.funcao || "").toLowerCase();
        if (fn.includes("limpez") && (s.salario === 45000 || s.diasTrab === 11)) {
          return {
            ...s,
            salario: 90000,
            diasTrab: (s.diasTrab || 0) < 22 ? 22 : s.diasTrab,
            diasUteis: s.diasUteis && s.diasUteis >= 22 ? s.diasUteis : 22,
          };
        }
        return s;
      }),
  ];
}


/** Acrescenta movimento à conta BAI (entrada ou saída) e actualiza saldo. */
export function saldoCreditoDe(rows: ContaCorrenteMov[] | undefined, alunoId: string): number {
  let s = 0;
  for (const m of rows || []) {
    if (m.alunoId !== alunoId) continue;
    if (m.tipo === "pagamento") continue;
    if (m.tipo === "credito") s += Number(m.valor) || 0;
    else s -= Number(m.valor) || 0;
  }
  return Math.round(s);
}

function pushBaiMovimento(
  get: () => {
    movimentosBaiExtra: MovimentoBai[];
    baiOverride: boolean;
  },
  set: (p: { movimentosBaiExtra: MovimentoBai[] }) => void,
  opts: {
    id: string;
    data: string;
    entrada?: number;
    saida?: number;
    banco?: string;
    descricao: string;
    observacoes?: string;
  },
) {
  const extra = get().movimentosBaiExtra || [];
  if (extra.some((m) => m.id === opts.id)) return false;
  const movs = movimentosAll(extra, get().baiOverride, []);
  const last = movs[movs.length - 1];
  const prevSaldo = last?.saldo ?? seed.escola.saldoInicialBai ?? 0;
  const entrada = Number(opts.entrada) || 0;
  const saida = Number(opts.saida) || 0;
  const mov: MovimentoBai = {
    id: opts.id,
    linha: (last?.linha ?? 0) + 1,
    data: opts.data,
    banco: opts.banco || "APP",
    descricao: opts.descricao,
    entrada,
    saida,
    saldo: prevSaldo + entrada - saida,
    observacoes: opts.observacoes || "",
  };
  const next = sortAndRecalcBai([...extra, mov]);
  set({ movimentosBaiExtra: next });
  return true;
}

/** Ordena por data/linha e recalcula saldo corrido a partir do saldo inicial BAI. */
export function sortAndRecalcBai(rows: MovimentoBai[]): MovimentoBai[] {
  const sorted = [...rows].sort((a, b) => {
    const dc = (a.data || "").localeCompare(b.data || "");
    if (dc !== 0) return dc;
    return (a.linha || 0) - (b.linha || 0);
  });
  let saldo = Number(seed.escola.saldoInicialBai) || 0;
  return sorted.map((m, i) => {
    saldo = Math.round((saldo + (Number(m.entrada) || 0) - (Number(m.saida) || 0)) * 100) / 100;
    return { ...m, linha: i + 1, saldo };
  });
}

/**
 * Extrato BAI unificado.
 * — Com import (override): usa o CSV e ainda funde movimentos do seed em falta
 *   (ex.: entradas Transf pelo NI / Fecho TPA registadas na secretaria).
 * — Sem override: seed + extras da app, ordenados e com saldo recalculado.
 */
export function movimentosAll(
  extra: MovimentoBai[] = [],
  override = false,
  deletedIds: string[] = [],
): MovimentoBai[] {
  const deleted = new Set(deletedIds);
  const fp = (m: MovimentoBai) =>
    `${m.data}|${Number(m.entrada) || 0}|${Number(m.saida) || 0}|${(m.banco || "").trim()}|${(m.descricao || "").trim()}`;

  /** Apenas "Sync lançamento …" (duplicados das fotos) — saídas originais do seed mantêm-se todas. */
  const isDuplicateAppSync = (m: MovimentoBai) => {
    const id = String(m.id || "");
    const banco = String(m.banco || "");
    const obs = String(m.observacoes || "");
    if (id.startsWith("APP-SAL-") || banco === "SALARIO-APP") return false;
    // Só os sync de lançamentos BAI-2026-08-xxx das fotos
    if (/Sync lançamento/i.test(obs)) return true;
    if (/Sync lançamento/i.test(String(m.descricao || ""))) return true;
    return false;
  };

  const notDeleted = (m: MovimentoBai) => !deleted.has(m.id) && !isDuplicateAppSync(m);

  if (override && extra.length) {
    return sortAndRecalcBai(extra.filter(notDeleted));
  }

  // Modo normal: seed + extras, sem duplicar por fingerprint
  const ids = new Set<string>();
  const fps = new Set<string>();
  const out: MovimentoBai[] = [];
  for (const m of [...seed.movimentosBai, ...extra]) {
    if (!notDeleted(m)) continue;
    if (ids.has(m.id) || fps.has(fp(m))) continue;
    ids.add(m.id);
    fps.add(fp(m));
    out.push(m);
  }
  return sortAndRecalcBai(out);
}

export function fundoAtmAll(extra: FundoAtm[] = []): FundoAtm[] {
  // Tombstones: valor 0 + data 1970-01-01 = bloco apagado (esconde também o seed)
  const deleted = new Set(
    extra.filter((a) => a.valor === 0 && a.data === "1970-01-01").map((a) => a.id),
  );
  const liveExtra = extra.filter((a) => !(a.valor === 0 && a.data === "1970-01-01"));
  const ids = new Set(liveExtra.map((a) => a.id));
  // Blocos manuais / seed
  const base = [
    ...seed.fundoAtm.filter((a) => !ids.has(a.id) && !deleted.has(a.id)),
    ...liveExtra,
  ];
  const baseKeys = new Set(base.map((a) => `${a.data}|${Number(a.valor) || 0}`));
  // Levantamentos ATM no extrato BAI (seed) → entram no Fundo (não são custo)
  for (const m of seed.movimentosBai) {
    const sai = Number(m.saida) || 0;
    if (sai <= 0) continue;
    const blob = `${m.banco || ""} ${m.descricao || ""}`;
    if (!/ATM|Levantamento/i.test(blob)) continue;
    const key = `${m.data}|${sai}`;
    if (baseKeys.has(key) || deleted.has(m.id) || ids.has(m.id)) continue;
    base.push({ id: m.id, data: m.data, valor: sai });
    baseKeys.add(key);
  }
  return base;
}

export function fundoPagAll(extra: FundoPagamento[]): FundoPagamento[] {
  return [...seed.fundoPagamentos, ...extra];
}

export function categoriaTotals(ledger: Lancamento[]) {
  const map = new Map<string, { entradas: number; despesas: number }>();
  for (const l of ledger) {
    const cur = map.get(l.categoria) ?? { entradas: 0, despesas: 0 };
    if (l.tipo === "entrada") cur.entradas += l.valor;
    else cur.despesas += l.valor;
    map.set(l.categoria, cur);
  }
  return [...map.entries()]
    .map(([categoria, v]) => ({ categoria, ...v }))
    .sort((a, b) => b.despesas + b.entradas - (a.despesas + a.entradas));
}
