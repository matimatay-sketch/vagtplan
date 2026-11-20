import type { Metadata } from "next";
import { SubmitButton } from "@/components/form";
import { loadPostingDimensions } from "@/lib/posting/load";
import { availablePosting } from "@/lib/domain/posting";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Plus, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { RotationGrid } from "@/components/turnus/rotation-grid";
import { RerollButton, RolloutForm } from "@/components/turnus/rollout-form";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  addLineAction,
  archiveRotationAction,
  copyRotationWeekAction,
  removeLineAction,
  renameLineAction,
} from "@/lib/actions/rotation";
import { addDays, todayIn } from "@/lib/domain/civil-date";
import { weekStartOf } from "@/lib/domain/schedule-time";
import type { TemplateBreak } from "@/lib/domain/breaks";
import type { RotationSlot } from "@/lib/domain/rotation";
import { formatDate } from "@/lib/format";
import { da } from "@/lib/i18n/da";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Turnus" };

export default async function RotationPage({
  params,
  searchParams,
}: PageProps<"/vagtplan/turnus/[id]">) {
  const ctx = await requireContext(["schedule.manage"]);
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const t = da.turnus;

  const { data: rotation } = await supabase
    .from("rotation")
    .select("id, name, length_weeks, department_id, archived_at")
    .eq("id", id)
    .maybeSingle();
  if (!rotation || rotation.archived_at) notFound();
  const week = Math.min(Math.max(Number(sp.uge ?? 1) || 1, 1), rotation.length_weeks) - 1;

  const [
    { data: lines },
    { data: slots },
    { data: dept },
    { data: members },
    { data: supplements },
    { data: templates },
    { data: rollouts },
    postingDimensions,
  ] = await Promise.all([
    supabase
      .from("rotation_line")
      .select("id, name, position")
      .eq("rotation_id", id)
      .order("position"),
    supabase
      .from("rotation_slot")
      .select(
        "id, line_id, week_index, weekday, start_time, end_time, kind, label, breaks, supplement_type_ids, posting_values",
      )
      .eq("rotation_id", id)
      .order("start_time"),
    supabase.from("department").select("name").eq("id", rotation.department_id).maybeSingle(),
    supabase
      .from("employee_department")
      .select(
        "employee:employee!employee_department_organization_id_employee_id_fkey (id, first_name, last_name, archived_at)",
      )
      .eq("department_id", rotation.department_id),
    supabase
      .from("supplement_type")
      .select("id, name, amount_type, amount")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("shift_template")
      .select(
        "id, name, start_time, end_time, label, kind, breaks, supplement_type_ids, posting_values, department_id",
      )
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .or(`department_id.is.null,department_id.eq.${rotation.department_id}`)
      .order("start_time"),
    supabase
      .from("rotation_rollout")
      .select("id, start_date, weeks, assignments, created_at")
      .eq("rotation_id", id)
      .order("created_at", { ascending: false }),
    loadPostingDimensions(supabase),
  ]);
  const posting = availablePosting(postingDimensions, rotation.department_id);

  const allSlots: RotationSlot[] = (slots ?? []).map((s) => ({
    id: s.id,
    lineId: s.line_id,
    weekIndex: s.week_index,
    weekday: s.weekday,
    startTime: s.start_time.slice(0, 5),
    endTime: s.end_time.slice(0, 5),
    kind: s.kind,
    label: s.label,
    breaks: s.breaks as unknown as TemplateBreak[],
    supplementTypeIds: s.supplement_type_ids,
    postingValues: (s.posting_values ?? {}) as Record<string, string>,
  }));
  const employees = (members ?? [])
    .flatMap((m) =>
      m.employee && !m.employee.archived_at
        ? [{ id: m.employee.id, name: `${m.employee.first_name} ${m.employee.last_name}` }]
        : [],
    )
    .sort((a, b) => a.name.localeCompare(b.name, "da"));
  const lineList = (lines ?? []).map((l) => ({ id: l.id, name: l.name }));
  const nameOf = new Map(employees.map((e) => [e.id, e.name]));
  const today = todayIn(ctx.organization.timezone);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/vagtplan/turnus"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> {t.title}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {rotation.name}
            <Badge variant="secondary">
              {rotation.length_weeks === 1 ? t.weekTemplate : t.rotation(rotation.length_weeks)}
            </Badge>
            <Badge variant="outline">{dept?.name}</Badge>
          </span>
        }
        actions={
          <form action={archiveRotationAction}>
            <input type="hidden" name="id" value={rotation.id} />
            <SubmitButton variant="ghost" className="text-destructive">
              <Trash2 /> {da.common.archive}
            </SubmitButton>
          </form>
        }
      />

      {rotation.length_weeks > 1 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label={t.weeks}>
            {Array.from({ length: rotation.length_weeks }, (_, i) => (
              <Link
                key={i}
                role="tab"
                aria-selected={i === week}
                href={`/vagtplan/turnus/${id}?uge=${i + 1}`}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm",
                  i === week
                    ? "border-primary bg-secondary font-medium"
                    : "bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {t.week(i + 1)}{" "}
                <span className="text-xs text-muted-foreground">
                  ({allSlots.filter((s) => s.weekIndex === i).length})
                </span>
              </Link>
            ))}
          </div>
          <form action={copyRotationWeekAction} className="ml-auto flex items-center gap-2 text-sm">
            <input type="hidden" name="rotation_id" value={id} />
            <input type="hidden" name="from" value={week} />
            {t.copyWeek} {week + 1} {t.copyTo}
            <div className="w-28">
              <NativeSelect
                name="to"
                aria-label={`${t.copyWeek} ${t.copyTo}`}
                defaultValue={String((week + 1) % rotation.length_weeks)}
              >
                {Array.from({ length: rotation.length_weeks }, (_, i) =>
                  i === week ? null : (
                    <option key={i} value={i}>
                      {t.week(i + 1)}
                    </option>
                  ),
                )}
              </NativeSelect>
            </div>
            <SubmitButton variant="outline" size="sm">
              {t.copyWeek}
            </SubmitButton>
          </form>
        </div>
      ) : null}

      <RotationGrid
        rotationId={id}
        weekIndex={week}
        lines={lineList}
        slots={allSlots.filter((s) => s.weekIndex === week)}
        supplementTypes={(supplements ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          amountType: s.amount_type,
          amount: s.amount,
        }))}
        shiftTemplates={(templates ?? []).map((tpl) => ({
          id: tpl.id,
          name: tpl.name,
          start: tpl.start_time.slice(0, 5),
          end: tpl.end_time.slice(0, 5),
          label: tpl.label,
          kind: tpl.kind,
          breaks: tpl.breaks as unknown as TemplateBreak[],
          supplementTypeIds: tpl.supplement_type_ids,
          postingValues: (tpl.posting_values ?? {}) as Record<string, string>,
        }))}
        posting={posting}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t.lines}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {lineList.map((l) => (
              <div key={l.id} className="flex items-center gap-2">
                <form action={renameLineAction} className="flex flex-1 gap-2">
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="rotation_id" value={id} />
                  <Input name="name" defaultValue={l.name} aria-label={t.lineName} />
                  <SubmitButton variant="outline" size="sm" className="h-9">
                    {da.common.save}
                  </SubmitButton>
                </form>
                {lineList.length > 1 ? (
                  <form action={removeLineAction}>
                    <input type="hidden" name="id" value={l.id} />
                    <input type="hidden" name="rotation_id" value={id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      aria-label={`${t.removeLine} ${l.name}`}
                    >
                      <X />
                    </Button>
                  </form>
                ) : null}
              </div>
            ))}
            <form action={addLineAction}>
              <input type="hidden" name="rotation_id" value={id} />
              <SubmitButton variant="outline" size="sm">
                <Plus /> {t.addLine}
              </SubmitButton>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.rolloutTitle}</CardTitle>
            <CardDescription>{t.rolloutLead}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <RolloutForm
              key={lineList.map((l) => l.id).join()}
              rotationId={id}
              lengthWeeks={rotation.length_weeks}
              lines={lineList}
              employees={employees}
              defaultStart={addDays(weekStartOf(today), 7)}
            />
            <div className="grid gap-2" data-testid="rollout-history">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t.history}
              </p>
              {(rollouts ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.noHistory}</p>
              ) : null}
              {(rollouts ?? []).map((r) => {
                const assignments = r.assignments as unknown as {
                  lineId: string;
                  employeeId: string | null;
                  startWeek: number;
                }[];
                return (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="font-medium">{formatDate(r.start_date)}</span> ·{" "}
                      {t.weeksCount(r.weeks)}
                      <span className="block text-xs text-muted-foreground">
                        {assignments
                          .map(
                            (a) =>
                              `${lineList.find((l) => l.id === a.lineId)?.name ?? "?"}: ${a.employeeId ? (nameOf.get(a.employeeId) ?? "?") : t.openShifts}`,
                          )
                          .join(" · ")}
                      </span>
                    </span>
                    <RerollButton rolloutId={r.id} />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
