import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import seedJson from "@/data/seed.json";
import type {
  Aluno,
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
import { DEFAULT_OPERATORS, MESES_LETIVOS } from "@/data/types";
import { assertCanEdit } from "@/lib/can-edit";

const seed = seedJson as Seed;

/** Bloqueia mutações para Colaboradores 2–5 (só C1 edita). */
function requireEdit(get: () => { activeOperator: string; operators: string[] }) {
  assertCanEdit(get().activeOperator || "", get().operators || []);
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
};

type Store = ExtraState & {
  addCaptura: (input: CapturaInput) => Lancamento;
  addAluno: (aluno: Aluno) => void;
  updateAluno: (id: string, patch: Partial<Aluno>) => void;
  setMensalidade: (id: string, mes: string, valor: number) => void;
  confirmPropinaBai: (id: string, mes: string) => { ok: boolean; message: string };
  setFoto: (id: string, dataUrl: string) => void;
  removeExtra: (id: string) => void;
  updateExtra: (id: string, patch: Partial<Lancamento>) => void;
  resetLocal: () => void;
  setActiveOperator: (name: string) => void;
  setOperatorName: (index: number, name: string) => void;
  pushAudit: (action: string, detail: string) => void;
  pushSession: (action: "entrada" | "saida", detail?: string) => void;
  addFundoPagamento: (p: Omit<import("@/data/types").FundoPagamento, "id"> & { id?: string }) => void;
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
  importLancamentos: (rows: CapturaInput[]) => number;
  addRecibosSalario: (rows: ReciboSalario[]) => void;
  updateReciboSalario: (
    id: string,
    patch: Partial<Pick<ReciboSalario, "mes" | "mesKey" | "dataPag" | "diasTrab" | "diasUteis" | "liquido">>,
  ) => void;
  setReciboSalarioPago: (id: string, pago: boolean, dataPag?: string) => void;
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
  processarInbox: () => { ordenados: number; duplicados: number; ligados: number };
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
};

const initialMensalidades: Mensalidade[] = seed.mensalidades;


/** Mês lectivo → mês civil 0-11 (ano lectivo set–jun). */
const MES_LETIVO_IDX: Record<string, number> = {
  set: 8, out: 9, nov: 10, dez: 11, jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
};

/**
 * Prazo de pagamento da propina do mês lectivo:
 * do dia 30 do mês de referência até ao dia 10 do mês seguinte.
 * Ex.: propina de setembro → 30/09 a 10/10.
 */
export function limitePropina(mesLetivo: string, refYear?: number): { inicio: Date; fim: Date } {
  const idx = MES_LETIVO_IDX[mesLetivo] ?? 8;
  const now = new Date();
  let y = refYear ?? now.getFullYear();
  // Ajuste ano lectivo
  if (["set", "out", "nov", "dez"].includes(mesLetivo) && now.getMonth() < 8) y -= 1;
  if (["jan", "fev", "mar", "abr", "mai", "jun"].includes(mesLetivo) && now.getMonth() >= 8) y += 1;
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
              ti && tj && (ti === tj || ti.includes(tj) || tj.includes(ti));
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

        // 3) Ligar a salários / propinas / despesas
        const recibos = get().recibosSalario || [];
        const extras = get().extras || [];
        const mens = get().mensalidades || [];
        let ligados = 0;

        const suggestTipo = (desc: string, valor: number): import("@/data/types").InboxTipo => {
          const d = (desc || "").toLowerCase();
          if (/sal[aá]rio|honor[aá]rio|rh-20|app-sal/i.test(d)) return "salario";
          if (/propina|mensalidade|prop-|frais|scolarit/i.test(d)) return "propina";
          if (/tpa|multicaixa|cart[aã]o/i.test(d)) return "tpa";
          if (/transf|transfer/i.test(d)) return "transferencia";
          if (/dep[oó]sito|deposito/i.test(d)) return "deposito";
          if (/despesa|fornec|compra|factura|fatura/i.test(d)) return "despesa";
          if (valor < 0 || /pagamento|pagamento/i.test(d)) return "despesa";
          return "desconhecido";
        };

        items = items.map((it) => {
          if (it.status === "duplicado" || it.status === "ignorado") return it;
          const valor = Math.abs(Number(it.valor) || Number(it.saida) || Number(it.entrada) || 0);
          let tipo = it.tipo && it.tipo !== "desconhecido" ? it.tipo : suggestTipo(it.descricao, valor);
          let linkId = it.linkId;
          let linkLabel = it.linkLabel;
          let status = it.status === "reconciliado" ? it.status : ("classificado" as const);

          if (tipo === "salario" || /sal|honor|rh-/i.test(it.descricao)) {
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
          if (!linkId && (tipo === "despesa" || tipo === "desconhecido")) {
            const match = extras.find(
              (e: { id?: string; valor?: number; data?: string; descricao?: string; docInterno?: string }) =>
                Math.abs((Number(e.valor) || 0) - valor) < 1 &&
                (!it.data || !e.data || e.data === it.data),
            ) as { id?: string; docInterno?: string; descricao?: string } | undefined;
            if (match?.id) {
              linkId = match.id;
              linkLabel = `Despesa ${match.docInterno || match.id}`;
              status = "reconciliado";
              tipo = "despesa";
              ligados += 1;
            }
          }
          if (!linkId && tipo === "propina") {
            // marca como classificado propina — ligação fina fica no separador Propinas
            status = status === "reconciliado" ? status : "classificado";
          }

          if (it.tipo === "desconhecido" || !it.tipo) {
            tipo = tipo;
          }

          return {
            ...it,
            tipo,
            status: status === "por_classificar" && tipo !== "desconhecido" ? "classificado" : status,
            linkId,
            linkLabel,
          };
        });

        set({ inboxItems: items });
        get().pushAudit(
          "inbox_processar",
          `${ordenados} ordenados · ${duplicados} duplicados · ${ligados} ligados`,
        );
        return { ordenados, duplicados, ligados };
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
          const mov: MovimentoBai = {
            id: `APP-${id}`,
            linha: (last?.linha ?? 0) + 1,
            data: input.data,
            banco: `${tipoBai}-APP`,
            descricao:
              input.descricao ||
              input.categoria ||
              (isLevantamento
                ? "Levantamento ATM BAI"
                : input.origem === "banco"
                  ? "Transferência conta BAI"
                  : "Despesa cartão BAI"),
            entrada: 0,
            saida,
            saldo: prevSaldo - saida,
            observacoes: `Lançamento ${id}${input.fornecedor ? ` · ${input.fornecedor}` : ""}`,
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
        const row = { ...aluno, criadoPor: by, createdAt: new Date().toISOString() };
        set({ alunosExtra: [...get().alunosExtra, row] });
        get().pushAudit("criar_aluno", `${row.id} · ${row.nome}`);
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
        // Manter Propinas alinhada com a matrícula
        if (patch.propina != null || patch.nome != null || patch.turma != null) {
          set({
            mensalidades: get().mensalidades.map((m) =>
              m.id === id
                ? {
                    ...m,
                    propina: patch.propina != null ? Number(patch.propina) : m.propina,
                    nome: patch.nome != null ? String(patch.nome) : m.nome,
                    turma: patch.turma != null ? String(patch.turma) : m.turma,
                  }
                : m,
            ),
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
      /** Confirma o valor da propina no mês e regista entrada no Banco BAI (id estável por aluno+mês). */
      confirmPropinaBai: (id, mes) => {
        requireEdit(get);
        const row = get().mensalidades.find((m) => m.id === id);
        if (!row) return { ok: false, message: "Aluno não encontrado em Propinas." };
        const valor = Number(row.pagamentos?.[mes] || 0);
        if (valor <= 0) return { ok: false, message: "Indique um valor pago maior que zero antes de salvar." };
        const movId = `APP-PROP-${id}-${mes}`;
        const hoje = new Date().toISOString().slice(0, 10);
        // Remove movimento anterior do mesmo aluno/mês (re-sincronizar)
        set({
          movimentosBaiExtra: (get().movimentosBaiExtra || []).filter((m) => m.id !== movId),
          mensalidades: get().mensalidades.map((m) =>
            m.id === id
              ? {
                  ...m,
                  pagamentosEm: { ...(m.pagamentosEm || {}), [mes]: hoje },
                }
              : m,
          ),
        });
        const ok = pushBaiMovimento(get, set, {
          id: movId,
          data: hoje,
          entrada: valor,
          banco: "PROPINA-APP",
          descricao: `Propina ${mes} · ${row.nome}`,
          observacoes: `Aluno ${id} · confirmado Departamento de Finanças`,
        });
        if (!ok) return { ok: false, message: "Não foi possível registar no BAI." };
        get().pushAudit("bai_entrada_propina", `${id} · ${mes} · ${valor}`);
        // Classificar pontualidade
        const pontual = propinaNoPrazo(mes, hoje);
        return {
          ok: true,
          message: pontual
            ? `Propina ${mes} · ${row.nome}: ${valor} Kz no BAI (dentro do prazo → Pago).`
            : `Propina ${mes} · ${row.nome}: ${valor} Kz no BAI (fora do prazo → Pago c/ multa).`,
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
      version: 3,
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
        return {
          ...s,
          movimentosBaiExtra: keepExtra,
          baiOverride: false,
          movimentosBaiDeletedIds: [],
          // Evita alunos repetidos vindos de sessões / nuvem antigas
          alunosExtra: [],
          alunosOverrides: {},
          alunosDeletedIds: [],
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
      }),
    },
  ),
);

export function getSeed(): Seed {
  return seed;
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

export type Totals = {
  alunos: number;
  inscricoesLiquido: number;
  inscricoesSemMensal: number;
  propinasRecebidas: number;
  descontos: number;
  socioEntradas: number;
  socioDespesas: number;
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

  const ledger = buildLedger(extras);
  const custosOperacionais = ledger
    .filter((l) => {
      if (l.tipo !== "despesa" || l.origem === "socio") return false;
      // Levantamento ATM = mudança de forma de dinheiro, não custo
      const blob = `${l.pagamento} ${l.categoria} ${l.descricao}`;
      if (/levantamento\s*atm/i.test(blob)) return false;
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

export function alunosAll(
  extras: Aluno[] = [],
  overrides: Record<string, Partial<Aluno>> = {},
  deletedIds: string[] = [],
): Aluno[] {
  const deleted = new Set(deletedIds);
  const apply = (a: Aluno): Aluno => {
    const o = overrides[a.id];
    return o ? { ...a, ...o, id: a.id } : a;
  };
  const norm = (n: string) =>
    (n || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const out: Aluno[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  const push = (a: Aluno) => {
    if (deleted.has(a.id) || seenIds.has(a.id)) return;
    const nn = norm(a.nome);
    if (nn && seenNames.has(nn)) return; // bloqueia duplicado por nome
    seenIds.add(a.id);
    if (nn) seenNames.add(nn);
    out.push(apply(a));
  };

  for (const a of seed.alunos) push(a);
  for (const a of extras) push(a);
  return out;
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
