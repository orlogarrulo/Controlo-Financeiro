/**
 * Link curto público — autorização de fotografias (sem menu da app).
 * URL: /fotos
 */
import { createFileRoute } from "@tanstack/react-router";
import { AutorizacaoFotosPage } from "./autorizacao-fotos";

export const Route = createFileRoute("/fotos")({
  component: AutorizacaoFotosPage,
});
