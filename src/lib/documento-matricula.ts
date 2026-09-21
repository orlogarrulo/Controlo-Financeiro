/**
 * Fonte única do modelo de fatura / recibo (separador Matrículas + CRM).
 * Rubricas e totais vêm sempre da ficha do aluno.
 */
import type { Aluno } from "@/data/types";
import { MESES_LABEL, MESES_PROPINA_ADIANTADOS } from "@/data/types";
import { nomeComSufixoCampus } from "@/lib/aluno-display";
import { formatKz } from "@/lib/format";
import { escolaLogoSrc } from "@/lib/logo-escola";
import { getSeed, useFinance } from "@/lib/store";

export type EscolaContacto = {
  morada: string;
  telefones: string;
  email: string;
  iban: string;
};

export const DEFAULT_CONTACTO: EscolaContacto = {
  morada: "Urbanização Nova Vida, Rua 63, Casa S/N, Município Kilamba Kiaxi, Luanda - Angola",
  telefones: "+244 922 637 640",
  email: "ecoleconsulaireeducongo1976.nv@gmail.com",
  iban: "AO06.0040.0000.6725.7113.1013.0",
};

const CONTACTO_STORAGE_KEY = "ecc-escola-contacto-v1";

export function loadContacto(): EscolaContacto {
  try {
    const raw = localStorage.getItem(CONTACTO_STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<EscolaContacto>;
      return { ...DEFAULT_CONTACTO, ...p };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_CONTACTO };
}

export type LinhaFat = { key: string; label: string; value: number; on: boolean };

export const NOME_ESCOLA_FATURA =
  "École Consulaire du Congo (Brazzaville) de Luanda — Annexe Nova Vida";

const CAMPUS_CIDADE_PROPINA = 75000;
const PROPINA_MATERNELLE = 170000;
const PROPINA_PRIMAIRE = 250000;
const PROPINA_COLLEGE = 260000;
const CAMPUS_CIDADE_PACOTES = [82000, 99000, 127000] as const;

export function fmtData(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

export function prazoFatura(mesLetivo: string): {
  limite: string;
  de11a30: string;
  multa40: string;
  suspensao: string;
} {
  const now = new Date();
  const mesIdx: Record<string, number> = {
    set: 8, out: 9, nov: 10, dez: 11, jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  };
  const baseMonth = mesIdx[mesLetivo] ?? now.getMonth();
  let y = now.getFullYear();
  if (["set", "out", "nov", "dez"].includes(mesLetivo) && now.getMonth() < 8) y -= 1;
  if (["jan", "fev", "mar", "abr", "mai", "jun"].includes(mesLetivo) && now.getMonth() >= 8) y += 1;

  if (mesLetivo === "out") {
    const limite = new Date(y, 8, 20);
    const de11 = new Date(y, 8, 21);
    const dia30 = new Date(y, 8, 30);
    const multa40 = new Date(y, 9, 10);
    return {
      limite: fmtData(limite),
      de11a30: `${fmtData(de11)} a ${fmtData(dia30)}`,
      multa40: fmtData(multa40),
      suspensao: fmtData(multa40),
    };
  }

  const limite = new Date(y, baseMonth + 1, 10);
  const dia30 = new Date(y, baseMonth + 1, 30);
  const dia10Seguinte = new Date(y, baseMonth + 2, 10);
  return {
    limite: fmtData(limite),
    de11a30: `${fmtData(new Date(y, baseMonth + 1, 11))} a ${fmtData(dia30)}`,
    multa40: fmtData(dia10Seguinte),
    suspensao: fmtData(dia10Seguinte),
  };
}


/** Nomes completos dos meses de propina (1.º = outubro). */
const MESES_PROP_NOME: Record<string, string> = {
  out: "outubro",
  nov: "novembro",
  dez: "dezembro",
  jan: "janeiro",
  fev: "fevereiro",
  mar: "março",
  abr: "abril",
  mai: "maio",
  jun: "junho",
  set: "setembro",
};

/**
 * Rótulo da rubrica de propina: "Propina outubro" ou "Propinas outubro–dezembro".
 * Nunca "1 mês" — usa a sequência lectiva a partir de Outubro.
 */
export function labelPropinasPorMeses(meses: number, detalhe?: string): string {
  const n = Math.max(0, Math.min(9, Math.round(meses) || 0));
  const keys = MESES_PROPINA_ADIANTADOS.slice(0, n);
  const nomes = keys.map((k) => MESES_PROP_NOME[k] || MESES_LABEL[k] || k);
  let base: string;
  if (n <= 0) {
    base = "Propina";
  } else if (n === 1) {
    base = `Propina ${nomes[0]}`;
  } else if (n <= 3) {
    base = `Propinas ${nomes.join(", ")}`;
  } else {
    base = `Propinas ${nomes[0]}–${nomes[nomes.length - 1]}`;
  }
  return detalhe ? `${base} · ${detalhe}` : base;
}

/** Nome completo de um mês lectivo (ex.: out → outubro). */
export function nomeMesPropina(mesLetivo: string): string {
  const k = (mesLetivo || "").toLowerCase().slice(0, 3);
  return MESES_PROP_NOME[k] || MESES_LABEL[k] || mesLetivo || "";
}

export function propinaPorCiclo(a: Aluno): number {
  if (a.transferidoCampusCidade) {
    return a.propina && a.propina > 0 ? a.propina : CAMPUS_CIDADE_PROPINA;
  }
  const c =
    a.grupo === "Maternelle" || a.turma.startsWith("Maternelle")
      ? "mat"
      : a.grupo === "Collège" || ["6ème", "5ème", "4ème", "3ème"].includes(a.turma)
        ? "col"
        : "pri";
  if (c === "mat") return PROPINA_MATERNELLE;
  if (c === "col") return PROPINA_COLLEGE;
  return PROPINA_PRIMAIRE;
}

export function calcPropinaComCampanha(
  propinaMensal: number,
  meses: number,
  campanha: boolean,
  irmaosNivel: 0 | 2 | 3 = 0,
): {
  brutoPropina: number;
  liquidoPropina: number;
  descPct: number;
  detalhe: string;
} {
  const m = Math.max(0, Math.min(9, Math.round(meses) || 0));
  const brutoPropina = Math.round(propinaMensal * m);
  if (brutoPropina <= 0 || m <= 0) {
    return { brutoPropina: 0, liquidoPropina: 0, descPct: 0, detalhe: "" };
  }
  let factor = 1;
  const parts: string[] = [];
  if (campanha) {
    factor *= 0.6;
    parts.push("−40% campanha (até 10/set)");
  }
  if (irmaosNivel === 2) {
    factor *= 0.9;
    parts.push("−10% 2 irmãos");
  } else if (irmaosNivel === 3) {
    factor *= 0.85;
    parts.push("−15% 3+ irmãos");
  }
  const liquidoPropina = Math.round(brutoPropina * factor);
  const descPct =
    brutoPropina > 0
      ? Math.round(((brutoPropina - liquidoPropina) / brutoPropina) * 1000) / 10
      : 0;
  return {
    brutoPropina,
    liquidoPropina,
    descPct,
    detalhe: parts.length
      ? `${formatKz(brutoPropina)} → ${formatKz(liquidoPropina)} (${parts.join(", ")})`
      : "",
  };
}

export function alunoTemCampanha(a: Aluno): boolean {
  if (typeof a.campanhaPromoSetembro === "boolean") return Boolean(a.campanhaPromoSetembro);
  if ((a.descPct || 0) >= 40) return true;
  const obs = (a.obs || "").toLowerCase();
  return /campanha|−40%|-40%|promo/.test(obs);
}

export function alunoTemIrmaosDesc(a: Aluno): 0 | 2 | 3 {
  if (a.transferidoCampusCidade) return 0;
  const n = Number(a.irmaosNivel) || 0;
  if (n === 2 || n === 3) return n as 2 | 3;
  const obs = (a.obs || "").toLowerCase();
  if (/3\+|3 ou mais|−15%|-15%/.test(obs)) return 3;
  if (/2\+|2 irm|−10%|-10%|agregado/.test(obs)) return 2;
  if ((a.descPct || 0) >= 45) return 2;
  return 0;
}

export function mesesPropinaFromAluno(a: Aluno): number {
  const prop = Number(a.propina) || 0;
  const mens = Number(a.mensalidade1) || 0;
  // Inscrição/manuais/seguro NÃO contam como propina.
  // Só há meses pagos se a liquidação incluir mensalidade1 (propina).
  if (!(mens > 0)) return 0;
  const saved = Number(a.mesesPropina) || 0;
  if (saved > 0 && prop > 0 && mens + 1 >= prop * 0.5) {
    return Math.min(9, saved);
  }
  if (prop > 0 && mens > 0) {
    for (const m of [9, 8, 7, 6, 5, 4, 3, 2, 1]) {
      for (const camp of [true, false]) {
        for (const ir of [0, 2, 3] as const) {
          const pc = calcPropinaComCampanha(prop, m, camp, ir);
          if (pc.liquidoPropina === mens) return m;
        }
      }
    }
    const ratio = Math.round(mens / prop);
    if (ratio >= 2 && ratio <= 9 && Math.abs(mens - prop * ratio) <= prop * 0.02) return ratio;
  }
  return 0;
}

export function linhasMatriculaFromAluno(
  a: Aluno,
  mesesProp = 1,
  opts?: { campanha?: boolean; irmaos?: boolean | 0 | 2 | 3 },
): LinhaFat[] {
  const meses = Math.min(9, Math.max(0, Math.round(mesesProp) || 0));
  const campanha = opts?.campanha ?? alunoTemCampanha(a);
  let irmaosNivel: 0 | 2 | 3 = 0;
  if (opts?.irmaos === true) irmaosNivel = alunoTemIrmaosDesc(a) || 2;
  else if (opts?.irmaos === false) irmaosNivel = 0;
  else if (opts?.irmaos === 2 || opts?.irmaos === 3 || opts?.irmaos === 0) irmaosNivel = opts.irmaos;
  else irmaosNivel = alunoTemIrmaosDesc(a);

  let propinaMes = Number(a.propina) || 0;
  if (!(propinaMes > 0)) {
    try {
      propinaMes = propinaPorCiclo(a);
    } catch {
      propinaMes = 0;
    }
  }
  const pc = calcPropinaComCampanha(propinaMes, meses, campanha, irmaosNivel);
  let propinaLiquida = pc.liquidoPropina;
  const mensSaved = Number(a.mensalidade1) || 0;
  const mesesSaved = Number(a.mesesPropina) || 0;
  if (mensSaved > 0 && mesesSaved === meses && meses > 0) {
    propinaLiquida = mensSaved;
  } else if (propinaLiquida <= 0 && mensSaved > 0 && meses > 0) {
    propinaLiquida = mensSaved;
  }

  // Rótulo com meses reais (outubro, novembro, …) — não "1 mês"
  const propLabel = labelPropinasPorMeses(meses, pc.detalhe || undefined);

  const cartaoVal = Number(a.cartaoEstudante) || 0;
  const inscricaoVal = Number(a.inscricao) || 0;
  const seguroVal = Number(a.seguro) || 0;
  const manuaisVal = Number(a.manuais) || 0;
  const cadernosVal = Number(a.cadernos) || 0;
  const uniformeVal = Number(a.uniforme) || 0;
  const atlVal = Number(a.extras) || 0;
  const transporteVal = Number(a.transporte) || 0;
  const alimentacaoVal = Number(a.alimentacao) || 0;
  const cursoVal = Number(a.curso) || 0;

  const isPacoteCampus =
    Boolean(a.transferidoCampusCidade) &&
    (CAMPUS_CIDADE_PACOTES as readonly number[]).includes(inscricaoVal);
  const labelInscricao = isPacoteCampus
    ? `Pacote Campus Cidade ${formatKz(inscricaoVal)} (matrícula + seguro escolar + cartão de estudante)`
    : "Inscrição";

  return [
    { key: "inscricao", label: labelInscricao, value: inscricaoVal, on: inscricaoVal > 0 },
    { key: "seguro", label: "Seguro escolar", value: seguroVal, on: seguroVal > 0 },
    { key: "manuais", label: "Manuais", value: manuaisVal, on: manuaisVal > 0 },
    { key: "cadernos", label: "Cadernos", value: cadernosVal, on: cadernosVal > 0 },
    { key: "uniforme", label: "Uniforme", value: uniformeVal, on: uniformeVal > 0 },
    { key: "atl", label: "ATL", value: atlVal, on: atlVal > 0 },
    { key: "transporte", label: "Transporte", value: transporteVal, on: transporteVal > 0 },
    { key: "alimentacao", label: "Alimentação", value: alimentacaoVal, on: alimentacaoVal > 0 },
    { key: "curso", label: "Curso intensivo", value: cursoVal, on: cursoVal > 0 },
    { key: "cartaoEstudante", label: "Cartão de estudante", value: cartaoVal, on: cartaoVal > 0 },
    {
      key: "propinas",
      label: propLabel,
      value: propinaLiquida > 0 ? propinaLiquida : 0,
      on: propinaLiquida > 0 && meses > 0,
    },
    { key: "multaAtraso", label: "Multa por atraso no pagamento", value: 0, on: false },
    { key: "multaRecolha", label: "Multa atraso recolha aluno(a) após 18:00", value: 15000, on: false },
  ];
}

export function totalLinhas(linhas: LinhaFat[]): number {
  return linhas.filter((l) => l.on && l.value > 0).reduce((s, l) => s + l.value, 0);
}

/** Propina de 1 mês: tarifa da classe + descontos individuais (irmãos / campanha). */
export function linhaPropinaMensal(a: Aluno, mesLetivo?: string): LinhaFat {
  const tarifa = Number(a.propina) > 0 ? Number(a.propina) : propinaPorCiclo(a);
  const campanha = alunoTemCampanha(a);
  const irmaos = alunoTemIrmaosDesc(a);
  const pc = calcPropinaComCampanha(tarifa, 1, campanha, irmaos);
  const ciclo = a.turma?.startsWith("Maternelle")
    ? "Maternelle"
    : ["6ème", "5ème", "4ème", "3ème"].includes(a.turma)
      ? "Collège"
      : "Primaire";
  const mesNome = mesLetivo ? nomeMesPropina(mesLetivo) : "";
  const mesTxt = mesNome ? ` ${mesNome}` : "";
  const desc = pc.detalhe ? ` · ${pc.detalhe}` : "";
  return {
    key: "propinas",
    label: mesNome
      ? `Propina ${mesNome}${desc}`
      : `Propina ${ciclo} (${a.turma || "—"}) · tarifa ${formatKz(tarifa)}${desc}`,
    value: pc.liquidoPropina > 0 ? pc.liquidoPropina : tarifa,
    on: (pc.liquidoPropina > 0 ? pc.liquidoPropina : tarifa) > 0,
  };
}

/** Documento oficial a partir da ficha — usado em Matrículas e CRM. */
export function documentoOficialFromAluno(
  a: Aluno,
  opts?: {
    modo?: "fatura" | "recibo";
    mesLetivo?: string;
    mesRef?: string;
    mesKey?: string;
    numero?: string;
    pagoMes?: number;
    codigoVerificacao?: string;
    viaLabel?: string;
    contacto?: EscolaContacto;
    /** Se true, rubricas da matrícula (recibo de liquidação). */
    liquidacaoCompleta?: boolean;
    /** mensalidade = só propina do mês (fatura CRM). */
    ambito?: "mensalidade" | "liquidacao";
  },
): { html: string; linhas: LinhaFat[]; valor: number; mesesProp: number } {
  const modo = opts?.modo || "fatura";
  const mesesProp = mesesPropinaFromAluno(a);
  const campanha = alunoTemCampanha(a);
  const irmaos = alunoTemIrmaosDesc(a);
  const ambito =
    opts?.ambito ||
    (modo === "fatura" || !opts?.liquidacaoCompleta ? "mensalidade" : "liquidacao");
  let linhas: LinhaFat[];
  const pagoMes = Number(opts?.pagoMes) || 0;
  if (ambito === "mensalidade") {
    const linha = linhaPropinaMensal(a, opts?.mesLetivo);
    if (pagoMes > 0) linha.value = pagoMes;
    linhas = [linha];
  } else {
    linhas = linhasMatriculaFromAluno(a, mesesProp, { campanha, irmaos });
  }
  const valor = totalLinhas(linhas);
  const html = buildInvoiceHtml({
    a,
    numero: opts?.numero || "—",
    valor,
    mesRef: opts?.mesRef || "",
    mesLetivo: opts?.mesLetivo || "out",
    pagoMes,
    contacto: opts?.contacto || loadContacto(),
    linhas,
    modo,
    codigoVerificacao: opts?.codigoVerificacao,
    viaLabel: opts?.viaLabel,
  });
  return { html, linhas, valor, mesesProp };
}

function viaLabelFromCount(vias: number): string {
  if (vias <= 1) return "1.ª via";
  if (vias === 2) return "2.ª via";
  if (vias === 3) return "3.ª via";
  return `${vias}.ª via`;
}

/**
 * Gera SEMPRE um código RC-YYYYMM-XXXX-NN novo e regista-o no store.
 * Anti-fraude: cada emissão de recibo tem código único (nunca reutiliza o do mesmo aluno+mês).
 * Usar em TODOS os recibos de alunos (Matrículas, Mensalidades, CRM, Arquivo).
 */
export function garantirCodigoReciboAluno(opts: {
  alunoId: string;
  alunoNome: string;
  mesKey: string;
  valor: number;
  rubricas?: string;
}): { codigo: string; viaLabel: string; vias: number } {
  const s = useFinance.getState();
  // Contagem só informativa (quantas emissões já existem para aluno+mês)
  let vias = 1;
  try {
    const list = (s.codigosRecibo || []).filter(
      (r) => r.alunoId === opts.alunoId && r.mesKey === opts.mesKey,
    );
    vias = list.length + 1;
  } catch {
    vias = 1;
  }
  const reg = s.addCodigoRecibo({
    alunoId: opts.alunoId,
    alunoNome: opts.alunoNome,
    mesKey: opts.mesKey,
    valor: opts.valor || 0,
    rubricas: opts.rubricas,
  });
  return { codigo: reg.codigo, viaLabel: viaLabelFromCount(vias), vias };
}

/** Recibo oficial COM código de verificação (padronizado). */
export function documentoReciboComCodigo(
  a: Aluno,
  opts?: Parameters<typeof documentoOficialFromAluno>[1],
): {
  html: string;
  linhas: LinhaFat[];
  valor: number;
  mesesProp: number;
  codigoVerificacao: string;
  viaLabel: string;
} {
  const base = documentoOficialFromAluno(a, { ...opts, modo: "recibo" });
  const mesKey =
    opts?.mesKey ||
    new Date().toISOString().slice(0, 7);
  const rubricas = base.linhas
    .filter((l) => l.on && l.value > 0)
    .map((l) => l.label)
    .join(", ");
  const stamp = garantirCodigoReciboAluno({
    alunoId: a.id,
    alunoNome: a.nome,
    mesKey,
    valor: base.valor,
    rubricas,
  });
  const stamped = documentoOficialFromAluno(a, {
    ...opts,
    modo: "recibo",
    codigoVerificacao: stamp.codigo,
    viaLabel: stamp.viaLabel,
  });
  try {
    const s = useFinance.getState();
    if (typeof s.addDocumentoAluno === "function") {
      const numero = opts?.numero || `REC-${a.id}-${mesKey}`;
      const ja = s.findDocumentoPorNumero?.(numero);
      if (!ja) {
        s.addDocumentoAluno({
          tipo: "recibo",
          modelo: opts?.ambito === "liquidacao" ? "liquidacao_matricula" : "propina_mes",
          numero,
          alunoId: a.id,
          alunoNome: a.nome,
          mesKey,
          mesRef: opts?.mesRef,
          valor: stamped.valor,
          linhas: stamped.linhas,
          estado: "emitido",
          codigoVerificacao: stamp.codigo,
          pagoEm: new Date().toISOString().slice(0, 10),
          criadoPor: s.activeOperator,
        });
      }
    }
  } catch {
    /* arquivo opcional */
  }
  return {
    ...stamped,
    codigoVerificacao: stamp.codigo,
    viaLabel: stamp.viaLabel,
  };
}

export function buildInvoiceHtml(opts: {
  a: Aluno;
  numero: string;
  valor: number;
  mesRef: string;
  mesLetivo: string;
  pagoMes: number;
  contacto: EscolaContacto;
  linhas?: LinhaFat[];
  modo?: "fatura" | "recibo";
  codigoVerificacao?: string;
  viaLabel?: string;
  /** Destinatário no documento (pai/mãe/outro/empresa). */
  destinatario?: {
    tipo?: "pai" | "mae" | "outro" | "empresa";
    nome: string;
    nif?: string;
    morada?: string;
  };
}): string {
  const { a, numero, valor, mesRef, mesLetivo, contacto, linhas } = opts;
  const modo = opts.modo || "fatura";
  const isRecibo = modo === "recibo";
  const codigoVerificacao = opts.codigoVerificacao || "";
  const viaLabel = opts.viaLabel || "";
  const escola = getSeed().escola;
  const linhasAtivas = (linhas || []).filter((l) => l.on && l.value > 0);
  const linhasHtml = linhasAtivas.length
    ? `<table style="width:100%;border-collapse:collapse;margin:10px 0 4px;font-size:12px;">
          <thead><tr>
            <th style="text-align:left;padding:6px 0;border-bottom:2px solid #cbd5e1;color:#64748b;font-size:10px;text-transform:uppercase;">Rubrica</th>
            <th style="text-align:right;padding:6px 0;border-bottom:2px solid #cbd5e1;color:#64748b;font-size:10px;text-transform:uppercase;">Valor</th>
          </tr></thead>
          <tbody>
            ${linhasAtivas
              .map(
                (l) =>
                  `<tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;">${l.label}</td><td style="padding:6px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums;">${formatKz(l.value)}</td></tr>`,
              )
              .join("")}
          </tbody>
        </table>`
    : "";
  const { morada, telefones, email: emailEscola, iban } = contacto;
  const dest = opts.destinatario;
  const encarregado =
    (dest?.nome && dest.nome.trim()) ||
    a.faturaDestinatario?.nome ||
    a.pai ||
    a.mae ||
    a.encarregado ||
    "Encarregado de educação";
  const destNif = (dest?.nif || a.faturaDestinatario?.nif || "").trim();
  const destMorada = (dest?.morada || a.faturaDestinatario?.morada || a.morada || "").trim();
  const destTipo = dest?.tipo || a.faturaDestinatario?.tipo;
  const destLabel =
    destTipo === "empresa"
      ? "Empresa / contribuinte"
      : destTipo === "pai"
        ? "Pai"
        : destTipo === "mae"
          ? "Mãe"
          : "Encarregado de educação";
  const email = (a.email || "").trim();
  const logoSrc = escolaLogoSrc();
  const prazo = prazoFatura(mesLetivo);
  const multa35v = formatKz(Math.round(valor * 0.35));
  const multa40v = formatKz(Math.round(valor * 0.4));
  const total35 = formatKz(Math.round(valor * 1.35));
  const total40 = formatKz(Math.round(valor * 1.4));
  const emitida = fmtData(new Date());
  return `
<div style="font-family:Georgia,'Times New Roman',Times,serif;color:#374151;background:#fff;min-height:1040px;display:flex;flex-direction:column;box-sizing:border-box;padding:0;">
  <div style="background:#ffffff;padding:6px 28px 8px;display:flex;align-items:center;justify-content:flex-start;gap:12px;border-bottom:1px solid #d1d5db;">
    <img src="${logoSrc}" width="64" height="64" alt="Logo" style="width:64px;height:64px;object-fit:contain;border-radius:8px;flex-shrink:0;" crossorigin="anonymous" />
    <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;">Apprendre · Grandir · Réussir</p>
  </div>

  <div style="flex:1;padding:18px 28px 12px;display:flex;flex-direction:column;gap:12px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;border-bottom:2px solid #9ca3af;padding-bottom:10px;">
      <div>
        <p style="margin:0;font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#4b5563;">${
          isRecibo
            ? `Reçu <span style="opacity:0.45;font-weight:500;">|</span> <span style="font-size:10px;font-weight:500;letter-spacing:0.06em;">Recibo / Comprovativo</span>`
            : `Facture <span style="opacity:0.45;font-weight:500;">|</span> <span style="font-size:10px;font-weight:500;letter-spacing:0.06em;">Fatura</span>`
        }</p>
        <p style="margin:6px 0 0;font-size:12px;color:#6b7280;">${mesRef} · ${MESES_LABEL[mesLetivo] || mesLetivo} · Ano ${escola.ano || ""}</p>
      </div>
      <div style="text-align:right;background:#f3f4f6;color:#374151;padding:10px 14px;border-radius:8px;min-width:140px;border:1px solid #d1d5db;">
        <p style="margin:0;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;font-weight:700;">Referência</p>
        <p style="margin:6px 0 0;font-size:15px;font-weight:700;font-family:ui-monospace,monospace;color:#111827;">${numero}</p>
        <p style="margin:6px 0 0;font-size:11px;color:#6b7280;">${emitida}</p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div style="border-left:3px solid #9ca3af;padding:10px 12px;background:#f9fafb;border-radius:0 8px 8px 0;">
        <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;">Emissor</p>
        <p style="margin:6px 0 0;font-size:13px;font-weight:700;color:#111827;">${NOME_ESCOLA_FATURA}</p>
        <p style="margin:4px 0 0;font-size:11px;color:#6b7280;line-height:1.4;">${morada}</p>
        <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">${telefones}</p>
        <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">${emailEscola}</p>
      </div>
      <div style="border-left:3px solid #9ca3af;padding:10px 12px;background:#f9fafb;border-radius:0 8px 8px 0;">
        <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;">Facturado a</p>
        <p style="margin:0;font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280;font-weight:600;">${destLabel}</p>
        <p style="margin:4px 0 0;font-size:13px;font-weight:700;color:#111827;">${encarregado}</p>
        ${destNif ? `<p style="margin:2px 0 0;font-size:11px;color:#4b5563;">NIF / Contribuinte: <strong>${destNif}</strong></p>` : ""}
        ${destMorada ? `<p style="margin:2px 0 0;font-size:11px;color:#4b5563;">Morada: ${destMorada}</p>` : ""}
        <p style="margin:4px 0 0;font-size:12px;color:#4b5563;">Aluno: <strong style="color:#111827;">${nomeComSufixoCampus(a)}</strong></p>
        <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">${a.id} · ${a.turma}</p>
        <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">Tel. ${a.telefone || "—"} · ${email || "—"}</p>
        ${a.transferidoCampusCidade ? `<p style="margin:6px 0 0;font-size:11px;color:#4b5563;font-weight:700;">Aluno(a) transferido(a) do Campus Cidade</p>
        <p style="margin:4px 0 0;font-size:10px;color:#6b7280;line-height:1.35;">Pacotes: 82.000 · 99.000 · 127.000 Kz (cada um inclui matrícula + seguro escolar + cartão de estudante). Propina mensal 75.000 Kz.</p>` : ""}
      </div>
    </div>

    <div style="display:flex;align-items:stretch;border-radius:10px;overflow:hidden;border:1px solid #d1d5db;">
      <div style="flex:1;padding:14px 16px;background:#f3f4f6;">
        <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;"><span style="font-weight:700;color:#4b5563;">Description</span> <span style="opacity:0.4;font-weight:500;">|</span> <span style="font-size:10px;font-weight:500;">Descrição</span></p>
        <p style="margin:8px 0 0;font-size:14px;font-weight:700;color:#111827;">${
          isRecibo
            ? `Reçu de paiement <span style="opacity:0.4;font-weight:500;">|</span> <span style="font-size:12px;font-weight:500;color:#6b7280;">Recibo de pagamento</span>`
            : `Frais de scolarité <span style="opacity:0.4;font-weight:500;">|</span> <span style="font-size:12px;font-weight:500;color:#6b7280;">Fatura / liquidação</span>`
        }</p>
        ${linhasHtml}
      </div>
      <div style="min-width:160px;background:#f3f4f6;color:#111827;display:flex;flex-direction:column;justify-content:center;align-items:flex-end;padding:14px 16px;border-left:1px solid #d1d5db;">
        <p style="margin:0;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;font-weight:700;">${isRecibo ? "Total recebido" : "Total"}</p>
        <p style="margin:6px 0 0;font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;color:#111827;">${formatKz(valor)}</p>
        <p style="margin:6px 0 0;font-size:10px;color:#6b7280;">${isRecibo ? "Pago" : `até ${prazo.limite}`}</p>
        ${isRecibo && codigoVerificacao ? `<p style="margin:10px 0 0;font-size:9px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;font-weight:700;">Código de verificação</p><p style="margin:4px 0 0;font-size:13px;font-weight:800;font-family:ui-monospace,Menlo,monospace;letter-spacing:0.06em;color:#111827;">${codigoVerificacao}</p>` : ""}
      </div>
    </div>

    ${isRecibo ? "" : `<!-- Prazos -->
    <div style="background:#f9fafb;border:1px solid #d1d5db;border-radius:10px;padding:12px 14px;">
      <p style="margin:0 0 10px;font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#4b5563;">Délais <span style="opacity:0.4;font-weight:500;">|</span> <span style="font-size:10px;font-weight:500;">Prazos</span></p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div style="background:#fff;border-radius:8px;padding:8px 10px;border:1px solid #e5e7eb;">
          <p style="margin:0;font-size:10px;color:#4b5563;font-weight:700;">SEM MULTA</p>
          <p style="margin:4px 0 0;font-size:13px;font-weight:700;color:#111827;">Até ${prazo.limite}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">Pagar ${formatKz(valor)}</p>
        </div>
        <div style="background:#fff;border-radius:8px;padding:8px 10px;border:1px solid #e5e7eb;">
          <p style="margin:0;font-size:10px;color:#4b5563;font-weight:700;">MULTA 35%</p>
          <p style="margin:4px 0 0;font-size:12px;font-weight:600;color:#111827;">${prazo.de11a30}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">+${multa35v} · total ${total35}</p>
        </div>
        <div style="background:#fff;border-radius:8px;padding:8px 10px;border:1px solid #e5e7eb;">
          <p style="margin:0;font-size:10px;color:#4b5563;font-weight:700;">MULTA 40%</p>
          <p style="margin:4px 0 0;font-size:13px;font-weight:700;color:#111827;">Até ${prazo.multa40}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">+${multa40v} · total ${total40}</p>
        </div>
        <div style="background:#fff;border-radius:8px;padding:8px 10px;border:1px solid #e5e7eb;">
          <p style="margin:0;font-size:10px;color:#4b5563;font-weight:700;">SUSPENSÃO</p>
          <p style="margin:4px 0 0;font-size:13px;font-weight:700;color:#111827;">Após ${prazo.suspensao}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">Sem pagamento · aluno suspenso</p>
        </div>
      </div>
    </div>`}

    ${isRecibo ? "" : `<div style="background:#f3f4f6;border:1px solid #d1d5db;border-radius:10px;padding:14px 16px;">
      <p style="margin:0;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#6b7280;font-weight:700;">IBAN · Métodos de pagamento</p>
      <p style="margin:10px 0 0;font-size:14px;font-weight:700;font-family:ui-monospace,Menlo,monospace;letter-spacing:0.04em;word-break:break-all;line-height:1.35;color:#111827;">${iban}</p>
      <p style="margin:12px 0 0;font-size:12px;line-height:1.7;color:#4b5563;">
        1. Transferência bancária &nbsp;·&nbsp; 2. Cartão Multicaixa &nbsp;·&nbsp; 3. Dinheiro (Departamento de Finanças)
      </p>
    </div>`}

    <div style="flex:1;"></div>
  </div>

  <div style="border-top:1px solid #d1d5db;padding:12px 24px 14px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px;background:#f9fafb;">
    <div>
      <p style="margin:0;font-size:11px;font-weight:700;color:#374151;">Departamento de Finanças</p>
      <p style="margin:4px 0 0;font-size:10px;color:#6b7280;">Documento elaborado pelo Departamento de Finanças</p>
      <p style="margin:8px 0 0;font-size:10px;line-height:1.45;color:#4b5563;max-width:420px;">A École Consulaire du Congo (Brazzaville) de Luanda — Annexe Nova Vida é uma entidade diplomática e, nessa qualidade, não está sujeita a IVA. / En tant qu’entité diplomatique, l’école n’est pas assujettie à la TVA.</p>
      <p style="margin:10px 0 0;border-top:1px solid #d1d5db;padding-top:4px;width:160px;font-size:10px;color:#6b7280;">Assinatura / carimbo</p>
    </div>
    <div style="text-align:right;font-size:10px;color:#6b7280;">
      <p style="margin:0;">Ref. <strong style="color:#111827;">${numero}</strong></p>
      <p style="margin:2px 0 0;">Emitida em ${emitida}</p>
    </div>
  </div>
</div>
    `;
}
