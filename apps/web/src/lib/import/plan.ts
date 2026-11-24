import "server-only";
import { leaveAccruals, leaveTypes } from "@vagtplan/rules-engine";
import type { AppContext } from "@/lib/auth";
import { canIn } from "@/lib/auth";
import { hasAny } from "@/lib/permissions";
import type { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/domain/civil-date";
import { balances, formatDays } from "@/lib/domain/leave";
import { localInstants } from "@/lib/schedule/breaks";
import { formatDate } from "@/lib/format";
import { engineInputs, ensureAccruals } from "@/lib/absence/load";
import {
  parseCsv,
  readImport,
  type ImportKind,
  type ImportProblem,
  type ImportRow,
} from "@/lib/domain/csv-import";
import { da } from "@/lib/i18n/da";

type Client = Awaited<ReturnType<typeof createClient>>;

export type BalanceMode = "set" | "adjust";
export type PlannedRow = {
  line: number;
  action: "create" | "update" | "skip" | "error";
  summary: string;
  message?: string;
};
export type ImportPlan = {
  kind: ImportKind;
  rows: PlannedRow[];
  /** Problems in the file itself (columns, values). */
  problems: ImportProblem[];
  fatal: boolean;
  /** What the database function receives (only rows that change something). */
  payload: Record<string, unknown>[];
};

const t = da.importCsv;
const key = (s: string) => s.trim().toLowerCase();
const str = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => (typeof v === "number" ? v : null);

/** The plan for a file: what each line will do, checked against the organization's data and the user's rights. */
export async function planImport(
  supabase: Client,
  ctx: AppContext,
  kind: ImportKind,
  text: string,
  opts: { balanceMode: BalanceMode },
): Promise<ImportPlan> {
  const read = readImport(kind, parseCsv(text));
  const base = { kind, problems: read.problems, fatal: read.fatal };
  if (read.fatal) return { ...base, rows: [], payload: [] };
  const planned =
    kind === "departments"
      ? await planDepartments(supabase, ctx, read.rows)
      : kind === "employees"
        ? await planEmployees(supabase, ctx, read.rows, read.columns)
        : kind === "shifts"
          ? await planShifts(supabase, ctx, read.rows)
          : await planBalances(supabase, ctx, read.rows, opts.balanceMode);
  return { ...base, ...planned };
}

type Planned = { rows: PlannedRow[]; payload: Record<string, unknown>[] };
const error = (line: number, message: string): PlannedRow => ({
  line,
  action: "error",
  summary: "",
  message,
});

// ---------------------------------------------------------------- departments
async function planDepartments(
  supabase: Client,
  ctx: AppContext,
  rows: ImportRow[],
): Promise<Planned> {
  const { data } = await supabase
    .from("department")
    .select("id, name")
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null);
  const byName = new Map((data ?? []).map((d) => [key(d.name), d]));
  const taken = new Set(byName.keys());
  const out: Planned = { rows: [], payload: [] };
  for (const { line, values } of rows) {
    const name = str(values.name)!;
    const newName = str(values.new_name);
    const existing = byName.get(key(name));
    if (!existing) {
      if (newName) {
        out.rows.push(error(line, t.departmentMissing(name)));
        continue;
      }
      if (taken.has(key(name))) {
        out.rows.push(error(line, t.departmentTwice(name)));
        continue;
      }
      taken.add(key(name));
      out.rows.push({ line, action: "create", summary: t.createDepartment(name) });
      out.payload.push({ line, id: null, name });
      continue;
    }
    if (!newName || newName === existing.name) {
      out.rows.push({ line, action: "skip", summary: t.unchanged(existing.name) });
      continue;
    }
    if (taken.has(key(newName)) && key(newName) !== key(existing.name)) {
      out.rows.push(error(line, t.departmentTaken(newName)));
      continue;
    }
    taken.add(key(newName));
    out.rows.push({ line, action: "update", summary: t.renameDepartment(existing.name, newName) });
    out.payload.push({ line, id: existing.id, new_name: newName });
  }
  return out;
}

// ---------------------------------------------------------------- employees
type EmployeeRow = {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  email: string | null;
  phone: string | null;
  hired_on: string | null;
  employee_department: { department_id: string }[];
  contract: { valid_from: string; valid_to: string | null }[];
};

