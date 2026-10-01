/**
 * Botão Matrículas — copiar mensagem WhatsApp com o link /fotos
 * e consultar respostas (sim / não + nome de quem tomou nota).
 */
import { useState } from "react";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  listAutorizacoesFotos,
  type AutorizacaoFotosCloud,
} from "@/lib/finance-cloud";
import { escolaLogoSrc } from "@/lib/logo-escola";
import {
  autorizacaoFotosPublicUrl,
  buildAutorizacaoFotosWhatsApp,
  escolaLogoPublicUrl,
} from "@/lib/inquerito-saude-whatsapp";

async function logoParaPartilha(): Promise<File | null> {
  try {
    const res = await fetch("/logo-escola.jpg");
    if (res.ok) {
      const blob = await res.blob();
      return new File([blob], "logo-ecole-consulaire.jpg", {
        type: blob.type || "image/jpeg",
      });
    }
  } catch {
    /* fallback data-url */
  }
  try {
    const dataUrl = escolaLogoSrc();
    const blob = await (await fetch(dataUrl)).blob();
    return new File([blob], "logo-ecole-consulaire.jpg", {
      type: blob.type || "image/jpeg",
    });
  } catch {
    return null;
  }
}

export function AutorizacaoFotosButton() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AutorizacaoFotosCloud[]>([]);
  const [loading, setLoading] = useState(false);

  async function copiarWhatsApp() {
    const url = autorizacaoFotosPublicUrl();
    const logoUrl = escolaLogoPublicUrl();
    const msg = buildAutorizacaoFotosWhatsApp({ linkFormulario: url, logoUrl });
    const logoFile = await logoParaPartilha();
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
    };
    if (logoFile && nav.share && nav.canShare?.({ files: [logoFile] })) {
      try {
        await nav.share({
          title: "Autorização de fotos",
          text: msg,
          files: [logoFile],
        });
        toast.success("Mensagem com logotipo pronta a enviar no WhatsApp");
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(msg);
      toast.success("Mensagem com logotipo copiada — cole no WhatsApp");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  async function abrirLista() {
    setOpen(true);
    setLoading(true);
    try {
      const cloud = await listAutorizacoesFotos();
      setRows(cloud);
    } catch {
      toast.error("Não foi possível carregar as autorizações");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        title="Autorização de fotos — link /fotos para os pais (WhatsApp)"
        onClick={() => void copiarWhatsApp()}
      >
        <Camera className="mr-1 size-4" /> Autorização de fotos
      </Button>
      <Button
        type="button"
        variant="ghost"
        title="Ver respostas: Sim autorizo / Não autorizo e nome de quem tomou nota"
        onClick={() => void abrirLista()}
      >
        Respostas
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Autorizações de fotos</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Link público: {autorizacaoFotosPublicUrl()}
          </p>
          {loading ? (
            <p className="text-sm">A carregar…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm">Ainda não há respostas na nuvem.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {rows.map((r, i) => (
                <li key={`${r.submittedAt}-${i}`} className="rounded-lg border p-2">
                  <p className="font-medium">{r.alunoNome}</p>
                  <p>
                    {r.decisao === "sim" ? "Sim, autorizo" : "Não autorizo"}
                    {r.turma ? ` · ${r.turma}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Responsável: {r.responsavelNome}
                    {r.telefone ? ` · ${r.telefone}` : ""}
                  </p>
                  <p className="text-xs">Tomei nota: {r.tomeiNotaNome}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {r.data || r.submittedAt.slice(0, 10)} · {r.lang === "fr" ? "FR" : "PT"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
