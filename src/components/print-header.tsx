/** Cabeçalho com logo oficial para documentos impressos (recibos, DRE, lançamentos, etc.). */
export function PrintHeader({
  title,
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <header className="print-header mb-4 flex items-center gap-4 border-b border-[var(--color-line-strong)] pb-3">
      <img
        src="/logo-escola.png"
        alt="École Consulaire du Congo"
        className="h-16 w-16 object-contain sm:h-20 sm:w-20"
      />
      <div className="min-w-0 flex-1">
        <p className="font-display text-base leading-tight text-[var(--color-ink)] sm:text-lg">
          École Consulaire du Congo (Brazzaville) de Luanda
        </p>
        <p className="text-[11px] text-[var(--color-muted)] sm:text-xs">
          Escola de Ensino Francês · Estabelecimento Consular · Filial Nova Vida · Luanda, Angola
        </p>
        {title ? <p className="mt-1 text-sm font-medium text-[var(--color-forest)]">{title}</p> : null}
        {subtitle ? <p className="text-xs text-[var(--color-muted)]">{subtitle}</p> : null}
      </div>
    </header>
  );
}
