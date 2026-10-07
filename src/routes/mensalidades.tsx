import { useEffect, useMemo, useRef, useState } from "react";
import { alunoMatchesQuery } from "@/lib/aluno-display";
import { NomeAluno } from "@/components/nome-aluno";
import { Save, Receipt, Wallet } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/kpi";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MESES_LABEL, MESES_PROPINA_ADIANTADOS } from "@/data/types";
const MESES_PROPINA = MESES_PROPINA_ADIANTADOS;
import {
  alunosAll,
  estadoPropinaMes,
  getSeed,
  useFinance,
  type EstadoPropinaMes,
} from "@/lib/store";
import { escolaLogoSrc } from "@/lib/logo-escola";
import { formatKz } from "@/lib/format";
import { tarifaPropinaAluno } from "@/lib/classe-congo";
import { fundirMensalidades, aplicarBolsaPropina, removerBolsaPropina } from "@/lib/propina-estado";
import {
  documentoReciboComCodigo,
  loadContacto,
} from "@/lib/documento-matricula";
import { htmlToPdfBlobDuasVias } from "@/lib/pdf-export";
import { PrintActions } from "@/components/print-actions";
import { isCollaborator1, VIEW_ONLY_MSG } from "@/lib/can-edit";

export const Route = createFileRoute("/mensalidades")({ component: Mensalidades });

function labelEstado(e: EstadoPropinaMes): {
  text: string;
  variant: "default" | "warn" | "danger" | "outline";
} {
  switch (e) {
    case "pago":
      return { text: "Pago", variant: "default" };
    case "pago_multa":
      return { text: "Pago c/ multa", variant: "warn" };
    case "em_prazo":
      return { text: "Em prazo", variant: "outline" };
    case "atraso":
      return { text: "Por pagar", variant: "danger" };
    default:
      return { text: "—", variant: "outline" };
  }
}

