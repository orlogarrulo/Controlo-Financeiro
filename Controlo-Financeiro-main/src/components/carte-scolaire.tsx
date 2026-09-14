import { ECOLE_CARTE, type CarteScolaireData } from "@/lib/carte-scolaire";

function CongoFlag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 90 60" className={className} aria-hidden>
      <rect width="90" height="60" fill="#009543" />
      <polygon points="90,0 30,0 90,45" fill="#FBDE4A" />
      <polygon points="90,15 50,60 90,60" fill="#DC241F" />
    </svg>
  );
}

function Arms({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <circle cx="32" cy="32" r="30" fill="#1a4d2e" stroke="#c9a227" strokeWidth="3" />
      <circle cx="32" cy="32" r="22" fill="#f4f1e8" />
      <text
        x="32"
        y="28"
        textAnchor="middle"
        fontSize="9"
        fontWeight="700"
        fill="#1a4d2e"
      >
        Rép.
      </text>
      <text
        x="32"
        y="40"
        textAnchor="middle"
        fontSize="8"
        fontWeight="700"
        fill="#1a4d2e"
      >
        Congo
      </text>
    </svg>
  );
}

export function CarteScolaire({
  data,
  className = "",
}: {
  data: CarteScolaireData;
  className?: string;
}) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=4&data=${encodeURIComponent(data.qrPayload)}`;

  return (
    <article
      className={`carte-scolaire relative overflow-hidden rounded-xl border border-zinc-200 bg-white text-[#1a1a1a] shadow-md ${className}`}
      style={{
        width: 420,
        minHeight: 264,
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}
    >
      <div className="flex items-start justify-between gap-2 px-3 pt-3">
        <CongoFlag className="h-9 w-14 shrink-0 rounded-sm border border-black/10" />
        <div className="flex-1 text-center leading-tight">
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
        <Arms className="h-12 w-12 shrink-0" />
      </div>

      <div className="mt-2 grid grid-cols-[96px_1fr] gap-3 px-3 pb-2">
        <div className="flex flex-col gap-2">
          <div className="h-[108px] w-[86px] overflow-hidden rounded-sm border border-zinc-300 bg-zinc-100">
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
          <img src={qrSrc} alt="" className="h-[72px] w-[72px] border border-zinc-200 bg-white" />
        </div>

        <div className="text-[11px] leading-[1.55]">
          <Row label="Noms & Prénoms" value={data.nomPrenoms} accent />
          <Row label="Date de Naissance" value={data.dateNaissance} />
          <Row label="Lieu de Naissance" value={data.lieuNaissance} />
          <Row label="Sexe" value={data.sexe} />
          <Row label="Classe" value={data.classe} />
          <Row label="Matricule" value={data.matricule} />
          <Row label="Année Scolaire" value={data.anneeScolaire} />
        </div>
      </div>

      <div className="flex items-end justify-between px-3 pb-3">
        <div className="text-[10px] text-zinc-600">Validité: {data.validite}</div>
        <div className="text-right">
          <div className="text-[10px] text-zinc-600">{ECOLE_CARTE.proviseur}</div>
          <div className="mt-1 h-8 w-24 rounded-full border border-red-300/80 opacity-70" />
        </div>
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

/** Campos do formulário de matrícula (francês no cartão; etiquetas PT na ficha). */
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
