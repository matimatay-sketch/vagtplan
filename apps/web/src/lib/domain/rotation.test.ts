import { describe, expect, it } from "vitest";
import { planRollout, type RotationSlot } from "./rotation";

const slot = (
  p: Partial<RotationSlot> & Pick<RotationSlot, "lineId" | "weekIndex" | "weekday">,
): RotationSlot => ({
  id: `${p.lineId}-${p.weekIndex}-${p.weekday}`,
  startTime: "08:00",
  endTime: "16:00",
  kind: "work",
  label: null,
  breaks: [],
  supplementTypeIds: [],
  ...p,
});

describe("planRollout", () => {
  // 2-week rotation: line A works Mon in week 1 and Tue in week 2; line B works Wed in week 1.
  const slots = [
    slot({ lineId: "A", weekIndex: 0, weekday: 1 }),
    slot({ lineId: "A", weekIndex: 1, weekday: 2 }),
    slot({ lineId: "B", weekIndex: 0, weekday: 3 }),
  ];

  it("repeats the rotation over the requested weeks", () => {
    const r = planRollout({
      lengthWeeks: 2,
      slots,
      startDate: "2027-01-04",
      weeks: 3,
      assignments: [{ lineId: "A", employeeId: "e1", startWeek: 0 }],
    });
    expect(r.map((x) => [x.date, x.employeeId, x.slotId])).toEqual([
      ["2027-01-04", "e1", "A-0-1"],
      ["2027-01-12", "e1", "A-1-2"],
      ["2027-01-18", "e1", "A-0-1"],
    ]);
  });

  it("offsets an employee into the rotation and leaves unassigned lines out", () => {
    const r = planRollout({
      lengthWeeks: 2,
      slots,
      startDate: "2027-01-04",
      weeks: 2,
      assignments: [
        { lineId: "A", employeeId: "e2", startWeek: 1 },
        { lineId: "B", employeeId: null, startWeek: 0 },
      ],
    });
    expect(r.map((x) => [x.date, x.employeeId, x.slotId])).toEqual([
      ["2027-01-05", "e2", "A-1-2"],
      ["2027-01-06", null, "B-0-3"],
      ["2027-01-11", "e2", "A-0-1"],
    ]);
  });

  it("marks night shifts and breaks after midnight", () => {
    const night = [
      slot({
        lineId: "N",
        weekIndex: 0,
        weekday: 7,
        startTime: "22:00",
        endTime: "06:00",
        breaks: [{ start_time: "02:00", minutes: 30, paid: false }],
      }),
    ];
    const [x] = planRollout({
      lengthWeeks: 1,
      slots: night,
      startDate: "2027-01-04",
      weeks: 1,
      assignments: [{ lineId: "N", employeeId: "e", startWeek: 0 }],
    });
    expect(x).toMatchObject({
      date: "2027-01-10",
      endsNextDay: true,
      breaks: [{ start: "02:00", minutes: 30, paid: false, nextDay: true }],
    });
  });
});
