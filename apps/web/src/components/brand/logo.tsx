import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Logo mark: a clock face cut by a shift bar. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <rect width="32" height="32" rx="9" className="fill-signal" />
      <circle
        cx="16"
        cy="16"
        r="9"
        fill="none"
        strokeWidth="2.5"
        className="stroke-signal-foreground"
      />
      <path
        d="M16 10v6l4 2.5"
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="stroke-signal-foreground"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-display text-lg font-semibold tracking-tight">{brand.name}</span>
    </span>
  );
}
