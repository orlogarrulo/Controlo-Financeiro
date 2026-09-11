import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { PageHeader } from "@/components/kpi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PrintActions } from "@/components/print-actions";
import { formatKz } from "@/lib/format";
import { isCollaborator1, VIEW_ONLY_MSG } from "@/lib/can-edit";
import { alunosAll, getSeed, useFinance } from "@/lib/store";
import {
  META_MATRICULADOS,
  downloadTextFile,
  linhasAlunos,
  linhasDivida,
  montarCenso,
  workbookRastreioXml,
  type CensoBackup,
} from "@/lib/rastreio";

export const Route = createFileRoute("/rastreio")({ component: Rastreio });

function Rastreio() {
  const printRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const escola = getSeed().escola;
  const alunosExtra = useFinance((s) => s.alunosExtra || []);
  const alunosOverrides = useFinance((s) => s.alunosOverrides || {});
  const alunosDeletedIds = useFinance((s) => s.alunosDeletedIds || []);
  const mensalidades = useFinance((s) => s.mensalidades || []);
  const importCensoAlunos = useFinance((s) => s.importCensoAlunos);
  const syncPropinasFromMatriculas = useFinance((s) => s.syncPropinasFromMatriculas);
  const activeOperator = useFinance((s) => s.activeOperator);
  const operators = useFinance((s) => s.operators);
  const canEdit = isCollaborator1(activeOperator, operators);
  const [tab, setTab] = useState<"campus" | "outros" | "divida">("campus");

  const alunos = useMemo(
    () => alunosAll(alunosExtra, alunosOverrides, alunosDeletedIds),
    [alunosExtra, alunosOverrides, alunosDeletedIds],
  );
  const linhas = useMemo(() => linhasAlunos(alunos), [alunos]);
  const campus = useMemo(() => linhas.filter((r) => r.origem === "campus_cidade"), [linhas]);
  const outros = useMemo(() => linhas.filter((r) => r.origem === "nova_vida"), [linhas]);
  const dividas = useMemo(() => linhasDivida(alunos, mensalidades), [alunos, mensalidades]);

  const totalCampus = campus.reduce((s, r) => s + r.mensalidade, 0);
  const totalOutros = outros.reduce((s, r) => s + r.mensalidade, 0);
  const totalDivida = dividas.reduce((s, r) => s + r.valorEmDivida, 0);
  const atrasoN = dividas.filter((d) => d.estado === "atraso").length;

  function exportarExcel() {
    const xml = workbookRastreioXml(campus, outros, dividas);
    downloadTextFile(
      `Rastreio_Mensalidades_${escola.ano.replace("/", "-")}.xls`,
      xml,
      "application/vnd.ms-excel",
    );
    toast.success("Folha Excel gerada (3 separadores).");
  }

  function exportarCenso() {
    const censo = montarCenso(alunos, mensalidades, escola.nome);
    downloadTextFile(
      `Censo_alunos_${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(censo, null, 2),
      "application/json",
    );
    toast.success("Censo JSON gravado — pode importar noutro PC para ficar com a mesma lista.");
  }

  function onImportFile(f: File | undefined) {
    if (!f) return;
    if (!canEdit) {
      toast.error(VIEW_ONLY_MSG);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result || "{}")) as CensoBackup | { alunos?: unknown };
        const lista = Array.isArray((raw as CensoBackup).alunos) ? (raw as CensoBackup).alunos : [];
        const mens = Array.isArray((raw as CensoBackup).mensalidades)
          ? (raw as CensoBackup).mensalidades
          : [];
        if (!lista.length) {
          toast.error("O ficheiro não tem alunos.");
          return;
        }
        const n = importCensoAlunos(lista, mens);
        syncPropinasFromMatriculas();
        toast.success(`${n} aluno(s) fundidos no cadastro. A sincronizar com a nuvem…`);
      } catch {
        toast.error("JSON inválido.");
      }
    };
    reader.readAsText(f);
  }

  const falta = Math.max(0, META_MATRICULADOS - alunos.length);

  return (
    <div>
      <PageHeader
        title="Rastreio de matrículas e propinas"
        description="Campus Cidade vs outros, totais do mês e mensalidades em dívida. O censo JSON leva a lista completa para qualquer PC."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={exportarExcel}>
              <Download className="size-4" />
              Excel (3 separadores)
            </Button>
            <Button type="button" variant="outline" onClick={exportarCenso}>
              <Download className="size-4" />
              Censo JSON
            </Button>
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" />
              Importar censo
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                onImportFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <PrintActions targetRef={printRef} filename="rastreio-mensalidades.pdf" />
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiMini
          label="Matriculados neste dispositivo"
          value={String(alunos.length)}
          hint={
            falta > 0
              ? `Meta ${META_MATRICULADOS} · faltam ${falta} (nuvem ou importar censo)`
              : `Meta ${META_MATRICULADOS} atingida`
          }
          warn={falta > 0}
        />
        <KpiMini
          label="Campus Cidade · mês"
          value={formatKz(totalCampus)}
          hint={`${campus.length} aluno(s) · 75.000 Kz de tarifário`}
        />
        <KpiMini
          label="Outros · mês"
          value={formatKz(totalOutros)}
          hint={`${outros.length} aluno(s) · tarifário Nova Vida`}
        />
        <KpiMini
          label="Propinas em dívida"
          value={formatKz(totalDivida)}
          hint={`${dividas.length} mês(es) · ${atrasoN} em atraso`}
          warn={totalDivida > 0}
        />
      </div>

      {falta > 0 && (
        <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Este PC só vê <strong>{alunos.length}</strong> matrículas. Os nomes em falta estão no
          computador da escola (nuvem Neon) ou num <strong>Censo JSON</strong> exportado de lá.
          Abra a app no PC que já tem os {META_MATRICULADOS}, clique «Censo JSON» e importe aqui —
          a nuvem passa a guardar a lista completa e deixa de ser apagada por engano.
        </p>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <TabBtn active={tab === "campus"} onClick={() => setTab("campus")}>
          Campus Cidade ({campus.length})
        </TabBtn>
        <TabBtn active={tab === "outros"} onClick={() => setTab("outros")}>
          Outros matriculados ({outros.length})
        </TabBtn>
        <TabBtn active={tab === "divida"} onClick={() => setTab("divida")}>
          Em dívida ({dividas.length})
        </TabBtn>
      </div>

      <div ref={printRef} className="space-y-4">
        <p className="text-xs text-[var(--color-muted)]">
          {escola.nome} · {escola.ano} · extraído neste dispositivo
        </p>

        {tab === "campus" && (
          <TabelaAlunos
            titulo="Alunos Campus Cidade"
            rows={campus}
            total={totalCampus}
            vazio="Nenhum aluno com a flag «Transferido Campus Cidade». Se existirem no PC da escola, importe o censo."
          />
        )}
        {tab === "outros" && (
          <TabelaAlunos
            titulo="Outros alunos matriculados (Nova Vida)"
            rows={outros}
            total={totalOutros}
            vazio="Sem alunos neste grupo."
          />
        )}
        {tab === "divida" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mensalidades em dívida / em prazo</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {dividas.length === 0 ? (
                <p className="text-sm text-[var(--color-muted)]">
                  Nenhuma propina vencida ou em prazo por pagar (meses futuros não contam como
                  dívida).
                </p>
              ) : (
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
                      <th className="py-2 pr-2">Aluno</th>
                      <th className="py-2 pr-2">Classe</th>
                      <th className="py-2 pr-2">Origem</th>
                      <th className="py-2 pr-2">Mês</th>
                      <th className="py-2 pr-2">Estado</th>
                      <th className="py-2 pr-2 text-right">Mensalidade</th>
                      <th className="py-2 text-right">Em dívida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dividas.map((r) => (
                      <tr key={`${r.id}-${r.mes}`} className="border-b border-[var(--color-line)]">
                        <td className="py-2 pr-2">
                          <div className="font-medium">{r.nome}</div>
                          <div className="text-[11px] text-[var(--color-muted)]">{r.id}</div>
                        </td>
                        <td className="py-2 pr-2">{r.turma}</td>
                        <td className="py-2 pr-2">{r.origemLabel}</td>
                        <td className="py-2 pr-2">{r.mesLabel}</td>
                        <td className="py-2 pr-2">
                          <Badge variant={r.estado === "atraso" ? "danger" : "outline"}>
                            {r.estadoLabel}
                          </Badge>
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums">{formatKz(r.mensalidade)}</td>
                        <td className="py-2 text-right tabular-nums font-medium">
                          {formatKz(r.valorEmDivida)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td className="py-3" colSpan={6}>
                        Total em dívida
                      </td>
                      <td className="py-3 text-right tabular-nums">{formatKz(totalDivida)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function KpiMini({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint: string;
  warn?: boolean;
}) {
  return (
    <Card className={warn ? "border-amber-300" : undefined}>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-[11px] text-[var(--color-muted)]">{hint}</p>
      </CardContent>
    </Card>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm ${
        active
          ? "bg-[var(--color-forest)] text-white"
          : "border border-[var(--color-line)] bg-[var(--color-surface)]"
      }`}
    >
      {children}
    </button>
  );
}

function TabelaAlunos({
  titulo,
  rows,
  total,
  vazio,
}: {
  titulo: string;
  rows: ReturnType<typeof linhasAlunos>;
  total: number;
  vazio: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">{vazio}</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
                <th className="py-2 pr-2">Nome</th>
                <th className="py-2 pr-2">Classe</th>
                <th className="py-2 pr-2">Ciclo</th>
                <th className="py-2 text-right">Mensalidade</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--color-line)]">
                  <td className="py-2 pr-2">
                    <div className="font-medium">{r.nome}</div>
                    <div className="text-[11px] text-[var(--color-muted)]">
                      {r.id}
                      {r.familia ? ` · ${r.familia}` : ""}
                    </div>
                  </td>
                  <td className="py-2 pr-2">{r.turma}</td>
                  <td className="py-2 pr-2">{r.grupo}</td>
                  <td className="py-2 text-right tabular-nums">{formatKz(r.mensalidade)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="py-3" colSpan={3}>
                  Total do mês · {rows.length} aluno(s)
                </td>
                <td className="py-3 text-right tabular-nums">{formatKz(total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
