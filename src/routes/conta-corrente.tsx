import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileText, Printer } from "lucide-react";
import {
  useFinance,
  saldoCreditoDe,
  getSeed,
  alunosAll,
  mesesOficiaisPagos,
  IDS_EXCEDENTE_REAL,
} from "@/lib/store";
import { formatKz } from "@/lib/format";
import { isCollaborator1 } from "@/lib/can-edit";
import { escolaLogoSrc } from "@/lib/logo-escola";

export const Route = createFileRoute("/conta-corrente")({ component: ContaCorrentePage });

type RowCC = {
  alunoId: string;
  nome: string;
  turma?: string;
  saldo: number;
  creditos: number;
  aplicacoes: number;
  mesesPago: string[];
  nMesesPago: number;
  detalheCreditos: { mes?: string; valor: number; descricao?: string; data?: string }[];
  temExcedente: boolean;
  totalExcedente: number;
  temAdiantado: boolean;
  /** Tarifa mensal de propina (Kz). */
  tarifa: number;
  /** Detalhe dos pagamentos por mês: valor efectivo e data. */
  pagamentosDetalhe: { mes: string; valor: number; data?: string }[];
  totalPago: number;
};

const MES_LABEL: Record<string, string> = {
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

const MES_NOME: Record<string, string> = {
  "2026-10": "Out/26",
  "2026-11": "Nov/26",
  "2026-12": "Dez/26",
  "2027-01": "Jan/27",
  "2027-02": "Fev/27",
  "2027-03": "Mar/27",
  "2027-04": "Abr/27",
  "2027-05": "Mai/27",
  "2027-06": "Jun/27",
  out: "Out/26",
  nov: "Nov/26",
  dez: "Dez/26",
  jan: "Jan/27",
  fev: "Fev/27",
  mar: "Mar/27",
  abr: "Abr/27",
  mai: "Mai/27",
  jun: "Jun/27",
};

function labelMes(m: string) {
  return MES_NOME[m] || m;
}

function openPrintHtml(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    toast.error("Permita pop-ups para imprimir / guardar PDF.");
    return;
  }
  setTimeout(() => {
    try {
      w.focus();
      w.print();
    } catch {
      /* user can print manually */
    }
  }, 400);
}

