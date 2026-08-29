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

const seed = seedJson as Seed;

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
  recibosSalario: ReciboSalario[];
  /** Sobrescritas de salários do seed (por id). */
  salariosOverrides: Record<string, Partial<Salario>>;
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
  importBaiMovimentos: (rows: MovimentoBai[], replace: boolean) => void;
  importLancamentos: (rows: CapturaInput[]) => number;
  addRecibosSalario: (rows: ReciboSalario[]) => void;
  setReciboSalarioPago: (id: string, pago: boolean, dataPag?: string) => void;
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
      recibosSalario: [],
      salariosOverrides: {},
      setActiveOperator: (name) => set({ activeOperator: name }),
      setOperatorName: (index, name) => {
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
        set({ fundoExtra: get().fundoExtra.filter((x) => x.id !== id) });
        get().pushAudit("fundo_apagar", id);
      },
      addCaptura: (input) => {
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
          createdAt: now,
          criadoPor: by,
        };
        set({ extras: [...extras, row] });
        if (input.foto) set({ fotos: { ...get().fotos, [id]: input.foto } });
        // Sai da conta BAI (cartão TPA, transferência ou levantamento ATM)
        const saiDaContaBai =
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
          const movs = movimentosAll(get().movimentosBaiExtra, get().baiOverride);
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
          const movs = movimentosAll(get().movimentosBaiExtra, get().baiOverride);
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
        const by = get().activeOperator || "—";
        const row = { ...aluno, criadoPor: by, createdAt: new Date().toISOString() };
        set({ alunosExtra: [...get().alunosExtra, row] });
        get().pushAudit("criar_aluno", `${row.id} · ${row.nome}`);
        // Pagamento de matrícula por cartão/transferência → entrada no Banco BAI
        const met = (row.metodoPagamento || "").toLowerCase();
        const viaBai =
          /cart[aã]o|multicaixa|transfer|bai|tpa/i.test(met) ||
          met.includes("banco");
        const valor = Number(row.liquido) || 0;
        if (viaBai && valor > 0) {
          const ok = pushBaiMovimento(get, set, {
            id: `APP-MAT-${row.id}`,
            data: row.dataPag || new Date().toISOString().slice(0, 10),
            entrada: valor,
            banco: /transfer/i.test(met) ? "TRANSF-APP" : "CARTAO-APP",
            descricao: `Matrícula ${row.nome} (${row.id})`,
            observacoes: `Método: ${row.metodoPagamento || "—"} · recibo ${row.recibo || ""}`,
          });
          if (ok) get().pushAudit("bai_entrada_matricula", `${row.id} · +${valor}`);
        }
      },
      updateAluno: (id, patch) => {
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
      setFoto: (id, dataUrl) => set({ fotos: { ...get().fotos, [id]: dataUrl } }),
      updateExtra: (id, patch) => {
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
        get().pushAudit("apagar_lancamento", id);
        set({ extras: get().extras.filter((e) => e.id !== id) });
      },
      addRecibosSalario: (rows: ReciboSalario[]) => {
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
      setReciboSalarioPago: (id: string, pago: boolean, dataPag?: string) => {
        const prev = (get().recibosSalario || []).find((r) => r.id === id);
        set({
          recibosSalario: (get().recibosSalario || []).map((r) =>
            r.id === id
              ? { ...r, pago, dataPag: dataPag || r.dataPag }
              : r,
          ),
        });
        // Pagamento de honorários sai da conta BAI
        if (prev && pago && !prev.pago && prev.liquido > 0) {
          const movs = movimentosAll(get().movimentosBaiExtra, get().baiOverride);
          const last = movs[movs.length - 1];
          const prevSaldo = last?.saldo ?? seed.escola.saldoInicialBai ?? 0;
          const saida = Number(prev.liquido) || 0;
          const movId = `APP-SAL-${id}`;
          if (!(get().movimentosBaiExtra || []).some((m) => m.id === movId)) {
            const mov: MovimentoBai = {
              id: movId,
              linha: (last?.linha ?? 0) + 1,
              data: dataPag || prev.dataPag || new Date().toISOString().slice(0, 10),
              banco: "SALARIO-APP",
              descricao: `Honorários ${prev.nome} · ${prev.mes}`,
              entrada: 0,
              saida,
              saldo: prevSaldo - saida,
              observacoes: `Recibo ${id}`,
            };
            set({ movimentosBaiExtra: [...get().movimentosBaiExtra, mov] });
            get().pushAudit("bai_saida_salario", `${movId} · -${saida}`);
          }
        }
        // Se desmarcar pago, remove movimento app associado (se existir)
        if (prev && !pago && prev.pago) {
          const movId = `APP-SAL-${id}`;
          set({
            movimentosBaiExtra: (get().movimentosBaiExtra || []).filter((m) => m.id !== movId),
          });
          get().pushAudit("bai_estorno_salario", movId);
        }
        get().pushAudit("recibo_salario_pago", `${id} · ${pago}`);
      },
      

      addBaiMovimentoManual: (input) => {
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
        const extras = get().extras || [];
        const existing = new Set((get().movimentosBaiExtra || []).map((m) => m.id));
        // também ids APP-SAL-*
        let movs = movimentosAll(get().movimentosBaiExtra, get().baiOverride);
        let last = movs[movs.length - 1];
        let saldo = last?.saldo ?? seed.escola.saldoInicialBai ?? 0;
        let linha = last?.linha ?? 0;
        const toAdd: MovimentoBai[] = [];
        const sorted = [...extras]
          .filter(
            (e) =>
              e.tipo === "despesa" &&
              (e.origem === "cartao" || e.origem === "banco") &&
              (e.valor || 0) > 0,
          )
          .sort((a, b) => (a.data || "").localeCompare(b.data || ""));
        for (const e of sorted) {
          // ID único mesmo se vários lançamentos partilharam o mesmo doc (bug antigo)
          const movId = `APP-${e.id}-${e.data}-${Math.round((e.valor || 0) * 100)}-${(e.descricao || "").slice(0, 24).replace(/\s+/g, "_")}`;
          if (existing.has(movId)) continue;
          if (movs.some((m) => m.id === movId)) continue;
          // evitar duplicar por valor+data+descrição já no extrato app
          const fingerprint = `${e.data}|${Number(e.valor)}|${(e.descricao || "").trim()}`;
          if (movs.some((m) => m.banco.endsWith("-APP") && `${m.data}|${m.saida}|${(m.descricao || "").trim()}` === fingerprint)) continue;
          const isLev =
            /levantamento|atm/i.test(e.pagamento || "") ||
            /levantamento|atm/i.test(e.categoria || "") ||
            /levantamento|atm/i.test(e.descricao || "");
          const tipoBai = isLev ? "ATM" : e.origem === "banco" ? "TRANSF" : "CARTAO";
          const saida = Number(e.valor) || 0;
          saldo = saldo - saida;
          linha += 1;
          toAdd.push({
            id: movId,
            linha,
            data: e.data,
            banco: `${tipoBai}-APP`,
            descricao: e.descricao || e.categoria || "Despesa conta BAI",
            entrada: 0,
            saida,
            saldo,
            observacoes: `Sync lançamento ${e.id}${e.fornecedor ? ` · ${e.fornecedor}` : ""}`,
          });
          existing.add(movId);
          if (isLev) {
            const atmId = `ATM-${e.id}`;
            if (!(get().fundoAtmExtra || []).some((a) => a.id === atmId)) {
              set({
                fundoAtmExtra: [
                  ...(get().fundoAtmExtra || []),
                  { id: atmId, data: e.data, valor: saida },
                ],
              });
            }
          }
        }
        // recibos salário pagos sem movimento
        for (const r of get().recibosSalario || []) {
          if (!r.pago || !(r.liquido > 0)) continue;
          const movId = `APP-SAL-${r.id}`;
          if (existing.has(movId)) continue;
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
              ...get().movimentosBaiExtra,
              ...toAdd,
            ]),
          });
          get().pushAudit("bai_sync_extras", `${toAdd.length} movimentos`);
        } else if ((get().movimentosBaiExtra || []).length) {
          set({ movimentosBaiExtra: sortAndRecalcBai(get().movimentosBaiExtra) });
        }
        return toAdd.length;
      },
      importBaiMovimentos: (rows, replace) => {
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
      importLancamentos: (rows) => {
        let n = 0;
        for (const r of rows) {
          get().addCaptura(r);
          n++;
        }
        get().pushAudit("import_lancamentos", `${n} lançamentos CSV`);
        return n;
      },
      addSalario: (s) => {
        const by = get().activeOperator || "—";
        const row = { ...s };
        set({ salariosExtra: [...get().salariosExtra, row] });
        get().pushAudit("criar_salario", `${row.id} · ${row.nome} · ${row.mes}`);
      },
      updateSalario: (id, patch) => {
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
        set({ faturasPropina: [...(get().faturasPropina || []), f] });
        get().pushAudit("emitir_fatura_propina", `${f.numero} · ${f.alunoNome} · ${f.mesRef}`);
      },
      resetLocal: () =>
        set({
          extras: [],
          alunosExtra: [],
          alunosOverrides: {},
          mensalidades: initialMensalidades,
          fundoExtra: [],
          fundoAtmExtra: [],
          movimentosBaiExtra: [],
          baiOverride: false,
          fotos: {},
          auditLog: [],
          sessionLog: [],
          salariosExtra: [],
          salariosOverrides: {},
          recibosSalario: [],
          faturasPropina: [],
        }),
    }),
    {
      name: "ecc-financeiro-v1",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        extras: s.extras,
        alunosExtra: s.alunosExtra,
        alunosOverrides: s.alunosOverrides,
        mensalidades: s.mensalidades,
        fundoExtra: s.fundoExtra,
        fundoAtmExtra: s.fundoAtmExtra,
        movimentosBaiExtra: s.movimentosBaiExtra,
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
      }),
    },
  ),
);

