"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/form";
import { magicLinkAction, signInAction } from "@/lib/actions/auth";
import { initialActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

export function LoginForm() {
  const [state, action] = useActionState(signInAction, initialActionState);
  const [linkState, linkAction] = useActionState(magicLinkAction, initialActionState);
  const t = da.auth;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">{t.signInTitle}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t.signInLead}</p>
      </div>
      <form action={action} className="space-y-4" noValidate>
        <FormMessage state={state} />
        <Field label={t.email} htmlFor="email" error={state.errors?.email}>
          <Input type="email" autoComplete="email" required {...fieldProps("email", state)} />
        </Field>
        <Field label={t.password} htmlFor="password" error={state.errors?.password}>
          <Input
            type="password"
            autoComplete="current-password"
            required
            {...fieldProps("password", state)}
          />
        </Field>
        <SubmitButton className="w-full">{t.signIn}</SubmitButton>
        <SubmitButton variant="outline" className="w-full" formAction={linkAction} formNoValidate>
          {t.sendMagicLink}
        </SubmitButton>
        <FormMessage state={linkState} />
      </form>
      <p className="text-sm text-muted-foreground">
        {t.noAccount}{" "}
        <Link href="/opret" className="font-medium text-primary underline-offset-4 hover:underline">
          {t.createAccountLink}
        </Link>
      </p>
    </div>
  );
}
