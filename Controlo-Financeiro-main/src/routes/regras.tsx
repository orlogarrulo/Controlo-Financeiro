/**
 * Link curto público — regulamento interno (sem menu da app).
 * URL: /regras?lang=pt | /regras?lang=fr
 */
import { createFileRoute } from "@tanstack/react-router";
import { RegulamentoPage } from "./regulamento";

export const Route = createFileRoute("/regras")({
  validateSearch: (s: Record<string, unknown>) => ({
    lang: s.lang === "fr" || s.lang === "pt" ? s.lang : ("pt" as const),
  }),
  component: RegulamentoPage,
});
