"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Car, Receipt, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { archiveExpenseItemAction, decideExpenseItemsAction } from "@/lib/actions/expenses";
import type { ExpenseItem } from "@/lib/expenses/load";
import { formatKm } from "@/lib/domain/mileage";
import { formatKroner } from "@/lib/domain/numbers";
import { da } from "@/lib/i18n/da";

const t = da.expenses;

const statusVariant = { pending: "outline", approved: "success", rejected: "destructive" } as const;

function ItemText({ item }: { item: ExpenseItem }) {
  if (item.kind === "trip")
    return (
      <>
        <span className="font-medium">
          {t.trip}: {formatKm(item.meters)}
        </span>
        <span className="text-sm">
          {item.from}
          {item.stops.length ? ` ${t.via} ${item.stops.join(", ")}` : ""} → {item.to}
        </span>
        <span className="text-xs text-muted-foreground">
          {item.purpose}
          {item.vehicle ? ` · ${item.vehicle}` : ""}
        </span>
      </>
    );
  return (
    <>
      <span className="font-medium">
        {t.expense}: {item.categoryName} {formatKroner(item.amountOre)} kr.
      </span>
      <span className="text-sm">{item.description}</span>
      {item.hasReceipt ? (
        <a
          className="text-xs underline"
          href={`/koersel/kvittering/${item.id}`}
          target="_blank"
          rel="noreferrer"
          data-testid="receipt-link"
        >
          {t.showReceipt}
        </a>
      ) : null}
    </>
  );
}

/** The employee's own items; pending ones can be removed. */
export function ExpenseList({ items }: { items: ExpenseItem[] }) {
  const [pending, start] = useTransition();
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t.noItems}</p>;
  return (
    <ul className="divide-y rounded-lg border" data-testid="expense-items">
      {items.map((i) => (
        <li
          key={`${i.kind}-${i.id}`}
          className="flex items-start gap-3 px-4 py-3"
          data-testid="expense-item"
          data-kind={i.kind}
        >
          {i.kind === "trip" ? (
            <Car className="mt-0.5 size-4" />
          ) : (
            <Receipt className="mt-0.5 size-4" />
          )}
          <div className="grid flex-1 gap-0.5">
            <span className="text-xs text-muted-foreground tabular">{i.date}</span>
            <ItemText item={i} />
            {i.decisionNote ? <span className="text-xs">“{i.decisionNote}”</span> : null}
          </div>
          <Badge variant={statusVariant[i.status]}>{t.statuses[i.status]}</Badge>
          {i.status === "pending" ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t.remove}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await archiveExpenseItemAction(i.kind, i.id);
                  if (!r.ok) toast.error(r.message);
                })
              }
            >
              <Trash2 />
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** For approvers: select and approve or reject. `decidable` are ids the user may decide. */
export function ExpenseApproval({
  items,
  decidable,
}: {
  items: ExpenseItem[];
  decidable: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [busy, start] = useTransition();
  const can = new Set(decidable);
  const key = (i: ExpenseItem) => `${i.kind}:${i.id}`;
  const toggle = (k: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const decide = (decision: "approved" | "rejected") =>
    start(async () => {
      const chosen = items.filter((i) => selected.has(key(i)));
      const r = await decideExpenseItemsAction({
        tripIds: chosen.filter((i) => i.kind === "trip").map((i) => i.id),
        expenseIds: chosen.filter((i) => i.kind === "expense").map((i) => i.id),
        decision,
        note: note || undefined,
      });
      if (r.ok) {
        toast.success(r.message);
        setSelected(new Set());
        setNote("");
      } else toast.error(r.message);
    });
  return (
    <div className="grid gap-3" data-testid="expense-approval">
      <ul className="divide-y rounded-lg border">
        {items.map((i) => (
          <li
            key={key(i)}
            className="flex items-start gap-3 px-4 py-3"
            data-testid="expense-item"
            data-kind={i.kind}
          >
            {i.status === "pending" && can.has(key(i)) ? (
              <input
                type="checkbox"
                className="mt-1 accent-primary"
                aria-label={t.select(`${i.employeeName} ${i.date}`)}
                checked={selected.has(key(i))}
                onChange={() => toggle(key(i))}
              />
            ) : (
              <span className="w-3.5" />
            )}
            <div className="grid flex-1 gap-0.5">
              <span className="text-xs text-muted-foreground">
                {i.employeeName} · <span className="tabular">{i.date}</span>
              </span>
              <ItemText item={i} />
              {i.decisionNote ? <span className="text-xs">“{i.decisionNote}”</span> : null}
            </div>
            <Badge variant={statusVariant[i.status]}>{t.statuses[i.status]}</Badge>
          </li>
        ))}
      </ul>
      {decidable.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={busy || selected.size === 0}
            onClick={() => decide("approved")}
            data-testid="approve-expenses"
          >
            {t.approve}
          </Button>
          <Input
            className="w-64"
            placeholder={t.rejectNote}
            aria-label={t.rejectNote}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            variant="outline"
            disabled={busy || selected.size === 0}
            onClick={() => decide("rejected")}
          >
            {t.reject}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
