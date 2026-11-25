"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LocateFixed, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { archiveWorkplaceAction, saveWorkplaceAction } from "@/lib/actions/workplaces";
import { initialActionState } from "@/lib/actions/state";
import { currentPosition } from "@/lib/geolocation";
import { da } from "@/lib/i18n/da";

const t = da.workplaces;

export type WorkplaceRow = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_m: number;
  department_ids: string[];
};

/** Create (no initial) or edit a workplace. Field ids are prefixed, so several forms fit on a page. */
export function WorkplaceForm({
  initial,
  departments,
}: {
  initial?: WorkplaceRow;
  departments: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(saveWorkplaceAction, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  const p = initial ? `wp-${initial.id}` : "wp-new";
  const coords = useRef<HTMLInputElement>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  useEffect(() => {
    if (state.ok && !initial) ref.current?.reset();
  }, [state, initial]);
  const v = (name: string, fallback: string) => state.values?.[name] ?? fallback;
  const useMine = async () => {
    setLocating(true);
    setLocateError(null);
    const r = await currentPosition();
    setLocating(false);
    if (!r.ok) return setLocateError(t.positionFailed);
    if (coords.current)
      coords.current.value = `${r.latitude.toFixed(6)}, ${r.longitude.toFixed(6)}`;
  };
  const chosen = new Set(initial?.department_ids ?? []);
  return (
    <form
      ref={ref}
      action={action}
      className="grid gap-4"
      noValidate
      data-testid={initial ? `workplace-form-${initial.name}` : "workplace-form"}
    >
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.name} htmlFor={`${p}-name`} error={state.errors?.name}>
          <Input
            id={`${p}-name`}
            name="name"
            defaultValue={v("name", initial?.name ?? "")}
            aria-invalid={state.errors?.name ? true : undefined}
          />
        </Field>
        <Field label={t.address} htmlFor={`${p}-address`} error={state.errors?.address}>
          <Input
            id={`${p}-address`}
            name="address"
            defaultValue={v("address", initial?.address ?? "")}
          />
        </Field>
        <Field
          label={t.coordinates}
          htmlFor={`${p}-coordinates`}
          error={state.errors?.coordinates ?? locateError ?? undefined}
          help={t.coordinatesHelp}
        >
          <div className="flex flex-wrap gap-2">
            <Input
              ref={coords}
              id={`${p}-coordinates`}
              name="coordinates"
              inputMode="decimal"
              className="min-w-0 flex-1"
              placeholder="55.6761, 12.5683"
              defaultValue={v(
                "coordinates",
                initial ? `${initial.latitude}, ${initial.longitude}` : "",
              )}
              aria-invalid={state.errors?.coordinates ? true : undefined}
            />
            <Button type="button" variant="outline" onClick={useMine} disabled={locating}>
              {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
              {locating ? t.locating : t.useMyPosition}
            </Button>
          </div>
        </Field>
        <Field
          label={t.radius}
          htmlFor={`${p}-radius`}
          error={state.errors?.radius_m}
          help={t.radiusHelp}
        >
          <Input
            id={`${p}-radius`}
            name="radius_m"
            type="number"
            inputMode="numeric"
            min={25}
            max={5000}
            step={5}
            className="w-32"
            defaultValue={v("radius_m", String(initial?.radius_m ?? 200))}
            aria-invalid={state.errors?.radius_m ? true : undefined}
          />
        </Field>
      </div>
      {departments.length ? (
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-sm font-medium">{t.departments}</legend>
          <p className="mb-1 text-xs text-muted-foreground">{t.departmentsHelp}</p>
          <div className="flex flex-wrap gap-x-4">
            {departments.map((d) => (
              <label
                key={d.id}
                className="flex min-h-9 cursor-pointer items-center gap-2 text-sm pointer-coarse:min-h-11"
              >
                <Checkbox
                  id={`${p}-dept-${d.id}`}
                  name="department_ids"
                  value={d.id}
                  defaultChecked={chosen.has(d.id)}
                />
                {d.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton className="w-fit">{initial ? t.save : t.create}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DeleteWorkplaceButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={`${t.remove} ${name}`}
      onClick={() => {
        if (!window.confirm(t.removeConfirm(name))) return;
        start(async () => {
          const r = await archiveWorkplaceAction(id);
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
          router.refresh();
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
      {t.remove}
    </Button>
  );
}
