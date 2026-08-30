import { Printer } from "lucide-react";
import type { RefObject } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Imprimir / Guardar PDF — usa a impressão nativa do browser
 * (mesmo layout que vê no ecrã de impressão).
 * No diálogo: escolha a impressora ou «Guardar como PDF» para ficheiro idêntico.
 */
export function PrintActions({
  targetRef: _targetRef,
  filename: _filename,
  shareTitle: _shareTitle,
  shareText: _shareText,
  printLabel = "Imprimir / Guardar PDF",
  pdfLabel: _pdfLabel,
  landscape: _landscape = false,
}: {
  targetRef: RefObject<HTMLElement | null>;
  filename: string;
  shareTitle?: string;
  shareText?: string;
  printLabel?: string;
  pdfLabel?: string;
  /** Mantido por compatibilidade; a orientação vem do @page CSS da página. */
  landscape?: boolean;
}) {
  function onPrint() {
    try {
      window.print();
      toast.message("No diálogo: escolha a impressora ou «Guardar como PDF» — fica idêntico à impressão.");
    } catch {
      toast.error("Impressão bloqueada pelo browser.");
    }
  }

  return (
    <div className="no-print flex flex-wrap gap-2">
      <Button variant="secondary" type="button" onClick={onPrint}>
        <Printer className="mr-1 size-4" /> {printLabel}
      </Button>
    </div>
  );
}
