import { FileDown, Printer, Share2 } from "lucide-react";
import { useState, type RefObject } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { elementToPdfBlob, shareOrDownloadPdf } from "@/lib/pdf-export";

/**
 * Botões Imprimir + Exportar / Enviar PDF.
 * Gera o PDF e abre a partilha do sistema (WhatsApp, Gmail…).
 * Se a partilha automática falhar (gesto do utilizador expirado após geração longa),
 * mostra um botão «Partilhar agora» com gesto fresco.
 */
export function PrintActions({
  targetRef,
  filename,
  shareTitle,
  shareText,
  printLabel = "Imprimir",
  pdfLabel = "Enviar / Exportar PDF",
}: {
  targetRef: RefObject<HTMLElement | null>;
  filename: string;
  shareTitle?: string;
  shareText?: string;
  printLabel?: string;
  pdfLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ blob: Blob; name: string } | null>(null);

  async function onPdf() {
    if (busy) return;
    setBusy(true);
    setPending(null);
    try {
      if (!targetRef.current) throw new Error("Área de impressão não encontrada");
      const { blob, filename: name } = await elementToPdfBlob(targetRef.current, {
        filename,
        stamp: true,
      });
      try {
        const result = await shareOrDownloadPdf(blob, name, {
          title: shareTitle,
          text: shareText,
        });
        if (result === "shared") {
          toast.success("Escolha WhatsApp, Gmail ou outra app para enviar o PDF");
        } else {
          // Guardar para partilha com gesto fresco (comum no Quadro — PDF mais demorado)
          setPending({ blob, name });
          toast.message("PDF pronto. Toque em «Partilhar agora» para abrir WhatsApp/Gmail.");
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          toast.message("Partilha cancelada");
        } else {
          setPending({ blob, name });
          toast.message("PDF pronto. Toque em «Partilhar agora».");
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
    } finally {
      setBusy(false);
    }
  }

  async function onSharePending() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const result = await shareOrDownloadPdf(pending.blob, pending.name, {
        title: shareTitle,
        text: shareText,
      });
      if (result === "shared") {
        toast.success("Escolha WhatsApp, Gmail ou outra app");
        setPending(null);
      } else {
        toast.message("PDF descarregado — anexe no WhatsApp ou e-mail");
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        toast.message("Partilha cancelada");
      } else {
        toast.error("Não foi possível partilhar");
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
      <Button type="button" onClick={() => void onPdf()} disabled={busy}>
        {busy && !pending ? (
          <>A gerar PDF…</>
        ) : (
          <>
            <Share2 className="mr-1 size-4" />
            <FileDown className="mr-1 hidden size-4 sm:inline" />
            {pdfLabel}
          </>
        )}
      </Button>
      {pending ? (
        <Button type="button" onClick={() => void onSharePending()} disabled={busy}>
          <Share2 className="mr-1 size-4" /> Partilhar agora
        </Button>
      ) : null}
    </div>
  );
}
