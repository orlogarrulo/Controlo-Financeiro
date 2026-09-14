import { ECOLE_CARTE, type CarteScolaireData } from "@/lib/carte-scolaire";
import { escolaLogoSrc } from "@/lib/logo-escola";

const LEMA = "Apprendre · Grandir · Réussir";
const LIEU = "Luanda · Angola";

export function CarteScolaire({
  data,
  className = "",
  logoSrc,
}: {
  data: CarteScolaireData;
  className?: string;
  /** Opcional: data-URL ou caminho do logotipo. */
  logoSrc?: string;
}) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=2&data=${encodeURIComponent(data.qrPayload)}`;
  const logo = logoSrc || escolaLogoSrc() || "/logo-ecole-consulaire-print.png";

  return (
    <article
      className={`carte-scolaire relative overflow-hidden rounded-xl border border-zinc-200 bg-white text-[#1a1a1a] shadow-md ${className}`}
      style={{
        width: 420,
        minHeight: 270,
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}
    >
      <div className="grid grid-cols-[56px_1fr_88px] items-center gap-2 px-3 pt-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt="Logo"
          className="h-14 w-14 object-contain rounded-md bg-white"
        />
        <div className="text-center leading-tight">
          <div className="text-[10px] font-bold uppercase tracking-wide text-[#1a4d2e]">
            {ECOLE_CARTE.nom}
          </div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-[#1a4d2e]">
            {ECOLE_CARTE.nom2}
          </div>
          <div className="mt-1 text-[15px] font-extrabold uppercase tracking-wider text-[#2e7d32]">
            {ECOLE_CARTE.titre}
          </div>
        </div>
        <div className="text-right leading-tight font-sans">
          <div className="text-[9px] font-bold uppercase tracking-wide text-[#1e3a5f]">
            {LEMA}
          </div>
          <div className="mt-0.5 text-[10px] font-semibold text-[#c9a227]">
            {LIEU}
          </div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-[88px_1fr] gap-3 px-3 pb-1">
        <div className="flex flex-col items-center gap-1.5">
          <div className="h-[100px] w-[80px] overflow-hidden rounded-sm border border-zinc-300 bg-zinc-100">
            {data.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-[9px] text-zinc-400">
                Photo
              </div>
            )}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrSrc}
            alt="QR"
            className="h-[64px] w-[64px] shrink-0 bg-white object-contain"
          />
        </div>

        <div className="text-[11px] leading-[1.55]">
          <Row label="Noms & Prénoms" value={data.nomPrenoms} accent />
          <Row label="Date de Naissance" value={data.dateNaissance} />
          <Row label="Lieu de Naissance" value={data.lieuNaissance} />
          <Row label="Sexe" value={data.sexe} />
          <Row label="Classe" value={data.classe} />
          <Row label="Matricule" value={data.matricule} />
          <Row label="Année Scolaire" value={data.anneeScolaire} />
          <Row label="Validité" value={data.validite} />
        </div>
      </div>

      <div className="flex items-end justify-end px-3 pb-3 pt-1">
        <div className="text-right text-[10px] text-zinc-600">{ECOLE_CARTE.proviseur}</div>
      </div>
    </article>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <span className="text-zinc-600">{label}: </span>
      <span className={accent ? "font-bold uppercase text-[#b42318]" : "font-semibold"}>
        {value}
      </span>
    </div>
  );
}

/** Campos do formulário de matrícula (francês no cartão; etiquetas na ficha). */
export function CarteScolaireFormFields({
  lugarNascimento,
  sexo,
  onChange,
}: {
  lugarNascimento: string;
  sexo: string;
  onChange: (patch: { lugarNascimento?: string; sexo?: "Féminin" | "Masculin" | "" }) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">
        <span>Lieu de naissance</span>
        <input
          className="h-11 rounded-md border border-zinc-300 bg-white px-3"
          value={lugarNascimento}
          onChange={(e) => onChange({ lugarNascimento: e.target.value })}
          placeholder="ex. Luanda"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span>Sexe</span>
        <select
          className="h-11 rounded-md border border-zinc-300 bg-white px-3"
          value={sexo}
          onChange={(e) =>
            onChange({ sexo: e.target.value as "Féminin" | "Masculin" | "" })
          }
        >
          <option value="">—</option>
          <option value="Féminin">Féminin</option>
          <option value="Masculin">Masculin</option>
        </select>
      </label>
    </div>
  );
}
