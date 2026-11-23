import type { Metadata } from "next";
import { HelpTip } from "@/components/help/help";
import { SubmitButton } from "@/components/form";
import Link from "next/link";
import { ArrowRight, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatSupplementAmount } from "@/lib/domain/supplements";
import { requireContext } from "@/lib/auth";
import { hasOrg } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  archiveSupplementTypeAction,
  setAssistantEnabledAction,
  setSupplementSelectableAction,
} from "@/lib/actions/settings";
import { assistantState } from "@/lib/assistant/access";
import { addDays, todayIn } from "@/lib/domain/civil-date";
import { loadOrganizationSettings } from "@/lib/schedule/validate-week";
import { CustomRulesForm } from "@/components/settings/custom-rules";
import {
  ArchiveDeviationReasonButton,
  DeviationReasonForm,
  DeviationThresholdForm,
} from "@/components/settings/deviation-reasons";
import { LazyDetails } from "@/components/lazy-details";
import { loadAgreements } from "@/lib/engine";
import type { DeviationReason } from "@/lib/domain/deviation";
import { da } from "@/lib/i18n/da";
import {
  LeaveRulesForm,
  NormDefaultsForm,
  NoticeForm,
  RuleHandlingForm,
  SupplementTypeForm,
  EditSupplementButton,
  DefaultAgreementForm,
} from "./forms";

export const metadata: Metadata = { title: "Opsætning" };

