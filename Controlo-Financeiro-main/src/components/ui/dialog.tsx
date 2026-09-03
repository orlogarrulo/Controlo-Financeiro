import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--color-ink)]/40" />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-[min(92vw,640px)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-card)]",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute top-4 right-4 rounded-full p-1 text-[var(--color-muted)] hover:bg-[var(--color-bg)]">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("font-display text-xl font-medium tracking-tight", className)}
      {...props}
    />
  );
}


export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mb-4 flex flex-col gap-1.5 pr-8 text-left", className)}
      {...props}
    />
  );
}
