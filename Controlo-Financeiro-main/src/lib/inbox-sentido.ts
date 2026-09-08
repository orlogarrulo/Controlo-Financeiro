import type { InboxMovimento, InboxTipo } from "@/data/types";

/** Sentido por tipo (conta da escola). */
export function tipoESaida(tipo: InboxTipo | undefined, descricao = ""): boolean | null {
  const d = descricao || "";
  switch (tipo) {
    case "salario":
    case "despesa":
    case "comissao_transferencia":
    case "comissao_fecho_tpa":
    case "taxa_aluguer_tpa":
      return true;
    case "propina":
    case "deposito":
      return false;
    case "tpa":
      // Fecho TPA = dinheiro que entra; TPA-MCX / pagamento cartão = sai
      return !/fecho\s*tpa/i.test(d);
    case "transferencia":
      // Recebida (NI, KWiK de, crédito) = entra; MB-Transf / pagamento = sai
      return !/recebid|pelo\s*ni|kwik\s*de|entrada|cr[eé]dito/i.test(d);
    default:
      return null;
  }
}

export function montanteAbs(it: Partial<InboxMovimento> & { valor?: number }): number {
  return Math.abs(Number(it.entrada) || Number(it.saida) || Number(it.valor) || 0);
}

export function aplicarSentido(
  tipo: InboxTipo | undefined,
  descricao: string,
  montante: number,
  prev?: { entrada?: number; saida?: number; valor?: number },
): { entrada: number; saida: number; valor: number } {
  const n = Math.abs(montante) || montanteAbs(prev || {});
  const forced = tipoESaida(tipo, descricao);
  if (forced === true) return { entrada: 0, saida: n, valor: -n };
  if (forced === false) return { entrada: n, saida: 0, valor: n };
  if (prev) {
    if (Number(prev.saida) > 0 && !(Number(prev.entrada) > 0)) {
      return { entrada: 0, saida: Number(prev.saida), valor: -Number(prev.saida) };
    }
    if (Number(prev.entrada) > 0) {
      return { entrada: Number(prev.entrada), saida: 0, valor: Number(prev.entrada) };
    }
    if (Number(prev.valor) < 0) {
      return { entrada: 0, saida: Math.abs(Number(prev.valor)), valor: Number(prev.valor) };
    }
    if (Number(prev.valor) > 0) {
      return { entrada: Number(prev.valor), saida: 0, valor: Number(prev.valor) };
    }
  }
  return { entrada: 0, saida: 0, valor: 0 };
}
