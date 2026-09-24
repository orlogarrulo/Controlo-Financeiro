import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useFinance, saldoCreditoDe, getSeed, alunosAll } from "@/lib/store";
import { formatKz } from "@/lib/format";
import { isCollaborator1 } from "@/lib/can-edit";

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
};

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
  const [q, setQ] = useState("");
  const [soComCredito, setSoComCredito] = useState(false);

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

      const prop = mensalidades.find((p) => p.alunoId === a.id || p.id === a.id);
      const mesesPago: string[] = [];
      if (prop) {
        for (const [k, v] of Object.entries(prop as Record<string, unknown>)) {
          if (!/^20\d{2}-\d{2}$/.test(k)) continue;
          const cell = v as { pago?: boolean; valorPago?: number } | number | boolean | undefined;
          if (cell && typeof cell === "object" && (cell.pago || (Number(cell.valorPago) || 0) > 0)) {
            mesesPago.push(k);
          } else if (typeof cell === "number" && cell > 0) {
            mesesPago.push(k);
          } else if (cell === true) {
            mesesPago.push(k);
          }
        }
      }
      // Meses referidos nos movimentos de crédito/aplicação
      for (const m of movs) {
        if (m.mes && !mesesPago.includes(m.mes)) {
          // não força como "pago", só detalhe
        }
      }
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
      });
    }

    // Alunos só na conta corrente (órfãos)
    for (const m of contaCorrente) {
      if (byId.has(m.alunoId)) continue;
      const saldo = saldoCreditoDe(contaCorrente, m.alunoId);
      byId.set(m.alunoId, {
        alunoId: m.alunoId,
        nome: m.nome || m.alunoId,
        saldo,
        creditos: m.tipo === "credito" ? Number(m.valor) || 0 : 0,
        aplicacoes: 0,
        mesesPago: [],
        nMesesPago: 0,
        detalheCreditos:
          m.tipo === "credito"
            ? [{ mes: m.mes, valor: Number(m.valor) || 0, descricao: m.descricao, data: m.data }]
            : [],
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

    // Créditos a receber (saldo > 0) primeiro; depois quem pagou >1 mensalidade; depois nome
    list.sort((a, b) => {
      const ca = a.saldo > 0 ? 0 : 1;
      const cb = b.saldo > 0 ? 0 : 1;
      if (ca !== cb) return ca - cb;
      if (a.saldo !== b.saldo) return b.saldo - a.saldo;
      if (a.nMesesPago !== b.nMesesPago) return b.nMesesPago - a.nMesesPago;
      return a.nome.localeCompare(b.nome, "pt");
    });
    return list;
  }, [alunos, contaCorrente, mensalidades, q, soComCredito]);

  const totalCredito = rows.reduce((s, r) => s + Math.max(0, r.saldo), 0);
  const comCredito = rows.filter((r) => r.saldo > 0).length;
  const multiMes = rows.filter((r) => r.nMesesPago > 1).length;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Conta Corrente</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Créditos de propina (pagamentos a mais) e aplicações a meses seguintes.{" "}
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
            &gt;1 mensalidade paga: <b>{multiMes}</b>
          </span>
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
              <th className="px-3 py-2"></th>
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
                return (
                  <tr
                    key={r.alunoId}
                    className={`border-b last:border-0 ${verde ? "bg-emerald-50/80 dark:bg-emerald-950/20" : ""}`}
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
                          </span>
                          <div className="mt-0.5 text-xs text-[var(--color-muted)]">
                            {r.mesesPago
                              .map((m) => {
                                const [y, mo] = m.split("-");
                                const nomes = [
                                  "",
                                  "Jan",
                                  "Fev",
                                  "Mar",
                                  "Abr",
                                  "Mai",
                                  "Jun",
                                  "Jul",
                                  "Ago",
                                  "Set",
                                  "Out",
                                  "Nov",
                                  "Dez",
                                ];
                                return `${nomes[Number(mo)] || mo}/${y?.slice(2)}`;
                              })
                              .join(", ")}
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
                              {d.mes ? ` · ${d.mes}` : ""}
                              {d.descricao ? (
                                <span className="text-[var(--color-muted)]"> — {d.descricao}</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {verde && canEdit ? (
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs hover:bg-emerald-100"
                          title="Aplicar crédito ao próximo mês em falta (Propinas)"
                          onClick={() => {
                            // tenta o mês corrente da seed / primeiro mês em aberto
                            const escola = getSeed().escola as { mesCompetencia?: string };
                            const mes =
                              escola.mesCompetencia ||
                              new Date().toISOString().slice(0, 7);
                            try {
                              const res = aplicarCreditoPropina(r.alunoId, mes);
                              if (res.ok) toast.success(res.message);
                              else toast.error(res.message || "Não foi possível aplicar.");
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Erro ao aplicar crédito");
                            }
                          }}
                        >
                          Aplicar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--color-muted)]">
        Saldo a receber em <span className="font-medium text-emerald-700">verde</span> e no topo da
        lista. Alunos com mais de uma mensalidade paga são marcados como{" "}
        <span className="rounded bg-amber-100 px-1 text-amber-900">adiantado</span> com os meses e
        montantes de crédito.
      </p>
    </div>
  );
}
