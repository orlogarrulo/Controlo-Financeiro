/**
 * Catálogo de rubricas para emissão de faturas/recibos.
 * ATL + taxas de secretaria (tabela 2026/2027).
 * Preços da secretaria: preencher no formulário (tabela oficial sem valores fixos no anexo).
 */
import type { DocumentoAlunoModelo, DocumentoLinha } from "@/data/types";

export type CatalogItem = {
  key: string;
  label: string;
  /** Grupo no dropdown */
  categoria: string;
  modelo: DocumentoAlunoModelo;
  /** Sugestão de valor (Kz); 0 = utilizador preenche */
  defaultValue?: number;
};

export const CATALOGO_RUBRICAS: CatalogItem[] = [
  // —— ATL ——
  {
    key: "atl_explicacao",
    label: "ATL — Explicação",
    categoria: "ATL",
    modelo: "atl_explicacao",
    defaultValue: 0,
  },
  {
    key: "atl_actividades",
    label: "ATL — Actividades",
    categoria: "ATL",
    modelo: "atl_actividades",
    defaultValue: 0,
  },

  // —— Secretaria: 1. Comprovação académica ——
  { key: "sec_decl_matricula", label: "Declaração de matrícula / frequência", categoria: "Secretaria · Comprovação", modelo: "secretaria" },
  { key: "sec_decl_conclusao", label: "Declaração de conclusão de classe / ano", categoria: "Secretaria · Comprovação", modelo: "secretaria" },
  { key: "sec_decl_notas_simples", label: "Declaração com notas (simples)", categoria: "Secretaria · Comprovação", modelo: "secretaria" },
  { key: "sec_decl_notas_disc", label: "Declaração com notas discriminadas", categoria: "Secretaria · Comprovação", modelo: "secretaria" },
  { key: "sec_decl_transf", label: "Declaração de transferência", categoria: "Secretaria · Comprovação", modelo: "secretaria" },
  { key: "sec_decl_visto", label: "Declaração para fins de visto / embaixada", categoria: "Secretaria · Comprovação", modelo: "secretaria" },
  { key: "sec_decl_imposto", label: "Declaração para fins de imposto / oficiais", categoria: "Secretaria · Comprovação", modelo: "secretaria" },
  { key: "sec_atestado_pre", label: "Atestado de conclusão do pré-escolar", categoria: "Secretaria · Comprovação", modelo: "secretaria" },

  // —— 2. Históricos e certificados ——
  { key: "sec_hist_simples", label: "Histórico escolar (transcript) – versão simples", categoria: "Secretaria · Históricos", modelo: "secretaria" },
  { key: "sec_hist_completo", label: "Histórico escolar completo / oficial", categoria: "Secretaria · Históricos", modelo: "secretaria" },
  { key: "sec_cert_habil", label: "Certificado de habilitações", categoria: "Secretaria · Históricos", modelo: "secretaria" },
  { key: "sec_cert_ciclo", label: "Certificado de conclusão de ciclo (Primário / I / II)", categoria: "Secretaria · Históricos", modelo: "secretaria" },
  { key: "sec_diploma_sec", label: "Diploma de conclusão do Ensino Secundário", categoria: "Secretaria · Históricos", modelo: "secretaria" },
  { key: "sec_2via_cert", label: "2.ª via de certificado / diploma / histórico", categoria: "Secretaria · Históricos", modelo: "secretaria" },
  { key: "sec_cert_equiv", label: "Certificado de equivalência", categoria: "Secretaria · Históricos", modelo: "secretaria" },

  // —— 3. Transferência ——
  { key: "sec_proc_transf", label: "Processo de transferência (entrada ou saída)", categoria: "Secretaria · Transferência", modelo: "secretaria" },
  { key: "sec_carta_transf", label: "Carta / Guia de transferência oficial", categoria: "Secretaria · Transferência", modelo: "secretaria" },
  { key: "sec_aut_transf", label: "Autorização de transferência", categoria: "Secretaria · Transferência", modelo: "secretaria" },

  // —— 4. Cartões ——
  { key: "sec_cartao_1via", label: "Emissão de cartão de estudante (1.ª via)", categoria: "Secretaria · Cartões", modelo: "secretaria" },
  { key: "sec_cartao_2via", label: "2.ª via do cartão de estudante", categoria: "Secretaria · Cartões", modelo: "secretaria" },
  { key: "sec_cartao_bib", label: "Cartão de biblioteca / acesso às instalações", categoria: "Secretaria · Cartões", modelo: "secretaria" },

  // —— 5. Administrativos ——
  { key: "sec_conf_matricula", label: "Confirmação / renovação de matrícula", categoria: "Secretaria · Administrativo", modelo: "secretaria" },
  { key: "sec_anul_matricula", label: "Anulação / cancelamento de matrícula", categoria: "Secretaria · Administrativo", modelo: "secretaria" },
  { key: "sec_just_faltas", label: "Justificação de faltas (documento oficial)", categoria: "Secretaria · Administrativo", modelo: "secretaria" },
  { key: "sec_rev_prova", label: "Pedido de revisão de prova / exame", categoria: "Secretaria · Administrativo", modelo: "secretaria" },
  { key: "sec_exam_recurso", label: "Inscrição em exames especiais / de recurso", categoria: "Secretaria · Administrativo", modelo: "secretaria" },
  { key: "sec_autent", label: "Autenticação / visto da escola em documentos", categoria: "Secretaria · Administrativo", modelo: "secretaria" },
  { key: "sec_copia_aut", label: "Cópia autenticada de documentos escolares", categoria: "Secretaria · Administrativo", modelo: "secretaria" },
  { key: "sec_syllabus", label: "Emissão de programa / conteúdo programático (syllabus)", categoria: "Secretaria · Administrativo", modelo: "secretaria" },

  // —— 6. Internacionais ——
  { key: "sec_transcript_ext", label: "Transcript oficial para universidades no exterior", categoria: "Secretaria · Internacional", modelo: "secretaria" },
  { key: "sec_carta_rec", label: "Carta de recomendação (secretaria)", categoria: "Secretaria · Internacional", modelo: "secretaria" },
  { key: "sec_apostila", label: "Documentos para apostila / legalização", categoria: "Secretaria · Internacional", modelo: "secretaria" },
  { key: "sec_ib_diploma", label: "Certificado IB / Diplôme / High School Diploma oficial", categoria: "Secretaria · Internacional", modelo: "secretaria" },
  { key: "sec_nivel_ingles", label: "Declaração de nível de inglês / idioma", categoria: "Secretaria · Internacional", modelo: "secretaria" },

  // —— 7. Outros ——
  { key: "sec_2via_boletim", label: "Segunda via de boletins de notas", categoria: "Secretaria · Outros", modelo: "secretaria" },
  { key: "sec_extrato_notas", label: "Extrato de notas / pauta", categoria: "Secretaria · Outros", modelo: "secretaria" },
  { key: "sec_quitacao", label: "Declaração de quitação financeira (para transferência)", categoria: "Secretaria · Outros", modelo: "secretaria" },
  { key: "sec_urgente", label: "Pedido urgente (taxa adicional)", categoria: "Secretaria · Outros", modelo: "secretaria" },
  { key: "sec_courier", label: "Envio de documentos por correio / courier", categoria: "Secretaria · Outros", modelo: "secretaria" },

  // —— Meio do ano (rubrica genérica) ——
  { key: "meio_ano_propina", label: "Propina proporcional (entrada a meio do ano)", categoria: "Meio do ano", modelo: "meio_ano", defaultValue: 0 },
  { key: "meio_ano_taxas", label: "Taxas de inscrição (entrada a meio do ano)", categoria: "Meio do ano", modelo: "meio_ano", defaultValue: 0 },
];