function folhaCreditoHtml(
  escola: { nome: string; subtitulo?: string; ano?: string },
  row: RowCC,
): string {
  const hoje = new Date().toLocaleDateString("pt-PT");
  const ano = escola.ano || "2026-2027";
  const logo = escolaLogoSrc();

  type Linha = { data: string; hist: string; deb: number; cred: number; mes?: string };
  const linhas: Linha[] = [];

  // 1) Créditos explícitos em conta corrente
  for (const d of row.detalheCreditos) {
    linhas.push({
      data: d.data || "",
      hist: (d.descricao || "Crédito em conta").replace(/</g, ""),
      deb: 0,
      cred: Number(d.valor) || 0,
      mes: d.mes,
    });
  }

  // 2) Propinas pagas — mês a mês com montante real
  const pagos = [...(row.pagamentosDetalhe || [])].sort((a, b) =>
    (a.mes || "").localeCompare(b.mes || ""),
  );
  for (const p of pagos) {
    const valor = Number(p.valor) || 0;
    if (valor <= 0) continue;
    linhas.push({
      data: p.data || "",
      hist: `Propina ${labelMes(p.mes)} — liquidada`,
      deb: 0,
      cred: valor,
      mes: p.mes,
    });
  }

  // Fallback: meses marcados sem valor (mostrar tarifa se conhecida)
  if (pagos.length === 0) {
    for (const m of row.mesesPago) {
      const valor = row.tarifa > 0 ? row.tarifa : 0;
      linhas.push({
        data: "",
        hist: `Propina ${labelMes(m)} — liquidada`,
        deb: 0,
        cred: valor,
        mes: m,
      });
    }
  }

  if (linhas.length === 0) {
    linhas.push({ data: hoje, hist: "Sem movimentos no período", deb: 0, cred: 0 });
  }

  let run = 0;
  let totalCred = 0;
  let totalDeb = 0;
  const movRows = linhas
    .map((l) => {
      run += l.cred - l.deb;
      totalCred += l.cred;
      totalDeb += l.deb;
      return `<tr>
        <td>${l.data || "—"}</td>
        <td>${l.hist}</td>
        <td class="n">${l.deb ? formatKz(l.deb) : "—"}</td>
        <td class="n">${l.cred ? formatKz(l.cred) : "—"}</td>
        <td class="n">${formatKz(run)}</td>
      </tr>`;
    })
    .join("");

  // Resumo mensal (meses separados)
  const porMes = new Map<string, number>();
  for (const p of pagos) {
    const k = p.mes || "";
    porMes.set(k, (porMes.get(k) || 0) + (Number(p.valor) || 0));
  }
  if (porMes.size === 0) {
    for (const m of row.mesesPago) {
      porMes.set(m, row.tarifa > 0 ? row.tarifa : 0);
    }
  }
  const resumoMeses = [...porMes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([m, v]) =>
        `<tr>
          <td>${labelMes(m)}</td>
          <td class="n">${v > 0 ? formatKz(v) : "—"}</td>
          <td>${v > 0 ? "Liquidado" : "—"}</td>
        </tr>`,
    )
    .join("");

  const situacao =
    row.temExcedente && row.totalExcedente > 0
      ? `Excedente ${formatKz(row.totalExcedente)}`
      : row.temAdiantado
        ? `${row.nMesesPago} mensalidades liquidadas (adiantado)`
        : row.nMesesPago
          ? `${row.nMesesPago} mensalidade(s) liquidada(s)`
          : "Sem movimentos de propina";

  const totalPago =
    row.totalPago > 0
      ? row.totalPago
      : [...porMes.values()].reduce((s, v) => s + v, 0) +
        row.detalheCreditos.reduce((s, d) => s + (Number(d.valor) || 0), 0);

  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/>
<title>Extracto de conta corrente — ${row.nome}</title>
<style>
@page { size: A4; margin: 14mm 14mm 16mm; }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #111; margin: 0; }
.hdr { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #14532d; padding-bottom: 10px; margin-bottom: 12px; }
.hdr img { height: 56px; width: 56px; object-fit: contain; }
.hdr .esc { font-size: 9pt; letter-spacing: 0.03em; text-transform: uppercase; color: #14532d; font-weight: 700; }
.hdr .tit { font-size: 14pt; font-weight: 700; margin-top: 2px; }
.hdr .sub { font-size: 9pt; color: #555; margin-top: 2px; }
.id { width: 100%; border-collapse: collapse; margin: 0 0 12px; }
.id td { border: 0.7pt solid #333; padding: 6px 8px; vertical-align: top; }
.id .lb { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.05em; color: #555; display: block; margin-bottom: 2px; }
.id .vl { font-size: 11pt; font-weight: 700; }
h2 { font-size: 10pt; text-transform: uppercase; letter-spacing: 0.06em; color: #14532d; margin: 14px 0 6px; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; }
table.mov, table.res { width: 100%; border-collapse: collapse; }
table.mov th, table.res th {
  border: 0.7pt solid #333; background: #14532d; color: #fff;
  font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; padding: 5px 6px; text-align: left;
}
table.mov td, table.res td { border: 0.7pt solid #333; padding: 5px 6px; }
.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.tot td { font-weight: 700; background: #f0fdf4; }
.nota { margin-top: 14px; font-size: 8.5pt; color: #444; line-height: 1.35; }
.emi { margin-top: 18px; font-size: 9pt; text-align: right; color: #333; }
.kpi { display: flex; gap: 10px; margin: 8px 0 12px; }
.kpi div { flex: 1; border: 0.7pt solid #333; padding: 6px 8px; }
.kpi .lb { font-size: 7.5pt; text-transform: uppercase; color: #555; }
.kpi .vl { font-size: 12pt; font-weight: 700; }
</style></head><body>
  <div class="hdr">
    ${logo ? `<img src="${logo}" alt=""/>` : ""}
    <div>
      <div class="esc">${(escola.nome || "École Consulaire du Congo (Brazzaville) de Luanda").replace(/</g, "")}</div>
      <div class="tit">Extracto de conta corrente</div>
      <div class="sub">Ano lectivo ${ano} · emitido em ${hoje}${(escola.subtitulo || "") ? " · " + String(escola.subtitulo).replace(/</g, "") : ""}</div>
    </div>
  </div>

  <table class="id">
    <tr>
      <td style="width:62%"><span class="lb">Aluno</span><span class="vl">${row.nome.replace(/</g, "")}</span></td>
      <td><span class="lb">Classe</span><span class="vl">${(row.turma || "—").replace(/</g, "")}</span></td>
    </tr>
    <tr>
      <td><span class="lb">Situação</span><span class="vl">${situacao}</span></td>
      <td><span class="lb">N.º aluno</span><span class="vl">${row.alunoId.replace(/</g, "")}</span></td>
    </tr>
  </table>

  <div class="kpi">
    <div><div class="lb">Tarifa mensal</div><div class="vl">${row.tarifa > 0 ? formatKz(row.tarifa) : "—"}</div></div>
    <div><div class="lb">Total pago (propinas)</div><div class="vl">${formatKz(totalPago)}</div></div>
    <div><div class="lb">Saldo conta corrente</div><div class="vl">${formatKz(row.saldo)}</div></div>
  </div>

  <h2>Movimentos</h2>
  <table class="mov">
    <thead>
      <tr>
        <th style="width:16%">Data</th>
        <th>Histórico</th>
        <th class="n" style="width:15%">Débito</th>
        <th class="n" style="width:15%">Crédito</th>
        <th class="n" style="width:15%">Saldo</th>
      </tr>
    </thead>
    <tbody>
      ${movRows}
      <tr class="tot">
        <td colspan="2">Totais / saldo actual</td>
        <td class="n">${totalDeb ? formatKz(totalDeb) : "—"}</td>
        <td class="n">${totalCred ? formatKz(totalCred) : "—"}</td>
        <td class="n">${formatKz(row.saldo > 0 ? row.saldo : run)}</td>
      </tr>
    </tbody>
  </table>

  <h2>Resumo por mês (propinas)</h2>
  <table class="res">
    <thead>
      <tr>
        <th style="width:30%">Mês</th>
        <th class="n" style="width:30%">Montante pago</th>
        <th>Situação</th>
      </tr>
    </thead>
    <tbody>
      ${resumoMeses || `<tr><td colspan="3" style="text-align:center;color:#666">Sem propinas liquidadas</td></tr>`}
      <tr class="tot">
        <td>Total</td>
        <td class="n">${formatKz(totalPago)}</td>
        <td>${row.nMesesPago} mês(es)</td>
      </tr>
    </tbody>
  </table>

  <p class="nota">
    Documento de acompanhamento da conta corrente do aluno (propinas).
    Os montantes por mês correspondem aos valores efectivamente registados no sistema.
    O excedente é o valor recebido acima da tarifa do mês; as mensalidades adiantadas
    constam como liquidadas e não constituem crédito adicional no banco.
  </p>
  <p class="emi">Departamento de Finanças</p>
</body></html>`;
}

function ContaCorrentePage() {
  const contaCorrente = useFinance((s) => s.contaCorrente || []);
  const mensalidades = useFinance((s) => s.mensalidades || []);
  const alunosExtra = useFinance((s) => s.alunosExtra || []);
  const alunosOverrides = useFinance((s) => s.alunosOverrides || {});
  const alunosDeletedIds = useFinance((s) => s.alunosDeletedIds || []);
  const aplicarCreditoPropina = useFinance((s) => s.aplicarCreditoPropina);
  const activeOperator = useFinance((s) => s.activeOperator);
  const operators = useFinance((s) => s.operators);
  const canEdit = isCollaborator1(activeOperator, operators);
  const escola = getSeed().escola;
  const [q, setQ] = useState("");
  const [soComCredito, setSoComCredito] = useState(false);
  const [soComExcedente, setSoComExcedente] = useState(false);
  const [soComAdiantado, setSoComAdiantado] = useState(false);

  const alunos = useMemo(
    () => alunosAll(alunosExtra, alunosOverrides, alunosDeletedIds),
    [alunosExtra, alunosOverrides, alunosDeletedIds],
  );

  const rows: RowCC[] = useMemo(() => {
    const byId = new Map<string, RowCC>();

    for (const a of alunos) {
      const saldo = saldoCreditoDe(contaCorrente, a.id);
      const movs = (contaCorrente || []).filter((m) => m.alunoId === a.id);
      const creditos = movs
        .filter((m) => m.tipo === "credito")
        .reduce((s, m) => s + (Number(m.valor) || 0), 0);
      const aplicacoes = movs
        .filter((m) => m.tipo !== "credito" && m.tipo !== "pagamento")
        .reduce((s, m) => s + (Number(m.valor) || 0), 0);
      const detalheCreditos = movs
        .filter((m) => m.tipo === "credito")
        .map((m) => ({
          mes: m.mes,
          valor: Number(m.valor) || 0,
          descricao: m.descricao,
          data: m.data,
        }));

      const prop = mensalidades.find(
        (p) => (p as { alunoId?: string }).alunoId === a.id || p.id === a.id,
      ) as
        | {
            propina?: number;
            pagamentos?: Record<string, number>;
            [k: string]: unknown;
          }
        | undefined;

      const oficiais = mesesOficiaisPagos(a.id);
      const mesesPago: string[] = [];
      let totalExcedente = 0;
      if (oficiais) {
        for (const k of oficiais) {
          const key = MES_LABEL[k] || k;
          if (!mesesPago.includes(key)) mesesPago.push(key);
        }
      } else if (prop) {
        const pags = prop.pagamentos || {};
        for (const [k, v] of Object.entries(pags)) {
          if ((Number(v) || 0) <= 0) continue;
          const key = MES_LABEL[k] || (/^20\d{2}-\d{2}$/.test(k) ? k : k);
          if (!mesesPago.includes(key)) mesesPago.push(key);
        }
      }
      // Excedente = só crédito explícito OU aluno na lista oficial (Hallan).
      // Pacote / vários meses à tarifa NÃO conta como excedente.
      const creditosExcedente = detalheCreditos
        .filter((d) => /excedente/i.test(d.descricao || ""))
        .reduce((s, d) => s + (d.valor || 0), 0);
      if (IDS_EXCEDENTE_REAL.has(a.id)) {
        if (prop) {
          const tarifa = Number(prop.propina) || 0;
          const pags = prop.pagamentos || {};
          for (const v of Object.values(pags)) {
            const n = Number(v) || 0;
            if (tarifa > 0 && n > tarifa && n < tarifa * 1.4) totalExcedente += n - tarifa;
          }
        }
        totalExcedente = Math.max(totalExcedente, creditosExcedente, 5000);
      } else {
        totalExcedente = 0;
      }
      const temExcedente = IDS_EXCEDENTE_REAL.has(a.id);
      const temAdiantado = mesesPago.length > 1;

      mesesPago.sort();

      // Detalhe de PROPINAS pagas (≠ inscrição/matrícula)
      const pagamentosDetalhe: { mes: string; valor: number; data?: string }[] = [];
      const tarifa =
        Number((prop as { propina?: number } | undefined)?.propina) ||
        Number((a as { propina?: number }).propina) ||
        0;
      const mens1 = Number((a as { mensalidade1?: number }).mensalidade1) || 0;
      const mesesP = Math.max(0, Math.min(9, Number((a as { mesesPropina?: number }).mesesPropina) || 0));
      const pags = (prop as { pagamentos?: Record<string, number> } | undefined)?.pagamentos || {};
      const pagsEm =
        (prop as { pagamentosEm?: Record<string, string> } | undefined)?.pagamentosEm || {};
      const ordemMes = ["out", "nov", "dez", "jan", "fev", "mar", "abr", "mai", "jun"];
      const taxas =
        (Number((a as { inscricao?: number }).inscricao) || 0) +
        (Number((a as { seguro?: number }).seguro) || 0) +
        (Number((a as { manuais?: number }).manuais) || 0) +
        (Number((a as { uniforme?: number }).uniforme) || 0) +
        (Number((a as { extras?: number }).extras) || 0);
      const liquido = Number((a as { liquido?: number }).liquido) || 0;
      const liquidoIncluiPropina = liquido > 0 && liquido > taxas + Math.max(tarifa, mens1, 1) * 0.5;

      for (let i = 0; i < ordemMes.length; i++) {
        const k = ordemMes[i];
        const pagoRaw = Number(pags[k] || 0);
        const mesIso = MES_LABEL[k] || k;
        let valor = 0;
        if (mens1 > 0 && mesesP > 0 && i < mesesP) {
          valor = pagoRaw > 0 ? pagoRaw : tarifa || Math.round(mens1 / mesesP) || mens1;
        } else if (mens1 > 0 && mesesP === 0 && i === 0) {
          valor = pagoRaw > 0 ? pagoRaw : tarifa || mens1;
        } else if (pagoRaw > 0 && (mens1 > 0 || liquidoIncluiPropina)) {
          valor = pagoRaw;
        }
        if (valor > 0) {
          pagamentosDetalhe.push({ mes: mesIso, valor, data: pagsEm[k] || "" });
        }
      }
      // Sincronizar mesesPago com propinas reais
      const mesesPagoReal = pagamentosDetalhe.map((p) => p.mes);
      if (mesesPagoReal.length) {
        mesesPago.length = 0;
        mesesPago.push(...mesesPagoReal);
      } else {
        mesesPago.length = 0;
      }
      const totalPago = pagamentosDetalhe.reduce((s, p) => s + p.valor, 0);

      byId.set(a.id, {
        alunoId: a.id,
        nome: a.nome || a.id,
        turma: (a as { turma?: string }).turma || (a as { classe?: string }).classe,
        saldo,
        creditos,
        aplicacoes,
        mesesPago,
        nMesesPago: mesesPago.length,
        detalheCreditos,
        temExcedente,
        totalExcedente,
        temAdiantado: mesesPago.length > 1,
        tarifa,
        pagamentosDetalhe,
        totalPago,
      });
    }

    for (const m of contaCorrente) {
      if (byId.has(m.alunoId)) continue;
      const saldo = saldoCreditoDe(contaCorrente, m.alunoId);
      const cred = m.tipo === "credito" ? Number(m.valor) || 0 : 0;
      const det =
        m.tipo === "credito"
          ? [{ mes: m.mes, valor: cred, descricao: m.descricao, data: m.data }]
          : [];
      byId.set(m.alunoId, {
        alunoId: m.alunoId,
        nome: m.nome || m.alunoId,
        saldo,
        creditos: cred,
        aplicacoes: 0,
        mesesPago: [],
        nMesesPago: 0,
        detalheCreditos: det,
        temExcedente: cred > 0 && /excedente/i.test(m.descricao || ""),
        totalExcedente: /excedente/i.test(m.descricao || "") ? cred : 0,
        temAdiantado: false,
        tarifa: 0,
        pagamentosDetalhe: [],
        totalPago: 0,
      });
    }

    let list = [...byId.values()];
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter(
        (r) =>
          r.nome.toLowerCase().includes(qq) ||
          r.alunoId.toLowerCase().includes(qq) ||
          (r.turma || "").toLowerCase().includes(qq),
      );
    }
    if (soComCredito) list = list.filter((r) => r.saldo > 0);
    if (soComExcedente) list = list.filter((r) => r.temExcedente);
    if (soComAdiantado) list = list.filter((r) => r.temAdiantado);

    list.sort((a, b) => {
      const ca = a.saldo > 0 ? 0 : 1;
      const cb = b.saldo > 0 ? 0 : 1;
      if (ca !== cb) return ca - cb;
      if (a.saldo !== b.saldo) return b.saldo - a.saldo;
      const ea = a.temExcedente ? 0 : 1;
      const eb = b.temExcedente ? 0 : 1;
      if (ea !== eb) return ea - eb;
      const aa = a.temAdiantado ? 0 : 1;
      const ab = b.temAdiantado ? 0 : 1;
      if (aa !== ab) return aa - ab;
      return a.nome.localeCompare(b.nome, "pt");
    });
    return list;
  }, [alunos, contaCorrente, mensalidades, q, soComCredito, soComExcedente, soComAdiantado]);

  const totalCredito = rows.reduce((s, r) => s + Math.max(0, r.saldo), 0);
  const comCredito = rows.filter((r) => r.saldo > 0).length;
  const comExcedente = rows.filter((r) => r.temExcedente).length;
  const multiMes = rows.filter((r) => r.nMesesPago > 1).length;

  function emitirPdf(row: RowCC) {
    openPrintHtml(folhaCreditoHtml(escola, row));
    toast.success(`Folha de conta corrente · ${row.nome}`);
  }

  function emitirListaPdf() {
    const alvo = soComExcedente || soComCredito ? rows : rows.filter((r) => r.temExcedente || r.saldo > 0);
    if (!alvo.length) {
      toast.error("Nenhum aluno com crédito/excedente para imprimir.");
      return;
    }
    const blocos = alvo.map((r) => {
      const inner = folhaCreditoHtml(escola, r);
      const body = inner.split("<body>")[1]?.split("</body>")[0] || inner;
      return `<div class="folha">${body}</div>`;
    });
    const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title>Conta corrente</title>
<style>
@page { size: A4; margin: 12mm; }
.folha { page-break-after: always; }
.folha:last-child { page-break-after: auto; }
</style></head><body>${blocos.join("\n")}</body></html>`;
    openPrintHtml(html);
    toast.success(`${alvo.length} folha(s) de conta corrente`);
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Conta Corrente</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Créditos de propina (excedente) e aplicações a meses seguintes.{" "}
            <Link to="/mensalidades" className="underline">
              Propinas
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-md border px-2 py-1">
            Com crédito: <b className="text-emerald-700">{comCredito}</b>
          </span>
          <span className="rounded-md border px-2 py-1">
            Total a receber: <b className="text-emerald-700">{formatKz(totalCredito)}</b>
          </span>
          <span className="rounded-md border px-2 py-1">
            &gt;1 mensalidade: <b>{multiMes}</b>
          </span>
          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-900">
            Com excedente: <b>{comExcedente}</b>
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            onClick={emitirListaPdf}
            title="Imprimir / PDF das folhas de conta corrente"
          >
            <Printer className="h-4 w-4" />
            PDF lista
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-[220px] flex-1 rounded-md border bg-transparent px-3 py-2 text-sm"
          placeholder="Pesquisar aluno, ID, turma…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={soComCredito}
            onChange={(e) => setSoComCredito(e.target.checked)}
          />
          Só com saldo a receber
        </label>
        <label
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            soComExcedente ? "border-emerald-600 bg-emerald-50 text-emerald-900" : ""
          }`}
        >
          <input
            type="checkbox"
            checked={soComExcedente}
            onChange={(e) => setSoComExcedente(e.target.checked)}
          />
          Só com excedente de propina
        </label>
        <label
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            soComAdiantado ? "border-amber-600 bg-amber-50 text-amber-950" : ""
          }`}
        >
          <input
            type="checkbox"
            checked={soComAdiantado}
            onChange={(e) => setSoComAdiantado(e.target.checked)}
          />
          Só com meses adiantados
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b bg-[var(--color-muted)]/10 text-xs uppercase tracking-wide text-[var(--color-muted)]">
            <tr>
              <th className="px-3 py-2">Aluno</th>
              <th className="px-3 py-2">Turma</th>
              <th className="px-3 py-2 text-right">Saldo</th>
              <th className="px-3 py-2">Mensalidades pagas</th>
              <th className="px-3 py-2">Detalhe crédito</th>
              <th className="px-3 py-2 text-right">PDF</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[var(--color-muted)]">
                  Sem registos de conta corrente.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const verde = r.saldo > 0;
                const multi = r.nMesesPago > 1;
                const exc = r.temExcedente;
                return (
                  <tr
                    key={r.alunoId}
                    className={`border-b last:border-0 ${
                      verde
                        ? "bg-emerald-50/80 dark:bg-emerald-950/20"
                        : exc
                          ? "bg-sky-50/80 dark:bg-sky-950/20"
                          : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.nome}</div>
                      <div className="text-xs text-[var(--color-muted)]">{r.alunoId}</div>
                    </td>
                    <td className="px-3 py-2 text-[var(--color-muted)]">{r.turma || "—"}</td>
                    <td
                      className={`px-3 py-2 text-right font-semibold tabular-nums ${
                        verde ? "text-emerald-700" : r.saldo < 0 ? "text-red-600" : ""
                      }`}
                    >
                      {formatKz(r.saldo)}
                      {verde ? (
                        <div className="text-[10px] font-normal uppercase tracking-wide text-emerald-600">
                          A receber
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {r.nMesesPago === 0 ? (
                        <span className="text-[var(--color-muted)]">—</span>
                      ) : (
                        <div>
                          <span
                            className={
                              multi
                                ? "rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
                                : "text-xs"
                            }
                          >
                            {r.nMesesPago} mês(es)
                            {multi ? " · adiantado" : ""}
                            {exc ? " · excedente" : ""}
                          </span>
                          <div className="mt-0.5 text-xs text-[var(--color-muted)]">
                            {r.mesesPago.map(labelMes).join(", ")}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.detalheCreditos.length === 0 ? (
                        <span className="text-[var(--color-muted)]">—</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {r.detalheCreditos.map((d, i) => (
                            <li key={i}>
                              <span className="tabular-nums text-emerald-700">{formatKz(d.valor)}</span>
                              {d.mes ? ` · ${labelMes(d.mes)}` : ""}
                              {d.descricao ? (
                                <span className="text-[var(--color-muted)]"> — {d.descricao}</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted"
                          title="Imprimir / guardar PDF da conta corrente"
                          onClick={() => emitirPdf(r)}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          PDF
                        </button>
                        {verde && canEdit ? (
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs hover:bg-emerald-100"
                            title="Aplicar crédito ao mês de competência"
                            onClick={() => {
                              const mes =
                                (escola as { mesCompetencia?: string }).mesCompetencia ||
                                new Date().toISOString().slice(0, 7);
                              try {
                                const res = aplicarCreditoPropina(r.alunoId, mes);
                                if (res.ok) toast.success(res.message);
                                else toast.error(res.message || "Não foi possível aplicar.");
                              } catch (e) {
                                toast.error(
                                  e instanceof Error ? e.message : "Erro ao aplicar crédito",
                                );
                              }
                            }}
                          >
                            Aplicar
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--color-muted)]">
        <b>Excedente</b> = valor acima da tarifa (ex.: Hallan 5 000 Kz). <b>Adiantado</b> = mais do
        que 1 mensalidade paga à tarifa (irmãos Bunga, Janota, Mutapayi) — não é crédito a receber.
        PDF em cada linha. Saldo a receber em{" "}
        <span className="font-medium text-emerald-700">verde</span>.
      </p>
    </div>
  );
}
