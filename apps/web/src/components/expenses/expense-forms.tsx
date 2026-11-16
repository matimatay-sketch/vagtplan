"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/form";
import { saveExpenseAction, saveTripAction } from "@/lib/actions/expenses";
import { initialActionState } from "@/lib/actions/state";
import type { PostingDimension } from "@/lib/domain/posting";
import { da } from "@/lib/i18n/da";

const t = da.expenses;

/** One select per dimension; empty = the department's/employee's default. */
function PostingSelects({
  dimensions,
  value,
  onChange,
}: {
  dimensions: PostingDimension[];
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  if (dimensions.length === 0) return null;
  return (
    <>
      {dimensions.map((d) => (
        <Field key={d.id} label={d.name} htmlFor={`posting-${d.id}`}>
          <NativeSelect
            id={`posting-${d.id}`}
            value={value[d.id] ?? ""}
            onChange={(e) => {
              const next = { ...value };
              if (e.target.value) next[d.id] = e.target.value;
              else delete next[d.id];
              onChange(next);
            }}
          >
            <option value="">{da.posting.useDefault}</option>
            {d.values.map((v) => (
              <option key={v.id} value={v.id}>
                {v.code} {v.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ))}
    </>
  );
}

export function TripForm({ today, posting }: { today: string; posting: PostingDimension[] }) {
  const [state, action] = useActionState(saveTripAction, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  const [stops, setStops] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  // Clear the controlled fields once per successful save (adjusting state on a new result).
  const [handled, setHandled] = useState(state);
  if (handled !== state) {
    setHandled(state);
    if (state.ok) {
      setStops([]);
      setValues({});
    }
  }
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const f = (n: string, fb?: string) => fieldProps(n, state, fb);
  return (
    <form ref={ref} action={action} className="grid gap-3" noValidate data-testid="trip-form">
      <FormMessage state={state} />
      <input type="hidden" name="stops" value={JSON.stringify(stops.filter((s) => s.trim()))} />
      <input type="hidden" name="posting" value={JSON.stringify(values)} />
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr_8rem]">
        <Field label={da.schedule.date} htmlFor="trip_date" error={state.errors?.trip_date}>
          <Input type="date" max={today} {...f("trip_date", today)} />
        </Field>
        <Field label={t.purpose} htmlFor="purpose" error={state.errors?.purpose}>
          <Input placeholder={t.purposePlaceholder} {...f("purpose")} />
        </Field>
        <Field label={t.km} htmlFor="km" error={state.errors?.km}>
          <Input inputMode="decimal" placeholder="42,5" {...f("km")} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.from} htmlFor="from_address" error={state.errors?.from_address}>
          <Input {...f("from_address")} />
        </Field>
        <Field label={t.to} htmlFor="to_address" error={state.errors?.to_address}>
          <Input {...f("to_address")} />
        </Field>
      </div>
      <div className="grid gap-2" data-testid="trip-stops">
        {stops.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              aria-label={t.stop(i + 1)}
              value={s}
              onChange={(e) => setStops((x) => x.map((y, k) => (k === i ? e.target.value : y)))}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t.removeStop}
              onClick={() => setStops((x) => x.filter((_, k) => k !== i))}
            >
              <X />
            </Button>
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setStops((x) => [...x, ""])}
          >
            <Plus /> {t.addStop}
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={`${t.vehicle} (${da.common.optional})`} htmlFor="vehicle">
          <Input {...f("vehicle")} />
        </Field>
        <PostingSelects dimensions={posting} value={values} onChange={setValues} />
      </div>
      <div>
        <SubmitButton>{t.saveTrip}</SubmitButton>
      </div>
    </form>
  );
}

export function ExpenseForm({
  today,
  categories,
  posting,
}: {
  today: string;
  categories: { id: string; name: string; receiptRequired: boolean }[];
  posting: PostingDimension[];
}) {
  const [state, action] = useActionState(saveExpenseAction, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [category, setCategory] = useState(categories[0]?.id ?? "");
  const [handled, setHandled] = useState(state);
  if (handled !== state) {
    setHandled(state);
    if (state.ok) setValues({});
  }
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const f = (n: string, fb?: string) => fieldProps(n, state, fb);
  if (categories.length === 0)
    return <p className="text-sm text-muted-foreground">{t.noCategoriesYet}</p>;
  const needsReceipt = categories.find((c) => c.id === category)?.receiptRequired ?? false;
  return (
    <form ref={ref} action={action} className="grid gap-3" noValidate data-testid="expense-form">
      <FormMessage state={state} />
      <input type="hidden" name="posting" value={JSON.stringify(values)} />
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr_8rem]">
        <Field label={da.schedule.date} htmlFor="expense_date" error={state.errors?.expense_date}>
          <Input type="date" max={today} {...f("expense_date", today)} />
        </Field>
        <Field label={t.category} htmlFor="category_id" error={state.errors?.category_id}>
          <NativeSelect
            id="category_id"
            name="category_id"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t.amount} htmlFor="amount" error={state.errors?.amount}>
          <Input inputMode="decimal" placeholder="45,00" {...f("amount")} />
        </Field>
      </div>
      <Field label={t.description} htmlFor="description" error={state.errors?.description}>
        <Input {...f("description")} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label={needsReceipt ? t.receipt : `${t.receipt} (${da.common.optional})`}
          htmlFor="receipt"
          error={state.errors?.receipt}
        >
          <Input
            id="receipt"
            name="receipt"
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
          />
        </Field>
        <PostingSelects dimensions={posting} value={values} onChange={setValues} />
      </div>
      <div>
        <SubmitButton>{t.saveExpense}</SubmitButton>
      </div>
    </form>
  );
}
