"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Pencil, Play, Plus, Trash2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field } from "@/components/form";
import {
  archiveTestWeekAction,
  previewTestWeekAction,
  runTestWeeksAction,
  saveTestWeekAction,
  type TestRun,
  type TestWeekResult,
} from "@/lib/actions/test-weeks";
import type { TestCase } from "@/lib/domain/test-weeks";
import {
  formatKroner,
  hoursToMinutes,
  parseDanishDecimal,
  parseKroner,
} from "@/lib/domain/numbers";
import { decimalHours } from "@/lib/domain/project-report";
import { da } from "@/lib/i18n/da";
import { cn } from "@/lib/utils";

const t = da.testWeeks;

const amounts = (a: { minutes: number; amountOre: number } | null) =>
  a ? `${decimalHours(a.minutes)} t / ${formatKroner(a.amountOre)} kr.` : t.none_;

function RunBadge({ run, label }: { run: TestRun | null; label: string }) {
  if (!run) return null;
  const ok = !("error" in run) && run.comparison.ok;
  return (
    <Badge
      variant={ok ? "default" : "destructive"}
      className="gap-1"
      data-testid={`run-${ok ? "ok" : "failed"}`}
    >
      {ok ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />} {label}:{" "}
      {ok ? t.passed : t.failed}
    </Badge>
  );
}

function RunDetails({ run }: { run: TestRun | null }) {
  if (!run) return null;
  if ("error" in run)
    return <p className="text-xs text-destructive">{`${t.error} ${run.error}`}</p>;
  if (run.comparison.ok) return null;
  const c = run.comparison;
  return (
    <ul className="list-disc pl-5 text-xs text-destructive" data-testid="test-diff">
      {c.lines.map((l) => (
        <li key={l.payCode}>{t.diffLine(l.payCode, amounts(l.expected), amounts(l.actual))}</li>
      ))}
      {c.violations.missing.length ? (
        <li>{t.missingViolation(c.violations.missing.join(", "))}</li>
      ) : null}
      {c.violations.unexpected.length ? (
        <li>{t.unexpectedViolation(c.violations.unexpected.join(", "))}</li>
      ) : null}
    </ul>
  );
}

