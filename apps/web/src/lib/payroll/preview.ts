import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { AppContext } from "@/lib/auth";
import type { IsoDate } from "@/lib/domain/civil-date";
import { previewFromLines, type PayPreview } from "@/lib/domain/pay-preview";
import { calculateEmployee } from "./calculate";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Which pay codes the week's registrations activate (including time waiting
 * for approval), per employee. Amounts only where `showAmounts` allows them;
 * otherwise they are removed here and never sent to the browser.
 */
export async function loadPayPreviews(
  supabase: Client,
  ctx: AppContext,
  employees: { id: string; showAmounts: boolean }[],
  week: { start: IsoDate; end: IsoDate },
): Promise<Record<string, PayPreview>> {
  const out: Record<string, PayPreview> = {};
  for (const e of employees) {
    try {
      const calc = await calculateEmployee(supabase, ctx, week, e.id, { includePending: true });
      if (!calc) continue;
      const preview = previewFromLines(
        calc.result.lines.map((l) => ({
          payCode: l.payCode,
          label: l.label,
          unit: l.unit,
          quantityMinutes: l.quantityMinutes,
          rateOre: l.rateOre,
          amountOre: l.amountOre,
          why: {
            ruleId: l.explanation.ruleId,
            source: l.explanation.source,
            layer: `${l.explanation.layer.agreementId} v${l.explanation.layer.version}`,
            note: l.explanation.note,
          },
          intervals: l.explanation.intervals.map((i) => ({
            intervalId: i.intervalId,
            minutes: i.minutes,
            start: i.start,
            end: i.end,
          })),
        })),
      );
      out[e.id] = e.showAmounts
        ? preview
        : {
            ...preview,
            codes: preview.codes.map((c) => ({ ...c, amountOre: 0 })),
            rows: preview.rows.map((r) => ({ ...r, rateOre: 0, amountOre: 0 })),
          };
    } catch {
      // No agreement in force for the week, or data the user cannot read: no preview.
    }
  }
  return out;
}
