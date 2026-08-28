export type TipoLancamento = "entrada" | "despesa";

export type Origem =
  | "socio"
  | "cartao"
  | "fundo"
  | "banco"
  | "inscricao"
  | "propina"
  | "formulario";

export type Categoria = {
  nome: string;
  tipo: TipoLancamento;
};

export type Lancamento = {
  id: string;
  n?: number;
  data: string;
  categoria: string;
  descricao: string;
  fornecedor: string;
  fatura: string;
  docInterno: string;
  tipo: TipoLancamento;
  valor: number;
  pagamento: string;
  observacoes: string;
  origem: Origem;
  fonte: string;
  ficheiro?: boolean;
  nomeFicheiro?: string;
  foto?: string;
  linkedId?: string;
  createdAt?: string;
  /** Nome do colaborador que registou (escritório, até 5 pessoas). */
  criadoPor?: string;
  /** Nome do colaborador que alterou pela última vez. */
  editadoPor?: string;
  updatedAt?: string;
};

export type MovimentoBai = {
  id: string;
  linha: number;
  data: string;
  banco: string;
  descricao: string;
  entrada: number;
  saida: number;
  saldo: number;
  observacoes: string;
};

export type FaturaCartao = {
  id: string;
  linhaMov: number | string;
  data: string;
  banco: string;
  descricao: string;
  fornecedor: string;
  valor: number;
  fatura: string;
  observacoes: string;
};

export type FundoAtm = {
  id: string;
  data: string;
  valor: number;
};

export type FundoPagamento = {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  recebeu: string;
  obs: string;
  atm: string;
  foto?: string;
  criadoPor?: string;
  createdAt?: string;
};

export type Aluno = {
  id: string;
  nome: string;
  turma: string;
  grupo: string;
  inscricao: number;
  manuais: number;
  uniforme: number;
  seguro: number;
  extras: number;
  /** Transporte escolar (Maternelle). */
  transporte?: number;
  /** Alimentação / cantina (Maternelle). */
  alimentacao?: number;
  curso: number;
  mensalidade1: number;
  dataPag: string;
  bruto: number;
  descPct: number;
  liquido: number;
  encarregado: string;
  /** Nome do pai (opcional). */
  pai?: string;
  /** Nome da mãe (opcional). */
  mae?: string;
  telefone: string;
  /** E-mail do encarregado de educação (para envio de faturas). */
  email?: string;
  /** Morada / endereço. */
  morada?: string;
  bi: string;
  familia: string;
  recibo: string;
  obs: string;
  propina: number;
  statusPag: "pago" | "registado" | "pendente";
  /** Método de pagamento da inscrição / liquidação. */
  metodoPagamento?: string;
  /**
   * Aluno transferido da filial Campus Cidade.
   * No ano 2026-2027 mantém propina da outra escola (50.000 Kz);
   * inscrição 50.000 + seguro 30.000.
   */
  transferidoCampusCidade?: boolean;
  criadoPor?: string;
  createdAt?: string;
  editadoPor?: string;
  updatedAt?: string;
};


export type FaturaPropina = {
  id: string;
  /** Numeração própria de propina: PROP-AAAA-MM-001 (≠ FAT- de despesas) */
  numero: string;
  alunoId: string;
  alunoNome: string;
  mesRef: string;
  /** YYYY-MM */
  mesKey: string;
  valor: number;
  email?: string;
  emitidoEm: string;
};

export type Mensalidade = {
  id: string;
  nome: string;
  turma: string;
  propina: number;
  pagamentos: Record<string, number>;
  obs: string;
};

export type Salario = {
  id: string;
  nome: string;
  funcao: string;
  categoria: string;
  salario: number;
  mes: string;
  diasUteis: number;
  diasTrab: number;
  outrosDesc: number;
  dataPag: string;
  /** Data de início do contrato de trabalho */
  dataInicioContrato?: string;
  /** Contactos e identificação (cadastro completo) */
  telefone?: string;
  email?: string;
  morada?: string;
  /** Nº BI ou Passaporte */
  documento?: string;
  nacionalidade?: string;
};

export type Escola = {
  nome: string;
  nomeCurto: string;
  subtitulo: string;
  ano: string;
  moeda: string;
  notaFiscal: string;
  contaBai: string;
  cartao: string;
  saldoInicialBai: number;
  formsUrl: string;
};

export type Seed = {
  escola: Escola;
  categorias: Categoria[];
  formasPagamento: string[];
  lancamentosSocio: Lancamento[];
  movimentosBai: MovimentoBai[];
  faturasCartao: FaturaCartao[];
  fundoAtm: FundoAtm[];
  fundoPagamentos: FundoPagamento[];
  alunos: Aluno[];
  mensalidades: Mensalidade[];
  salarios: Salario[];
};

/** Colaboradores do escritório (até 5). Podem ser renomeados na app. */
export const DEFAULT_OPERATORS = [
  "Colaborador 1",
  "Colaborador 2",
  "Colaborador 3",
  "Colaborador 4",
  "Colaborador 5",
] as const;

export const MESES_LETIVOS = [
  "set",
  "out",
  "nov",
  "dez",
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
] as const;

export const MESES_LABEL: Record<string, string> = {
  set: "Set",
  out: "Out",
  nov: "Nov",
  dez: "Dez",
  jan: "Jan",
  fev: "Fev",
  mar: "Mar",
  abr: "Abr",
  mai: "Mai",
  jun: "Jun",
};
