import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  PASTA_CAMPUS_CIDADE,
  PASTA_CAMPUS_NOVA_VIDA,
  desligarPastaPc,
  ligarPastaPc,
  onPastasPcStatus,
  reautorizarPastaPc,
  sincronizarPastasPc,
  type PastasPcStatus,
} from "@/lib/pastas-pc";

export function PastasPcPanel() {
  const [st, setSt] = useState<PastasPcStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => onPastasPcStatus(setSt), []);

  async function ligar() {
    setBusy(true);
    try {
      const nome = await ligarPastaPc();
      toast.success(`Pastas criadas em «${nome}»: ${PASTA_CAMPUS_CIDADE} e ${PASTA_CAMPUS_NOVA_VIDA}.`);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error(e instanceof Error ? e.message : "Não foi possível ligar a pasta.");
    } finally {
      setBusy(false);
    }
  }

  async function syncAgora() {
    setBusy(true);
    try {
      const r = await sincronizarPastasPc();
      toast.success(
        `Sincronizado: ${r.alunos} alunos (${r.campusCidade} cidade · ${r.campusNovaVida} Nova Vida).`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na sincronização.");
    } finally {
      setBusy(false);
    }
  }

  async function reautorizar() {
    setBusy(true);
    try {
      await reautorizarPastaPc();
      toast.success("Pasta reautorizada e actualizada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível reautorizar.");
    } finally {
      setBusy(false);
    }
  }

  const status = st;
  return (
    <section className="mb-4 rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <h2 className="font-display text-xl">Pastas no PC (Windows)</h2>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Cria <strong>{PASTA_CAMPUS_CIDADE}</strong> e <strong>{PASTA_CAMPUS_NOVA_VIDA}</strong>. Dentro de
        cada campus, uma pasta por aluno com <strong>ficha de matrícula</strong>, <strong>recibos</strong> e{" "}
        <strong>faturas</strong>. Nova matrícula, alteração ou recibo/fatura novo actualizam a pasta
        automaticamente — desde que esta origem (Chrome ou Edge) esteja ligada à pasta.
      </p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Escolha uma pasta vazia, por exemplo Documentos\Ecole Consulaire. O Firefox não suporta esta
        escrita directa no disco.
      </p>
      {status?.erro ? <p className="mt-2 text-sm text-red-600">{status.erro}</p> : null}
      {status?.ligada ? (
        <p className="mt-3 text-sm">
          Ligada a <strong>{status.nomePasta}</strong>
          {status.ultimaSync ? ` · última sincronização ${status.ultimaSync}` : ""}
          {status.aSincronizar ? " · a sincronizar…" : ""}
          {status.precisaAutorizacao ? " · precisa de autorização outra vez" : ""}
        </p>
      ) : (
        <p className="mt-3 text-sm">Ainda sem pasta ligada neste computador.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={() => void ligar()} disabled={busy || status?.suportado === false}>
          {status?.ligada ? "Trocar pasta do PC" : "Ligar pasta do PC e criar campus"}
        </Button>
        {status?.precisaAutorizacao ? (
          <Button type="button" variant="secondary" onClick={() => void reautorizar()} disabled={busy}>
            Autorizar e sincronizar
          </Button>
        ) : null}
        {status?.ligada ? (
          <Button type="button" variant="secondary" onClick={() => void syncAgora()} disabled={busy}>
            Sincronizar agora
          </Button>
        ) : null}
        {status?.ligada ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void desligarPastaPc().then(() => toast.message("Pasta desligada. As pastas no disco mantêm-se."));
            }}
            disabled={busy}
          >
            Desligar
          </Button>
        ) : null}
      </div>
    </section>
  );
}
