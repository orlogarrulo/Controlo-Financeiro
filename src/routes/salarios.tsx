import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileText, Pencil, Plus, Printer, Trash2, UserPlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/kpi";
import { PrintActions } from "@/components/print-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isCollaborator1 } from "@/lib/can-edit";
import { formatDate, formatKz, todayIso } from "@/lib/format";
import { getSeed, salariosAll, useFinance } from "@/lib/store";
import { deliverOfficialHtml, isMobileDevice } from "@/lib/pdf-export";
import type { ReciboSalario, Salario } from "@/data/types";

export const Route = createFileRoute("/salarios")({
  component: Salarios,
  validateSearch: (s: Record<string, unknown>) => ({
    edit: typeof s.edit === "string" ? s.edit : undefined,
    focus: typeof s.focus === "string" ? s.focus : undefined,
  }),
});

type FormState = {
  nome: string;
  funcao: string;
  categoria: string;
  salario: string;
  mes: string;
  diasUteis: string;
  diasTrab: string;
  outrosDesc: string;
  dataPag: string;
  dataInicioContrato: string;
  dataFimContrato: string;
  telefone: string;
  email: string;
  morada: string;
  documento: string;
  nacionalidade: string;
  iban: string;
  localPrestacao: string;
  objectoContrato: string;
  horario: string;
};

function addMonthsIso(iso: string, months: number): string {
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  if (Number.isNaN(d.getTime())) return iso;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function emptyForm(): FormState {
  const start = todayIso();
  return {
    nome: "",
    funcao: "",
    categoria: "Pessoal",
    salario: "",
    mes: "",
    diasUteis: "22",
    diasTrab: "22",
    outrosDesc: "0",
    dataPag: todayIso(),
    dataInicioContrato: start,
    dataFimContrato: addMonthsIso(start, 9),
    telefone: "",
    email: "",
    morada: "",
    documento: "",
    nacionalidade: "Angolana",
    iban: "",
    localPrestacao: "Luanda",
    objectoContrato:
      "",
    horario: HORARIO_PADRAO,
  };
}

function formFromSalario(r: Salario): FormState {
  const start = r.dataInicioContrato || todayIso();
  return {
    nome: r.nome || "",
    funcao: r.funcao || "",
    categoria: r.categoria || "Pessoal",
    salario: String(r.salario ?? 0),
    mes: r.mes || "",
    diasUteis: String(r.diasUteis ?? 22),
    diasTrab: String(r.diasTrab ?? 22),
    outrosDesc: String(r.outrosDesc ?? 0),
    dataPag: r.dataPag || todayIso(),
    dataInicioContrato: start,
    dataFimContrato: r.dataFimContrato || addMonthsIso(start, 9),
    telefone: r.telefone || "",
    email: r.email || "",
    morada: r.morada || "",
    documento: r.documento || "",
    nacionalidade: r.nacionalidade || "Angolana",
    iban: r.iban || "",
    localPrestacao: r.localPrestacao || "Luanda",
    objectoContrato: (() => {
      const perfil = perfilContrato(r.funcao || "", r.categoria);
      const raw = (r.objectoContrato || "").trim();
      const legado =
        /natureza educacional|apoio à École Consulaire|apoio à actividade escolar/i.test(raw);
      return !raw || legado ? perfil.objecto : raw;
    })(),
    horario: r.horario || (isVigilante(r.funcao) ? HORARIO_VIGILANTE : HORARIO_PADRAO),
  };
}

function toSalarioPatch(form: FormState): Partial<Salario> {
  return {
    nome: form.nome.trim(),
    funcao: form.funcao.trim(),
    categoria: form.categoria.trim() || "Pessoal",
    salario: Number(form.salario) || 0,
    mes: form.mes.trim(),
    diasUteis: Number(form.diasUteis) || 22,
    diasTrab: Number(form.diasTrab) || 0,
    outrosDesc: Number(form.outrosDesc) || 0,
    dataPag: form.dataPag,
    dataInicioContrato: form.dataInicioContrato,
    dataFimContrato: form.dataFimContrato,
    telefone: form.telefone.trim(),
    email: form.email.trim(),
    morada: form.morada.trim(),
    documento: form.documento.trim(),
    nacionalidade: form.nacionalidade.trim(),
    iban: form.iban.trim(),
    localPrestacao: form.localPrestacao.trim(),
    objectoContrato: form.objectoContrato.trim(),
    horario: form.horario.trim(),
  };
}

const HORARIO_PADRAO =
  "07h00 às 17h00, com 1 hora de almoço (aulas a partir das 07h30)";
/** Regime de turnos 24h — vigilantes: 3 dias de serviço + 3 dias de folga, em alternância. */
const HORARIO_VIGILANTE =
  "regime de turnos de 24 horas: 3 dias consecutivos de serviço (24h/dia) e 3 dias de folga, em alternância com o colega de turno";

/** Funções pré-definidas (dropdown). A categoria contratual deriva automaticamente. */
const FUNCOES_OPCOES = [
  "Vigilante",
  "Pessoal de Segurança",
  "Funcionário de Limpeza",
  "Empregada de Limpeza",
  "Diretor de Património",
  "Técnico Financeiro",
  "Responsável Financeiro",
  "Diretor Administrativo",
  "Professor(a)",
  "Diretor Pedagógico",
] as const;

function isVigilante(funcao: string): boolean {
  const f = (funcao || "").toLowerCase().normalize("NFD").replace(/\u0300-\u036f/g, "");
  return f.includes("vigilant") || (f.includes("segur") && f.includes("pessoal"));
}

function normTxt(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\u0300-\u036f/g, "");
}

