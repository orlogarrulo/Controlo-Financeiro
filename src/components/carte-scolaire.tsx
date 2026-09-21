import { ECOLE_CARTE, type CarteScolaireData } from "@/lib/carte-scolaire";
import { escolaLogoSrc } from "@/lib/logo-escola";

/**
 * Pré-visualização geométrica ISO ID-1 (proporção 85,6 × 54).
 * 3 faixas: cabeçalho · corpo (foto|dados) · rodapé (QR|Proviseur).
 */
export function CarteScolaire({
  data,
  className = "",
  logoSrc,
}: {
  data: CarteScolaireData;
  className?: string;
  logoSrc?: string;
}) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=2&ecc=M&data=${encodeURIComponent(data.qrPayload)}`;
  const logo = logoSrc || escolaLogoSrc() || "/logo-carte-scolaire.jpg";

  return (
    <article
      className={`carte-scolaire relative overflow-hidden rounded-[10px] border border-[#009543] bg-white text-[#0B1F4A] shadow-md ${className}`}
      style={{
        width: 342,
        height: 216,
        fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
        display: "grid",
        gridTemplateRows: "52px 1fr 48px",
        padding: "14px 10px 8px",
        boxSizing: "border-box",
      }}
    >
      <div
        className="absolute left-0 right-0 top-0"
        style={{
          height: 8,
          background:
            "linear-gradient(90deg, #009543 0%, #009543 33%, #FBDE4A 33%, #FBDE4A 66%, #DC241F 66%, #DC241F 100%)",
        }}
      />

      <div
        className="grid items-center gap-2"
        style={{ gridTemplateColumns: "48px 1fr auto" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt="Logo"
          className="h-12 w-12 rounded object-contain bg-white"
        />
        <div className="min-w-0">
          <div className="text-[11px] font-bold leading-tight">
            École Consulaire
            <br />
            de la République du Congo
          </div>
          <div className="mt-0.5 text-[9px] font-semibold text-[#009543]">
            Annexe Nova Vida · Luanda
          </div>
        </div>
        <span className="rounded bg-[#009543] px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white">
          Élève
        </span>
      </div>

      <div
        className="grid items-center gap-2.5 border-y border-zinc-200 py-2"
        style={{ gridTemplateColumns: "80px 1fr 48px", minHeight: 0 }}
      >
        <div className="flex items-center justify-center">
          <div className="flex h-[96px] w-[80px] items-center justify-center overflow-hidden rounded border border-zinc-300 bg-zinc-100">
            {data.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-center text-[9px] leading-tight text-zinc-400">
                Sans
                <br />
                photo
              </span>
            )}
          </div>
        </div>
        <div className="flex min-w-0 flex-col justify-between">
          <div>
            <p className="mb-1 text-[13px] font-bold uppercase leading-tight">
              {data.nomPrenoms}
            </p>
            <Meta label="Classe" value={data.classe} />
            <Meta label="Né(e) le" value={data.dateNaissance} />
            <Meta label="Lieu" value={data.lieuNaissance} />
            <Meta label="Sexe" value={data.sexe} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#009543]">
              Matricule {data.matricule}
            </span>
            <span className="rounded bg-[#FBDE4A] px-1.5 py-0.5 text-[9px] font-semibold">
              {data.anneeScolaire}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrSrc}
            alt="QR"
            className="h-11 w-11 rounded-sm bg-white object-contain"
          />
        </div>
      </div>

      <div className="flex items-end justify-end pt-1">
        <div className="w-[110px] text-center">
          <div className="mb-0.5 h-4 border-b border-zinc-400" />
          <div className="text-[9px] font-semibold text-zinc-600">
            {ECOLE_CARTE.proviseur}
          </div>
        </div>
      </div>
    </article>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid text-[10px] leading-snug" style={{ gridTemplateColumns: "56px 1fr" }}>
      <span className="font-medium text-zinc-500">{label}</span>
      <span className="font-semibold">{value || "—"}</span>
    </div>
  );
}

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
