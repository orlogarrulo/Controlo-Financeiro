import { FileDown, Printer, Share2 } from "lucide-react";
import { useState, type RefObject } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportElementPdf } from "@/lib/pdf-export";

/**
 * Botões Imprimir + Exportar / Enviar PDF.
 * Passe `targetRef` para o elemento a capturar (recibo, tabela, etc.).
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

  async function onPdf() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await exportElementPdf(targetRef.current, filename, {
        title: shareTitle,
        text: shareText,
      });
      if (result === "shared") {
        toast.success("PDF partilhado (WhatsApp, e-mail, …)");
      } else {
        toast.success("PDF descarregado — pode anexar no WhatsApp ou e-mail");
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        toast.message("Partilha cancelada");
      } else {
        toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
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
        {busy ? (
          <>A gerar PDF…</>
        ) : (
          <>
            <Share2 className="mr-1 size-4" />
            <FileDown className="mr-1 hidden size-4 sm:inline" />
            {pdfLabel}
          </>
        )}
      </Button>
    </div>
  );
}