async function planEmployees(
  supabase: Client,
  ctx: AppContext,
  rows: ImportRow[],
  columns: string[],
): Promise<Planned> {
  const org = ctx.organization.id;
  const [{ data: emps }, { data: depts }, { data: agreements }, { data: groups }] =
    await Promise.all([
      supabase
        .from("employee")
        .select(
          "id, employee_number, first_name, last_name, birth_date, email, phone, hired_on, employee_department (department_id), contract (valid_from, valid_to)",
        )
        .eq("organization_id", org)
        .is("archived_at", null),
      supabase
        .from("department")
        .select("id, name")
        .eq("organization_id", org)
        .is("archived_at", null),
      supabase
        .from("agreement")
        .select("id, name, kind")
        .eq("kind", "agreement")
        .is("archived_at", null),
      supabase
        .from("pay_period_group")
        .select("id, name")
        .eq("organization_id", org)
        .is("archived_at", null),
    ]);
  const byNumber = new Map(((emps ?? []) as EmployeeRow[]).map((e) => [key(e.employee_number), e]));
  const deptByName = new Map((depts ?? []).map((d) => [key(d.name), d]));
  const agreementByName = new Map((agreements ?? []).map((a) => [key(a.name), a]));
  const groupByName = new Map((groups ?? []).map((g) => [key(g.name), g]));
  const onlyGroup = groups?.length === 1 ? groups[0] : undefined;
  const today = todayIn(ctx.organization.timezone);
  const mayContract = hasAny(ctx.permissions, ["contracts.manage"]);
  const labels = t.fields;
  const out: Planned = { rows: [], payload: [] };

  for (const { line, values: v } of rows) {
    const number = str(v.employee_number)!;
    const existing = byNumber.get(key(number));
    const deptName = str(v.department);
    const dept = deptName ? deptByName.get(key(deptName)) : undefined;
    if (deptName && !dept) {
      out.rows.push(error(line, t.departmentMissing(deptName)));
      continue;
    }
    if (dept && !canIn(ctx, "employees.manage", dept.id)) {
      out.rows.push(error(line, t.notAllowedIn(dept.name)));
      continue;
    }

    // The contract, when an agreement is given.
    let contract: Record<string, unknown> | null = null;
    let contractNote = "";
    const agreementName = str(v.agreement);
    if (agreementName) {
      const agreement = agreementByName.get(key(agreementName));
      const groupName = str(v.pay_period_group);
      const group = groupName ? groupByName.get(key(groupName)) : onlyGroup;
      const from = str(v.contract_from) ?? str(v.hired_on) ?? existing?.hired_on ?? today;
      const problem = !mayContract
        ? t.noContractRight
        : !agreement
          ? t.agreementMissing(agreementName)
          : num(v.weekly_minutes) === null
            ? t.contractNeeds(labels.weekly_minutes)
            : !str(v.pay_form)
              ? t.contractNeeds(labels.pay_form)
              : !group
                ? groupName
                  ? t.groupMissing(groupName)
                  : t.contractNeeds(labels.pay_period_group)
                : null;
      if (problem) {
        out.rows.push(error(line, problem));
        continue;
      }
      const overlaps = (existing?.contract ?? []).some((c) => !c.valid_to || c.valid_to >= from);
      if (overlaps) contractNote = t.contractExists;
      else {
        contract = {
          agreement_id: agreement!.id,
          pay_period_group_id: group!.id,
          weekly_norm_minutes: num(v.weekly_minutes),
          pay_form: str(v.pay_form),
          valid_from: from,
        };
      }
    }

    if (!existing) {
      const missing = (["first_name", "last_name", "birth_date", "department"] as const).filter(
        (k) => v[k] === null,
      );
      if (missing.length) {
        out.rows.push(error(line, t.newNeeds(missing.map((k) => labels[k]).join(", "))));
        continue;
      }
      const name = `${str(v.first_name)} ${str(v.last_name)}`;
      out.rows.push({
        line,
        action: "create",
        summary:
          t.createEmployee(name, number, dept!.name) +
          (contract ? t.withContract(formatDate(String(contract.valid_from))) : ""),
      });
      out.payload.push({
        line,
        id: null,
        employee_number: number,
        first_name: str(v.first_name),
        last_name: str(v.last_name),
        birth_date: str(v.birth_date),
        email: str(v.email),
        phone: str(v.phone),
        hired_on: str(v.hired_on),
        department_id: dept!.id,
        contract,
      });
      continue;
    }

    // A change: only the given fields that differ.
    const fields = ["first_name", "last_name", "birth_date", "email", "phone", "hired_on"] as const;
    const changed = fields.filter(
      (k) => columns.includes(k) && v[k] !== null && v[k] !== (existing[k] ?? null),
    );
    const addDept = dept && !existing.employee_department.some((d) => d.department_id === dept.id);
    const parts = [
      ...changed.map((k) => labels[k]),
      ...(addDept ? [t.addDepartment(dept.name)] : []),
      ...(contract ? [t.contractFrom(formatDate(String(contract.valid_from)))] : []),
    ];
    if (!parts.length) {
      out.rows.push({
        line,
        action: "skip",
        summary: t.noChanges(number) + (contractNote ? ` ${contractNote}` : ""),
      });
      continue;
    }
    out.rows.push({
      line,
      action: "update",
      summary:
        t.updateEmployee(number, parts.join(", ")) + (contractNote ? ` ${contractNote}` : ""),
    });
    out.payload.push({
      line,
      id: existing.id,
      ...Object.fromEntries(changed.map((k) => [k, v[k]])),
      department_id: addDept ? dept.id : null,
      contract,
    });
  }
  return out;
}

