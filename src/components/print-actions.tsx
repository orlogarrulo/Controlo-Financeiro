import { ExternalLink, FileDown, Printer, Share2 } from "lucide-react";
import { useState, type RefObject } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  elementToPdfBlob,
  isMobileDevice,
  shareOrDownloadPdf,
} from "@/lib/pdf-export";

/**
 * Fluxo unificado (Quadro e restantes):
 * — PC: Imprimir + Exportar PDF (abre no browser)
 * — Telemóvel: Preparar PDF → Partilhar (WhatsApp, e-mail, …)
 * PDF gerado a partir da área de impressão com estilo formal (texto escuro, A4).
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
  landscape?: boolean;
}) {
  const mobile = typeof navigator !== "undefined" ? isMobileDevice() : false;
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<{ blob: Blob; name: string } | null>(null);

  function onPrint() {
    try {
      window.print();
      toast.message("No diálogo: impressora ou «Guardar como PDF».");
    } catch {
      toast.error("Impressão bloqueada pelo browser.");
    }
  }

  async function generatePdf(): Promise<{ blob: Blob; name: string }> {
    if (!targetRef.current) throw new Error("Área de impressão não encontrada");
    const { blob, filename: name } = await elementToPdfBlob(targetRef.current, {
      filename,
      stamp: true,
      landscape,
    });
    if (!blob || blob.type !== "application/pdf" || blob.size < 400) {
      throw new Error("Não foi possível gerar o PDF");
    }
    return { blob, name };
  }

  async function onExportDesktop() {
    if (busy) return;
    setBusy(true);
    try {
      const { blob, name } = await generatePdf();
      const result = await shareOrDownloadPdf(blob, name, {
        title: shareTitle,
        text: shareText,
      });
      if (result === "opened") {
        toast.success("PDF aberto — pode guardar ou enviar");
      } else {
        toast.message("PDF descarregado");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar PDF");
    } finally {
      setBusy(false);
    }
  }

  async function onPrepareMobile() {
    if (busy) return;
    setBusy(true);
    setReady(null);
    try {
      const { blob, name } = await generatePdf();
      setReady({ blob, name });
      toast.success("PDF pronto — toque em «Partilhar»");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar PDF");
    } finally {
      setBusy(false);
    }
  }

  async function onShareMobile() {
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
        toast.message("PDF descarregado — abra e partilhe");
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        toast.message("Partilha cancelada");
      } else {
        try {
          const url = URL.createObjectURL(ready.blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = ready.name;
          a.click();
          URL.revokeObjectURL(url);
          toast.message("PDF descarregado");
        } catch {
          toast.error("Não foi possível partilhar");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      {!mobile ? (
        <>
          <Button variant="secondary" type="button" onClick={onPrint}>
            <Printer className="mr-1 size-4" /> {printLabel}
          </Button>
          <Button type="button" onClick={() => void onExportDesktop()} disabled={busy}>
            <ExternalLink className="mr-1 size-4" />
            {busy ? "A gerar…" : pdfLabel || "PDF"}
          </Button>
        </>
      ) : (
        <>
          <Button
            type="button"
            variant={ready ? "secondary" : "default"}
            onClick={() => void onPrepareMobile()}
            disabled={busy}
          >
            <FileDown className="mr-1 size-4" />
            {busy && !ready ? "A gerar…" : ready ? "Gerar de novo" : pdfLabel || "PDF"}
          </Button>
          {ready ? (
            <Button
              type="button"
              onClick={() => void onShareMobile()}
              disabled={busy}
              className="bg-[var(--color-forest)] text-white hover:opacity-95"
            >
              <Share2 className="mr-1 size-4" /> Partilhar
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
