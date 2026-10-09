const kzFmt = new Intl.NumberFormat("pt-AO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const kzCompact = new Intl.NumberFormat("pt-AO", {
  maximumFractionDigits: 0,
});

export function formatKz(value: number, compact = false): string {
  const n = Number.isFinite(value) ? value : 0;
  return `${(compact ? kzCompact : kzFmt).format(n)} Kz`;
}

export function formatKzShort(value: number): string {
  const n = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (n >= 1_000_000) return `${sign}${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2).replace(".", ",")} M Kz`;
  if (n >= 1_000) return `${sign}${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1).replace(".", ",")} mil`;
  return formatKz(value);
}

export function parseDate(iso: string | undefined | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(iso: string | undefined | null): string {
  const d = parseDate(iso);
  if (!d) return "—";
  return d.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateLong(iso: string | undefined | null): string {
  const d = parseDate(iso);
  if (!d) return "—";
  return d.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function todayIso(): string {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthLabel(isoOrKey: string): string {
  const key = isoOrKey.length >= 7 ? isoOrKey.slice(0, 7) : isoOrKey;
  const [y, m] = key.split("-");
  const names = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  const mi = Number(m) - 1;
  if (!y || mi < 0 || mi > 11) return isoOrKey;
  return `${names[mi]} ${y}`;
}

export function extensoKz(value: number): string {
  const n = Math.round(value);
  return `${kzFmt.format(value)} Kwanzas (${n.toLocaleString("pt-PT")} Kz)`;
}