/** Categoria + redacção completa da cláusula 2 (Objecto) por função. */
function perfilContrato(funcao: string, categoria?: string): {
  categoria: string;
  /** Parágrafos HTML da cláusula 2 (já com <p>). */
  objectoHtml: string;
  /** Texto simples (formulário / fallback). */
  objecto: string;
} {
  const f = normTxt(funcao);
  const c = normTxt(categoria || "");
  const escola = "École Consulaire du Congo (Brazzaville) de Luanda — Annexe Nova Vida";
  const nomeFunc = (funcao || "").trim() || "—";

  function montar(opts: {
    categoria: string;
    natureza: string;
    ambito: string;
    exclusoes: string;
  }) {
    const objecto =
      `O presente contrato tem por objecto ${opts.natureza} ` +
      opts.ambito +
      " " +
      opts.exclusoes;
    const objectoHtml = `
<p><strong>2.1.</strong> O presente contrato de prestação de serviços tem por objecto ${opts.natureza}</p>
<p><strong>2.2. Âmbito dos serviços.</strong> ${opts.ambito}</p>
<p><strong>2.3. Limites.</strong> ${opts.exclusoes}</p>
<p><strong>2.4. Identificação da prestação.</strong> Função: <strong>${nomeFunc}</strong>. Categoria contratual: <strong>${opts.categoria}</strong>.</p>
<p><strong>2.5.</strong> A duração, o local e o horário da prestação regulam-se, respectivamente, pelas cláusulas 3 e 4 do presente contrato, sem prejuízo das orientações escritas que a Contratante venha a transmitir no âmbito da função.</p>`;
    return { categoria: opts.categoria, objecto, objectoHtml };
  }

  // Vigilantes / Pessoal de Segurança
  if (
    f.includes("vigilant") ||
    f.includes("seguranca") ||
    f.includes("segurança") ||
    (f.includes("segur") && !f.includes("social"))
  ) {
    return montar({
      categoria: "Pessoal de Apoio Operacional (Segurança e Vigilância)",
      natureza: `a prestação, pelo Prestador à Contratante, de serviços de vigilância e segurança física das instalações, bens e pessoas da ${escola}, durante o período de vigência do contrato.`,
      ambito:
        "Constituem obrigações do Prestador, a título enunciativo: (i) a permanência no posto e a realização de rondas segundo a escala de turnos de 24 horas definida pela Contratante; (ii) o controlo de entradas e saídas e a identificação de pessoas e veículos, quando aplicável; (iii) a prevenção de riscos e a preservação do património escolar; (iv) o registo e a comunicação imediata de ocorrências, anomalias ou incidentes à direcção ou ao responsável designado; (v) o cumprimento das normas internas de segurança e confidencialidade.",
      exclusoes:
        "Os serviços objecto desta cláusula são exclusivamente de natureza operacional de segurança e vigilância. Ficam expressamente excluídas do objecto contratual quaisquer actividades lectivas, pedagógicas, de ensino, de limpeza ou de gestão administrativa e financeira.",
    });
  }

  // Limpeza / empregada / empregado de limpeza
  if (
    f.includes("limpez") ||
    f.includes("higiene") ||
    f.includes("faxina") ||
    f.includes("conservacao") ||
    f.includes("empregada") ||
    (f.includes("empregado") && f.includes("limp")) ||
    (f.includes("auxiliar") && f.includes("limp"))
  ) {
    return montar({
      categoria: "Pessoal de Apoio Operacional (Higiene e Salubridade)",
      natureza: `a prestação, pelo Prestador à Contratante, de serviços de limpeza, higiene e salubridade das instalações da ${escola}, durante o período de vigência do contrato.`,
      ambito:
        "Constituem obrigações do Prestador, a título enunciativo: (i) a limpeza e conservação higiénica das salas, sanitários, corredores, áreas comuns e demais espaços indicados pela Contratante; (ii) a execução do plano de trabalho e dos horários de serviço definidos; (iii) a utilização correcta dos produtos, utensílios e equipamentos disponibilizados; (iv) a comunicação de anomalias, avarias ou necessidades de material; (v) o cumprimento das regras de higiene, segurança e confidencialidade aplicáveis nas instalações escolares.",
      exclusoes:
        "Os serviços objecto desta cláusula são exclusivamente de natureza operacional de higiene e salubridade. Ficam expressamente excluídas do objecto contratual funções de ensino, de vigilância de segurança, de controlo de acessos e de gestão administrativa ou financeira.",
    });
  }

  // Diretor de Património
  if (f.includes("patrimonio") || f.includes("património") || (f.includes("diretor") && f.includes("infra"))) {
    return montar({
      categoria: "Quadro Técnico / Gestão de Infraestruturas",
      natureza: `a prestação, pelo Prestador à Contratante, de serviços de direcção técnica e de gestão do património e das infraestruturas da ${escola}, durante o período de vigência do contrato.`,
      ambito:
        "Constituem obrigações do Prestador, a título enunciativo: (i) a supervisão do estado de conservação de edifícios, equipamentos e bens afectos à escola; (ii) a coordenação de intervenções de manutenção e reparação, em articulação com a direcção; (iii) o apoio à planificação de necessidades patrimoniais e logísticas; (iv) a vigilância do uso adequado das infraestruturas; (v) a elaboração de reportes e propostas técnicas que lhe sejam solicitados no âmbito da função.",
      exclusoes:
        "Os serviços objecto desta cláusula são de natureza técnico-gestora de património e infraestruturas. Não incluem o exercício regular de funções docentes, de limpeza operacional de rotina nem de vigilância de segurança em regime de turnos, salvo determinação escrita em contrário da Contratante.",
    });
  }

  // Financeiro
  if (f.includes("financ") || f.includes("contabil") || f.includes("tesour") || c.includes("financ")) {
    return montar({
      categoria: "Quadro Técnico Administrativo (Especialidade: Gestão Financeira)",
      natureza: `a prestação, pelo Prestador à Contratante, de serviços técnico-administrativos na área da gestão financeira da ${escola}, durante o período de vigência do contrato.`,
      ambito:
        "Constituem obrigações do Prestador, a título enunciativo: (i) o apoio ao registo e organização de documentação financeira (propinas, despesas, comprovativos e mapas de suporte); (ii) a colaboração em reconciliações e controlos internos sob orientação do Departamento de Finanças; (iii) a preparação de elementos para reporte à direcção; (iv) a observância de confidencialidade quanto a dados financeiros e pessoais a que tenha acesso; (v) o cumprimento dos procedimentos e prazos definidos pela Contratante.",
      exclusoes:
        "Os serviços objecto desta cláusula são exclusivamente de natureza administrativo-financeira. Ficam excluídas do objecto contratual funções docentes, de vigilância das instalações e de limpeza ou manutenção operacional.",
    });
  }

  // Diretor Administrativo
  if (
    (f.includes("diretor") || f.includes("director")) &&
    (f.includes("admin") || f.includes("execut"))
  ) {
    return montar({
      categoria: "Cargo de Direção Executiva / Quadro Técnico Superior",
      natureza: `a prestação, pelo Prestador à Contratante, de serviços de direcção administrativa e executiva da ${escola}, durante o período de vigência do contrato.`,
      ambito:
        "Constituem obrigações do Prestador, a título enunciativo: (i) a coordenação dos serviços de apoio administrativo e logístico ao funcionamento da escola; (ii) a articulação entre os diversos serviços e a direcção; (iii) o acompanhamento do cumprimento de orientações internas e de rotinas organizativas; (iv) a representação administrativa da escola quando para tal for mandatada; (v) a elaboração de informações e propostas no âmbito da gestão administrativa.",
      exclusoes:
        "Os serviços objecto desta cláusula respeitam à direcção administrativa e executiva. Não substituem as competências próprias da direcção pedagógica nem o exercício regular de funções docentes ou de vigilância operacional de segurança.",
    });
  }

  // Diretor Pedagógico
  if (
    (f.includes("diretor") || f.includes("director")) &&
    (f.includes("pedagog") || f.includes("ensino") || f.includes("academ"))
  ) {
    return montar({
      categoria: "Cargo de Direção Superior / Comissão de Serviço",
      natureza: `a prestação, pelo Prestador à Contratante, de serviços de direcção pedagógica superior da ${escola}, em regime de cargo de direcção / comissão de serviço, durante o período de vigência do contrato.`,
      ambito:
        "Constituem obrigações do Prestador, a título enunciativo: (i) a coordenação do projecto educativo e da organização pedagógica; (ii) o acompanhamento e a orientação do corpo docente; (iii) a supervisão da qualidade do ensino e do cumprimento do calendário escolar; (iv) a articulação com famílias e instâncias internas da escola no domínio pedagógico; (v) a apresentação de balanços e propostas pedagógicas à direcção da escola.",
      exclusoes:
        "Os serviços objecto desta cláusula são de direcção pedagógica. Não se confundem com a vigilância operacional de segurança, com os serviços de limpeza ou com a gestão meramente patrimonial e financeira das instalações.",
    });
  }

  // Professores
  if (
    f.includes("professor") ||
    f.includes("docente") ||
    f.includes("enseignant") ||
    f.includes("educador") ||
    f.includes("maitre") ||
    f.includes("maître")
  ) {
    return montar({
      categoria: "Corpo Docente (Expatriado ou Local)",
      natureza: `a prestação, pelo Prestador à Contratante, de serviços docentes e educativos na ${escola}, na qualidade de membro do corpo docente (expatriado ou local), durante o período de vigência do contrato.`,
      ambito:
        "Constituem obrigações do Prestador, a título enunciativo: (i) a leccionação das disciplinas, níveis ou turmas que lhe forem atribuídos; (ii) a preparação de aulas e materiais didácticos; (iii) o acompanhamento pedagógico e a avaliação dos alunos nos termos definidos pela direcção pedagógica; (iv) a participação em reuniões, conselhos e actividades escolares inerentes à função docente; (v) o cumprimento do horário lectivo e do projecto pedagógico da escola.",
      exclusoes:
        "Os serviços objecto desta cláusula são exclusivamente de natureza educacional e lectiva. Ficam excluídas do objecto contratual funções de vigilância de segurança das instalações, de limpeza e de gestão administrativa ou financeira, salvo tarefas pontuais de acompanhamento de alunos expressamente solicitadas no âmbito escolar.",
    });
  }

  // Fallback
  return montar({
    categoria: categoria?.trim() || "Pessoal de Apoio / Prestação de Serviços",
    natureza: `a prestação, pelo Prestador à Contratante, de serviços profissionais de apoio ao funcionamento da ${escola}, nos termos da função indicada no presente contrato.`,
    ambito:
      "O Prestador executará as tarefas inerentes à função e à categoria contratual aqui identificadas, segundo as orientações escritas da direcção da escola e dentro do horário e local previstos nas cláusulas seguintes.",
    exclusoes:
      "O objecto contratual limita-se ao âmbito da função e categoria indicadas, sem alargamento automático a outras áreas de actividade da escola.",
  });
}

function liquidoCalc(salario: number, diasUteis: number, diasTrab: number, outrosDesc: number) {
  const falta = Math.max(0, (diasUteis || 0) - (diasTrab || 0));
  const descDias = diasUteis > 0 ? (salario / diasUteis) * falta : 0;
  return {
    descontoDias: descDias,
    liquido: Math.max(0, salario - descDias - (outrosDesc || 0)),
  };
}

