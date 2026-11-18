import { apiRoute, dbError, json, ApiError } from "@/lib/api/handler";
import { employeeNumbers, postingCodes, rangeOf } from "@/lib/api/util";

type Snapshot = {
  employee_id: string | null;
  start_at: string;
  end_at: string;
  breaks?: { start_at: string | null; minutes: number; paid: boolean }[];
  kind?: string;
  label?: string | null;
  posting_allocations?: {
    values: Record<string, string>;
    start_at: string | null;
    end_at: string | null;
    minutes: number | null;
  }[];
};

/** The published schedule (what employees see), by start time. */
export const GET = apiRoute("schedule.read", async (ctx) => {
  const r = rangeOf(ctx);
  const department = ctx.url.searchParams.get("department_id");
  if (department && !/^[0-9a-f-]{36}$/i.test(department))
    throw new ApiError(400, "invalid_query", "department_id must be an id");
  // The working copy may have moved; read a day around the range and filter on the published times.
  const pad = 86_400_000;
  let query = ctx.db
    .from("shift")
    .select("id, department_id, published")
    .eq("organization_id", ctx.organizationId)
    .is("archived_at", null)
    .not("published", "is", null)
    .gte("start_at", new Date(Date.parse(r.fromIso) - pad).toISOString())
    .lt("start_at", new Date(Date.parse(r.toIso) + pad).toISOString());
  if (department) query = query.eq("department_id", department);
  const { data, error } = await query;
  if (error) throw dbError(error);
  const rows = (data ?? [])
    .map((s) => ({
      id: s.id,
      department_id: s.department_id,
      p: s.published as unknown as Snapshot,
    }))
    .filter(
      (s) =>
        Date.parse(s.p.start_at) >= Date.parse(r.fromIso) &&
        Date.parse(s.p.start_at) < Date.parse(r.toIso),
    )
    .sort((a, b) => Date.parse(a.p.start_at) - Date.parse(b.p.start_at));
  const [numbers, codes] = await Promise.all([
    employeeNumbers(
      ctx,
      rows.map((s) => s.p.employee_id),
    ),
    postingCodes(ctx),
  ]);
  return json({
    data: rows.map((s) => ({
      id: s.id,
      department_id: s.department_id,
      employee_id: s.p.employee_id,
      employee_number: s.p.employee_id ? (numbers.get(s.p.employee_id) ?? null) : null,
      start_at: s.p.start_at,
      end_at: s.p.end_at,
      kind: s.p.kind ?? "work",
      label: s.p.label ?? null,
      breaks: (s.p.breaks ?? []).map((b) => ({
        start_at: b.start_at,
        minutes: b.minutes,
        paid: b.paid,
      })),
      posting: (s.p.posting_allocations ?? []).map((a) => ({
        values: codes(a.values),
        start_at: a.start_at,
        end_at: a.end_at,
        minutes: a.minutes,
      })),
    })),
  });
});
