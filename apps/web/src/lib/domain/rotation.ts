import { addDays, type IsoDate } from "./civil-date";
import type { TemplateBreak } from "./breaks";

export type RotationSlot = {
  id: string;
  lineId: string;
  /** 0-based week in the rotation. */
  weekIndex: number;
  /** 1 = Monday … 7 = Sunday */
  weekday: number;
  startTime: string;
  endTime: string;
  kind: "work" | "on_call";
  label: string | null;
  breaks: TemplateBreak[];
  supplementTypeIds: string[];
  /** Default project for the whole shift. */
  projectId?: string | null;
};

export type RolloutAssignment = {
  lineId: string;
  /** null = open shifts (ledige vagter). */
  employeeId: string | null;
  /** Rotation week (0-based) used in the first rolled-out week. */
  startWeek: number;
};

export type PlannedSlot = {
  slotId: string;
  lineId: string;
  employeeId: string | null;
  date: IsoDate;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  kind: "work" | "on_call";
  label: string | null;
  breaks: { start: string | null; minutes: number; paid: boolean; nextDay: boolean }[];
  supplementTypeIds: string[];
  projectId: string | null;
};

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Expands a rotation into concrete shifts (local dates and wall-clock times). */
export function planRollout(input: {
  lengthWeeks: number;
  slots: readonly RotationSlot[];
  startDate: IsoDate;
  weeks: number;
  assignments: readonly RolloutAssignment[];
}): PlannedSlot[] {
  const out: PlannedSlot[] = [];
  for (let w = 0; w < input.weeks; w++) {
    for (const a of input.assignments) {
      const index =
        (((a.startWeek + w) % input.lengthWeeks) + input.lengthWeeks) % input.lengthWeeks;
      for (const s of input.slots.filter((x) => x.lineId === a.lineId && x.weekIndex === index)) {
        const start = toMin(s.startTime);
        out.push({
          slotId: s.id,
          lineId: s.lineId,
          employeeId: a.employeeId,
          date: addDays(input.startDate, 7 * w + s.weekday - 1),
          startTime: s.startTime,
          endTime: s.endTime,
          endsNextDay: toMin(s.endTime) <= start,
          kind: s.kind,
          label: s.label,
          breaks: s.breaks.map((b) => {
            const at = b.start_time ? b.start_time.slice(0, 5) : null;
            return {
              start: at,
              minutes: b.minutes,
              paid: b.paid,
              nextDay: at !== null && toMin(at) < start,
            };
          }),
          supplementTypeIds: [...s.supplementTypeIds],
          projectId: s.projectId ?? null,
        });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}
