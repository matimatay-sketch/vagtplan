import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LazyDetails } from "@/components/lazy-details";
import { EndSubstituteButton, SubstituteForm } from "@/components/time/substitutes";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayIn } from "@/lib/domain/civil-date";
import { substituteStatus } from "@/lib/forms/substitutes";
import { formatDate } from "@/lib/format";
import { hasOrg } from "@/lib/permissions";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Stedfortrædere" };

/** Substitute approvers: who approves while a manager is away. */
export default async function SubstitutesPage() {
  const ctx = await requireContext(["users.manage", "time.approve"]);
  const t = da.substitutes;
  const supabase = await createClient();
  const today = todayIn(ctx.organization.timezone);
  const canChooseAbsent = hasOrg(ctx.permissions, "users.manage");
  const [{ data: candidates }, { data: rows }] = await Promise.all([
    supabase.rpc("substitute_candidates", { p_org: ctx.organization.id }),
    supabase
      .from("approval_substitute")
      .select("id, absent_user_id, substitute_user_id, valid_from, valid_to, note, archived_at")
      .eq("organization_id", ctx.organization.id)
      .order("valid_from", { ascending: false })
      .limit(100),
  ]);
  const names = new Map((candidates ?? []).map((c) => [c.user_id, c.name]));
  const nameOf = (id: string) => names.get(id) ?? "–";
  const list = (rows ?? []).map((r) => ({ ...r, status: substituteStatus(r, today) }));
  // Current and coming first, then the rest.
  const order = { active: 0, upcoming: 1, over: 2, ended: 3 } as const;
  list.sort((a, b) => order[a.status] - order[b.status]);
  const editable = (absent: string) => canChooseAbsent || absent === ctx.userId;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/tid/godkend"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> {da.time.approveTitle}
          </Link>
        }
        title={t.title}
        help={t.lead}
      />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t.newTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <SubstituteForm
              candidates={candidates ?? []}
              canChooseAbsent={canChooseAbsent}
              me={ctx.userId}
              initial={{
                absent_user_id: ctx.userId,
                substitute_user_id: "",
                valid_from: today,
                valid_to: addDays(today, 6),
                note: "",
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.listTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            {list.length === 0 ? (
              <EmptyState>{t.none}</EmptyState>
            ) : (
              <ul className="grid divide-y" data-testid="substitutes">
                {list.map((s) => (
                  <li key={s.id} className="grid gap-2 py-3" data-substitute={s.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {nameOf(s.absent_user_id)} → {nameOf(s.substitute_user_id)}
                      </span>
                      <Badge variant={s.status === "active" ? "default" : "secondary"}>
                        {t.statuses[s.status]}
                      </Badge>
                      <span className="text-sm tabular text-muted-foreground">
                        {t.period(formatDate(s.valid_from), formatDate(s.valid_to))}
                      </span>
                      {s.note ? (
                        <span className="text-sm text-muted-foreground">{s.note}</span>
                      ) : null}
                      {editable(s.absent_user_id) &&
                      (s.status === "active" || s.status === "upcoming") ? (
                        <span className="ml-auto">
                          <EndSubstituteButton id={s.id} />
                        </span>
                      ) : null}
                    </div>
                    {editable(s.absent_user_id) &&
                    (s.status === "active" || s.status === "upcoming") ? (
                      <LazyDetails
                        className="text-sm"
                        summary={t.edit}
                        testId={`edit-substitute-${s.id}`}
                      >
                        <div className="mt-3">
                          <SubstituteForm
                            candidates={candidates ?? []}
                            canChooseAbsent={canChooseAbsent}
                            me={ctx.userId}
                            initial={s}
                          />
                        </div>
                      </LazyDetails>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
