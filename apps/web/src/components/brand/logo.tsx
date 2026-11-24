import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * Logo mark: a 24-hour dial on night blue. The ring is the day's four parts
 * (night, morning, day, evening, the same colours as the shifts), and the hand
 * points to the start of the morning. Fixed colours, so it reads the same in
 * light and dark mode.
 */
/** The parts of the day on night blue (the dark-mode shift colours). */
export const NIGHT_DAYPART_COLORS = {
  night: "#8193d0",
  morning: "#f0b04f",
  day: "#4fb8bf",
  evening: "#a98bd6",
} as const;

const DIAL_ARCS = [
  { d: "M9.93 8.7A9.5 9.5 0 0 1 25.46 15.13", color: NIGHT_DAYPART_COLORS.night },
  { d: "M25.46 16.87A9.5 9.5 0 0 1 19.29 24.91", color: NIGHT_DAYPART_COLORS.morning },
  { d: "M17.61 25.36A9.5 9.5 0 0 1 9.93 23.3", color: NIGHT_DAYPART_COLORS.day },
  { d: "M8.7 22.07A9.5 9.5 0 0 1 8.7 9.93", color: NIGHT_DAYPART_COLORS.evening },
];

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <rect width="32" height="32" rx="8" fill="#16212e" />
      {DIAL_ARCS.map((a) => (
        <path
          key={a.d}
          d={a.d}
          fill="none"
          stroke={a.color}
          strokeWidth="3"
          strokeLinecap="round"
        />
      ))}
      <path d="M16 16L21.8 17.55" stroke="#f4fbfa" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.9" fill="#f4fbfa" />
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
