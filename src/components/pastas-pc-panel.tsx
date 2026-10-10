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
