/**
 * Botão Matrículas — copiar mensagem WhatsApp com o link /fotos
 * e consultar respostas (sim / não + nome de quem tomou nota).
 */
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
      toast.error("Não foi possível copiar a mensagem");
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      title="Enviar o link /fotos aos pais. As respostas estão em Google Sheets."
      onClick={() => void copiarWhatsApp()}
    >
      <Camera className="mr-1 size-4" /> Autorização de fotos
    </Button>
  );
}
