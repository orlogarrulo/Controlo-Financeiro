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
import {
  autorizacaoFotosPublicUrl,
  buildAutorizacaoFotosWhatsApp,
} from "@/lib/inquerito-saude-whatsapp";

export function AutorizacaoFotosButton() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AutorizacaoFotosCloud[]>([]);
  const [loading, setLoading] = useState(false);

  function copiarWhatsApp() {
    const url = autorizacaoFotosPublicUrl();
    const msg = buildAutorizacaoFotosWhatsApp({ linkFormulario: url });
    void navigator.clipboard.writeText(msg).then(
      () => toast.success("Mensagem de autorização de fotos copiada — cole no WhatsApp"),
      () => toast.error("Não foi possível copiar"),
    );
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
        onClick={copiarWhatsApp}
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
