"use client";
import { useActionState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/form";
import {
  createSupplementTypeAction,
  saveNoticeAction,
  saveRuleHandlingAction,
} from "@/lib/actions/settings";
import { initialActionState } from "@/lib/actions/state";
import { RULE_CATALOG, type RuleHandlingMap } from "@/lib/schedule/rule-handling";
import { da } from "@/lib/i18n/da";

const t = da.settings;

export function NoticeForm({ publish, change }: { publish: number | null; change: number | null }) {
  const [state, action] = useActionState(saveNoticeAction, initialActionState);
  return (
    <form
      action={action}
      className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      noValidate
      data-testid="notice-form"
    >
      <Field
        label={t.noticePublish}
        htmlFor="notice_publish_hours"
        error={state.errors?.notice_publish_hours}
      >
        <Input
          type="number"
          min={0}
          placeholder={t.followAgreement}
          {...fieldProps("notice_publish_hours", state, publish?.toString() ?? "")}
        />
      </Field>
      <Field
        label={t.noticeChange}
        htmlFor="notice_change_hours"
        error={state.errors?.notice_change_hours}
      >
        <Input
          type="number"
          min={0}
          placeholder={t.followAgreement}
          {...fieldProps("notice_change_hours", state, change?.toString() ?? "")}
        />
      </Field>
      <SubmitButton>{da.common.save}</SubmitButton>
      <div className="sm:col-span-3">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function RuleHandlingForm({ handling }: { handling: RuleHandlingMap }) {
  const [state, action] = useActionState(saveRuleHandlingAction, initialActionState);
  return (
    <form action={action} className="grid gap-3" data-testid="rule-handling-form">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground uppercase">
              <th className="py-2 pr-3 font-medium">{t.rule}</th>
              <th className="py-2 pr-3 font-medium">{t.standard}</th>
              <th className="py-2 font-medium">{t.handling}</th>
            </tr>
          </thead>
          <tbody>
            {RULE_CATALOG.map((r) => (
              <tr key={r.code} className="border-b last:border-0">
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-2">
                    {r.label}
                    {r.young ? <Badge variant="warning">{t.youngRule}</Badge> : null}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <Badge variant={r.severity === "BLOCKING" ? "destructive" : "warning"}>
                    {r.severity === "BLOCKING" ? da.schedule.blocking : da.schedule.warning}
                  </Badge>
                </td>
                <td className="w-56 py-2">
                  <NativeSelect
                    name={`rule:${r.code}`}
                    defaultValue={handling[r.code] ?? ""}
                    aria-label={`${t.handling} – ${r.label}`}
                  >
                    <option value="">
                      {t.handlingDefault(
                        r.severity === "BLOCKING"
                          ? t.handlings.block.toLowerCase()
                          : da.schedule.warning.toLowerCase(),
                      )}
                    </option>
                    <option value="block">{t.handlings.block}</option>
                    <option value="allow">{t.handlings.allow}</option>
                  </NativeSelect>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton>{da.common.save}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function SupplementTypeForm() {
  const [state, action] = useActionState(createSupplementTypeAction, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const f = (n: string, fb?: string) => fieldProps(n, state, fb);
  return (
    <form
      ref={ref}
      action={action}
      className="grid gap-3 sm:grid-cols-[1.5fr_1fr_1fr_1fr_auto] sm:items-start"
      noValidate
      data-testid="supplement-type-form"
    >
      <Field label={t.supplementName} htmlFor="name" error={state.errors?.name}>
        <Input placeholder="Fx Ansvarstillæg" {...f("name")} />
      </Field>
      <Field label={t.payCode} htmlFor="pay_code" error={state.errors?.pay_code}>
        <Input placeholder="ANSVAR" {...f("pay_code")} />
      </Field>
      <Field label={t.amountType} htmlFor="amount_type">
        <NativeSelect {...f("amount_type", "per_hour")}>
          {(["per_hour", "fixed", "percent"] as const).map((k) => (
            <option key={k} value={k}>
              {t.amountTypes[k]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={t.amount} htmlFor="amount" error={state.errors?.amount}>
        <Input inputMode="decimal" placeholder="25,00" {...f("amount")} />
      </Field>
      <div className="sm:pt-[22px]">
        <SubmitButton>{t.newSupplement}</SubmitButton>
      </div>
      <div className="sm:col-span-5">{state.ok ? null : <FormMessage state={state} />}</div>
    </form>
  );
}
