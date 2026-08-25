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
  Seed,
} from "@/data/types";
import { DEFAULT_OPERATORS, MESES_LETIVOS } from "@/data/types";
import { EDIT_PIN } from "@/lib/can-edit";

const seed = seedJson as Seed;

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
  fotos: Record<string, string>;
  /** Nome do colaborador ativo neste browser (escritório, até 5). */
  activeOperator: string; // "" = ainda não escolheu membro da equipa
  /** Lista editável dos 5 nomes do escritório. */
  operators: string[];
  /** Sessão Colaborador 1 desbloqueada com PIN (não persistir em claro como segredo). */
  adminUnlocked: boolean;
  /** Registo de auditoria local: quem fez o quê. */
  auditLog: { at: string; by: string; action: string; detail: string }[];
};

type Store = ExtraState & {
  addCaptura: (input: CapturaInput) => Lancamento;
  addAluno: (aluno: Aluno) => void;
  updateAluno: (id: string, patch: Partial<Aluno>) => void;
  setMensalidade: (id: string, mes: string, valor: number) => void;
  setFoto: (id: string, dataUrl: string) => void;
  removeExtra: (id: string) => void;
  updateExtra: (id: string, patch: Partial<Lancamento>) => void;
  resetLocal: () => void;
  setActiveOperator: (name: string) => void;
  setOperatorName: (index: number, name: string) => void;
  unlockAdmin: (pin: string) => boolean;
  lockAdmin: () => void;
  pushAudit: (action: string, detail: string) => void;
};

const initialMensalidades: Mensalidade[] = seed.mensalidades;

export const useFinance = create<Store>()(
  persist(
    (set, get) => ({
      extras: [],
      alunosExtra: [],
      alunosOverrides: {},
      mensalidades: initialMensalidades,
      fundoExtra: [],
      fotos: {},
      activeOperator: "",
      operators: [...DEFAULT_OPERATORS],
      adminUnlocked: false,
      auditLog: [],
      setActiveOperator: (name) => {
        const ops = get().operators;
        // Trocar para não-admin → sempre trancar privilégios
        if (!ops[0] || name !== ops[0]) {
          set({ activeOperator: name, adminUnlocked: false });
        } else {
          // Seleccionar Colaborador 1 sem PIN → ainda sem privilégios até unlockAdmin
          set({ activeOperator: name, adminUnlocked: false });
        }
      },
      unlockAdmin: (pin) => {
        const ops = get().operators;
        if (!ops[0]) return false;
        if (pin !== EDIT_PIN) return false;
        set({ activeOperator: ops[0], adminUnlocked: true });
        get().pushAudit("desbloquear_admin", "Colaborador 1");
        return true;
      },
      lockAdmin: () => set({ adminUnlocked: false }),
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
      addCaptura: (input) => {
        const extras = get().extras;
        const by = get().activeOperator || "—";
        const now = new Date().toISOString();
        // Numeração mensal: FRM-AAAA-MM-001 … reinicia em cada mês
        const dataRef = (input.data || now.slice(0, 10)).slice(0, 7); // YYYY-MM
        const prefix = `FRM-${dataRef}-`;
        let maxN = 0;
        for (const e of extras) {
          const doc = e.docInterno || e.id || "";
          if (doc.startsWith(prefix)) {
            const tail = doc.slice(prefix.length);
            const num = parseInt(tail, 10);
            if (Number.isFinite(num) && num > maxN) maxN = num;
          }
        }
        const id = `${prefix}${String(maxN + 1).padStart(3, "0")}`;
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
        get().pushAudit("criar_lancamento", `${id} · ${row.descricao} · ${row.valor}`);
        return row;
      },
      addAluno: (aluno) => {
        const by = get().activeOperator || "—";
        const row = { ...aluno, criadoPor: by, createdAt: new Date().toISOString() };
        set({ alunosExtra: [...get().alunosExtra, row] });
        get().pushAudit("criar_aluno", `${row.id} · ${row.nome}`);
      },
      updateAluno: (id, patch) => {
        const ops = get().operators;
        const by = get().activeOperator || "—";
        // Apenas o Colaborador 1 (primeiro da lista) pode editar alunos
        if (by !== ops[0] || !get().adminUnlocked) {
          throw new Error("Apenas o Colaborador 1 (com código) pode editar dados de alunos.");
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
      },
      setMensalidade: (id, mes, valor) => {
        set({
          mensalidades: get().mensalidades.map((m) =>
            m.id === id ? { ...m, pagamentos: { ...m.pagamentos, [mes]: valor } } : m,
          ),
        });
        get().pushAudit("propina", `${id} · ${mes} · ${valor}`);
      },
      setFoto: (id, dataUrl) => set({ fotos: { ...get().fotos, [id]: dataUrl } }),
      removeExtra: (id) => {
        const ops = get().operators;
        const by = get().activeOperator || "—";
        if (!ops[0] || by !== ops[0] || !get().adminUnlocked) {
          throw new Error("Apenas o Colaborador 1 (com código) pode apagar lançamentos.");
        }
        get().pushAudit("apagar_lancamento", id);
        set({ extras: get().extras.filter((e) => e.id !== id) });
      },
      updateExtra: (id, patch) => {
        const ops = get().operators;
        const by = get().activeOperator || "—";
        if (!ops[0] || by !== ops[0] || !get().adminUnlocked) {
          throw new Error("Apenas o Colaborador 1 (com código) pode editar lançamentos.");
        }
        set({
          extras: get().extras.map((e) =>
            e.id === id
              ? { ...e, ...patch, editadoPor: by, updatedAt: new Date().toISOString() }
              : e,
          ),
        });
        get().pushAudit("editar_lancamento", `${id} · ${Object.keys(patch).join(", ")}`);
      },
      resetLocal: () =>
        set({
          extras: [],
          alunosExtra: [],
          alunosOverrides: {},
          mensalidades: initialMensalidades,
          fundoExtra: [],
          fotos: {},
          auditLog: [],
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
        fotos: s.fotos,
        activeOperator: s.activeOperator,
        operators: s.operators,
        auditLog: s.auditLog,
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

  return [...socio, ...card, ...fundo, ...insc, ...bankOps, ...extras].sort((a, b) =>
    (a.data || "9999").localeCompare(b.data || "9999"),
  );
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
    .filter((l) => l.tipo === "despesa" && l.origem !== "socio")
    .reduce((s, l) => s + l.valor, 0);
  const extraEntradas = extras.filter((l) => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0);

  const proveitos = inscricoesLiquido - mensal1 + propinasRecebidas + extraEntradas;
  const custosTotais = socioDespesas + custosOperacionais;
  const lastBai = seed.movimentosBai[seed.movimentosBai.length - 1];
  const fundoLevantado = seed.fundoAtm.reduce((s, a) => s + a.valor, 0);
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

export function salariosAll(): Salario[] {
  return seed.salarios;
}

export function movimentosAll(): MovimentoBai[] {
  return seed.movimentosBai;
}

export function fundoAtmAll(): FundoAtm[] {
  return seed.fundoAtm;
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