export function catalogoPorCategoria(): { categoria: string; items: CatalogItem[] }[] {
  const map = new Map<string, CatalogItem[]>();
  for (const it of CATALOGO_RUBRICAS) {
    const list = map.get(it.categoria) || [];
    list.push(it);
    map.set(it.categoria, list);
  }
  return [...map.entries()].map(([categoria, items]) => ({ categoria, items }));
}

export function findCatalogItem(key: string): CatalogItem | undefined {
  return CATALOGO_RUBRICAS.find((c) => c.key === key);
}

export function linhasFromCatalog(
  keys: string[],
  valores: Record<string, number>,
): DocumentoLinha[] {
  return keys
    .map((key) => {
      const c = findCatalogItem(key);
      if (!c) return null;
      const value = Number(valores[key] ?? c.defaultValue ?? 0) || 0;
      return { key, label: c.label, value, on: value > 0 || true } as DocumentoLinha;
    })
    .filter(Boolean) as DocumentoLinha[];
}

/** Numeração SEC-AAAA-MM-NNN ou ATL-… */
export function nextNumeroModelo(
  modelo: DocumentoAlunoModelo,
  mesKey: string,
  existentes: { numero?: string }[],
): string {
  const prefix =
    modelo === "secretaria"
      ? "SEC"
      : modelo === "atl_explicacao" || modelo === "atl_actividades"
        ? "ATL"
        : modelo === "meio_ano"
          ? "MEA"
          : "DOC";
  const key = mesKey || new Date().toISOString().slice(0, 7);
  const re = new RegExp(`^${prefix}-${key}-(\\d{3,})$`);
  let max = 0;
  for (const f of existentes) {
    const m = String(f.numero || "").match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${key}-${String(max + 1).padStart(3, "0")}`;
}
