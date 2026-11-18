import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { AppContext } from "@/lib/auth";
import {
  addDays,
  daysInMonth,
  isValidIsoDate,
  makeIsoDate,
  parseIsoDate,
  todayIn,
  type IsoDate,
} from "@/lib/domain/civil-date";
import { zonedTime } from "@/lib/domain/schedule-time";
import { projectLines, type ProjectLine, type ProjectShiftRow } from "@/lib/domain/project-report";
import { canInDepartment } from "@/lib/permissions";

export type ReportProject = {
  id: string;
  number: string;
  name: string;
  customer: string | null;
  archived: boolean;
  departmentIds: string[];
};

/** The organization's project dimension ("Projekt"), if any. */
export async function loadProjectDimension(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
): Promise<{ id: string; key: string; name: string } | null> {
  const { data } = await supabase
    .from("posting_dimension")
    .select("id, key, name")
    .eq("organization_id", organizationId)
    .eq("is_project", true)
    .is("archived_at", null)
    .maybeSingle();
  return data ?? null;
}

export type ReportFilter = {
  from: IsoDate;
  to: IsoDate;
  departmentId: string | null;
  /** Planned shifts or registered time. */
  source: "plan" | "actual";
};

/** Reads ?fra=&til=&afdeling= with the current month as default. At most a year. */
export function reportFilter(
  sp: Record<string, string | string[] | undefined>,
  timezone: string,
): ReportFilter {
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const today = todayIn(timezone);
  const { y, m } = parseIsoDate(today);
  let from = isValidIsoDate(str(sp.fra)) ? str(sp.fra) : makeIsoDate(y, m, 1);
  let to = isValidIsoDate(str(sp.til)) ? str(sp.til) : makeIsoDate(y, m, daysInMonth(y, m));
  if (to < from) [from, to] = [to, from];
  if (to > addDays(from, 366)) to = addDays(from, 366);
  return {
    from,
    to,
    departmentId: str(sp.afdeling) || null,
    source: str(sp.kilde) === "registreret" ? "actual" : "plan",
  };
}

export async function loadProjectReport(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ctx: AppContext,
  filter: ReportFilter,
) {
  const dimension = await loadProjectDimension(supabase, ctx.organization.id);
  const [{ data: projects }, { data: departments }, rows] = await Promise.all([
    dimension
      ? supabase
          .from("posting_value")
          .select(
            "id, code, name, description, archived_at, posting_value_department (department_id)",
          )
          .eq("dimension_id", dimension.id)
          .order("code")
      : Promise.resolve({ data: [] }),
    supabase
      .from("department")
      .select("id, name")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("name"),
    ctx.permissions["projects.view"] && dimension
      ? supabase.rpc(filter.source === "actual" ? "project_time_entries" : "project_shifts", {
          p_from: new Date(zonedTime(filter.from)).toISOString(),
          p_to: new Date(zonedTime(addDays(filter.to, 1))).toISOString(),
        })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (rows.error) throw new Error(rows.error.message);

  const visibleDepartments = (departments ?? []).filter((d) =>
    canInDepartment(ctx.permissions, "projects.view", d.id, ctx.responsibleDepartmentIds),
  );
  const shiftRows = ((rows.data ?? []) as unknown as ProjectShiftRow[]).filter(
    (r) => !filter.departmentId || r.department_id === filter.departmentId,
  );
  const lines: ProjectLine[] = (dimension ? projectLines(dimension.id, shiftRows) : []).sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.start.localeCompare(b.start) ||
      (a.employeeName ?? "").localeCompare(b.employeeName ?? "", "da"),
  );
  return {
    dimension,
    projects: (projects ?? []).map((p): ReportProject => ({
      id: p.id,
      number: p.code,
      name: p.name,
      customer: p.description,
      archived: p.archived_at !== null,
      departmentIds: p.posting_value_department.map((d) => d.department_id),
    })),
    departments: departments ?? [],
    visibleDepartments,
    lines,
  };
}