export default async function SettingsPage() {
  const ctx = await requireContext(["settings.manage"]);
  const supabase = await createClient();
  const t = da.settings;
  const since = new Date(
    `${addDays(todayIn(ctx.organization.timezone), -30)}T00:00:00Z`,
  ).toISOString();
  const [
    settings,
    { data: supplements },
    assistant,
    { count: assistantUsage },
    { data: norm },
    { data: agreements },
  ] = await Promise.all([
    loadOrganizationSettings(supabase, ctx.organization.id),
    supabase
      .from("supplement_type")
      .select("id, name, pay_code, amount_type, amount, employee_selectable")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("name"),
    assistantState(supabase, ctx),
    supabase
      .from("assistant_request")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organization.id)
      .gte("created_at", since),
    supabase
      .from("organization_settings")
      .select(
        "norm_percent_work, norm_percent_on_call, norm_in_pay_work, norm_in_pay_on_call, default_agreement_id, deviation_threshold_minutes",
      )
      .eq("organization_id", ctx.organization.id)
      .maybeSingle(),
    supabase
      .from("agreement")
      .select("id, name")
      .in("kind", ["agreement", "base"])
      .eq("is_example", false)
      .order("name"),
  ]);
  const [{ data: reasonRows }, engine] = await Promise.all([
    supabase
      .from("deviation_reason")
      .select(
        "id, name, applies_to, treatment, time_off_mode, time_off_factor_bp, time_off_pay_code, absence_type",
      )
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("sort_order")
      .order("name"),
    loadAgreements(supabase),
  ]);
  const reasons = (reasonRows ?? []) as unknown as DeviationReason[];
  // Absence types in the organization's agreements (for "the missing time becomes absence").
  const absenceTypes = new Map<string, string>();
  for (const docs of Object.values(engine.registry))
    for (const doc of docs)
      for (const r of doc.rules)
        if (r.primitive === "absence")
          for (const type of (r.params as { types?: { code: string; label: string }[] }).types ??
            [])
            if (!absenceTypes.has(type.code)) absenceTypes.set(type.code, type.label);
  const absenceTypeList = [...absenceTypes.entries()]
    .map(([code, label]) => ({ code, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "da"));
  const links = [
    { href: "/indstillinger/lonperioder", label: da.nav.payPeriodGroups, show: true },
    {
      href: "/indstillinger/overenskomster",
      label: da.nav.agreements,
      show: hasOrg(ctx.permissions, "agreements.manage"),
    },
    {
      href: "/indstillinger/rettigheder",
      label: da.nav.profiles,
      show: hasOrg(ctx.permissions, "users.manage"),
    },
    {
      href: "/vagtplan/skabeloner",
      label: da.nav.templates,
      show: Boolean(ctx.permissions["schedule.manage"]),
    },
  ].filter((l) => l.show);

  return (
    <>
      <PageHeader title={t.title} help={t.lead} />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              {t.defaultAgreementTitle}
              <HelpTip>{t.defaultAgreementLead}</HelpTip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DefaultAgreementForm
              value={norm?.default_agreement_id ?? null}
              agreements={agreements ?? []}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              {t.noticeTitle}
              <HelpTip>{t.noticeLead}</HelpTip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <NoticeForm
              publish={settings.notice_publish_hours}
              change={settings.notice_change_hours}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              {t.normTitle}
              <HelpTip>{t.normLead}</HelpTip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <NormDefaultsForm
              defaults={
                norm ?? {
                  norm_percent_work: 100,
                  norm_percent_on_call: 0,
                  norm_in_pay_work: false,
                  norm_in_pay_on_call: false,
                }
              }
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              {t.leaveTitle}
              <HelpTip>{t.leaveLead}</HelpTip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LeaveRulesForm rules={settings.leave_rules} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              {t.rulesTitle}
              <HelpTip>{t.rulesLead}</HelpTip>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Alert variant="warning">
              <AlertDescription>{t.rulesWarning}</AlertDescription>
            </Alert>
            <RuleHandlingForm handling={settings.rule_handling} />
            <section className="grid gap-3 border-t pt-4" aria-labelledby="custom-rules-title">
              <h3 id="custom-rules-title" className="flex items-center gap-1 font-semibold">
                {da.customRules.title}
                <HelpTip>{da.customRules.lead}</HelpTip>
              </h3>
              <CustomRulesForm rules={settings.custom_rules} />
            </section>
          </CardContent>
        </Card>
        <Card data-testid="deviation-reasons">
          <CardHeader>
            <CardTitle>
              {da.deviationReasons.title}
              <HelpTip>{da.deviationReasons.lead}</HelpTip>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <DeviationThresholdForm minutes={norm?.deviation_threshold_minutes ?? 5} />
            {reasons.length === 0 ? (
              <p className="text-sm text-muted-foreground">{da.deviationReasons.none}</p>
            ) : (
              <ul className="grid divide-y rounded-lg border" data-testid="deviation-reason-list">
                {reasons.map((r) => (
                  <li key={r.id} className="grid gap-2 px-3 py-3" data-reason={r.name}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {da.deviationReasons.treatments[r.treatment]}
                        {" · "}
                        {r.applies_to.map((x) => da.deviationReasons.situations[x]).join(", ")}
                      </span>
                      <span className="ml-auto">
                        <ArchiveDeviationReasonButton id={r.id} name={r.name} />
                      </span>
                    </div>
                    <LazyDetails className="text-sm" summary={da.deviationReasons.edit}>
                      <div className="mt-3">
                        <DeviationReasonForm initial={r} absenceTypes={absenceTypeList} />
                      </div>
                    </LazyDetails>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-2 border-t pt-4">
              <h3 className="font-semibold">{da.deviationReasons.newTitle}</h3>
              <DeviationReasonForm absenceTypes={absenceTypeList} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              {t.supplementsTitle}
              <HelpTip>{t.supplementsLead}</HelpTip>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <SupplementTypeForm />
            <ul className="grid gap-2" data-testid="supplement-types">
              {(supplements ?? []).length === 0 ? (
                <li className="text-sm text-muted-foreground">{t.noSupplements}</li>
              ) : null}
              {(supplements ?? []).map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{s.name}</span> ·{" "}
                    {formatSupplementAmount({ amountType: s.amount_type, amount: s.amount })}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {s.pay_code}
                    </span>
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <EditSupplementButton supplement={s} />
                    <form action={setSupplementSelectableAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <input
                        type="hidden"
                        name="employee_selectable"
                        value={String(!s.employee_selectable)}
                      />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        data-testid="toggle-selectable"
                        title={t.employeeSelectableHelp}
                      >
                        {s.employee_selectable ? t.selectableYes : t.selectableNo}
                      </Button>
                    </form>
                    <form action={archiveSupplementTypeAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`${da.common.archive} ${s.name}`}
                      >
                        <Trash2 />
                      </Button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card data-testid="assistant-settings">
          <CardHeader>
            <CardTitle>
              {da.assistant.settingsTitle}
              <HelpTip>{da.assistant.settingsLead}</HelpTip>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {!assistant.configured ? (
              <Alert>
                <AlertDescription>{da.assistant.keyMissing}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium" data-testid="assistant-status">
                {assistant.enabled ? da.assistant.enabled : da.assistant.off}
              </span>
              <form action={setAssistantEnabledAction}>
                <input type="hidden" name="enabled" value={String(!assistant.enabled)} />
                <SubmitButton variant="outline" size="sm">
                  {assistant.enabled ? da.assistant.disable : da.assistant.enable}
                </SubmitButton>
              </form>
              <span className="text-muted-foreground">
                {da.assistant.usage(assistantUsage ?? 0)}
              </span>
            </div>
            <p className="text-muted-foreground">{da.assistant.privacy}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.more}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {links.map((l) => (
              <Button key={l.href} asChild variant="outline">
                <Link href={l.href}>
                  {l.label} <ArrowRight />
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
