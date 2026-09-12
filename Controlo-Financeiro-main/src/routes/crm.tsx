import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Mail,
  MessageCircle,
  CheckCircle2,
  XCircle,
  Users,
  Send,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Kpi } from "@/components/kpi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  alunosAll,
  getSeed,
  useFinance,
} from "@/lib/store";
import { formatKz, formatDate } from "@/lib/format";
import type { Aluno, CrmEnvio, FaturaPropina } from "@/data/types";

export const Route = createFileRoute("/crm")({
  component: CrmPage,
});

function mesKeyAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function mesLabel(key: string): string {
  const [y, m] = key.split("-");
  const nomes = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const idx = Number(m) - 1;
  return `${nomes[idx] || m} de ${y}`;
}

/** Normaliza telefone angolano para wa.me (244XXXXXXXXX). */
function phoneToWa(raw?: string): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00244")) d = d.slice(5);
  if (d.startsWith("244")) d = d.slice(3);
  if (d.length === 9 && /^9/.test(d)) return `244${d}`;
  if (d.length === 12 && d.startsWith("244")) return d;
  return null;
}

function buildMensagemFatura(opts: {
  alunoNome: string;
  mesRef: string;
  valor?: number;
  escolaNome: string;
  faturaNumero?: string;
}): string {
  const valorTxt = opts.valor ? formatKz(opts.valor) : "conforme tarifário";
  const fat = opts.faturaNumero ? `\nFatura: ${opts.faturaNumero}` : "";
  return (
    `Olá,\n\n` +
    `Segue a referência da propina de *${opts.mesRef}* referente a *${opts.alunoNome}*.\n` +
    `Valor: *${valorTxt}*${fat}\n\n` +
    `${opts.escolaNome}\n` +
    `Por favor confirme o pagamento ou contacte a secretaria.`
  );
}

type Row = {
  aluno: Aluno;
  fatura?: FaturaPropina;
  envios: CrmEnvio[];
  ultimo?: CrmEnvio;
  confirmado: boolean;
  enviado: boolean;
};