export function TestWeeks({
  agreementId,
  initial,
  hasDraft,
  defaultWeek,
}: {
  agreementId: string;
  initial: TestWeekResult[];
  hasDraft: boolean;
  defaultWeek: string;
}) {
  const router = useRouter();
  const [results, setResults] = useState(initial);
  const [editing, setEditing] = useState<{ id: string | null; test: TestCase | null } | null>(null);
  const [pending, start] = useTransition();
  const failing = (k: "published" | "draft") =>
    results.filter((r) => r[k] && ("error" in r[k]! || !r[k]!.comparison.ok)).length;

  return (
    <section className="grid gap-4" data-testid="test-weeks">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t.title}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">{t.lead}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={pending || results.length === 0}
            onClick={() =>
              start(async () => setResults((await runTestWeeksAction(agreementId)).results))
            }
          >
            <Play /> {t.run}
          </Button>
          <Button variant="outline" onClick={() => setEditing({ id: null, test: null })}>
            <Plus /> {t.new}
          </Button>
        </div>
      </div>

      {results.length ? (
        <p className="text-sm" data-testid="test-summary">
          {(["published", "draft"] as const)
            .filter((k) => k === "published" || hasDraft)
            .map((k) => {
              const n = failing(k);
              return `${t.against[k]}: ${n === 0 ? t.allPassed(results.length) : t.someFailed(n, results.length)}`;
            })
            .join(" · ")}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{t.none}</p>
      )}

      <ul className="grid gap-2">
        {results.map((r) => (
          <li
            key={r.id}
            className="grid gap-1.5 rounded-xl border bg-card px-4 py-3"
            data-test-week={r.name}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{r.name}</span>
              <RunBadge run={r.published} label={t.against.published} />
              <RunBadge run={r.draft} label={t.against.draft} />
              <span className="ml-auto flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`${da.common.edit} ${r.name}`}
                  onClick={() => setEditing({ id: r.id, test: r.test })}
                >
                  <Pencil />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`${t.archive} ${r.name}`}
                  onClick={() =>
                    start(async () => {
                      const x = await archiveTestWeekAction(agreementId, r.id);
                      if (x.message) (x.ok ? toast.success : toast.error)(x.message);
                      setResults((list) => list.filter((y) => y.id !== r.id));
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </span>
            </div>
            <RunDetails run={r.published} />
            <RunDetails run={r.draft} />
          </li>
        ))}
      </ul>

      {editing ? (
        <TestWeekForm
          key={editing.id ?? "ny"}
          agreementId={agreementId}
          id={editing.id}
          initial={editing.test}
          defaultWeek={defaultWeek}
          onSaved={() =>
            start(async () => {
              setEditing(null);
              setResults((await runTestWeeksAction(agreementId)).results);
              router.refresh();
            })
          }
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </section>
  );
}

type Line = { payCode: string; hours: string; amount: string };

function TestWeekForm({
  agreementId,
  id,
  initial,
  defaultWeek,
  onSaved,
  onCancel,
}: {
  agreementId: string;
  id: string | null;
  initial: TestCase | null;
  defaultWeek: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [pending, start] = useTransition();
  const [tc, setTc] = useState<Omit<TestCase, "expected">>(() =>
    initial
      ? { ...initial }
      : {
          name: "",
          weekStart: defaultWeek,
          employee: { birthDate: "1990-01-01", schoolObligated: false },
          contract: { payForm: "hourly", weeklyNormMinutes: 2220, staffGroup: null, payStep: null },
          shifts: [
            { date: defaultWeek, start: "08:00", end: "16:00", breakMinutes: 30, kind: "work" },
          ],
          absences: [],
        },
  );
  const [lines, setLines] = useState<Line[]>(() =>
    initial
      ? initial.expected.lines.map((l) => ({
          payCode: l.payCode,
          hours: decimalHours(l.minutes),
          amount: formatKroner(l.amountOre),
        }))
      : [{ payCode: "NORMAL", hours: "", amount: "" }],
  );
  const [violations, setViolations] = useState(() => initial?.expected.violations.join(", ") ?? "");
  const [current, setCurrent] = useState<TestRun | null>(null);

  const build = (): unknown => ({
    ...tc,
    expected: {
      lines: lines
        .filter((l) => l.payCode.trim())
        .map((l) => ({
          payCode: l.payCode.trim().toUpperCase(),
          minutes: hoursToMinutes(parseDanishDecimal(l.hours) ?? NaN),
          amountOre: parseKroner(l.amount) ?? NaN,
        })),
      violations: violations
        .split(",")
        .map((v) => v.trim().toUpperCase())
        .filter(Boolean),
    },
  });
  const setShift = (i: number, patch: Partial<TestCase["shifts"][number]>) =>
    setTc((x) => ({ ...x, shifts: x.shifts.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));
  const setAbsence = (i: number, patch: Partial<TestCase["absences"][number]>) =>
    setTc((x) => ({
      ...x,
      absences: x.absences.map((s, k) => (k === i ? { ...s, ...patch } : s)),
    }));

  return (
    <div className="grid gap-5 rounded-xl border bg-card p-4" data-testid="test-week-form">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t.name} htmlFor="tw-name" className="lg:col-span-2">
          <Input
            id="tw-name"
            value={tc.name}
            onChange={(e) => setTc({ ...tc, name: e.target.value })}
          />
        </Field>
        <Field label={t.week} htmlFor="tw-week">
          <Input
            id="tw-week"
            type="date"
            value={tc.weekStart}
            onChange={(e) => setTc({ ...tc, weekStart: e.target.value })}
          />
        </Field>
        <Field label={t.birthDate} htmlFor="tw-birth">
          <Input
            id="tw-birth"
            type="date"
            value={tc.employee.birthDate}
            onChange={(e) =>
              setTc({ ...tc, employee: { ...tc.employee, birthDate: e.target.value } })
            }
          />
        </Field>
        <Field label={t.payForm} htmlFor="tw-payform">
          <NativeSelect
            id="tw-payform"
            value={tc.contract.payForm}
            onChange={(e) =>
              setTc({
                ...tc,
                contract: { ...tc.contract, payForm: e.target.value as "hourly" | "monthly" },
              })
            }
          >
            <option value="hourly">{t.payForms.hourly}</option>
            <option value="monthly">{t.payForms.monthly}</option>
          </NativeSelect>
        </Field>
        <Field label={t.norm} htmlFor="tw-norm">
          <Input
            id="tw-norm"
            inputMode="decimal"
            defaultValue={decimalHours(tc.contract.weeklyNormMinutes)}
            onChange={(e) => {
              const h = parseDanishDecimal(e.target.value);
              if (h !== null)
                setTc({
                  ...tc,
                  contract: { ...tc.contract, weeklyNormMinutes: hoursToMinutes(h) },
                });
            }}
          />
        </Field>
        <Field label={t.staffGroup} htmlFor="tw-group">
          <Input
            id="tw-group"
            value={tc.contract.staffGroup ?? ""}
            onChange={(e) =>
              setTc({ ...tc, contract: { ...tc.contract, staffGroup: e.target.value || null } })
            }
          />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary"
            checked={tc.employee.schoolObligated}
            onChange={(e) =>
              setTc({ ...tc, employee: { ...tc.employee, schoolObligated: e.target.checked } })
            }
          />
          {t.schoolObligated}
        </label>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t.shifts}</legend>
        {tc.shifts.map((s, i) => (
          <div
            key={i}
            className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[10rem_7rem_7rem_8rem_9rem_auto]"
            data-testid="tw-shift"
          >
            <Input
              type="date"
              aria-label={`${t.date} ${i + 1}`}
              value={s.date}
              onChange={(e) => setShift(i, { date: e.target.value })}
            />
            <Input
              type="time"
              aria-label={`${t.start} ${i + 1}`}
              value={s.start}
              onChange={(e) => setShift(i, { start: e.target.value })}
            />
            <Input
              type="time"
              aria-label={`${t.end} ${i + 1}`}
              value={s.end}
              onChange={(e) => setShift(i, { end: e.target.value })}
            />
            <Input
              type="number"
              min={0}
              aria-label={`${t.breakMinutes} ${i + 1}`}
              value={s.breakMinutes}
              onChange={(e) => setShift(i, { breakMinutes: Number(e.target.value) || 0 })}
            />
            <NativeSelect
              aria-label={`${t.kind} ${i + 1}`}
              value={s.kind}
              onChange={(e) =>
                setShift(i, { kind: e.target.value as TestCase["shifts"][number]["kind"] })
              }
            >
              <option value="work">{t.kinds.work}</option>
              <option value="on_call">{t.kinds.on_call}</option>
              <option value="call_out">{t.kinds.call_out}</option>
            </NativeSelect>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t.remove}
              onClick={() => setTc({ ...tc, shifts: tc.shifts.filter((_, k) => k !== i) })}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="justify-self-start"
          onClick={() =>
            setTc({
              ...tc,
              shifts: [
                ...tc.shifts,
                {
                  date: tc.weekStart,
                  start: "08:00",
                  end: "16:00",
                  breakMinutes: 30,
                  kind: "work",
                },
              ],
            })
          }
        >
          <Plus /> {t.addShift}
        </Button>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{t.absences}</legend>
        {tc.absences.map((a, i) => (
          <div
            key={i}
            className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[12rem_10rem_10rem_auto]"
          >
            <Input
              aria-label={`${t.absenceType} ${i + 1}`}
              value={a.type}
              placeholder="sick"
              onChange={(e) => setAbsence(i, { type: e.target.value })}
            />
            <Input
              type="date"
              aria-label={`${da.absence.from} ${i + 1}`}
              value={a.from}
              onChange={(e) => setAbsence(i, { from: e.target.value })}
            />
            <Input
              type="date"
              aria-label={`${da.absence.to} ${i + 1}`}
              value={a.to}
              onChange={(e) => setAbsence(i, { to: e.target.value })}
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label={t.remove}
              onClick={() => setTc({ ...tc, absences: tc.absences.filter((_, k) => k !== i) })}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="justify-self-start"
          onClick={() =>
            setTc({
              ...tc,
              absences: [...tc.absences, { type: "sick", from: tc.weekStart, to: tc.weekStart }],
            })
          }
        >
          <Plus /> {t.addAbsence}
        </Button>
      </fieldset>

      <fieldset className="grid gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
        <legend className="px-1 text-sm font-medium">{t.expected}</legend>
        <p className="text-xs text-muted-foreground">{t.expectedHelp}</p>
        {lines.map((l, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2"
            data-testid="tw-line"
          >
            <Input
              aria-label={`${t.payCode} ${i + 1}`}
              placeholder={t.payCode}
              value={l.payCode}
              onChange={(e) =>
                setLines(lines.map((x, k) => (k === i ? { ...x, payCode: e.target.value } : x)))
              }
            />
            <Input
              aria-label={`${t.hours} ${i + 1}`}
              placeholder={t.hours}
              inputMode="decimal"
              value={l.hours}
              onChange={(e) =>
                setLines(lines.map((x, k) => (k === i ? { ...x, hours: e.target.value } : x)))
              }
            />
            <Input
              aria-label={`${t.amount} ${i + 1}`}
              placeholder={t.amount}
              inputMode="decimal"
              value={l.amount}
              onChange={(e) =>
                setLines(lines.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))
              }
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label={t.remove}
              onClick={() => setLines(lines.filter((_, k) => k !== i))}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="justify-self-start"
          onClick={() => setLines([...lines, { payCode: "", hours: "", amount: "" }])}
        >
          <Plus /> {t.addLine}
        </Button>
        <Field label={t.violations} htmlFor="tw-violations">
          <Input
            id="tw-violations"
            value={violations}
            onChange={(e) => setViolations(e.target.value)}
            placeholder="REST_DAILY"
          />
        </Field>
      </fieldset>

      {current ? (
        <div className={cn("rounded-lg border p-3 text-sm")} data-testid="tw-current">
          <div className="mb-1 font-medium">{t.current}</div>
          {"error" in current ? (
            <p className="text-destructive">{current.error}</p>
          ) : (
            <ul className="tabular">
              {current.actual.lines.map((l) => (
                <li key={l.payCode}>
                  <span className="font-mono">{l.payCode}</span> {amounts(l)}
                </li>
              ))}
              {current.actual.violations.length ? (
                <li>{current.actual.violations.join(", ")}</li>
              ) : null}
            </ul>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveTestWeekAction(agreementId, id, build());
              if (r.message) (r.ok ? toast.success : toast.error)(r.message);
              if (r.ok) onSaved();
            })
          }
        >
          {t.save}
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => setCurrent(await previewTestWeekAction(agreementId, build())))
          }
        >
          {t.current}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {da.common.cancel}
        </Button>
      </div>
    </div>
  );
}
