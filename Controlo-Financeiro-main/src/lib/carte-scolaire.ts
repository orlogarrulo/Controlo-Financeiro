import type { Aluno } from "@/data/types";

export const ANO_LECTIF_CARTE = "2026-2027";

export const ECOLE_CARTE = {
  /** Linha 1 do cabeçalho impresso */
  nom: "École Consulaire De La République Du Congo",
  /** Linha 2 (annexe) */
  nom2: "annexe Nova Vida",
  titre: "CARTE SCOLAIRE",
  proviseur: "Le Proviseur",
};

const PRENOMS_FEMININS = new Set(
  [
    "kaila",
    "wendy",
    "eloá",
    "eloa",
    "kesane",
    "ivanna",
    "belangela",
    "graciela",
    "louisa",
    "maria",
    "ana",
    "sofia",
    "sophia",
    "lara",
    "laura",
    "julia",
    "júlia",
    "beatriz",
    "ines",
    "inês",
    "isabel",
    "isabelle",
    "camila",
    "carla",
    "daniela",
    "diana",
    "eva",
    "fatima",
    "fátima",
    "helena",
    "irene",
    "joana",
    "lucia",
    "lúcia",
    "luisa",
    "luísa",
    "margarida",
    "marta",
    "patricia",
    "patrícia",
    "paula",
    "rita",
    "sara",
    "teresa",
    "valentina",
    "victoria",
    "vitória",
    "yasmin",
    "ayanna",
    "chayane",
    "aimé",
    "aime",
  ].map((s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()),
);

const PRENOMS_MASCULINS = new Set(
  [
    "pedro",
    "nathaniel",
    "hazail",
    "erick",
    "gael",
    "keane",
    "ivander",
    "marciel",
    "kuami",
    "imayami",
    "crisber",
    "christian",
    "abdel",
    "william",
    "jose",
    "josé",
    "joao",
    "joão",
    "miguel",
    "tiago",
    "diego",
    "daniel",
    "david",
    "andre",
    "andré",
    "carlos",
    "francisco",
    "gabriel",
    "lucas",
    "mateus",
    "matheus",
    "paulo",
    "rafael",
    "samuel",
    "simon",
    "simão",
    "victor",
    "vitor",
    "henriques",
    "ondjaki",
    "uluwami",
    "suriel",
    "uziel",
    "hazael",
    "hanji",
    "libanio",
    "libânio",
    "antonio",
    "antónio",
  ].map((s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()),
);

function normToken(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z]/g, "");
}

/** Infere Féminin / Masculin a partir do primeiro nome. Não inventa se for ambíguo. */
export function inferSexoFromNome(nome: string | undefined): "Féminin" | "Masculin" | "" {
  if (!nome) return "";
  const first = normToken(nome.trim().split(/\s+/)[0] || "");
  if (!first) return "";
  if (PRENOMS_FEMININS.has(first)) return "Féminin";
  if (PRENOMS_MASCULINS.has(first)) return "Masculin";
  return "";
}

export function formatDateFr(iso?: string) {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export type CarteScolaireData = {
  nomPrenoms: string;
  dateNaissance: string;
  lieuNaissance: string;
  sexe: string;
  classe: string;
  matricule: string;
  anneeScolaire: string;
  validite: string;
  photo?: string;
  qrPayload: string;
};

export function alunoToCarte(
  aluno: Pick<
    Aluno,
    "id" | "nome" | "dataNascimento" | "lugarNascimento" | "sexo" | "turma" | "foto"
  >,
  annee = ANO_LECTIF_CARTE,
): CarteScolaireData {
  const sexe = aluno.sexo || inferSexoFromNome(aluno.nome);
  return {
    nomPrenoms: (aluno.nome || "—").toUpperCase(),
    dateNaissance: formatDateFr(aluno.dataNascimento),
    lieuNaissance: aluno.lugarNascimento?.trim() || "—",
    sexe: sexe || "—",
    classe: aluno.turma || "—",
    matricule: aluno.id || "—",
    anneeScolaire: annee,
    validite: annee,
    photo: aluno.foto,
    qrPayload: `ECC|${aluno.id || ""}|${annee}|${aluno.nome || ""}`,
  };
}

export function enrichAlunoCarteFields<T extends Partial<Aluno>>(aluno: T): T {
  const sexo =
    aluno.sexo && aluno.sexo !== ""
      ? aluno.sexo
      : inferSexoFromNome(aluno.nome);
  return {
    ...aluno,
    sexo: sexo || aluno.sexo || "",
    lugarNascimento: aluno.lugarNascimento ?? "",
  };
}