// ---------------------------------------------------------------- shifts
async function planShifts(supabase: Client, ctx: AppContext, rows: ImportRow[]): Promise<Planned> {
  const org = ctx.organization.id;
  const [{ data: emps }, { data: depts }] = await Promise.all([
    supabase
      .from("employee")
      .select("id, employee_number, first_name, last_name, employee_department (department_id)")
      .eq("organization_id", org)
      .is("archived_at", null),
    supabase
      .from("department")
      .select("id, name")
      .eq("organization_id", org)
      .is("archived_at", null),
  ]);
  const byNumber = new Map((emps ?? []).map((e) => [key(e.employee_number), e]));
  const deptByName = new Map((depts ?? []).map((d) => [key(d.name), d]));

  type Candidate = {
    line: number;
    dept: { id: string; name: string };
    emp: { id: string; first_name: string; last_name: string } | null;
    start_at: string;
    end_at: string;
    values: ImportRow["values"];
  };
  const out: Planned = { rows: [], payload: [] };
  const candidates: Candidate[] = [];
  for (const { line, values: v } of rows) {
    const dept = deptByName.get(key(str(v.department)!));
    if (!dept) {
      out.rows.push(error(line, t.departmentMissing(str(v.department)!)));
      continue;
    }
    if (!canIn(ctx, "schedule.manage", dept.id)) {
      out.rows.push(error(line, t.notAllowedIn(dept.name)));
      continue;
    }
    const number = str(v.employee_number);
    const emp = number ? byNumber.get(key(number)) : null;
    if (number && !emp) {
      out.rows.push(error(line, t.employeeMissing(number)));
      continue;
    }
    if (emp && !emp.employee_department.some((d) => d.department_id === dept.id)) {
      out.rows.push(
        error(line, t.notInDepartment(`${emp.first_name} ${emp.last_name}`, dept.name)),
      );
      continue;
    }
    const start = str(v.start)!;
    const end = str(v.end)!;
    const times = localInstants(str(v.date)!, start, end, end <= start);
    const minutes = (Date.parse(times.end_at) - Date.parse(times.start_at)) / 60_000;
    if ((num(v.break_minutes) ?? 0) >= minutes) {
      out.rows.push(error(line, t.breakTooLong));
      continue;
    }
    candidates.push({ line, dept, emp: emp ?? null, ...times, values: v });
  }

  // Shifts that already exist (same employee, same times) are skipped, so a file can be imported again.
  const starts = candidates.map((c) => c.start_at).sort();
  const { data: existing } = candidates.length
    ? await supabase
        .from("shift")
        .select("employee_id, department_id, start_at, end_at")
        .eq("organization_id", org)
        .is("archived_at", null)
        .gte("start_at", starts[0]!)
        .lte("start_at", starts[starts.length - 1]!)
    : { data: [] };
  const sig = (emp: string | null, dept: string, s: string, e: string) =>
    `${emp ?? "-"}|${dept}|${Date.parse(s)}|${Date.parse(e)}`;
  const seen = new Set(
    (existing ?? []).map((s) => sig(s.employee_id, s.department_id, s.start_at, s.end_at)),
  );
  for (const c of candidates) {
    const who = c.emp ? `${c.emp.first_name} ${c.emp.last_name}` : t.openShift;
    const summary = t.shiftSummary(
      who,
      c.dept.name,
      formatDate(str(c.values.date)!),
      `${str(c.values.start)}–${str(c.values.end)}`,
    );
    const s = sig(c.emp?.id ?? null, c.dept.id, c.start_at, c.end_at);
    if (seen.has(s)) {
      out.rows.push({ line: c.line, action: "skip", summary, message: t.shiftExists });
      continue;
    }
    seen.add(s);
    out.rows.push({ line: c.line, action: "create", summary });
    out.payload.push({
      line: c.line,
      department_id: c.dept.id,
      employee_id: c.emp?.id ?? null,
      start_at: c.start_at,
      end_at: c.end_at,
      break_minutes: num(c.values.break_minutes) ?? 0,
      kind: str(c.values.kind) ?? "work",
      label: str(c.values.label),
    });
  }
  out.rows.sort((a, b) => a.line - b.line);
  return out;
}