function Mensalidades() {
  const printRef = useRef<HTMLDivElement>(null);
  const escola = getSeed().escola;
  const rows = useFinance((s) => s.mensalidades);
  const alunosExtra = useFinance((s) => s.alunosExtra || []);
  const alunosOverrides = useFinance((s) => s.alunosOverrides || {});
  const alunosDeletedIds = useFinance((s) => s.alunosDeletedIds || []);
  const setMensalidade = useFinance((s) => s.setMensalidade);
  const confirmPropinaBai = useFinance((s) => s.confirmPropinaBai);
  const aplicarCreditoPropina = useFinance((s) => s.aplicarCreditoPropina);
  const addDocumentoAluno = useFinance((s) => s.addDocumentoAluno);
  const addCodigoRecibo = useFinance((s) => s.addCodigoRecibo);
  const documentosAluno = useFinance((s) => s.documentosAluno || []);
  const contaCorrente = useFinance((s) => s.contaCorrente || []);
  const syncPropinasFromMatriculas = useFinance((s) => s.syncPropinasFromMatriculas);
  const syncPropinasFromRecibos = useFinance((s) => s.syncPropinasFromRecibos);
  const syncArquivoFromPropinasPagas = useFinance((s) => s.syncArquivoFromPropinasPagas);
  const reporPropinasFromMatriculas = useFinance((s) => s.reporPropinasFromMatriculas);
  const movimentosBaiExtra = useFinance((s) => s.movimentosBaiExtra || []);
  const activeOperator = useFinance((s) => s.activeOperator);
  const operators = useFinance((s) => s.operators);
  const canEdit = isCollaborator1(activeOperator, operators);

  const [q, setQ] = useState("");

  function aplicarBolsa(id: string) {
    if (!canEdit) {
      toast.error(VIEW_ONLY_MSG);
      return;
    }
    const r = aplicarBolsaPropina(id);
    if (r.ok) toast.success(r.message);
    else toast.error(r.message);
  }

  function tirarBolsa(id: string) {
    if (!canEdit) {
      toast.error(VIEW_ONLY_MSG);
      return;
    }
    const r = removerBolsaPropina(id);
    if (r.ok) toast.success(r.message);
    else toast.error(r.message);
  }



  // Backfill + limpar órfãos/duplicados (Propinas = Matrículas)
  useEffect(() => {
    try {
      syncPropinasFromMatriculas();
      const r = reporPropinasFromMatriculas();
      if (r.removidos > 0) {
        toast.message(
          `Propinas alinhadas a Matrículas: ${r.alunos} aluno(s), ${r.removidos} linha(s) a mais removida(s).`,
        );
      }
    } catch {
      /* ignore */
    }
  }, [syncPropinasFromMatriculas, reporPropinasFromMatriculas]);

  const alunoMetaById = useMemo(() => {
    const map = new Map<
      string,
      {
        familia?: string;
        transferidoCampusCidade?: boolean;
        nome?: string;
        irmaosNivel?: 0 | 2 | 3;
        campanhaPromoSetembro?: boolean;
        descPct?: number;
        obs?: string;
        propina?: number;
        mensalidade1?: number;
        mesesPropina?: number;
      }
    >();
    for (const a of alunosAll(alunosExtra, alunosOverrides, alunosDeletedIds)) {
      map.set(a.id, {
        familia: a.familia,
        transferidoCampusCidade: a.transferidoCampusCidade,
        nome: a.nome,
        irmaosNivel: a.irmaosNivel,
        campanhaPromoSetembro: a.campanhaPromoSetembro,
        descPct: a.descPct,
        obs: a.obs,
        propina: a.propina,
        mensalidade1: a.mensalidade1,
        mesesPropina: a.mesesPropina,
        bolsa: a.bolsa,
        bolsaMeses: a.bolsaMeses,
      });
    }
    return map;
  }, [alunosExtra, alunosOverrides, alunosDeletedIds]);

  const filtered = useMemo(() => {
    const activos = fundirMensalidades(rows).filter((r) => alunoMetaById.has(r.id));
    const seen = new Set<string>();
    const unique = activos.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
    const needle = q.trim().toLowerCase();
    if (!needle) return unique;
    return unique.filter((r) => {
      const meta = alunoMetaById.get(r.id);
      return alunoMatchesQuery(
        {
          nome: r.nome || meta?.nome,
          id: r.id,
          turma: r.turma,
          familia: meta?.familia,
          obs: r.obs,
          transferidoCampusCidade: meta?.transferidoCampusCidade,
        },
        needle,
      );
    });
  }, [rows, q, alunoMetaById]);

  const monthTotals = MESES_PROPINA.map((m) =>
    filtered.reduce((s, r) => s + (r.pagamentos[m] || 0), 0),
  );
  const grand = monthTotals.reduce((s, n) => s + n, 0);

  function jaNoBai(id: string, mes: string) {
    const movId = `APP-PROP-${id}-${mes}`;
    return movimentosBaiExtra.some((m) => m.id === movId);
  }

  function creditoDe(id: string) {
    return useFinance.getState().saldoCreditoAluno(id);
  }

  function aplicarCredito(id: string, mes: string) {
    if (!canEdit) {
      toast.error(VIEW_ONLY_MSG);
      return;
    }
    try {
      const r = aplicarCreditoPropina(id, mes);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao aplicar crédito");
    }
  }

  function salvarBai(id: string, mes: string) {
    if (!canEdit) {
      toast.error(VIEW_ONLY_MSG);
      return;
    }
    try {
      const r = confirmPropinaBai(id, mes);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao sincronizar com o BAI");
    }
  }

  /** Recibo PDF da propina de um mês (só se valor > 0).
   * Também regista no Arquivo e garante que o mês fica como pago em Propinas. */
  async function abrirReciboPropina(id: string, mes: string, valor: number) {
    if (!(valor > 0)) {
      toast.message("Introduza e confirme o valor do mês (BAI) antes de emitir o recibo.");
      return;
    }
    // Garantir que o valor está gravado em pagamentos (pode ter sido só digitado)
    const rowNow = rows.find((r) => r.id === id);
    const jaPago = Number(rowNow?.pagamentos?.[mes] || 0);
    if (jaPago !== valor) {
      setMensalidade(id, mes, valor);
    }
    const meta = alunoMetaById.get(id);
    const row = rows.find((r) => r.id === id);
    const alunoBase = {
      id,
      nome: row?.nome || meta?.nome || id,
      turma: row?.turma || meta?.turma || "",
      propina: row?.propina || 0,
      liquido: valor,
      recibo: "",
      statusPag: "pago" as const,
    };
    const all = alunosAll(alunosExtra, alunosOverrides, alunosDeletedIds);
    const aluno = all.find((a) => a.id === id) || (alunoBase as import("@/data/types").Aluno);
    const mesLabel =
      (MESES_LABEL as Record<string, string>)[mes] || mes;
    const mesKey = (() => {
      const map: Record<string, string> = {
        set: "2026-09", out: "2026-10", nov: "2026-11", dez: "2026-12",
        jan: "2027-01", fev: "2027-02", mar: "2027-03", abr: "2027-04",
        mai: "2027-05", jun: "2027-06",
      };
      return map[mes] || `2026-${mes}`;
    })();
    const numeroRecibo = `REC-PROP-${id}-${mes.toUpperCase()}`;
    try {
      const doc = documentoReciboComCodigo(aluno, {
        modo: "recibo",
        ambito: "mensalidade",
        mesLetivo: mes,
        mesRef: mesLabel,
        mesKey,
        numero: numeroRecibo,
        pagoMes: valor,
        contacto: loadContacto(),
      });
      // Registar no Arquivo (evita recibo “só PDF” sem histórico)
      const jaNoArquivo = (documentosAluno as { numero?: string; alunoId?: string; mesKey?: string; linhas?: { key?: string; label?: string; on?: boolean }[] }[]).some(
        (d) => {
          const mesmaPropina =
            d.numero === numeroRecibo ||
            (d.alunoId === id && d.mesKey === mesKey && /propina|PROP/i.test(String(d.numero || "")));
          if (!mesmaPropina) return false;
          const linhas = d.linhas || [];
          if (!linhas.length) return true;
          return linhas.some(
            (l) =>
              l.on !== false &&
              /propina/i.test(String(l.key || "") + " " + String(l.label || "")),
          );
        },
      );
      if (jaNoArquivo) {
        toast.warning(
          `Esta rubrica já foi emitida uma vez (1.ª via) · Propina ${mesLabel} · ${numeroRecibo}. Esta emissão será uma nova via.`,
        );
      }
      if (!jaNoArquivo && addDocumentoAluno) {
        const codigo = doc.codigoVerificacao || "";
        if (codigo && addCodigoRecibo) {
          addCodigoRecibo({
            alunoId: id,
            alunoNome: aluno.nome,
            mesKey,
            valor,
            rubricas: `Propina ${mesLabel}`,
            codigo,
          });
        }
        addDocumentoAluno({
          tipo: "recibo",
          modelo: "propina_mes",
          numero: numeroRecibo,
          alunoId: id,
          alunoNome: aluno.nome,
          mesKey,
          mesRef: mesLabel,
          valor,
          linhas: [{ key: "propina", label: `Propina ${mesLabel}`, value: valor, on: true }],
          estado: "emitido",
          codigoVerificacao: codigo || undefined,
          pagoEm: new Date().toISOString().slice(0, 10),
          criadoPor: activeOperator,
        });
      }
      const { blob } = await htmlToPdfBlobDuasVias(doc.html, {
        filename: `Recibo-Propina-${id}-${mes}.pdf`,
      });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast.success(
        `Recibo de propina (${mesLabel}) · ${formatKz(valor)} · ${doc.codigoVerificacao} · Propinas actualizado`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar recibo");
    }
  }

  return (
    <div>
      <div className="mb-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
        <strong>Bolsa escolar:</strong> botão <em>Bolsa Out→Jun</em> em cada aluno marca propinas isentas até junho
        (Relatórios/Conta corrente = pago, valor 0). Só Colaborador 1.
      </div>
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  title="Cria no Arquivo os recibos em falta para meses já pagos (ex.: Pedro Out/Nov no BAI)"
                  onClick={() => {
                    try {
                      const n = syncArquivoFromPropinasPagas?.() ?? 0;
                      toast.success(
                        n > 0
                          ? `${n} recibo(s) de propina criados no Arquivo.`
                          : "Arquivo já tinha recibos para todos os meses pagos.",
                      );
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Falha ao criar recibos");
                    }
                  }}
                >
                  <Receipt className="mr-1 size-3.5" />
                  Propinas pagas → Arquivo
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title="Marca em Propinas os meses que já têm recibo/fatura de propina no Arquivo"
                  onClick={() => {
                    try {
                      const n = syncPropinasFromRecibos?.() ?? 0;
                      toast.success(
                        n > 0
                          ? `${n} recibo(s)/fatura(s) de propina aplicados ao quadro de Propinas.`
                          : "Nenhum recibo de propina pendente de sincronizar.",
                      );
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Falha ao sincronizar");
                    }
                  }}
                >
                  <Receipt className="mr-1 size-3.5" />
                  Sincronizar recibos → Propinas
                </Button>
              </>
            ) : null}
            <PrintActions
              targetRef={printRef}
              filename="propinas.pdf"
              landscape
              shareTitle="Propinas · École Consulaire"
              shareText="Documento gerado pelo Departamento de Finanças."
            />
          </div>
        }
        kicker="Outubro a Junho"
        title="Mensalidades"
        description={`Mesma lista de Matrículas · ${all.length} aluno(s). 1.ª propina: Outubro (até 20 de setembro). Meses seguintes: do dia 30 até ao dia 10. No telemóvel, deslize a grelha.`}
      />

      <div className="no-print mb-3">
        <Input
          placeholder="Nome, família, ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Pesquisar aluno por nome, família ou ID"
        />
      </div>

      <p className="mb-3 text-sm text-[var(--color-muted)]">
        {filtered.length}
        {q.trim() ? ` de ${rows.length}` : ""} aluno(s) · Total recebido (lista): {formatKz(grand)}.{" "}
        {canEdit
          ? "Introduza o valor e clique em «BAI» para confirmar. Estados: Pago · Pago c/ multa · Em prazo · Pendente · multa."
          : "Modo consulta — só visualizar e imprimir. Edição reservada ao Colaborador 1."}{" "}
        <Link to="/conta-corrente" className="underline">
          Conta corrente
        </Link>
      </p>
      <div ref={printRef}>
        <header className="print-only mb-4 hidden items-center gap-3 border-b border-[var(--color-line-strong)] pb-3 print:flex">
          <img
            src={escolaLogoSrc()}
            alt=""
            className="h-16 w-16 object-contain"
            width={64}
            height={64}
          />
          <div>
            <p className="text-[10px] font-medium tracking-[0.14em] text-[var(--color-forest)] uppercase">
              {escola.nomeCurto}
            </p>
            <p className="font-display text-lg leading-tight">Propinas · mensalidades</p>
            <p className="text-[11px] text-[var(--color-muted)]">
              {new Date().toLocaleDateString("pt-PT")} · {escola.ano} · Departamento de Finanças
            </p>
          </div>
        </header>
        <div className="overflow-x-auto print-sheet rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
          <table className="propinas-table w-full min-w-[1080px] text-left text-sm">
            <thead className="bg-[var(--color-bg)] text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
              <tr>
                <th className="col-aluno px-3 py-2 font-medium">Aluno</th>
                <th className="col-propina px-3 py-2 font-medium">Propina</th>
                {MESES_PROPINA.map((m) => (
                  <th key={m} className="col-mes px-2 py-2 text-center font-medium">
                    {MESES_LABEL[m]}
                  </th>
                ))}
                <th className="col-estado px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={2 + MESES_PROPINA.length + 1}
                    className="px-3 py-8 text-center text-[var(--color-muted)]"
                  >
                    {q.trim()
                      ? "Nenhum aluno corresponde à pesquisa."
                      : "Sem registos de propinas."}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const cred = creditoDe(r.id);
                  const paid = MESES_PROPINA.reduce((s, m) => s + (r.pagamentos[m] || 0), 0);
                  const isBolsaRow = !!(r as { bolsa?: boolean }).bolsa || !!alunoMetaById.get(r.id)?.bolsa;
                  const monthsPaid = isBolsaRow
                    ? MESES_PROPINA.length
                    : MESES_PROPINA.filter((m) => (r.pagamentos[m] || 0) > 0).length;
                  const emAtraso = MESES_PROPINA.filter((m) => {
                    const v = r.pagamentos[m] || 0;
                    return estadoPropinaMes(m, v, r.pagamentosEm?.[m], undefined, !!(r as { bolsa?: boolean }).bolsa || !!alunoMetaById.get(r.id)?.bolsa) === "atraso";
                  }).length;
                  const status =
                    monthsPaid === 0 && emAtraso === 0
                      ? "Em prazo"
                      : emAtraso > 0 && monthsPaid < 10
                        ? "Com atrasos"
                        : monthsPaid >= 10
                          ? "Pago"
                          : "Parcial";
                  return (
                    <tr key={r.id} className="border-t border-[var(--color-line)]">
                      <td className="col-aluno px-3 py-2">
                        <p className="font-medium leading-snug">
                          <NomeAluno
                            aluno={{
                              nome: r.nome,
                              transferidoCampusCidade: alunoMetaById.get(r.id)?.transferidoCampusCidade,
                            }}
                          />
                        </p>
                        <p className="text-xs text-[var(--color-muted)]">
                          {r.id} · {r.turma}
                          {alunoMetaById.get(r.id)?.familia ? ` · ${alunoMetaById.get(r.id)?.familia}` : ""}
                          {cred > 0 ? ` · crédito ${formatKz(cred)}` : ""}
                        </p>
                        <div className="no-print mt-1 flex flex-wrap items-center gap-1">
                          {(!!(r as { bolsa?: boolean }).bolsa || !!alunoMetaById.get(r.id)?.bolsa) ? (
                            <Badge variant="default" className="text-[10px]">Bolsa</Badge>
                          ) : null}
                          {canEdit ? (
                            (!!(r as { bolsa?: boolean }).bolsa || !!alunoMetaById.get(r.id)?.bolsa) ? (
                              <button
                                type="button"
                                className="rounded border px-1.5 py-0.5 text-[10px]"
                                onClick={() => tirarBolsa(r.id)}
                              >
                                Remover bolsa
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="rounded border border-emerald-600 px-1.5 py-0.5 text-[10px] text-emerald-800"
                                onClick={() => aplicarBolsa(r.id)}
                                title="Marcar propinas Outubro→Junho como pagas (isento / bolsa)"
                              >
                                Bolsa Out→Jun
                              </button>
                            )
                          ) : null}
                        </div>
                      </td>
                      <td className="col-propina px-3 py-2 tabular-nums text-xs whitespace-nowrap">
                        {formatKz(
                          tarifaPropinaAluno({
                            propina: alunoMetaById.get(r.id)?.propina ?? r.propina,
                            turma: r.turma,
                            transferidoCampusCidade: alunoMetaById.get(r.id)?.transferidoCampusCidade,
                            irmaosNivel: alunoMetaById.get(r.id)?.irmaosNivel,
                            campanhaPromoSetembro: alunoMetaById.get(r.id)?.campanhaPromoSetembro,
                            descPct: alunoMetaById.get(r.id)?.descPct,
                            obs: alunoMetaById.get(r.id)?.obs,
                            mensalidade1: alunoMetaById.get(r.id)?.mensalidade1,
                            mesesPropina: alunoMetaById.get(r.id)?.mesesPropina,
                          }),
                        )}
                      </td>
                      {MESES_PROPINA.map((m) => {
                        const val = r.pagamentos[m] || 0;
                        const dataPag = r.pagamentosEm?.[m];
                        const synced = jaNoBai(r.id, m);
                        const isBolsaMes = !!(r as { bolsa?: boolean }).bolsa || !!alunoMetaById.get(r.id)?.bolsa;
                        const est = estadoPropinaMes(
                          m,
                          val,
                          dataPag || (synced ? new Date().toISOString().slice(0, 10) : undefined),
                          undefined,
                          isBolsaMes,
                        );
                        const lab = labelEstado(est);
                        return (
                          <td key={m} className="propina-cell col-mes px-1 py-1 align-top">
                            <div className="no-print flex flex-col items-stretch gap-0.5">
                              <Input
                                className="propina-input h-9 w-full min-w-[5.5rem] bg-white px-2 text-right text-xs"
                                type="number"
                                inputMode="decimal"
                                min={0}
                                disabled={!canEdit}
                                value={val || ""}
                                title={canEdit ? "Escreva o valor da propina deste mês" : "Edição reservada ao Colaborador 1"}
                                onChange={(e) =>
                                  setMensalidade(r.id, m, Number(e.target.value) || 0)
                                }
                              />
                              <span
                                className={
                                  "text-center text-[9px] font-medium leading-tight " +
                                  (est === "pago"
                                    ? "text-[var(--color-forest)]"
                                    : est === "pago_multa" || est === "em_prazo"
                                      ? "text-[var(--color-amber)]"
                                      : est === "atraso"
                                        ? "text-[var(--color-clay)]"
                                        : "text-[var(--color-muted)]")
                                }
                                title={lab.text}
                              >
                                {lab.text}
                              </span>
                              {val > 0 ? (
                                <div className="flex flex-wrap gap-0.5 justify-center">
                                  {canEdit ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={synced ? "secondary" : "default"}
                                      className="h-7 px-1 text-[10px]"
                                      title={
                                        synced
                                          ? "Já no BAI — clicar para actualizar"
                                          : "Salvar / sincronizar no Banco BAI"
                                      }
                                      onClick={() => salvarBai(r.id, m)}
                                    >
                                      <Save className="mr-0.5 size-3" />
                                      {synced ? "BAI ✓" : "BAI"}
                                    </Button>
                                  ) : null}
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-1 text-[10px]"
                                    title="Emitir / ver recibo desta propina"
                                    onClick={() => void abrirReciboPropina(r.id, m, val)}
                                  >
                                    <Receipt className="mr-0.5 size-3" />
                                    Recibo
                                  </Button>
                                </div>
                              ) : cred > 0 && canEdit && val < r.propina ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  className="h-7 px-1 text-[10px]"
                                  title="Aplicar crédito deste aluno a este mês (sem BAI)"
                                  onClick={() => aplicarCredito(r.id, m)}
                                >
                                  <Wallet className="mr-0.5 size-3" />
                                  Crédito
                                </Button>
                              ) : null}
                            </div>
                            <span className="hidden print:inline text-xs tabular-nums">
                              {val ? formatKz(val) : lab.text}
                            </span>
                          </td>
                        );
                      })}
                      <td className="col-estado px-3 py-2">
                        <Badge
                          variant={
                            status === "Pago"
                              ? "default"
                              : status === "Com atrasos"
                                ? "danger"
                                : status === "Parcial"
                                  ? "warn"
                                  : "outline"
                          }
                        >
                          {status}
                        </Badge>
                        <p className="mt-1 text-[11px] tabular-nums text-[var(--color-muted)]">
                          {formatKz(paid)}
                        </p>
                      </td>
                    </tr>
                  );
                })
              )}
              <tr className="border-t border-[var(--color-line-strong)] bg-[var(--color-bg)] font-medium">
                <td className="px-3 py-2" colSpan={2}>
                  Totais{q.trim() ? " (filtro)" : ""}
                </td>
                {monthTotals.map((n, i) => (
                  <td key={i} className="px-2 py-2 text-center text-xs tabular-nums">
                    {n ? formatKz(n) : "—"}
                  </td>
                ))}
                <td className="px-3 py-2 tabular-nums">{formatKz(grand)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
