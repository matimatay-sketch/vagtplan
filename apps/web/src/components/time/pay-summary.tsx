import { formatKroner } from "@/lib/domain/numbers";
import type { PayPreview, SummaryRow } from "@/lib/domain/pay-preview";
import { decimalHours } from "@/lib/domain/project-report";
import { localParts, timeRange } from "@/lib/domain/schedule-time";
import { da } from "@/lib/i18n/da";
import { formatDay } from "./my-entries";

function SummaryTable({ rows, showAmounts }: { rows: SummaryRow[]; showAmounts: boolean }) {
  const t = da.time;
  const total = rows.reduce((s, r) => s + r.amountOre, 0);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-muted-foreground">
          <th className="py-1.5 pr-2 font-medium">{t.summary.code}</th>
          <th className="py-1.5 pr-2 font-medium">{t.summary.label}</th>
          <th className="py-1.5 pr-2 text-right font-medium">{t.summary.quantity}</th>
          <th className="py-1.5 pr-2 text-right font-medium">{t.summary.rate}</th>
          <th className="py-1.5 text-right font-medium">{t.summary.amount}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={`${r.payCode}-${r.rateOre}`}
            className="border-b last:border-0"
            data-pay-code={r.payCode}
          >
            <td className="py-1.5 pr-2 font-mono text-xs">{r.payCode}</td>
            <td className="py-1.5 pr-2">{r.label}</td>
            <td className="py-1.5 pr-2 text-right tabular">
              {r.unit === "fixed" ? "–" : `${decimalHours(r.minutes)} t`}
            </td>
            <td className="py-1.5 pr-2 text-right tabular">
              {showAmounts && r.unit !== "fixed" ? formatKroner(r.rateOre) : "–"}
            </td>
            <td className="py-1.5 text-right tabular">
              {showAmounts ? formatKroner(r.amountOre) : "–"}
            </td>
          </tr>
        ))}
      </tbody>
      {showAmounts ? (
        <tfoot>
          <tr className="border-t font-semibold">
            <td className="py-1.5" colSpan={4}>
              {da.payroll.total}
            </td>
            <td className="py-1.5 text-right tabular" data-testid="summary-total">
              {formatKroner(total)}
            </td>
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}

/**
 * The right-hand summary of the approval list: the week's pay codes and paid
 * absence as a table, per department and per employee, with why each pay code
 * was activated.
 */
export function PaySummary({
  departments,
  employees,
}: {
  departments: { id: string; name: string; rows: SummaryRow[]; showAmounts: boolean }[];
  employees: { id: string; name: string; preview: PayPreview; showAmounts: boolean }[];
}) {
  const t = da.time;
  return (
    <aside className="grid gap-4 lg:sticky lg:top-4" data-testid="pay-summary">
      <p className="text-xs text-muted-foreground">{t.payPreviewHelp}</p>
      {departments.map((d) => (
        <section
          key={d.id}
          className="rounded-xl border border-primary/30 bg-primary/5 p-4"
          data-testid="department-total"
          data-department={d.name}
        >
          <h2 className="mb-2 font-semibold">{t.departmentTotal(d.name)}</h2>
          <SummaryTable rows={d.rows} showAmounts={d.showAmounts} />
        </section>
      ))}
      {employees.map((e) => (
        <section
          key={e.id}
          className="rounded-xl border bg-card p-4"
          data-testid="pay-preview"
          data-employee={e.name}
        >
          <h3 className="mb-2 font-semibold">{e.name}</h3>
          <SummaryTable rows={e.preview.rows} showAmounts={e.showAmounts} />
          <details className="mt-2 text-xs text-muted-foreground" data-testid="pay-why">
            <summary className="cursor-pointer">{t.why}</summary>
            <ul className="mt-1 grid gap-1.5">
              {e.preview.codes.map((c) => (
                <li key={c.payCode}>
                  <span className="font-mono font-medium text-foreground">{c.payCode}</span>{" "}
                  {c.label}:{" "}
                  {c.why
                    .map(
                      (w) =>
                        `${t.whyRule} ${w.ruleId} · ${w.source} · ${w.layer}${w.note ? ` · ${w.note}` : ""}`,
                    )
                    .join("; ")}
                  {c.intervals.length ? (
                    <span className="block tabular">
                      {c.intervals
                        .map(
                          (i) =>
                            `${formatDay(localParts(i.start).date)} ${timeRange(i.start, i.end)} (${decimalHours(i.minutes)} t)`,
                        )
                        .join(", ")}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        </section>
      ))}
    </aside>
  );
}
