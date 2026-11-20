import { CalendarClock } from "lucide-react";
import { formatDays, summarizeBalances, type Balance } from "@/lib/domain/leave";
import { formatDate } from "@/lib/format";
import { da } from "@/lib/i18n/da";
import { cn } from "@/lib/utils";

/** "How many days do I have left?" per account, in plain words. */
export function BalanceCards({
  balances,
  labels,
  today,
}: {
  balances: Balance[];
  labels: Record<string, string>;
  today: string;
}) {
  const t = da.absence;
  const summary = summarizeBalances(balances, today);
  if (summary.length === 0) return <p className="text-sm text-muted-foreground">{t.noBalances}</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="balance-cards">
      {summary.map((s) => (
        <div
          key={s.account}
          className="rounded-xl border bg-card p-4"
          data-account={s.account}
          data-testid="balance-card"
        >
          <p className="text-sm font-medium text-muted-foreground">
            {labels[s.account] ?? t.accounts[s.account] ?? s.account}
          </p>
          <p
            className={cn(
              "mt-1 font-display text-3xl font-semibold tabular",
              s.left < 0 && "text-destructive",
            )}
          >
            {formatDays(s.left)}
            <span className="ml-1.5 text-base font-normal text-muted-foreground">
              {t.daysLeft(s.left)}
            </span>
          </p>
          {s.expiring ? (
            <p className="mt-2 flex items-start gap-1.5 text-sm text-warning-foreground">
              <CalendarClock className="mt-0.5 size-4 shrink-0" />
              {t.mustUseBy(formatDays(s.expiring.amount), formatDate(s.expiring.until))}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
