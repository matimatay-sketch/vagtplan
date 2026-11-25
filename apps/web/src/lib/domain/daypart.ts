import { localParts } from "./schedule-time";

/**
 * The part of the day a shift starts in, by its local time in Copenhagen.
 * Only for display: the schedule colours shifts by it ("Døgnet"). It has
 * nothing to do with pay windows, which come from the agreement.
 */
export type Daypart = "morning" | "day" | "evening" | "night";

/** In the order of the day; each part runs until the next one starts. */
export const DAYPARTS: readonly { part: Daypart; from: string }[] = [
  { part: "morning", from: "06:00" },
  { part: "day", from: "11:00" },
  { part: "evening", from: "15:00" },
  { part: "night", from: "21:00" },
];

export function daypartOf(startIso: string | number | Date): Daypart {
  const time = localParts(startIso).time;
  let part: Daypart = "night";
  for (const d of DAYPARTS) if (time >= d.from) part = d.part;
  return part;
}
