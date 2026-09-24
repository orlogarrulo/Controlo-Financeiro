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
  const logo = escolaLogoSrc();
  const hoje = new Date().toLocaleDateString("pt-PT");
  const movRows = row.detalheCreditos
    .map(
      (d) =>
        `<tr>
      <td>${d.data || "—"}</td>
      <td>${d.mes ? labelMes(d.mes) : "—"}</td>
      <td>${(d.descricao || "Crédito / excedente de propina").replace(/</g, "")}</td>
      <td class="n">${formatKz(d.valor)}</td>
    </tr>`,
    )
    .join("");
  const meses =
    row.mesesPago.length > 0
      ? row.mesesPago.map(labelMes).join(", ")
      : "—";

  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/><title>Conta corrente — ${row.nome}</title>
<style>
@page { size: A4; margin: 14mm; }
body { font-family: Georgia, "Times New Roman", serif; font-size: 11pt; color: #0f172a; margin: 0; }
.rh { display:flex; gap:12px; align-items:center; border-bottom:2pt solid #009543; padding-bottom:8px; margin-bottom:12px; }
.rh img { width:48px; height:48px; object-fit:contain; }
.rh strong { font-size:13pt; }
.mu { color:#64748b; font-size:9pt; }
h1 { font-size:14pt; text-align:center; margin:8px 0 4px; color:#009543; letter-spacing:0.06em; text-transform:uppercase; }
.box { border:1px solid #cbd5e1; border-radius:6px; padding:10px 12px; margin:10px 0; }
.grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 16px; }
.saldo { font-size:16pt; font-weight:700; color:${row.saldo > 0 ? "#047857" : "#0f172a"}; }
table { width:100%; border-collapse:collapse; margin-top:10px; font-size:10pt; }
th, td { border-bottom:0.5pt solid #e2e8f0; padding:5px 4px; text-align:left; }
th { font-size:8pt; text-transform:uppercase; color:#64748b; }
.n { text-align:right; font-variant-numeric:tabular-nums; }
.sg { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-top:28px; text-align:center; font-size:9pt; }
.sg i { display:block; border-top:0.5pt solid #64748b; margin-top:36px; font-style:normal; }
.ft { margin-top:16px; font-size:8pt; color:#64748b; }
.via { text-align:center; font-size:9pt; font-weight:700; color:#009543; margin:4px 0 8px; }
</style></head><body>
<article>
  <header class="rh">
    <img src="${logo}" alt=""/>
    <div>
      <strong>${escola.nome || "École Consulaire du Congo"}</strong><br/>
      <span class="mu">${escola.subtitulo || "Luanda"} · ${escola.ano || "2026-2027"}</span>
    </div>
  </header>
  <h1>Conta corrente do aluno</h1>
  <p class="via">Excedente / crédito de propina · Documento para arquivo e encarregado</p>
  <div class="box">
    <div class="grid">
      <div><span class="mu">Aluno</span><br/><b>${row.nome}</b></div>
      <div><span class="mu">ID / Turma</span><br/><b>${row.alunoId}</b> · ${row.turma || "—"}</div>
      <div><span class="mu">Saldo actual</span><br/><span class="saldo">${formatKz(row.saldo)}</span></div>
      <div><span class="mu">Total créditos registados</span><br/><b>${formatKz(row.totalExcedente || row.creditos)}</b></div>
      <div><span class="mu">Mensalidades já liquidadas (ref.)</span><br/>${meses}</div>
      <div><span class="mu">Data do documento</span><br/>${hoje}</div>
    </div>
  </div>
  <p class="mu" style="margin:8px 0">
    O excedente corresponde a valores recebidos acima da tarifa mensal. Entram uma só vez no Banco BAI
    e ficam a crédito do aluno para aplicação em propinas futuras (sem segundo lançamento bancário).
  </p>
  <table>
    <thead>
      <tr><th>Data</th><th>Mês</th><th>Descrição</th><th class="n">Valor</th></tr>
    </thead>
    <tbody>
      ${movRows || `<tr><td colspan="4" class="mu">Sem movimentos de crédito registados.</td></tr>`}
    </tbody>
  </table>
  <div class="sg">
    <div><span>O encarregado</span><i></i></div>
    <div><span>Departamento de Finanças</span><i></i></div>
  </div>
  <p class="ft">Documento gerado pelo Departamento de Finanças · ${escola.nome || ""} · ${hoje}</p>
</article>
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
        temAdiantado,
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
