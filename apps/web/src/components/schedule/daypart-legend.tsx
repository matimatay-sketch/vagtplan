import { DAYPARTS } from "@/lib/domain/daypart";
import { da } from "@/lib/i18n/da";

/** Explains the shift colours: the part of the day a shift starts in. */
export function DaypartLegend() {
  return (
    <ul
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
      aria-label={da.dayparts.legend}
      data-testid="daypart-legend"
    >
      {DAYPARTS.map((d, i) => (
        <li key={d.part} data-daypart={d.part} className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-1.5 rounded-full bg-(color:--dp)" />
          <span>
            {da.dayparts[d.part]}{" "}
            <span className="tabular">
              {d.from}–{DAYPARTS[(i + 1) % DAYPARTS.length]!.from}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
