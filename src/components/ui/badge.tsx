import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide",
  {
    variants: {
      variant: {
        default: "bg-[var(--color-forest-soft)] text-[var(--color-forest-deep)]",
        muted: "bg-[var(--color-line)] text-[var(--color-ink-soft)]",
        danger: "bg-[var(--color-clay-soft)] text-[var(--color-clay)]",
        warn: "bg-[var(--color-amber-soft)] text-[var(--color-amber)]",
        outline: "border border-[var(--color-line-strong)] text-[var(--color-ink-soft)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
