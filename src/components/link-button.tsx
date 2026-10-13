import type { VariantProps } from "class-variance-authority";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A Next.js link styled as a button (keeps link semantics for screen readers). */
export function LinkButton({
  href,
  children,
  variant,
  size,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> & { href: string } & VariantProps<typeof buttonVariants>) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </Link>
  );
}
