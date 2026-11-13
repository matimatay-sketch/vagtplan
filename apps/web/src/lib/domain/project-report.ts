import type { DbBreak } from "./breaks";
import { projectMinutes, type ProjectAllocation } from "./projects";
import { localParts } from "./schedule-time";

/** A row from the `project_shifts` RPC. */
export type ProjectShiftRow = {
  id: string;
  department_id: string;
  department_name: string;
  employee_id: string | null;
  employee_number: string | null;
  employee_name: string | null;
  start_at: string;
  end_at: string;
  breaks: DbBreak[];
  project_allocations: ProjectAllocation[];
  status: "draft" | "published";
  kind: "work" | "on_call";
};

export type ProjectLine = {
  projectId: string;
  shiftId: string;
  /** Local start date of the shift. */
  date: string;
  start: string;
  end: string;
  employeeId: string | null;
  employeeNumber: string | null;
  employeeName: string | null;
  departmentName: string;
  status: "draft" | "published";
  minutes: number;
};

/** One line per project and shift. Time without a project is left out. */
export function projectLines(rows: readonly ProjectShiftRow[]): ProjectLine[] {
  return rows.flatMap((r) =>
    projectMinutes({ start: r.start_at, end: r.end_at, breaks: r.breaks }, r.project_allocations)
      .filter((m): m is { projectId: string; minutes: number } => m.projectId !== null)
      .map((m) => ({
        projectId: m.projectId,
        shiftId: r.id,
        date: localParts(r.start_at).date,
        start: r.start_at,
        end: r.end_at,
        employeeId: r.employee_id,
        employeeNumber: r.employee_number,
        employeeName: r.employee_name,
        departmentName: r.department_name,
        status: r.status,
        minutes: m.minutes,
      })),
  );
}

export type ProjectSummary = {
  projectId: string;
  minutes: number;
  shiftCount: number;
  employees: { employeeId: string | null; name: string | null; minutes: number }[];
};

/** Totals per project and per employee, in first-appearance order. */
export function summarizeProjects(lines: readonly ProjectLine[]): ProjectSummary[] {
  const out = new Map<string, ProjectSummary & { shifts: Set<string> }>();
  for (const l of lines) {
    let p = out.get(l.projectId);
    if (!p) {
      p = { projectId: l.projectId, minutes: 0, shiftCount: 0, employees: [], shifts: new Set() };
      out.set(l.projectId, p);
    }
    p.minutes += l.minutes;
    p.shifts.add(l.shiftId);
    const e = p.employees.find((x) => x.employeeId === l.employeeId);
    if (e) e.minutes += l.minutes;
    else p.employees.push({ employeeId: l.employeeId, name: l.employeeName, minutes: l.minutes });
  }
  return [...out.values()].map(({ shifts, ...p }) => ({ ...p, shiftCount: shifts.size }));
}

/** Minutes as Danish decimal hours with two decimals ("7,50"), using integer maths. */
export function decimalHours(minutes: number): string {
  const whole = Math.floor(minutes / 60);
  const hundredths = Math.round(((minutes % 60) * 100) / 60);
  return `${whole},${String(hundredths).padStart(2, "0")}`;
}
