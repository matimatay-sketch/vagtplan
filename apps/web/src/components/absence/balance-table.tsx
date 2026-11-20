import type { Balance } from "@/lib/domain/leave";
import { formatDays } from "@/lib/domain/leave";
import { formatDate } from "@/lib/format";
import { da } from "@/lib/i18n/da";
import { cn } from "@/lib/utils";

/** Balances per account and period (each row is the sum of its postings). */
export function BalanceTable({
  balances,
  labels,
  today,
}: {
  balances: Balance[];
  labels: Record<string, string>;
  today: string;
}) {
  const t = da.absence;
  const current = balances.filter((b) => b.usableUntil >= today);
  if (current.length === 0) return <p className="text-sm text-muted-foreground">{t.noBalances}</p>;
  return (
    <div
      className="overflow-x-auto rounded-xl border bg-card outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      tabIndex={0}
      role="region"
      aria-label={da.common.scrollRegion}
    >
      <table className="w-full text-sm" data-testid="balances">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground uppercase">
            <th className="px-3 py-2 font-medium">{t.account}</th>
            <th className="px-3 py-2 font-medium">{t.period}</th>
            <th className="px-3 py-2 text-right font-medium">{t.earned}</th>
            <th className="px-3 py-2 text-right font-medium">{t.used}</th>
            <th className="px-3 py-2 text-right font-medium">{t.other}</th>
            <th className="px-3 py-2 text-right font-medium">{t.balance}</th>
          </tr>
        </thead>
        <tbody>
          {current.map((b) => (
            <tr
              key={`${b.account}-${b.periodStart}`}
              className="border-b last:border-0"
              data-account={b.account}
            >
              <td className="px-3 py-2 font-medium">
                {labels[b.account] ?? t.accounts[b.account] ?? b.account}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {formatDate(b.periodStart)} · {t.usableUntil(formatDate(b.usableUntil))}
              </td>
              <td className="px-3 py-2 text-right tabular">{formatDays(b.earned)}</td>
              <td className="px-3 py-2 text-right tabular">{formatDays(b.used)}</td>
              <td className="px-3 py-2 text-right tabular">{formatDays(b.other)}</td>
              <td
                className={cn(
                  "px-3 py-2 text-right font-semibold tabular",
                  b.balance < 0 && "text-destructive",
                )}
                data-testid="balance"
              >
                {formatDays(b.balance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
