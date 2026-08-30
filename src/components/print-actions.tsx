import { FileDown, Printer, Share2 } from "lucide-react";
import { useState, type RefObject } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  elementToPdfBlob,
  isMobileDevice,
  shareOrDownloadPdf,
} from "@/lib/pdf-export";

/**
 * Imprimir (layout exacto) + no telemóvel preparar PDF para WhatsApp / e-mail.
 */
export function PrintActions({
  targetRef,
  filename,
  shareTitle,
  shareText,
  printLabel = "Imprimir / Guardar PDF",
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
      if (!mobile) {
        toast.message("No diálogo: impressora ou «Guardar como PDF».");
      }
    } catch {
      toast.error("Impressão bloqueada pelo browser.");
    }
  }

  async function onPrepareShare() {
    if (busy) return;
    setBusy(true);
    setReady(null);
    try {
      if (!targetRef.current) throw new Error("Área de impressão não encontrada");
      const { blob, filename: name } = await elementToPdfBlob(targetRef.current, {
        filename,
        stamp: true,
        landscape,
      });
      if (blob.type !== "application/pdf") {
        throw new Error("Não foi possível gerar o PDF");
      }
      setReady({ blob, name });
      toast.success("PDF pronto — toque em «Partilhar» (WhatsApp, e-mail, …)");
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
        toast.message("PDF descarregado — abra o ficheiro e partilhe");
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
          toast.message("PDF descarregado — abra-o e partilhe");
        } catch {
          toast.error("Não foi possível partilhar neste aparelho");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print flex flex-wrap gap-2">
      <Button variant="secondary" type="button" onClick={onPrint}>
        <Printer className="mr-1 size-4" /> {printLabel}
      </Button>
      {mobile ? (
        <>
          <Button type="button" onClick={() => void onPrepareShare()} disabled={busy}>
            <FileDown className="mr-1 size-4" />
            {busy && !ready ? "A gerar PDF…" : pdfLabel || "Preparar PDF"}
          </Button>
          {ready ? (
            <Button
              type="button"
              onClick={() => void onShareNow()}
              disabled={busy}
              className="bg-[var(--color-forest)] text-white"
            >
              <Share2 className="mr-1 size-4" /> Partilhar
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
