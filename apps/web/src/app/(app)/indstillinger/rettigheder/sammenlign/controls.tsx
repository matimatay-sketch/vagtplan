"use client";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { da } from "@/lib/i18n/da";

/** Which profiles to compare and whether to show only the differences (kept in the URL). */
export function CompareControls({
  profiles,
  selected,
  onlyDifferences,
}: {
  profiles: { id: string; name: string }[];
  selected: string[];
  onlyDifferences: boolean;
}) {
  const t = da.profiles.compare;
  const router = useRouter();
  const [pending, start] = useTransition();
  // The boxes change at once; the table follows when the page has reloaded.
  const [shown, setShown] = useOptimistic({ selected, onlyDifferences });
  const go = (ids: string[], diff: boolean) => {
    const q = new URLSearchParams();
    for (const id of ids) q.append("p", id);
    if (diff) q.set("forskelle", "1");
    start(() => {
      setShown({ selected: ids, onlyDifferences: diff });
      router.replace(`/indstillinger/rettigheder/sammenlign?${q}`, { scroll: false });
    });
  };
  const toggle = (id: string, on: boolean) =>
    go(
      profiles.map((p) => p.id).filter((x) => (x === id ? on : shown.selected.includes(x))),
      shown.onlyDifferences,
    );
  return (
    <div
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
      data-testid="compare-controls"
      aria-busy={pending}
    >
      <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
        <legend className="sr-only">{t.choose}</legend>
        {profiles.map((p) => (
          <label key={p.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={shown.selected.includes(p.id)}
              onChange={(e) => toggle(p.id, e.target.checked)}
            />
            {p.name}
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={shown.onlyDifferences}
          onChange={(e) => go(shown.selected, e.target.checked)}
        />
        {t.onlyDifferences}
      </label>
    </div>
  );
}