// ---------------------------------------------------------------- balances
async function planBalances(
  supabase: Client,
  ctx: AppContext,
  rows: ImportRow[],
  mode: BalanceMode,
): Promise<Planned> {
  const org = ctx.organization.id;
  const today = todayIn(ctx.organization.timezone);
  const { data: emps } = await supabase
    .from("employee")
    .select("id, employee_number, first_name, last_name")
    .eq("organization_id", org)
    .is("archived_at", null);
  const byNumber = new Map((emps ?? []).map((e) => [key(e.employee_number), e]));
  const ids = [
    ...new Set(
      rows
        .map((r) => byNumber.get(key(str(r.values.employee_number)!))?.id)
        .filter((x): x is string => !!x),
    ),
  ];
  // Accruals up to today are posted first, so "the balance now" is the real balance.
  const inputs = await engineInputs(supabase, ctx, ids);
  await ensureAccruals(supabase, ctx, inputs);
  const [{ data: postings }, allowed] = await Promise.all([
    supabase
      .from("leave_posting")
      .select("employee_id, account, kind, period_start, usable_until, hundredths")
      .in("employee_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    Promise.all(
      ids.map(async (id) => {
        const { data } = await supabase.rpc("can_on_employee", { perm: "absence.manage", emp: id });
        return [id, data === true] as const;
      }),
    ).then((x) => new Map(x)),
  ]);
  const norm = (s: string) => s.trim().toLowerCase();
  const out: Planned = { rows: [], payload: [] };
  const once = new Map<string, number>();
  for (const { line, values: v } of rows) {
    const number = str(v.employee_number)!;
    const emp = byNumber.get(key(number));
    if (!emp) {
      out.rows.push(error(line, t.employeeMissing(number)));
      continue;
    }
    if (!allowed.get(emp.id)) {
      out.rows.push(error(line, t.notAllowedEmployee(number)));
      continue;
    }
    const input = inputs.get(emp.id);
    const asOf = str(v.as_of) ?? today;
    let types: { code: string; label: string; hasBalance: boolean }[] = [];
    try {
      types = input ? leaveTypes(input, asOf) : [];
    } catch {
      types = [];
    }
    const wanted = norm(str(v.account)!);
    const type = types.find(
      (x) =>
        x.hasBalance &&
        [norm(x.code), norm(x.label), `${norm(x.label)}e`, `${norm(x.label)}r`].includes(wanted),
    );
    if (!type) {
      out.rows.push(
        error(
          line,
          t.accountMissing(
            str(v.account)!,
            types.filter((x) => x.hasBalance).map((x) => x.label),
          ),
        ),
      );
      continue;
    }
    const own = (postings ?? [])
      .filter((p) => p.employee_id === emp.id && p.account === type.code)
      .map((p) => ({
        account: p.account,
        kind: p.kind,
        periodStart: p.period_start,
        usableUntil: p.usable_until,
        hundredths: p.hundredths,
      }));
    let accrued: { periodStart: string; usableUntil: string }[] = [];
    try {
      accrued = input ? leaveAccruals(input, asOf).filter((p) => p.account === type.code) : [];
    } catch {
      accrued = [];
    }
    const period = [...own, ...accrued]
      .filter((p) => p.periodStart <= asOf && p.usableUntil >= asOf)
      .sort((a, b) => b.periodStart.localeCompare(a.periodStart))[0];
    if (!period) {
      out.rows.push(error(line, t.periodMissing(type.label, formatDate(asOf))));
      continue;
    }
    const sig = `${emp.id}|${type.code}|${period.periodStart}`;
    if (mode === "set" && once.has(sig)) {
      out.rows.push(error(line, t.balanceTwice(once.get(sig)!)));
      continue;
    }
    once.set(sig, line);
    const current = balances(own).find((b) => b.periodStart === period.periodStart)?.balance ?? 0;
    const value = num(v.hundredths)!;
    const delta = mode === "set" ? value - current : value;
    const who = `${emp.first_name} ${emp.last_name}`;
    const periodText = `${type.label} ${formatDate(period.periodStart)}`;
    if (delta === 0) {
      if (mode === "adjust") out.rows.push(error(line, t.zeroDays));
      else
        out.rows.push({
          line,
          action: "skip",
          summary: t.balanceSame(who, periodText, formatDays(current)),
        });
      continue;
    }
    out.rows.push({
      line,
      action: "update",
      summary: t.balanceChange(
        who,
        periodText,
        formatDays(current),
        formatDays(current + delta),
        `${delta > 0 ? "+" : "−"}${formatDays(Math.abs(delta))}`,
      ),
    });
    out.payload.push({
      line,
      employee_id: emp.id,
      account: type.code,
      period_start: period.periodStart,
      usable_until: period.usableUntil,
      hundredths: delta,
      note: str(v.note),
    });
  }
  return out;
}