function contratoHtml(escola: { nome: string; subtitulo?: string; ano?: string }, f: Salario) {
  const inicio = f.dataInicioContrato ? formatDate(f.dataInicioContrato) : "—";
  const fim = f.dataFimContrato ? formatDate(f.dataFimContrato) : "—";
  const hoje = formatDate(todayIso());
  const emitidoEm = new Date().toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  // Ex.: "Luanda, aos 29 de AGOSTO DE 2026"
  const MESES_EXT = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const agora = new Date();
  const dia = agora.getDate();
  const mesExt = MESES_EXT[agora.getMonth()];
  const ano = agora.getFullYear();
  const localData = `Luanda, aos ${dia} de ${mesExt} de ${ano}`;
  const vigilante = isVigilante(f.funcao || "");
  const perfil = perfilContrato(f.funcao || "", f.categoria);
  const categoriaContrato = perfil.categoria;
  // Cláusula 2 SEMPRE segundo a função (evita texto genérico/educacional antigo guardado em objectoContrato)
  const objectoHtml = perfil.objectoHtml;
  const horario =
    f.horario ||
    (vigilante ? HORARIO_VIGILANTE : HORARIO_PADRAO);
  const clausula4 = vigilante
    ? `<p>O Prestador prestará serviços na qualidade de <strong>vigilante em regime de turnos</strong>.</p>
<p>Na escala habitual, a cobertura de vigilância é assegurada em alternância: cada vigilante cumpre <strong>3 (três) dias consecutivos</strong> de turno de <strong>24 horas</strong> e beneficia de <strong>3 (três) dias de folga</strong>, entrando o colega de turno nos dias seguintes. A escala semanal (incluindo a distribuição entre segunda e sexta-feira e demais dias de funcionamento) é definida e afixada pela escola.</p>
<p>O horário de referência do Prestador é: <strong>${horario}</strong>. Este regime de turnos de 24 horas adapta-se à natureza da vigilância contínua das instalações escolares e ao calendário de funcionamento da escola, no âmbito do contrato de <em>prestação de serviços</em>.</p>`
    : `<p>O Prestador cumprirá o horário de <strong>${horario}</strong>. Este horário corresponde a cerca de 8 horas efectivas de trabalho por dia (após a pausa de almoço), alinhado com a prática usual e com os limites gerais da legislação laboral angolana para jornada diária, adaptado ao regime de <em>prestação de serviços</em> e ao calendário escolar (aulas a partir das 07h30).</p>`;
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title></title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 12px; line-height: 1.5; color: #0f172a; text-align: justify; }
  h1 { font-size: 16px; text-align: center; margin: 8px 0 4px; }
  h2 { font-size: 13px; margin: 16px 0 8px; text-align: center; font-weight: 700; }
  .head { display:flex; gap:12px; align-items:center; border-bottom:2px solid #009543; padding-bottom:10px; margin-bottom:12px; }
  .head img { width:64px; height:64px; object-fit:contain; }
  .muted { color:#64748b; font-size:11px; }
  p { margin: 0 0 8px; text-align: justify; text-justify: inter-word; }
  .clause { margin-bottom: 12px; }
  .local-data {
    text-align: left;
    font-size: 12px;
    margin: 28px 0 56px 0;
    padding: 0;
  }
  .sign { display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-top:0; padding-top:0; }
  .sign div { border-top:1px solid #94a3b8; padding-top:12px; text-align:center; font-size:11px; min-height:88px; }
  .doc-foot { margin-top:28px; text-align:right; font-size:9px; color:#94a3b8; line-height:1.35; }
</style></head><body>
<!-- Sem logotipo no contrato (documento formal de prestação de serviços). Em Angola é lícito o empregador usar papel timbrado/logo; nesta escola optámos por modelo só texto. -->
<p class="muted" style="text-align:center;margin:0 0 4px">${escola.nome}<br/>${escola.subtitulo || "Missão diplomática · Luanda"} · Ano lectivo ${escola.ano || ""}</p>
<h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
<p class="muted" style="text-align:center">Regime de prestação de serviços · Duração do ano lectivo (9 meses)<br/>
Entidade de natureza diplomática — sem retenção de impostos do trabalho na presente relação contratual, nos termos aplicáveis às missões diplomáticas em Angola.</p>

<div class="clause"><h2>1. Partes</h2>
<p><strong>Primeiro Outorgante (Contratante):</strong> ${escola.nome}, com sede em Luanda, Angola.</p>
<p><strong>Segundo Outorgante (Prestador):</strong> ${f.nome}, nacionalidade ${f.nacionalidade || "—"}, documento de identificação ${f.documento || "—"}, residente em ${f.morada || "—"}, contacto ${f.telefone || "—"} / ${f.email || "—"}, IBAN ${f.iban || "—"}.</p>
</div>

<div class="clause"><h2>2. Objecto</h2>
${objectoHtml}
</div>

<div class="clause"><h2>3. Local e duração</h2>
<p>Local de prestação: <strong>${f.localPrestacao || "Luanda"}</strong>. O presente contrato tem a duração do ano lectivo, estimada em <strong>9 (nove) meses</strong>, com início em <strong>${inicio}</strong> e termo previsto em <strong>${fim}</strong>, podendo cessar por acordo ou por incumprimento.</p>
</div>

<div class="clause"><h2>4. Horário de prestação</h2>
${clausula4}
</div>

<div class="clause"><h2>5. Honorários</h2>
<p>Pelos serviços prestados, o Contratante pagará ao Prestador o valor mensal de <strong>${formatKz(f.salario)}</strong> (honorários brutos mensais de referência), proporcional aos dias efectivamente prestados no mês, quando aplicável. O pagamento será efectuado até ao dia 30 de cada mês (ou no dia útil imediato), preferencialmente por transferência para o IBAN indicado.</p>
<p>Por se tratar de entidade de natureza diplomática, não há lugar, nesta relação, a descontos de segurança social ou retenção na fonte a cargo da escola, salvo orientação diversa das autoridades competentes.</p>
</div>

<div class="clause"><h2>6. Obrigações</h2>
<p>O Prestador obriga-se a cumprir horários e tarefas acordadas, guardar confidencialidade e zelar pelo património escolar. O Contratante obriga-se a pagar pontualmente os honorários e a disponibilizar condições mínimas de trabalho.</p>
</div>

<div class="clause"><h2>7. Cessação</h2>
<p>Qualquer das partes pode denunciar o contrato com pré-aviso de 15 dias, por escrito, salvo justa causa.</p>
</div>

<div class="clause"><h2>8. Lei e foro</h2>
<p>O contrato rege-se pela legislação angolana aplicável à prestação de serviços e pelas normas próprias da missão diplomática. Foro de Luanda.</p>
</div>

<p class="local-data">${localData}</p>

<div class="sign">
  <div>O Contratante<br/>${escola.nome}<br/><br/>_______________________</div>
  <div>O Prestador<br/>${f.nome}<br/><br/>_______________________</div>
</div>
<p class="doc-foot">Documento gerado por Recursos Humanos · ${emitidoEm}</p>
</body></html>`;
}


function dataDocFinancas(iso?: string): string {
  const d = iso ? new Date(iso.length === 10 ? iso + "T12:00:00" : iso) : new Date();
  if (Number.isNaN(d.getTime())) {
    const n = new Date();
    return `${String(n.getDate()).padStart(2, "0")}-${String(n.getMonth() + 1).padStart(2, "0")}-${n.getFullYear()}`;
  }
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

/** Resumo curto do objecto (cláusula 2) para o recibo de honorários. */
const ESCOLA_CURTA =
  "École Consulaire du Congo (Brazzaville) de Luanda — Annexe Nova Vida";

/** Período 01–30 do mês do recibo, formato DD-MM-AA. */
function periodoPrestacaoMes(mesKey?: string, mesLabel?: string): { ini: string; fim: string } {
  let y: number;
  let m: number;
  if (mesKey && /^\d{4}-\d{2}$/.test(mesKey)) {
    const [ys, ms] = mesKey.split("-");
    y = Number(ys);
    m = Number(ms);
  } else {
    const now = new Date();
    y = now.getFullYear();
    m = now.getMonth() + 1;
  }
  const mm = String(m).padStart(2, "0");
  const yy = String(y).slice(-2);
  return { ini: `01-${mm}-${yy}`, fim: `30-${mm}-${yy}` };
}

/**
 * Descrição curta da prestação conforme a função (para o texto do recibo).
 */
function descricaoPrestacaoPorFuncao(funcao?: string): string {
  const f = (funcao || "").toLowerCase();
  if (/vigil|segur|guarda|porteir|rond/.test(f)) {
    return `prestação de serviços de vigilância e segurança física das instalações, bens e pessoas da ${ESCOLA_CURTA}`;
  }
  if (/limp|higien|faxin|cantina|cozinh/.test(f)) {
    return `prestação de serviços de limpeza e higiene das instalações da ${ESCOLA_CURTA}`;
  }
  if (/manut|eletric|electric|canal|serral|jardim|patrim/.test(f)) {
    return `prestação de serviços de manutenção e conservação das instalações da ${ESCOLA_CURTA}`;
  }
  if (/admin|secret|financ|contab|tesour/.test(f)) {
    return `prestação de serviços técnico-administrativos e de apoio à gestão financeira da ${ESCOLA_CURTA}`;
  }
  if (/direc|director|diretor|coorden/.test(f) && /pedag/.test(f)) {
    return `prestação de serviços de direcção pedagógica da ${ESCOLA_CURTA}`;
  }
  if (/direc|director|diretor/.test(f)) {
    return `prestação de serviços de direcção administrativa da ${ESCOLA_CURTA}`;
  }
  if (/professor|docente|enseignant|educador|maitre|maître|mestre/.test(f)) {
    return `prestação de serviços docentes e educativos na ${ESCOLA_CURTA}`;
  }
  if (/motor|motorista|condutor/.test(f)) {
    return `prestação de serviços de transporte e condução ao serviço da ${ESCOLA_CURTA}`;
  }
  const perfil = perfilContrato(funcao || "");
  return `prestação de serviços de ${perfil.categoria.toLowerCase()} na ${ESCOLA_CURTA}`;
}

function resumoTrabalhoPrestacao(funcao?: string, _categoria?: string): string {
  return descricaoPrestacaoPorFuncao(funcao);
}

function autorizacaoPagamentoHtml(
  escola: { nome: string; subtitulo?: string; ano?: string; nomeCurto?: string },
  recibos: ReciboSalario[],
  _socios?: [string, string],
) {
  const logo = `${typeof location !== "undefined" ? location.origin : ""}/logo-escola.jpg`;
  const dataDoc = dataDocFinancas(todayIso());
  const mes = recibos[0]?.mes || "—";
  const total = recibos.reduce((s, r) => s + (r.liquido || 0), 0);
  const rows = recibos
    .map(
      (r, i) =>
        `<tr>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;width:2.2em;text-align:right;color:#64748b;font-variant-numeric:tabular-nums;">${i + 1}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${r.nome}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${r.funcao || "—"}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums;">${formatKz(r.liquido)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">${r.iban || "—"}</td>
        </tr>`,
    )
    .join("");
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title>Autorização de pagamento</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 12px; line-height: 1.45; color: #0f172a; position: relative; min-height: 100vh; }
  h1 { font-size: 15px; text-align: center; margin: 10px 0 6px; }
  .head { display:flex; gap:12px; align-items:center; border-bottom:2px solid #009543; padding-bottom:10px; margin-bottom:14px; }
  .head img { width:64px; height:64px; object-fit:contain; }
  .muted { color:#64748b; font-size:11px; }
  table { width:100%; border-collapse:collapse; margin:12px 0 16px; }
  th { text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.06em; color:#64748b; padding:6px 8px; border-bottom:2px solid #cbd5e1; }
  .total { font-weight:700; font-size:14px; margin:8px 0 28px; }
  .sign { margin-top:56px; max-width:280px; }
  .sign .line { margin-top:56px; border-top:1px solid #94a3b8; padding-top:8px; text-align:center; font-size:11px; }
  .doc-foot { margin-top: 24px; text-align: right; font-size: 9px; color: #64748b; }
</style></head><body>
<div class="head">
  <img src="${logo}" alt="Logo"/>
  <div>
    <strong>${escola.nome}</strong><br/>
    <span class="muted">${escola.subtitulo || "Missão diplomática · Luanda"}</span><br/>
    <span class="muted">Ano lectivo ${escola.ano || ""}</span>
  </div>
</div>
<h1>AUTORIZAÇÃO / SOLICITAÇÃO DE PAGAMENTO DE HONORÁRIOS</h1>
<p>A Administração <strong>autoriza</strong> o pagamento dos honorários referentes a <strong>${mes}</strong>, conforme a lista seguinte, por transferência ou cartão a partir da conta BAI da ${escola.nomeCurto || "escola"}.</p>
<table>
  <thead><tr><th style="width:2.2em">N.º</th><th>Prestador</th><th>Função</th><th style="text-align:right">Valor líquido</th><th>IBAN</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p class="total">Total a autorizar: ${formatKz(total)}</p>
<div class="sign">
  <div class="line">A Administração</div>
</div>
<p class="doc-foot">Documento gerado pelo Departamento de Finanças, ${dataDoc}</p>
</body></html>`;
}

function reciboHonorarioHtml(
  escola: { nome: string; subtitulo?: string; ano?: string; nomeCurto?: string; notaFiscal?: string },
  r: ReciboSalario,
) {
  const logo = `${typeof location !== "undefined" ? location.origin : ""}/logo-escola.jpg`;
  const descricao = descricaoPrestacaoPorFuncao(r.funcao);
  const { ini, fim } = periodoPrestacaoMes(r.mesKey, r.mes);
  const dataDoc = dataDocFinancas(r.dataPag || todayIso());
  return `<article class="recibo">
  <header class="rh">
    <img src="${logo}" alt=""/>
    <div>
      <strong>${escola.nome}</strong><br/>
      <span class="mu">${escola.subtitulo || "Luanda"} · ${escola.ano || ""}</span>
    </div>
  </header>
  <p class="ki" style="text-align:center">Recibo de honorários / prestação de serviços</p>
  <div class="rw"><span>N.º <b>${r.id}</b></span><span>${r.dataPag ? formatDate(r.dataPag) : "—"}</span></div>
  <p class="tx">Pagámos a <b>${r.nome}</b> a quantia de <b>${formatKz(r.liquido)}</b> referente a ${descricao}, durante o período <b>${ini}</b> a <b>${fim}</b>.</p>
  <table class="tb">
    <tr><td>Honorário de referência</td><td class="n">${formatKz(r.salarioBruto)}</td></tr>
    ${r.descontoDias > 0 ? `<tr><td>Desconto dias (${r.diasTrab}/${r.diasUteis})</td><td class="n">−${formatKz(r.descontoDias)}</td></tr>` : ""}
    ${(r.outrosDesc || 0) > 0 ? `<tr><td>Outros descontos</td><td class="n">−${formatKz(r.outrosDesc)}</td></tr>` : ""}
    <tr class="tot"><td>Líquido</td><td class="n">${formatKz(r.liquido)}</td></tr>
  </table>
  ${r.iban ? `<p class="mu">IBAN: ${r.iban}</p>` : ""}
  <div class="sg">
    <div><span>O prestador</span><i></i></div>
    <div><span>Departamento de Finanças</span><i></i></div>
  </div>
  <p class="ft">Documento gerado pelo Departamento de Finanças, ${dataDoc}</p>
</article>`;
}

function listaFuncionariosHtml(
  escola: { nome: string; subtitulo?: string; ano?: string },
  rows: { nome: string; funcao: string; salario: number; diasTrab: number; diasUteis: number; mes: string }[],
  titulo = "Lista de funcionários e honorários",
) {
  const logo = `${typeof location !== "undefined" ? location.origin : ""}/logo-escola.jpg`;
  const body = rows
    .map(
      (r) =>
        `<tr>
          <td>${r.nome}</td>
          <td>${r.funcao || "—"}</td>
          <td class="num">${formatKz(r.salario)}</td>
          <td class="num">${r.diasTrab}/${r.diasUteis}</td>
          <td>${r.mes || "—"}</td>
        </tr>`,
    )
    .join("");
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title></title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: system-ui, sans-serif; font-size: 12px; color: #0f172a; }
  .head { display:flex; gap:12px; align-items:center; border-bottom:2px solid #009543; padding-bottom:10px; margin-bottom:14px; }
  .head img { width:56px; height:56px; object-fit:contain; }
  h1 { font-size: 15px; margin: 0 0 12px; }
  table { width:100%; border-collapse:collapse; }
  th { text-align:left; font-size:10px; text-transform:uppercase; color:#64748b; border-bottom:2px solid #cbd5e1; padding:8px 6px; }
  td { padding:8px 6px; border-bottom:1px solid #e2e8f0; }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
  .muted { color:#64748b; font-size:11px; }
</style></head><body>
<div class="head"><img src="${logo}" alt="Logo"/><div><strong>${escola.nome}</strong><br/><span class="muted">${escola.subtitulo || ""} · ${escola.ano || ""}</span></div></div>
<h1>${titulo}</h1>
<table>
  <thead><tr><th>Funcionário</th><th>Função</th><th class="num">Salário</th><th class="num">Dias trab.</th><th>Mês</th></tr></thead>
  <tbody>${body}</tbody>
</table>
<p class="muted">Documento gerado pelo Departamento de Finanças.</p>
</body></html>`;
}

function pacoteRecibosComAutorizacaoHtml(
  escola: { nome: string; subtitulo?: string; ano?: string; nomeCurto?: string; notaFiscal?: string },
  recibos: ReciboSalario[],
) {
  const folhas: string[] = [];
  for (let i = 0; i < recibos.length; i += 2) {
    const r1 = reciboHonorarioHtml(escola, recibos[i]);
    const r2 = recibos[i + 1] ? reciboHonorarioHtml(escola, recibos[i + 1]) : "";
    folhas.push(`<div class="folha">${r1}${r2}</div>`);
  }
  // Autorização: extrair só o miolo do HTML completo
  const authFull = autorizacaoPagamentoHtml(escola, recibos);
  let authInner = authFull;
  const b0 = authFull.indexOf("<body");
  if (b0 >= 0) {
    const after = authFull.indexOf(">", b0);
    const b1 = authFull.lastIndexOf("</body>");
    if (after >= 0 && b1 > after) authInner = authFull.slice(after + 1, b1);
  }
  // Reembrulhar autorização com classes .auth
  authInner = authInner
    .replace(/class="head"/g, 'class="head"')
    .replace(/<body[^>]*>/i, "")
    .replace(/<\/body>/i, "");
  const authPage = `<div class="folha"><div class="auth">${authInner}</div></div>`;

  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title></title>
<style>${cssImpressaoRecibos()}</style>
</head><body>
${folhas.join("\n")}
${authPage}
</body></html>`;
}

function openPrintHtml(html: string, _title?: string) {
  /**
   * Impressão limpa: sem título de documento (nome/recibo) e via blob
   * para reduzir URL da app no rodapé. No Chrome/Edge desactive
   * «Cabeçalhos e rodapés» no diálogo de impressão (data + URL).
   */
  let docHtml = html;
  // Título vazio — evita "Contrato — Nome" / "Recibos e autorização" no cabeçalho
  if (docHtml.includes("<title>")) {
    docHtml = docHtml.replace(/<title>[^<]*<\/title>/i, "<title></title>");
  } else if (docHtml.includes("</head>")) {
    docHtml = docHtml.replace("</head>", "<title></title></head>");
  }
  // Não injectar @page extra — os documentos já definem size A4 e margens.
  // Um segundo @page { margin } estraga o emparelhamento de 2 recibos.

  const blob = new Blob([docHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", " ");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
  iframe.src = url;
  document.body.appendChild(iframe);

  const cleanup = () => {
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const runPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      toast.error("Impressão bloqueada pelo browser.");
    }
    window.setTimeout(cleanup, 2500);
  };

  iframe.onload = () => {
    const doc = iframe.contentDocument;
    const imgs = doc ? Array.from(doc.images || []) : [];
    if (imgs.length === 0) {
      window.setTimeout(runPrint, 200);
      return;
    }
    let left = imgs.length;
    const done = () => {
      left -= 1;
      if (left <= 0) window.setTimeout(runPrint, 150);
    };
    imgs.forEach((img) => {
      if (img.complete) done();
      else {
        img.onload = done;
        img.onerror = done;
      }
    });
    window.setTimeout(runPrint, 2500);
  };
}




/** Estilos de impressão: 2 recibos por A4 (metade superior + metade inferior). */
function cssImpressaoRecibos(): string {
  return `
@page { size: A4 portrait; margin: 10mm; }
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 10.5pt;
  color: #0f172a;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.folha {
  width: 100%;
  page-break-after: always;
  break-after: page;
}
.folha:last-child { page-break-after: auto; break-after: auto; }
.folha::after {
  content: "";
  display: table;
  clear: both;
}
.recibo {
  width: 100%;
  height: 128mm;
  max-height: 128mm;
  padding: 3mm 2mm 2mm;
  overflow: hidden;
  border-bottom: 1px dashed #94a3b8;
}
.folha .recibo:last-child { border-bottom: none; }
.recibo .rh {
  display: flex;
  gap: 8px;
  align-items: center;
  border-bottom: 1.5pt solid #009543;
  padding-bottom: 3mm;
  margin-bottom: 2mm;
}
.recibo .rh img { width: 36px; height: 36px; object-fit: contain; }
.recibo .rh strong { font-size: 10pt; }
.recibo .mu { color: #64748b; font-size: 8pt; }
.recibo .ki {
  font-size: 7.5pt;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #009543;
  font-weight: 700;
  margin: 0 0 1.5mm;
  text-align: center;
}
.recibo .rw {
  display: flex;
  justify-content: space-between;
  margin: 0 0 1.5mm;
  font-size: 9pt;
}
.recibo .tx {
  font-size: 9pt;
  line-height: 1.3;
  margin: 0 0 2mm;
  text-align: justify;
}
.recibo .tb {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 1.5mm;
  font-size: 9pt;
}
.recibo .tb td { padding: 1mm 0; border-top: 0.5pt solid #e2e8f0; }
.recibo .tb .n { text-align: right; font-variant-numeric: tabular-nums; }
.recibo .tb .tot { font-weight: 700; border-top: 1pt solid #0f172a; }
.recibo .sg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12mm;
  margin-top: 4mm;
  font-size: 8pt;
  text-align: center;
}
.recibo .sg span { display: block; margin-bottom: 10mm; }
.recibo .sg i {
  display: block;
  border-top: 0.5pt solid #64748b;
  font-style: normal;
}
.recibo .ft {
  margin: 3mm 0 0;
  font-size: 7.5pt;
  color: #64748b;
  text-align: right;
}
/* Autorização */
.auth {
  padding: 2mm;
  position: relative;
  min-height: 260mm;
}
.auth .head {
  display: flex;
  gap: 10px;
  align-items: center;
  border-bottom: 2px solid #009543;
  padding-bottom: 8px;
  margin-bottom: 12px;
}
.auth .head img { width: 52px; height: 52px; object-fit: contain; }
.auth h1 { font-size: 13pt; text-align: center; margin: 8px 0 6px; }
.auth .muted { color: #64748b; font-size: 9pt; }
.auth table { width: 100%; border-collapse: collapse; margin: 10px 0 14px; font-size: 10pt; }
.auth th {
  text-align: left;
  font-size: 8pt;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #64748b;
  padding: 4px 6px;
  border-bottom: 1.5pt solid #cbd5e1;
}
.auth td { padding: 4px 6px; border-bottom: 0.5pt solid #e2e8f0; }
.auth .total { font-weight: 700; font-size: 12pt; margin: 8px 0 20px; }
.auth .sign { margin-top: 40px; max-width: 60mm; }
.auth .sign .line {
  margin-top: 40px;
  border-top: 0.5pt solid #94a3b8;
  padding-top: 6px;
  text-align: center;
  font-size: 9pt;
}
.auth .doc-foot {
  position: absolute;
  bottom: 0;
  right: 0;
  font-size: 8pt;
  color: #64748b;
  text-align: right;
}
`;
}

/** HTML completo para pré-visualizar recibo individual */
function wrapReciboPage(
  escola: { nome: string; subtitulo?: string; ano?: string; nomeCurto?: string; notaFiscal?: string },
  r: ReciboSalario,
) {
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title></title>
<style>${cssImpressaoRecibos()}</style></head><body>
<div class="folha">${reciboHonorarioHtml(escola, r)}</div>
</body></html>`;
}


/** CSS partilhado: dois recibos A5 por folha A4. */


function SalarioFormFields({
  form,
  setForm,
  onSave,
  onCancel,
  onSaveAndContract,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  onSave: () => void;
  onCancel: () => void;
  onSaveAndContract?: () => void;
}) {
  return (
    <div className="grid max-h-[70vh] gap-3 overflow-y-auto sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Nome completo *</Label>
        <Input data-focus="nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Função</Label>
        <select
          className="flex h-11 w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
          value={FUNCOES_OPCOES.includes(form.funcao as (typeof FUNCOES_OPCOES)[number]) ? form.funcao : form.funcao ? "__outro__" : ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__outro__") {
              setForm({ ...form, funcao: form.funcao && !FUNCOES_OPCOES.includes(form.funcao as (typeof FUNCOES_OPCOES)[number]) ? form.funcao : "" });
              return;
            }
            const perfil = perfilContrato(v);
            const next = {
              ...form,
              funcao: v,
              categoria: perfil.categoria,
              objectoContrato: perfil.objecto,
              horario: isVigilante(v) ? HORARIO_VIGILANTE : form.horario === HORARIO_VIGILANTE ? HORARIO_PADRAO : form.horario || HORARIO_PADRAO,
            };
            setForm(next);
          }}
        >
          <option value="">— escolher função —</option>
          {FUNCOES_OPCOES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
          <option value="__outro__">Outra função…</option>
        </select>
        {!FUNCOES_OPCOES.includes(form.funcao as (typeof FUNCOES_OPCOES)[number]) && form.funcao !== "" ? (
          <Input
            className="mt-1.5"
            value={form.funcao}
            onChange={(e) => {
              const funcao = e.target.value;
              const perfil = perfilContrato(funcao);
              setForm({
                ...form,
                funcao,
                categoria: perfil.categoria,
                horario: isVigilante(funcao) ? HORARIO_VIGILANTE : form.horario,
              });
            }}
            placeholder="Escreva a função"
          />
        ) : null}
        {isVigilante(form.funcao) ? (
          <p className="text-[11px] text-[var(--color-forest)]">
            Vigilante: contrato em regime de turnos (3 dias 24h + 3 dias folga).
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label>Categoria contratual</Label>
        <select
          className="flex h-11 w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-sm"
          value={form.categoria}
          onChange={(e) => setForm({ ...form, categoria: e.target.value })}
        >
          {[
            "Pessoal de Apoio Operacional (Segurança e Vigilância)",
            "Pessoal de Apoio Operacional (Higiene e Salubridade)",
            "Quadro Técnico / Gestão de Infraestruturas",
            "Quadro Técnico Administrativo (Especialidade: Gestão Financeira)",
            "Cargo de Direção Executiva / Quadro Técnico Superior",
            "Corpo Docente (Expatriado ou Local)",
            "Cargo de Direção Superior / Comissão de Serviço",
            "Pessoal de Apoio / Prestação de Serviços",
            form.categoria,
          ]
            .filter((v, i, a) => v && a.indexOf(v) === i)
            .map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
        </select>
        <p className="text-[11px] text-[var(--color-muted)]">
          Actualiza-se com a função; pode ajustar manualmente. O contrato usa estes dados.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>Honorário mensal (Kz)</Label>
        <Input value={form.salario} onChange={(e) => setForm({ ...form, salario: e.target.value })} inputMode="decimal" />
      </div>
      <div className="space-y-1.5">
        <Label>IBAN</Label>
        <Input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="AO06…" />
      </div>
      <div className="space-y-1.5">
        <Label>Telefone</Label>
        <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>E-mail</Label>
        <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Morada</Label>
        <Input value={form.morada} onChange={(e) => setForm({ ...form, morada: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>BI / Passaporte</Label>
        <Input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Nacionalidade</Label>
        <Input value={form.nacionalidade} onChange={(e) => setForm({ ...form, nacionalidade: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Início do contrato</Label>
        <Input
          type="date"
          value={form.dataInicioContrato}
          onChange={(e) => {
            const v = e.target.value;
            setForm({ ...form, dataInicioContrato: v, dataFimContrato: addMonthsIso(v, 9) });
          }}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Fim do contrato (9 meses)</Label>
        <Input type="date" value={form.dataFimContrato} onChange={(e) => setForm({ ...form, dataFimContrato: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Local de prestação</Label>
        <Input value={form.localPrestacao} onChange={(e) => setForm({ ...form, localPrestacao: e.target.value })} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Objecto do contrato</Label>
        <Input value={form.objectoContrato} onChange={(e) => setForm({ ...form, objectoContrato: e.target.value })} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Horário de prestação</Label>
        <Input
          value={form.horario}
          onChange={(e) => setForm({ ...form, horario: e.target.value })}
          placeholder="07h00 às 17h00, com 1 hora de almoço (aulas a partir das 07h30)"
        />
        <p className="text-[11px] text-[var(--color-muted)]">
          {isVigilante(form.funcao)
            ? "Vigilante: turnos de 24h — 3 dias de serviço e 3 dias de folga, em alternância."
            : "Padrão: 07h00–17h00 com 1h de almoço (≈8h efectivas). Editável por prestador."}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>Dias úteis (ref.)</Label>
        <Input value={form.diasUteis} onChange={(e) => setForm({ ...form, diasUteis: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Outros descontos (Kz)</Label>
        <Input value={form.outrosDesc} onChange={(e) => setForm({ ...form, outrosDesc: e.target.value })} />
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--color-line)] pt-3 sm:col-span-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="button" variant="secondary" onClick={onSave}>
          Guardar cadastro
        </Button>
        {onSaveAndContract ? (
          <Button type="button" onClick={onSaveAndContract}>
            Criar contrato
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Salarios() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const escola = getSeed().escola;
  const printRef = useRef<HTMLDivElement>(null);
  const listPrintRef = useRef<HTMLDivElement>(null);
  const operators = useFinance((s) => s.operators);
  const active = useFinance((s) => s.activeOperator);
  const canEdit = isCollaborator1(active, operators);
  const salariosExtra = useFinance((s) => s.salariosExtra);
  const salariosOverrides = useFinance((s) => s.salariosOverrides);
  const salariosDeletedIds = useFinance((s) => s.salariosDeletedIds || []);
  const removeSalario = useFinance((s) => s.removeSalario);
  const addSalario = useFinance((s) => s.addSalario);
  const updateSalario = useFinance((s) => s.updateSalario);
  const recibosSalario = useFinance((s) => s.recibosSalario || []);
  const addRecibosSalario = useFinance((s) => s.addRecibosSalario);
  const setReciboSalarioPago = useFinance((s) => s.setReciboSalarioPago);
  const reconcileSalariosBai = useFinance((s) => s.reconcileSalariosBai);
  const ensureSalariosBaiFromRecibos = useFinance((s) => s.ensureSalariosBaiFromRecibos);
  const limparDebitosSalarioBai = useFinance((s) => s.limparDebitosSalarioBai);
  const restaurarRecibosPagos = useFinance((s) => s.restaurarRecibosPagos);
  const removeReciboSalario = useFinance((s) => s.removeReciboSalario);
  const rows = salariosAll(salariosExtra, salariosOverrides, salariosDeletedIds);

  const [form, setForm] = useState<FormState>(emptyForm());
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Salario | null>(null);
  const [viewing, setViewing] = useState<Salario | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [genMes, setGenMes] = useState("");
  const [genMesKey, setGenMesKey] = useState("");
  const [genDiasUteis, setGenDiasUteis] = useState("22");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [diasMap, setDiasMap] = useState<Record<string, string>>({});
  const [filterRec, setFilterRec] = useState<"todos" | "pagos" | "por_pagar">("todos");
  const [previewHtml, setPreviewHtml] = useState<{ title: string; html: string } | null>(null);
  const [avisoFimMesOn, setAvisoFimMesOn] = useState(() => {
    if (typeof window === "undefined") return true;
    const day = new Date().getDate();
    if (day < 28 || day > 30) return false;
    const key = `aviso-salarios-${new Date().getFullYear()}-${new Date().getMonth()}`;
    return window.sessionStorage.getItem(key) !== "1";
  });

  function clearDeepLink() {
    void navigate({ search: { edit: undefined, focus: undefined }, replace: true });
  }

  useEffect(() => {
    // Correcção urgente: limpar SALARIO-APP órfãos e garantir 4 recibos pagos Agosto
    try {
      const key = "ecc-fix-salarios-ago-2026-v2";
      if (typeof window !== "undefined" && window.sessionStorage.getItem(key) === "1") {
        reconcileSalariosBai();
        ensureSalariosBaiFromRecibos();
        return;
      }
      restaurarQuatroPagosAgosto();
      try {
        window.sessionStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
    } catch {
      try {
        limparDebitosSalarioBai();
        reconcileSalariosBai();
        ensureSalariosBaiFromRecibos();
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (search.edit) {
      const r = rows.find((x) => x.id === search.edit);
      if (r) {
        setEditing(r);
        setForm(formFromSalario(r));
      }
    }
  }, [search.edit]); // eslint-disable-line react-hooks/exhaustive-deps

  function openNew() {
    if (!canEdit) {
      toast.error("Apenas o Colaborador 1 pode adicionar funcionários.");
      return;
    }
    setForm(emptyForm());
    setCreating(true);
  }

  function openEdit(r: Salario) {
    if (!canEdit) {
      toast.error("Apenas o Colaborador 1 pode editar.");
      return;
    }
    setEditing(r);
    setForm(formFromSalario(r));
  }

  function saveNew(withContract: boolean) {
    if (!form.nome.trim()) {
      toast.error("Indique o nome completo.");
      return;
    }
    const id = `F-${Date.now().toString(36).slice(-6).toUpperCase()}`;
    const perfil = perfilContrato(form.funcao, form.categoria);
    const formAligned = {
      ...form,
      categoria: form.categoria.trim() || perfil.categoria,
      objectoContrato: perfil.objecto,
      horario: form.horario.trim() || (isVigilante(form.funcao) ? HORARIO_VIGILANTE : HORARIO_PADRAO),
      mes: form.mes.trim() || new Date().toLocaleDateString("pt-PT", { month: "long", year: "numeric" }),
    };
    const patch = toSalarioPatch(formAligned);
    const row: Salario = {
      id,
      nome: patch.nome!,
      funcao: patch.funcao || "",
      categoria: patch.categoria || "Pessoal",
      salario: patch.salario || 0,
      mes: patch.mes || "",
      diasUteis: patch.diasUteis || 22,
      diasTrab: patch.diasTrab || 22,
      outrosDesc: patch.outrosDesc || 0,
      dataPag: patch.dataPag || todayIso(),
      dataInicioContrato: patch.dataInicioContrato,
      dataFimContrato: patch.dataFimContrato,
      telefone: patch.telefone,
      email: patch.email,
      morada: patch.morada,
      documento: patch.documento,
      nacionalidade: patch.nacionalidade,
      iban: patch.iban,
      localPrestacao: patch.localPrestacao,
      objectoContrato: patch.objectoContrato,
      horario: patch.horario,
      temContrato: withContract,
    };
    addSalario(row);
    setCreating(false);
    toast.success(withContract ? "Cadastro guardado e contrato pronto a imprimir" : "Cadastro guardado");
    if (withContract) verDocumento(`Contrato — ${row.nome}`, contratoHtml(escola, row));
  }

  function saveEdit(withContract: boolean) {
    if (!editing) return;
    if (!form.nome.trim()) {
      toast.error("Indique o nome completo.");
      return;
    }
    const perfil = perfilContrato(form.funcao, form.categoria);
    const formAligned = {
      ...form,
      categoria: form.categoria.trim() || perfil.categoria,
      objectoContrato: perfil.objecto,
      horario: form.horario.trim() || (isVigilante(form.funcao) ? HORARIO_VIGILANTE : HORARIO_PADRAO),
    };
    const patch = { ...toSalarioPatch(formAligned), temContrato: withContract || editing.temContrato };
    try {
      updateSalario(editing.id, patch);
      const full = { ...editing, ...patch } as Salario;
      toast.success("Cadastro actualizado" + (withContract || editing.temContrato ? " · contrato actualizado" : ""));
      // Sempre actualiza o contrato em pré-visualização se já tiver contrato ou pediu com contrato
      if (withContract || editing.temContrato) {
        verDocumento(`Contrato — ${full.nome}`, contratoHtml(escola, full));
      }
      setEditing(null);
      clearDeepLink();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar");
    }
  }

  function verDocumento(title: string, html: string) {
    setPreviewHtml({ title, html });
  }

  function criarContrato(r: Salario) {
    if (!canEdit) {
      toast.error("Apenas o Colaborador 1.");
      return;
    }
    try {
      updateSalario(r.id, { temContrato: true });
    } catch {
      /* ignore */
    }
    verDocumento(`Contrato — ${r.nome}`, contratoHtml(escola, r));
  }

  function openGerarRecibos() {
    if (!canEdit) {
      toast.error("Apenas o Colaborador 1.");
      return;
    }
    const now = new Date();
    const mesLabel = now.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
    const mesKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    setGenMes(mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1));
    setGenMesKey(mesKey);
    setGenDiasUteis("22");
    setSelected(new Set(rows.map((r) => r.id)));
    const dm: Record<string, string> = {};
    rows.forEach((r) => {
      dm[r.id] = String(r.diasTrab || 22);
    });
    setDiasMap(dm);
    setGenOpen(true);
  }


  function restaurarQuatroPagosAgosto() {
    // Fallback fixo dos 4 honorários de Agosto (valores do extrato)
    const FALLBACK = [
      { id: "F-CAPOLO", nome: "Alberto Afonso Capolo", funcao: "Prestador", salario: 90000 },
      { id: "F-KATIVA", nome: "Francisco Kativa", funcao: "Prestador", salario: 90000 },
      { id: "F-JONES", nome: "José Borges Pilartes Jones", funcao: "Prestador", salario: 90000 },
      { id: "F-MASSAMBA", nome: "Massamba João Lucique", funcao: "Prestador", salario: 120000 },
    ];
    const nomesAlvo = ["massamba", "pilartes", "kativa", "capolo"];
    let staff = rows
      .filter((r) => nomesAlvo.some((n) => (r.nome || "").toLowerCase().includes(n)))
      .map((f) => ({
        id: f.id,
        nome: f.nome,
        funcao: f.funcao,
        salario: f.salario,
        diasUteis: f.diasUteis || 22,
        diasTrab: f.diasTrab || 22,
        outrosDesc: f.outrosDesc || 0,
        iban: f.iban,
      }));
    // Completar com fallback se faltar alguém na lista de funcionários
    for (const fb of FALLBACK) {
      if (staff.length >= 4) break;
      if (!staff.some((s) => s.nome.toLowerCase().includes(fb.nome.split(" ").slice(-1)[0].toLowerCase()) || s.nome.toLowerCase().includes(fb.nome.split(" ")[0].toLowerCase()))) {
        staff.push({ ...fb, diasUteis: 22, diasTrab: 22, outrosDesc: 0 });
      }
    }
    if (staff.length > 4) staff = staff.slice(0, 4);
    if (!staff.length) {
      toast.error("Não foi possível identificar os 4 funcionários.");
      return;
    }
    // 1) Remover débitos salário do extrato e recalcular saldo
    const removed = limparDebitosSalarioBai();
    // 2) Recibos Agosto como pagos
    const n = restaurarRecibosPagos(
      staff,
      "Agosto de 2026",
      "2026-08",
      "2026-08-30",
    );
    setFilterRec("pagos");
    toast.success(
      `${n} recibo(s) pagos · ${removed} linha(s) removida(s) do BAI · saldo recalculado.`,
    );
  }

  function gerarRecibos() {
    if (!selected.size) {
      toast.error("Seleccione pelo menos um funcionário.");
      return;
    }
    const diasU = Number(genDiasUteis) || 22;
    const created: ReciboSalario[] = [];
    for (const id of selected) {
      const f = rows.find((r) => r.id === id);
      if (!f) continue;
      const diasT = Number(diasMap[id] ?? diasU) || 0;
      const { descontoDias, liquido } = liquidoCalc(f.salario, diasU, diasT, f.outrosDesc || 0);
      const rid = `RS-${id}-${genMesKey}`;
      created.push({
        id: rid,
        funcionarioId: id,
        nome: f.nome,
        funcao: f.funcao,
        mes: genMes,
        mesKey: genMesKey,
        diasUteis: diasU,
        diasTrab: diasT,
        salarioBruto: f.salario,
        descontoDias,
        outrosDesc: f.outrosDesc || 0,
        liquido,
        dataPag: todayIso(),
        pago: false,
        iban: f.iban,
        criadoEm: new Date().toISOString(),
      });
    }
    // Numeração RH-AAAA-MM-NNN
    const numbered = created.map((r, i) => ({
      ...r,
      id: `RH-${genMesKey}-${String(i + 1).padStart(3, "0")}`,
    }));
    addRecibosSalario(numbered);
    setGenOpen(false);
    toast.success(`${numbered.length} recibo(s) + autorização gerados para ${genMes}`);
    // Um único documento: recibos (um por funcionário) + autorização no fim
    verDocumento(
      `Recibos e autorização — ${genMes}`,
      pacoteRecibosComAutorizacaoHtml(escola, numbered),
    );
  }

  const recibosFiltrados = useMemo(() => {
    let list = [...recibosSalario].sort((a, b) => b.mesKey.localeCompare(a.mesKey) || a.nome.localeCompare(b.nome));
    if (filterRec === "pagos") list = list.filter((r) => r.pago);
    if (filterRec === "por_pagar") list = list.filter((r) => !r.pago);
    return list;
  }, [recibosSalario, filterRec]);

  const totalFolha = rows.reduce((s, r) => s + (r.salario || 0), 0);

  return (
    <div>
      <PageHeader
        kicker="Recursos humanos"
        title="Salários e contratos"
        description="Cadastro, contrato (9 meses), recibos mensais, autorização dos sócios e débito no Banco BAI ao marcar pago. Aviso automático nos dias 28–30."
        actions={
          <div className="no-print flex flex-row flex-wrap items-center gap-2">
            {canEdit ? (
              <>
                <Button className="shrink-0" type="button" variant="secondary" onClick={openGerarRecibos}>
                  Gerar recibos do mês
                </Button>
                <Button className="shrink-0" type="button" onClick={openNew}>
                  <UserPlus className="mr-1 size-4" />
                  Novo funcionário
                </Button>
              </>
            ) : null}
            <PrintActions
              targetRef={printRef}
              filename="salarios.pdf"
              shareTitle="Salários · École Consulaire"
              shareText="Lista de funcionários · Departamento de Finanças."
            />
            <Button
              type="button"
              variant="secondary"
              className="hidden shrink-0 sm:inline-flex"
              onClick={() => {
                const now = new Date();
                const mesAtual = now.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
                const mesLabel = mesAtual.charAt(0).toUpperCase() + mesAtual.slice(1);
                const list = rows.map((r) => ({
                  nome: r.nome,
                  funcao: r.funcao,
                  salario: r.salario,
                  diasTrab: r.diasTrab,
                  diasUteis: r.diasUteis,
                  mes: mesLabel,
                }));
                verDocumento(
                  `Lista funcionários — ${mesLabel}`,
                  listaFuncionariosHtml(escola, list, `Lista de funcionários · ${mesLabel}`),
                );
              }}
            >
              Imprimir lista
            </Button>
          </div>
        }
      />


      {avisoFimMesOn && (() => {
        const day = new Date().getDate();
        if (day < 28 || day > 30) return null;
        const porPagar = recibosSalario.filter((r) => !r.pago).length;
        return (
          <div className="no-print mb-4 flex gap-3 rounded-[var(--radius)] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <div className="min-w-0 flex-1">
              <strong>Aviso de fim de mês (dia {day})</strong>
              {" — "}
              {porPagar > 0
                ? `Existem ${porPagar} recibo(s) de honorários por pagar. Gere a autorização dos sócios e marque como pago (debita o Banco BAI).`
                : "Está entre os dias 28 e 30: confirme se já gerou os recibos de honorários deste mês."}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={openGerarRecibos}>
                  Gerar recibos do mês
                </Button>
              </div>
            </div>
            <button
              type="button"
              className="shrink-0 rounded px-2 text-lg leading-none text-amber-900/70 hover:bg-amber-100"
              title="Fechar aviso"
              aria-label="Fechar aviso"
              onClick={() => {
                const key = `aviso-salarios-${new Date().getFullYear()}-${new Date().getMonth()}`;
                try {
                  window.sessionStorage.setItem(key, "1");
                } catch {
                  /* ignore */
                }
                setAvisoFimMesOn(false);
              }}
            >
              ×
            </button>
          </div>
        );
      })()}

      <p className="mb-3 text-sm text-[var(--color-muted)]">
        {rows.length} funcionário(s) · Folha de referência {formatKz(totalFolha)} · {recibosSalario.filter((r) => !r.pago).length} recibo(s) por pagar
      </p>

      <div ref={printRef} className="overflow-x-auto rounded-[var(--radius)] border border-[var(--color-line)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[var(--color-surface-2)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Função</th>
              <th className="px-3 py-2 text-right">Honorário</th>
              <th className="px-3 py-2">IBAN</th>
              <th className="px-3 py-2">Contrato</th>
              <th className="no-print px-3 py-2">Acções</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--color-line)]">
                <td className="px-3 py-2 font-medium">
                  <button type="button" className="text-left hover:underline" onClick={() => setViewing(r)}>
                    {r.nome}
                  </button>
                </td>
                <td className="px-3 py-2">{r.funcao}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatKz(r.salario)}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.iban || "—"}</td>
                <td className="px-3 py-2 text-xs">
                  {r.temContrato ? "Sim" : "—"}
                  {r.dataInicioContrato ? ` · ${formatDate(r.dataInicioContrato)}` : ""}
                </td>
                <td className="no-print px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {canEdit ? (
                      <>
                        <Button type="button" size="sm" variant="secondary" onClick={() => openEdit(r)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {canEdit ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            title="Apagar registo do funcionário"
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Apagar o registo de ${r.nome}? Esta acção não pode ser desfeita facilmente.`,
                                )
                              )
                                return;
                              try {
                                removeSalario(r.id);
                                toast.success(`Registo de ${r.nome} apagado`);
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Não foi possível apagar");
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        <Button type="button" size="sm" variant="secondary" onClick={() => criarContrato(r)} title="Criar contrato">
                          <FileText className="h-3.5 w-3.5" />
                          <span className="ml-1 hidden sm:inline">Contrato</span>
                        </Button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recibos gerados */}
      <div className="mt-8">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Recibos de honorários</h2>
          <div className="flex flex-wrap gap-2">
            {(["todos", "por_pagar", "pagos"] as const).map((f) => (
              <Button key={f} type="button" size="sm" variant={filterRec === f ? "default" : "secondary"} onClick={() => setFilterRec(f)}>
                {f === "todos" ? "Todos" : f === "pagos" ? "Pagos" : "Por pagar"}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                const list = recibosFiltrados.length ? recibosFiltrados : recibosSalario;
                if (!list.length) {
                  toast.error("Não há recibos. Use «Gerar recibos do mês» primeiro.");
                  return;
                }
                verDocumento(
                  "Recibos e autorização de pagamento",
                  pacoteRecibosComAutorizacaoHtml(escola, list),
                );
              }}
            >
              PDF
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                const list = recibosFiltrados.map((r) => ({
                  nome: r.nome,
                  funcao: r.funcao,
                  salario: r.liquido,
                  diasTrab: r.diasTrab,
                  diasUteis: r.diasUteis,
                  mes: r.mes,
                }));
                if (!list.length) {
                  toast.error("Lista vazia.");
                  return;
                }
                openPrintHtml(
                  listaFuncionariosHtml(escola, list, "Lista de recibos de honorários"),
                  "Lista recibos",
                );
              }}
            >
              Imprimir listagem
            </Button>
            {canEdit ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                title="Remove débitos SALARIO-APP do BAI e recria os recibos de Agosto como pagos (Massamba, José, Kativa, Capolo)"
                onClick={restaurarQuatroPagosAgosto}
              >
                Restaurar pagos (Agosto)
              </Button>
            ) : null}
          </div>
        </div>
        <div ref={listPrintRef} className="overflow-x-auto rounded-[var(--radius)] border border-[var(--color-line)]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[var(--color-surface-2)] text-xs uppercase text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-2">Mês</th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2 text-right">Líquido</th>
                <th className="px-3 py-2">Dias</th>
                <th className="px-3 py-2">Estado</th>
                <th className="no-print px-3 py-2">Acção</th>
              </tr>
            </thead>
            <tbody>
              {recibosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[var(--color-muted)]">
                    Ainda não há recibos. Use «Gerar recibos do mês».
                  </td>
                </tr>
              ) : (
                recibosFiltrados.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--color-line)]">
                    <td className="px-3 py-2">{r.mes}</td>
                    <td className="px-3 py-2">{r.nome}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatKz(r.liquido)}</td>
                    <td className="px-3 py-2">
                      {r.diasTrab}/{r.diasUteis}
                    </td>
                    <td className="px-3 py-2">{r.pago ? "Pago" : "Por pagar"}</td>
                    <td className="no-print px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            verDocumento(`Recibo — ${r.nome}`, wrapReciboPage(escola, r))
                          }
                        >
                          Ver recibo
                        </Button>
                        {canEdit ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => setReciboSalarioPago(r.id, !r.pago, todayIso())}
                            >
                              {r.pago ? "Marcar por pagar" : "Marcar pago"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              title="Apagar recibo (permite gerar outro)"
                              onClick={() => {
                                if (
                                  !confirm(
                                    `Apagar o recibo de ${r.nome} (${r.mes})? Poderá gerar um novo depois.`,
                                  )
                                ) {
                                  return;
                                }
                                removeReciboSalario(r.id);
                                toast.success("Recibo apagado. Pode gerar outro em «Gerar recibos do mês».");
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span className="ml-1 hidden sm:inline">Apagar</span>
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Novo */}
      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo funcionário</DialogTitle>
          </DialogHeader>
          <SalarioFormFields
            form={form}
            setForm={setForm}
            onCancel={() => setCreating(false)}
            onSave={() => saveNew(false)}
            onSaveAndContract={() => saveNew(true)}
          />
        </DialogContent>
      </Dialog>

      {/* Editar */}
      <Dialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            clearDeepLink();
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar funcionário</DialogTitle>
          </DialogHeader>
          <SalarioFormFields
            form={form}
            setForm={setForm}
            onCancel={() => {
              setEditing(null);
              clearDeepLink();
            }}
            onSave={() => saveEdit(false)}
            onSaveAndContract={() => saveEdit(true)}
          />
        </DialogContent>
      </Dialog>

      {/* Ver */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{viewing?.nome}</DialogTitle>
          </DialogHeader>
          {viewing ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <p>
                  <span className="text-[var(--color-muted)]">Função</span>
                  <br />
                  {viewing.funcao || "—"}
                </p>
                <p>
                  <span className="text-[var(--color-muted)]">Honorário</span>
                  <br />
                  {formatKz(viewing.salario)}
                </p>
                <p className="col-span-2">
                  <span className="text-[var(--color-muted)]">IBAN</span>
                  <br />
                  {viewing.iban || "—"}
                </p>
                <p>
                  <span className="text-[var(--color-muted)]">Contrato</span>
                  <br />
                  {viewing.dataInicioContrato ? formatDate(viewing.dataInicioContrato) : "—"} →{" "}
                  {viewing.dataFimContrato ? formatDate(viewing.dataFimContrato) : "—"}
                </p>
                <p>
                  <span className="text-[var(--color-muted)]">Documento</span>
                  <br />
                  {viewing.documento || "—"}
                </p>
              </div>
              <div className="flex justify-end gap-2 border-t pt-3">
                <Button type="button" variant="secondary" onClick={() => setViewing(null)}>
                  Fechar
                </Button>
                {canEdit ? (
                  <>
                    <Button type="button" variant="secondary" onClick={() => criarContrato(viewing)}>
                      Contrato
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        const r = viewing;
                        setViewing(null);
                        openEdit(r);
                      }}
                    >
                      Editar
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Pré-visualização contrato / autorização / recibo */}
      <Dialog open={!!previewHtml} onOpenChange={(o) => !o && setPreviewHtml(null)}>
        <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-3">
          <DialogHeader>
            <DialogTitle>{previewHtml?.title || "Documento"}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto rounded border border-[var(--color-line)] bg-white">
            {previewHtml ? (
              <iframe
                key={previewHtml.title}
                title={previewHtml.title}
                srcDoc={previewHtml.html}
                sandbox="allow-same-origin allow-modals allow-popups"
                className="h-[60vh] w-full bg-white"
              />
            ) : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
            <Button type="button" variant="secondary" onClick={() => setPreviewHtml(null)}>
              Fechar
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!previewHtml) return;
                void deliverOfficialHtml(previewHtml.html, {
                  filename: `${(previewHtml.title || "salarios").replace(/\s+/g, "-").toLowerCase()}.pdf`,
                  shareTitle: previewHtml.title || "Salários",
                  shareText: "Documento · Departamento de Finanças · École Consulaire",
                }).then((r) => {
                  if (r.delivery === "shared") toast.success("Escolha WhatsApp, Gmail ou outra app");
                  else if (isMobileDevice()) toast.success("PDF pronto");
                  else toast.message("No diálogo: impressora ou «Guardar como PDF»");
                });
              }}
            >
              PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Gerar recibos */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerar recibos + autorização do mês</DialogTitle>
          </DialogHeader>
          <div className="grid max-h-[70vh] gap-3 overflow-y-auto">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Mês (texto)</Label>
                <Input value={genMes} onChange={(e) => setGenMes(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Chave mês (AAAA-MM)</Label>
                <Input value={genMesKey} onChange={(e) => setGenMesKey(e.target.value)} placeholder="2026-08" />
              </div>
              <div className="space-y-1">
                <Label>Dias úteis do mês</Label>
                <Input value={genDiasUteis} onChange={(e) => setGenDiasUteis(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-[var(--color-muted)]">
              Seleccione os funcionários e, se necessário, ajuste os dias trabalhados (proporcional). No dia 30 pode gerar a folha do mês.
            </p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setSelected(new Set(rows.map((r) => r.id)))}>
                Todos
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setSelected(new Set())}>
                Nenhum
              </Button>
            </div>
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded border border-[var(--color-line)] px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={(e) => {
                      const n = new Set(selected);
                      if (e.target.checked) n.add(r.id);
                      else n.delete(r.id);
                      setSelected(n);
                    }}
                  />
                  <span className="min-w-[8rem] flex-1 text-sm font-medium">{r.nome}</span>
                  <span className="text-xs text-[var(--color-muted)]">{formatKz(r.salario)}</span>
                  <label className="flex items-center gap-1 text-xs">
                    Dias
                    <Input
                      className="h-8 w-16"
                      value={diasMap[r.id] ?? "22"}
                      onChange={(e) => setDiasMap({ ...diasMap, [r.id]: e.target.value })}
                    />
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2 border-t pt-3">
              <Button type="button" variant="secondary" onClick={() => setGenOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={gerarRecibos}>
                <Printer className="mr-1.5 h-4 w-4" />
                Gerar recibos
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
