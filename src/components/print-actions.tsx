import { ExternalLink, FileDown, Printer, Share2 } from "lucide-react";
import { useState, type RefObject } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { elementToPdfBlob, isMobileDevice, shareOrDownloadPdf } from "@/lib/pdf-export";

/**
 * Imprimir + Exportar PDF.
 * — PC: abre o PDF num novo separador.
 * — Telemóvel: gera o PDF e mostra «Partilhar PDF» (gesto fresco → caixa WhatsApp/Gmail).
 *   Não tenta partilhar automaticamente após a geração (o browser anula o gesto).
 */
export function PrintActions({
  targetRef,
  filename,
  shareTitle,
  shareText,
  printLabel = "Imprimir",
  pdfLabel,
  landscape = false,
}: {
  targetRef: RefObject<HTMLElement | null>;
  filename: string;
  shareTitle?: string;
  shareText?: string;
  printLabel?: string;
  pdfLabel?: string;
  /** PDF em A4 horizontal (tabelas largas: BAI, Fundo) */
  landscape?: boolean;
}) {
  const mobile = typeof navigator !== "undefined" ? isMobileDevice() : false;
  const label = pdfLabel ?? (mobile ? "Preparar PDF" : "Ver / Exportar PDF");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<{ blob: Blob; name: string } | null>(null);

  async function onPrepare() {
    if (busy) return;
    setBusy(true);
    setReady(null);
    try {
      if (!targetRef.current) throw new Error("Área de impressão não encontrada");
      const { blob, filename: name } = await elementToPdfBlob(targetRef.current, {
        filename,
        stamp: true,
        landscape,
        title: shareTitle || filename.replace(/\.pdf$/i, ""),
      });

      if (!isMobileDevice()) {
        const result = await shareOrDownloadPdf(blob, name, {
          title: shareTitle,
          text: shareText,
        });
        if (result === "opened") {
          toast.success("PDF aberto num novo separador — pode ver, guardar ou enviar");
        } else {
          toast.message("PDF descarregado (o browser bloqueou a nova janela)");
        }
        return;
      }

      // Telemóvel: guardar e pedir toque em «Partilhar PDF» (gesto válido)
      setReady({ blob, name });
      toast.success("PDF pronto — toque em «Partilhar PDF»");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
    } finally {
      setBusy(false);
    }
  }

  async function onShareNow() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const result = await shareOrDownloadPdf(ready.blob, ready.name, {
        title: shareTitle,
        text: shareText,
      });
      if (result === "shared") {
        toast.success("Escolha WhatsApp, Gmail ou outra app");
        setReady(null);
      } else if (result === "opened") {
        toast.success("PDF aberto");
        setReady(null);
      } else {
        toast.message("PDF descarregado — abra o ficheiro e partilhe pelo WhatsApp");
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        toast.message("Partilha cancelada");
      } else {
        // Último recurso: download para o utilizador partilhar manualmente
        try {
          const url = URL.createObjectURL(ready.blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = ready.name;
          a.click();
          URL.revokeObjectURL(url);
          toast.message("PDF descarregado — abra-o e partilhe pelo WhatsApp");
        } catch {
          toast.error("Não foi possível partilhar o PDF neste aparelho");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print flex flex-wrap gap-2">
      <Button variant="secondary" type="button" onClick={() => window.print()}>
        <Printer className="mr-1 size-4" /> {printLabel}
      </Button>
      <Button type="button" onClick={() => void onPrepare()} disabled={busy}>
        {busy && !ready ? (
          <>A gerar PDF…</>
        ) : (
          <>
            {mobile ? <FileDown className="mr-1 size-4" /> : <ExternalLink className="mr-1 size-4" />}
            {label}
          </>
        )}
      </Button>
      {ready && mobile ? (
        <Button type="button" onClick={() => void onShareNow()} disabled={busy} className="bg-[var(--color-forest)] text-white">
          <Share2 className="mr-1 size-4" /> Partilhar PDF
        </Button>
      ) : null}
    </div>
  );
}
