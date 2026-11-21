"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { saveKitExtrasAction } from "@/lib/actions/starter-kits";
import { formatKroner, parseKroner } from "@/lib/domain/numbers";
import type { KitPayPeriodGroup, KitSupplementType } from "@/lib/domain/starter-kit";
import { formatDate } from "@/lib/format";
import { da } from "@/lib/i18n/da";

/** Amounts are hundredths (øre, or hundredths of a percent): shown as "12,50". */
const show = (n: number) => formatKroner(n).replaceAll(".", "");

type Row = Omit<KitSupplementType, "amounts"> & { amounts: string[] };

/** The supplement types (a rate per version date) and pay period groups of a starter kit. */
export function KitExtrasForm({
  kitKey,
  dates,
  supplementTypes,
  payPeriodGroups,
}: {
  kitKey: string;
  /** The version start dates, oldest first: one rate column each. */
  dates: string[];
  supplementTypes: KitSupplementType[];
  payPeriodGroups: KitPayPeriodGroup[];
}) {
  const t = da.starterKits;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<Row[]>(() =>
    supplementTypes.map((s) => ({
      ...s,
      amounts: dates.map((d) => {
        const a = s.amounts.find((x) => x.valid_from === d);
        return a ? show(a.amount) : "";
      }),
    })),
  );
  const [groups, setGroups] = useState(payPeriodGroups);
  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  const submit = () => {
    const supplement_types = rows.map((r) => ({
      name: r.name,
      pay_code: r.pay_code.trim().toUpperCase(),
      amount_type: r.amount_type,
      amounts: r.amounts.flatMap((a, k) => {
        if (!a.trim()) return [];
        const n = parseKroner(a);
        return [{ valid_from: dates[k]!, amount: n ?? -1 }];
      }),
    }));
    start(async () => {
      const r = await saveKitExtrasAction(kitKey, {
        supplement_types,
        pay_period_groups: groups,
      });
      if (r.message) (r.ok ? toast.success : toast.error)(r.message);
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className="grid gap-6" data-testid="kit-extras">
      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">{t.supplementTypes}</h3>
        <div
          className="overflow-x-auto rounded-lg border"
          tabIndex={0}
          role="region"
          aria-label={t.supplementTypes}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-2 py-2 font-medium">{t.name}</th>
                <th className="px-2 py-2 font-medium">{t.payCode}</th>
                <th className="px-2 py-2 font-medium">{t.amountType}</th>
                {dates.map((d) => (
                  <th key={d} className="px-2 py-2 font-medium whitespace-nowrap">
                    {t.rateFrom(formatDate(d))}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0" data-kit-supplement={r.pay_code}>
                  <td className="px-2 py-1.5">
                    <Input
                      aria-label={`${t.name} ${i + 1}`}
                      className="min-w-48"
                      value={r.name}
                      onChange={(e) => setRow(i, { name: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      aria-label={`${t.payCode} ${r.name}`}
                      className="w-40 font-mono"
                      value={r.pay_code}
                      onChange={(e) => setRow(i, { pay_code: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <NativeSelect
                      aria-label={`${t.amountType} ${r.name}`}
                      value={r.amount_type}
                      onChange={(e) =>
                        setRow(i, { amount_type: e.target.value as Row["amount_type"] })
                      }
                    >
                      {(["per_hour", "fixed", "percent"] as const).map((k) => (
                        <option key={k} value={k}>
                          {t.amountTypes[k]}
                        </option>
                      ))}
                    </NativeSelect>
                  </td>
                  {dates.map((d, k) => (
                    <td key={d} className="px-2 py-1.5">
                      <Input
                        aria-label={`${r.name} ${t.rateFrom(formatDate(d))}`}
                        inputMode="decimal"
                        className="w-28 text-right tabular"
                        value={r.amounts[k] ?? ""}
                        onChange={(e) =>
                          setRow(i, {
                            amounts: r.amounts.map((a, j) => (j === k ? e.target.value : a)),
                          })
                        }
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t.removeSupplement(r.name)}
                      onClick={() => setRows((x) => x.filter((_, j) => j !== i))}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setRows((x) => [
                ...x,
                {
                  name: "",
                  pay_code: "",
                  amount_type: "per_hour",
                  amounts: dates.map(() => ""),
                },
              ])
            }
          >
            <Plus /> {t.addSupplement}
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">{t.payPeriodGroups}</h3>
        {groups.map((g, i) => (
          <div key={i} className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs text-muted-foreground">
              {t.name}
              <Input
                value={g.name}
                onChange={(e) =>
                  setGroups((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))
                }
              />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              {t.frequency}
              <NativeSelect
                value={g.frequency}
                onChange={(e) =>
                  setGroups((x) =>
                    x.map((y, j) =>
                      j === i
                        ? { ...y, frequency: e.target.value as KitPayPeriodGroup["frequency"] }
                        : y,
                    ),
                  )
                }
              >
                {(["weekly", "biweekly"] as const).map((k) => (
                  <option key={k} value={k}>
                    {t.frequencies[k]}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              {t.anchorDate}
              <Input
                type="date"
                value={g.anchor_date}
                onChange={(e) =>
                  setGroups((x) =>
                    x.map((y, j) => (j === i ? { ...y, anchor_date: e.target.value } : y)),
                  )
                }
              />
            </label>
          </div>
        ))}
      </div>

      <div>
        <Button type="button" disabled={pending} onClick={submit}>
          {t.saveExtras}
        </Button>
      </div>
    </div>
  );
}
