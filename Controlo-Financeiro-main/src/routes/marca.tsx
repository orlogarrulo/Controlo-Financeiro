/**
 * Link curto público — agendamento pedagógico (sem menu da app).
 * URL: /marca
 */
import { createFileRoute } from "@tanstack/react-router";
import { AgendamentoPage } from "./agendamento";

export const Route = createFileRoute("/marca")({
  component: AgendamentoPage,
});