export function getSeed(): Seed {
  return seed;
}

/** Card invoices already booked as socio FAT (avoid double-count). */
const LINKED_CARD = new Set(["CX-001"]); // Tamaco panfletos = FAT-050

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

  const fundo: Lancamento[] = seed.fundoPagamentos.map((p) => ({
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

  const insc: Lancamento[] = seed.alunos
    .filter((a) => a.liquido > 0)
    .map((a) => ({
      id: a.recibo,
      data: a.dataPag || "",
      categoria: "Inscrição / Matrícula",
      descricao: `Inscrição ${a.nome}`,
      fornecedor: a.encarregado,
      fatura: "",
      docInterno: a.recibo,
      tipo: "entrada" as const,
      valor: a.liquido,
      pagamento: "",
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
): Totals {
  const alunos = alunosAll(alunosExtra, alunosOverrides);
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
  const baiRows = movimentosAll(movimentosBaiExtra, baiOverride);
  const lastBai = baiRows[baiRows.length - 1];
  const fundoLevantado = fundoAtmAll(fundoAtmExtra).reduce((s, a) => s + a.valor, 0);
  const fundoGasto =
    seed.fundoPagamentos.reduce((s, p) => s + p.valor, 0) +
    extras.filter((e) => e.origem === "fundo").reduce((s, e) => s + e.valor, 0);

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
  alunosExtra: Aluno[],
  overrides: Record<string, Partial<Aluno>> = {},
): Aluno[] {
  const apply = (a: Aluno): Aluno => {
    const o = overrides[a.id];
    return o ? { ...a, ...o } : a;
  };
  return [...seed.alunos.map(apply), ...alunosExtra.map(apply)];
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
      return o ? { ...s, ...o } : s;
    });
  const extraIds = new Set(extra.map((s) => s.id));
  return [
    ...fromSeed.filter((s) => !extraIds.has(s.id)),
    ...extra.filter((s) => !deleted.has(s.id)),
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
  const movs = movimentosAll(extra, get().baiOverride);
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
export function movimentosAll(extra: MovimentoBai[] = [], override = false): MovimentoBai[] {
  const fp = (m: MovimentoBai) =>
    `${m.data}|${Number(m.entrada) || 0}|${Number(m.saida) || 0}|${(m.banco || "").trim()}|${(m.descricao || "").trim()}`;

  if (override && extra.length) {
    const ids = new Set(extra.map((m) => m.id));
    const fps = new Set(extra.map(fp));
    const merged = [...extra];
    for (const s of seed.movimentosBai) {
      if (ids.has(s.id) || fps.has(fp(s))) continue;
      // Fundir sobretudo registos manuais recentes da secretaria (após linha 62)
      if ((s.linha || 0) > 62 || /Transf pelo NI|Fecho TPA/i.test(`${s.banco} ${s.descricao}`)) {
        merged.push(s);
        ids.add(s.id);
        fps.add(fp(s));
      }
    }
    // Extras da app (APP-*) que não estejam no CSV
    for (const e of extra) {
      if (!ids.has(e.id)) {
        merged.push(e);
        ids.add(e.id);
      }
    }
    return sortAndRecalcBai(merged);
  }

  if (extra.length) {
    const ids = new Set(extra.map((m) => m.id));
    const fps = new Set(extra.map(fp));
    const base = seed.movimentosBai.filter((m) => !ids.has(m.id) && !fps.has(fp(m)));
    return sortAndRecalcBai([...base, ...extra]);
  }

  return sortAndRecalcBai(seed.movimentosBai);
}

export function fundoAtmAll(extra: FundoAtm[] = []): FundoAtm[] {
  if (!extra.length) return seed.fundoAtm;
  const ids = new Set(extra.map((a) => a.id));
  return [...seed.fundoAtm.filter((a) => !ids.has(a.id)), ...extra];
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
