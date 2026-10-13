"use client";

import { ChevronLeft, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, type ReactNode } from "react";
import { LinkButton } from "@/components/link-button";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export { LinkButton } from "@/components/link-button";

export function PageHeader({
  title,
  back,
  actions,
  className,
}: {
  title: ReactNode;
  back?: string | true;
  actions?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const t = useTranslations("common");
  return (
    <header className={cn("pt-safe sticky top-0 z-20 -mx-4 mb-2 bg-background/90 px-4 backdrop-blur", className)}>
      <div className="flex min-h-14 items-center gap-2">
        {back &&
          (typeof back === "string" ? (
            <LinkButton href={back} variant="ghost" size="icon" aria-label={t("back")}>
              <ChevronLeft />
            </LinkButton>
          ) : (
            <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label={t("back")}>
              <ChevronLeft />
            </Button>
          ))}
        <h1 className="flex-1 truncate text-2xl font-bold uppercase">{title}</h1>
        {actions}
      </div>
    </header>
  );
}

export function Section({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2">
          {title && <h2 className="text-lg font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Card({ className, children, ...rest }: React.ComponentProps<"div">) {
  return (
    <div className={cn("rounded-2xl border bg-card p-4 text-card-foreground", className)} {...rest}>
      {children}
    </div>
  );
}

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed p-6 text-center text-muted-foreground">
      <p>{children}</p>
      {action}
    </div>
  );
}

/** Accessible segmented control (radio-group semantics). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex rounded-xl bg-muted p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-11 flex-1 rounded-lg px-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            value === o.value ? "bg-background text-foreground shadow-sm dark:bg-secondary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Native select: best picker UX on phones, accessible by default. */
export function NativeSelect({
  label,
  value,
  onChange,
  children,
  className,
  hideLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  className?: string;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={id} className={cn("text-sm font-medium", hideLabel && "sr-only")}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 [&>option]:bg-popover"
      >
        {children}
      </select>
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: ReactNode;
  onConfirm: () => void | Promise<void>;
  destructive?: boolean;
}) {
  const t = useTranslations("common");
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={async () => {
              await onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Polite paywall: says what you get, never hides existing data. */
export function PaywallCard({ reason, className }: { reason: ReactNode; className?: string }) {
  const t = useTranslations("premium");
  useEffect(() => {
    track("paywall_viewed", { reason: typeof reason === "string" ? reason : "feature" });
  }, [reason]);
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl border border-primary/40 bg-accent/40 p-4", className)}>
      <Lock className="mt-0.5 size-5 shrink-0 text-accent-foreground" aria-hidden />
      <div className="flex-1 space-y-2">
        <p className="text-sm font-semibold">{t("locked")}</p>
        <p className="text-sm text-muted-foreground">{reason}</p>
        <LinkButton href="/premium" size="sm">
          {t("seePremium")}
        </LinkButton>
      </div>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="num text-3xl leading-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
