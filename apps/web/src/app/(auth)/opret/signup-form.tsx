"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/form";
import { signUpAction } from "@/lib/actions/auth";
import { initialActionState } from "@/lib/actions/state";
import { da } from "@/lib/i18n/da";

export function SignupForm({ signedIn }: { signedIn: boolean }) {
  const [state, action] = useActionState(signUpAction, initialActionState);
  const t = da.auth;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">
          {signedIn ? t.noOrganizationTitle : t.signUpTitle}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {signedIn ? t.noOrganizationLead : t.signUpLead}
        </p>
      </div>
      <form action={action} className="space-y-4" noValidate>
        <FormMessage state={state} />
        <Field
          label={t.organizationName}
          htmlFor="organization_name"
          error={state.errors?.organization_name}
        >
          <Input required autoComplete="organization" {...fieldProps("organization_name", state)} />
        </Field>
        {signedIn ? null : (
          <>
            <Field label={t.email} htmlFor="email" error={state.errors?.email}>
              <Input type="email" autoComplete="email" required {...fieldProps("email", state)} />
            </Field>
            <Field
              label={t.password}
              htmlFor="password"
              error={state.errors?.password}
              help={da.validation.passwordTooShort}
            >
              <Input
                type="password"
                autoComplete="new-password"
                required
                {...fieldProps("password", state)}
              />
            </Field>
          </>
        )}
        <SubmitButton className="w-full">
          {signedIn ? t.createOrganizationTitle : t.signUp}
        </SubmitButton>
      </form>
      {signedIn ? null : (
        <p className="text-sm text-muted-foreground">
          {t.haveAccount}{" "}
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t.signInLink}
          </Link>
        </p>
      )}
    </div>
  );
}
