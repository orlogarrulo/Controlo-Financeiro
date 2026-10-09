/**
 * Link curto público — inquérito de saúde (sem menu da app).
 * URL: /saude
 */
import { createFileRoute } from "@tanstack/react-router";
import { InqueritoSaudePage } from "./inquerito-saude";

export const Route = createFileRoute("/saude")({
  component: InqueritoSaudePage,
});