function CrmPage() {
  const escola = getSeed().escola;
  const extraA = useFinance((s) => s.alunosExtra);
  const overrides = useFinance((s) => s.alunosOverrides);
  const deleted = useFinance((s) => s.alunosDeletedIds);
  const faturas = useFinance((s) => s.faturasPropina) || [];
  const mensalidades = useFinance((s) => s.mensalidades) || [];
  const crmEnvios = useFinance((s) => s.crmEnvios) || [];
  const addCrmEnvio = useFinance((s) => s.addCrmEnvio);
  const updateCrmEnvio = useFinance((s) => s.updateCrmEnvio);
  const active = useFinance((s) => s.activeOperator);

  const alunos = useMemo(
    () => alunosAll(extraA, overrides, deleted || []),
    [extraA, overrides, deleted],
  );

  const [mesKey, setMesKey] = useState(mesKeyAtual);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState<"todos" | "enviados" | "por_enviar">("todos");

  const rows: Row[] = useMemo(() => {
    const fatByAluno = new Map<string, FaturaPropina>();
    for (const f of faturas as FaturaPropina[]) {
      if (f.mesKey === mesKey) fatByAluno.set(f.alunoId, f);
    }
    const enviosMes = (crmEnvios as CrmEnvio[]).filter((e) => e.mesKey === mesKey);
    const enviosByAluno = new Map<string, CrmEnvio[]>();
    for (const e of enviosMes) {
      const list = enviosByAluno.get(e.alunoId) || [];
      list.push(e);
      enviosByAluno.set(e.alunoId, list);
    }

    const list: Row[] = [];
    for (const a of alunos) {
      const envios = enviosByAluno.get(a.id) || [];
      envios.sort((x, y) => (y.enviadoEm || "").localeCompare(x.enviadoEm || ""));
      const ultimo = envios[0];
      const fatura = fatByAluno.get(a.id);
      // Valor da propina: fatura > mensalidade
      list.push({
        aluno: a,
        fatura,
        envios,
        ultimo,
        enviado: envios.length > 0,
        confirmado: envios.some((e) => e.confirmado),
      });
    }
    return list;
  }, [alunos, faturas, crmEnvios, mesKey]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filtro === "enviados") list = list.filter((r) => r.enviado);
    if (filtro === "por_enviar") list = list.filter((r) => !r.enviado);
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter((r) => {
        const a = r.aluno;
        return (
          a.nome?.toLowerCase().includes(qq) ||
          a.encarregado?.toLowerCase().includes(qq) ||
          a.email?.toLowerCase().includes(qq) ||
          a.telefone?.includes(qq) ||
          a.id?.toLowerCase().includes(qq)
        );
      });
    }
    return list;
  }, [rows, filtro, q]);

  const stats = useMemo(() => {
    const enviados = rows.filter((r) => r.enviado).length;
    const confirmados = rows.filter((r) => r.confirmado).length;
    const porEnviar = rows.length - enviados;
    const emails = (crmEnvios as CrmEnvio[]).filter(
      (e) => e.mesKey === mesKey && e.canal === "email",
    ).length;
    const whats = (crmEnvios as CrmEnvio[]).filter(
      (e) => e.mesKey === mesKey && e.canal === "whatsapp",
    ).length;
    return { enviados, confirmados, porEnviar, emails, whats, total: rows.length };
  }, [rows, crmEnvios, mesKey]);

  function valorPropina(a: Aluno, fatura?: FaturaPropina): number | undefined {
    if (fatura?.valor) return fatura.valor;
    const m = mensalidades.find(
      (x) => x.id === a.id || x.nome === a.nome,
    );
    if (m?.propina) return m.propina;
    return a.propina || undefined;
  }

  function registarEnvio(
    a: Aluno,
    canal: "email" | "whatsapp",
    fatura?: FaturaPropina,
  ) {
    const valor = valorPropina(a, fatura);
    addCrmEnvio({
      alunoId: a.id,
      alunoNome: a.nome,
      mesKey,
      canal,
      faturaNumero: fatura?.numero,
      valor,
      criadoPor: active,
    });
    toast.success(
      canal === "email"
        ? `E-mail aberto · ${a.encarregado || a.nome}`
        : `WhatsApp aberto · ${a.encarregado || a.nome}`,
    );
  }

  function enviarEmail(row: Row) {
    const a = row.aluno;
    const email = (a.email || row.fatura?.email || "").trim();
    if (!email) {
      toast.error("Sem e-mail do encarregado. Actualize em Matrículas.");
      return;
    }
    const valor = valorPropina(a, row.fatura);
    const mesRef = mesLabel(mesKey);
    const subject = encodeURIComponent(
      `Propina ${mesRef} — ${a.nome} · ${escola.nomeCurto || escola.nome || "École Consulaire"}`,
    );
    const body = encodeURIComponent(
      buildMensagemFatura({
        alunoNome: a.nome,
        mesRef,
        valor,
        escolaNome: escola.nome || "École Consulaire",
        faturaNumero: row.fatura?.numero,
      }),
    );
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, "_blank");
    registarEnvio(a, "email", row.fatura);
  }

  function enviarWhatsApp(row: Row) {
    const a = row.aluno;
    const wa = phoneToWa(a.telefone);
    if (!wa) {
      toast.error("Telefone inválido ou em falta. Actualize em Matrículas.");
      return;
    }
    const valor = valorPropina(a, row.fatura);
    const text = encodeURIComponent(
      buildMensagemFatura({
        alunoNome: a.nome,
        mesRef: mesLabel(mesKey),
        valor,
        escolaNome: escola.nome || "École Consulaire",
        faturaNumero: row.fatura?.numero,
      }),
    );
    window.open(`https://wa.me/${wa}?text=${text}`, "_blank");
    registarEnvio(a, "whatsapp", row.fatura);
  }

  function toggleConfirmado(row: Row) {
    if (!row.ultimo) {
      toast.message("Registe primeiro um envio (e-mail ou WhatsApp).");
      return;
    }
    const next = !row.confirmado;
    // Confirma todos os envios deste aluno/mês
    for (const e of row.envios) {
      updateCrmEnvio(e.id, { confirmado: next });
    }
    toast.success(next ? "Confirmado (verde)" : "Confirmação removida");
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function selectAllVisible() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => r.aluno.id)));
    }
  }

  function enviarGrupo(canal: "email" | "whatsapp") {
    const alvos = filtered.filter((r) => selected.has(r.aluno.id));
    if (!alvos.length) {
      toast.message("Seleccione pelo menos um encarregado.");
      return;
    }
    if (canal === "email") {
      const emails = alvos
        .map((r) => (r.aluno.email || r.fatura?.email || "").trim())
        .filter(Boolean);
      if (!emails.length) {
        toast.error("Nenhum dos seleccionados tem e-mail.");
        return;
      }
      const subject = encodeURIComponent(
        `Propina ${mesLabel(mesKey)} · ${escola.nomeCurto || "École Consulaire"}`,
      );
      const body = encodeURIComponent(
        `Olá,\n\nSegue a referência da propina de ${mesLabel(mesKey)}.\n` +
          `Por favor consulte os valores individuais com a secretaria.\n\n` +
          `${escola.nome || "École Consulaire"}`,
      );
      // BCC para não expor contactos
      window.open(
        `mailto:?bcc=${emails.join(",")}&subject=${subject}&body=${body}`,
        "_blank",
      );
      for (const r of alvos) {
        if ((r.aluno.email || r.fatura?.email || "").trim()) {
          registarEnvio(r.aluno, "email", r.fatura);
        }
      }
      return;
    }
    // WhatsApp: abre o primeiro; restantes ficam registados e o utilizador pode continuar
    let abertos = 0;
    for (const r of alvos) {
      const wa = phoneToWa(r.aluno.telefone);
      if (!wa) continue;
      const valor = valorPropina(r.aluno, r.fatura);
      const text = encodeURIComponent(
        buildMensagemFatura({
          alunoNome: r.aluno.nome,
          mesRef: mesLabel(mesKey),
          valor,
          escolaNome: escola.nome || "École Consulaire",
          faturaNumero: r.fatura?.numero,
        }),
      );
      if (abertos === 0) {
        window.open(`https://wa.me/${wa}?text=${text}`, "_blank");
      }
      registarEnvio(r.aluno, "whatsapp", r.fatura);
      abertos += 1;
    }
    if (abertos === 0) {
      toast.error("Nenhum telefone válido nos seleccionados.");
    } else if (abertos > 1) {
      toast.message(
        `WhatsApp aberto para o 1.º de ${abertos}. Os restantes ficaram registados como enviados — use o botão individual para abrir cada conversa.`,
      );
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM · Encarregados"
        description="Contactos, envio de faturas/propinas (e-mail e WhatsApp) e confirmação de entrega."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Alunos" value={stats.total} />
        <Kpi label="Enviados" value={stats.enviados} />
        <Kpi label="Confirmados" value={stats.confirmados} />
        <Kpi label="Por enviar" value={stats.porEnviar} />
        <Kpi
          label="E-mail / WhatsApp"
          value={`${stats.emails} / ${stats.whats}`}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-card)] p-4">
        <div className="space-y-1">
          <Label htmlFor="mes">Mês de referência</Label>
          <Input
            id="mes"
            type="month"
            value={mesKey}
            onChange={(e) => setMesKey(e.target.value)}
            className="w-44"
          />
        </div>
        <div className="min-w-[200px] flex-1 space-y-1">
          <Label htmlFor="q">Pesquisar</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted)]" />
            <Input
              id="q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nome, encarregado, e-mail, telefone…"
              className="pl-9"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["todos", "Todos"],
              ["por_enviar", "Por enviar"],
              ["enviados", "Enviados"],
            ] as const
          ).map(([k, lab]) => (
            <Button
              key={k}
              size="sm"
              variant={filtro === k ? "default" : "outline"}
              onClick={() => setFiltro(k)}
            >
              {lab}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={selectAllVisible}>
          <Users className="mr-1 size-4" />
          {selected.size === filtered.length && filtered.length > 0
            ? "Limpar selecção"
            : `Seleccionar visíveis (${filtered.length})`}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!selected.size}
          onClick={() => enviarGrupo("email")}
        >
          <Mail className="mr-1 size-4" />
          E-mail grupo ({selected.size})
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!selected.size}
          onClick={() => enviarGrupo("whatsapp")}
        >
          <MessageCircle className="mr-1 size-4" />
          WhatsApp grupo ({selected.size})
        </Button>
        <span className="text-xs text-[var(--color-muted)]">
          Verde = confirmado · Vermelho = sem confirmação / por enviar
        </span>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-line)]">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-[var(--color-bg)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
            <tr>
              <th className="px-3 py-2 w-10"></th>
              <th className="px-3 py-2">Aluno / Turma</th>
              <th className="px-3 py-2">Encarregado</th>
              <th className="px-3 py-2">Contactos</th>
              <th className="px-3 py-2">Propina / Fatura</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2 text-right">Acções</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-[var(--color-muted)]">
                  Nenhum registo para os filtros actuais.
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const a = row.aluno;
                const valor = valorPropina(a, row.fatura);
                const email = (a.email || row.fatura?.email || "").trim();
                const waOk = !!phoneToWa(a.telefone);
                return (
                  <tr
                    key={a.id}
                    className="border-t border-[var(--color-line)] hover:bg-[var(--color-bg)]/60"
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(a.id)}
                        onChange={() => toggleSelect(a.id)}
                        className="size-4 accent-[var(--color-forest)]"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{a.nome}</div>
                      <div className="text-xs text-[var(--color-muted)]">
                        {a.id} · {a.turma || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {a.encarregado || a.pai || a.mae || (
                        <span className="text-[var(--color-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div>{a.telefone || "—"}</div>
                      <div className="text-[var(--color-muted)]">
                        {email || "sem e-mail"}
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-xs">
                      {valor != null ? formatKz(valor) : "—"}
                      {row.fatura?.numero ? (
                        <div className="text-[var(--color-muted)]">
                          {row.fatura.numero}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {row.confirmado ? (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                          <CheckCircle2 className="mr-1 size-3" />
                          Confirmado
                        </Badge>
                      ) : row.enviado ? (
                        <Badge className="bg-red-600 text-white hover:bg-red-600">
                          <XCircle className="mr-1 size-3" />
                          Sem confirmação
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-red-700 border-red-300">
                          Por enviar
                        </Badge>
                      )}
                      {row.ultimo ? (
                        <div className="mt-1 text-[10px] text-[var(--color-muted)]">
                          {row.ultimo.canal} · {formatDate(row.ultimo.enviadoEm.slice(0, 10))}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!email}
                          title={email ? `Enviar para ${email}` : "Sem e-mail"}
                          onClick={() => enviarEmail(row)}
                        >
                          <Mail className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!waOk}
                          title={waOk ? "Abrir WhatsApp" : "Telefone inválido"}
                          onClick={() => enviarWhatsApp(row)}
                        >
                          <MessageCircle className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant={row.confirmado ? "default" : "outline"}
                          className={
                            row.confirmado
                              ? "bg-emerald-600 hover:bg-emerald-700"
                              : "text-red-700 border-red-300 hover:bg-red-50"
                          }
                          title="Marcar confirmação de envio"
                          onClick={() => toggleConfirmado(row)}
                        >
                          {row.confirmado ? (
                            <CheckCircle2 className="size-3.5" />
                          ) : (
                            <XCircle className="size-3.5" />
                          )}
                        </Button>
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
        <Send className="mr-1 inline size-3" />
        O envio abre o cliente de e-mail (mailto) ou o WhatsApp Web/App (wa.me).
        O estado fica registado neste separador para reconciliação. Actualize
        e-mails e telefones em <strong>Matrículas</strong> quando estiverem em falta.
      </p>
    </div>
  );
}
