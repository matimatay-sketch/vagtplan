import type { Metadata } from "next";
import { HelpTip } from "@/components/help/help";
import { SubmitButton } from "@/components/form";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApiKeyForm, WebhookForm } from "@/components/integrations/forms";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  disableWebhookAction,
  pingWebhookAction,
  revokeApiKeyAction,
} from "@/lib/actions/integrations";
import { localParts } from "@/lib/domain/schedule-time";
import { formatDate } from "@/lib/format";
import { env } from "@/lib/env";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Integrationer" };

const when = (iso: string | null) =>
  iso ? `${formatDate(localParts(iso).date)} ${localParts(iso).time}` : "–";

export default async function IntegrationsPage() {
  const ctx = await requireContext(["integrations.manage"]);
  const supabase = await createClient();
  const t = da.integrations;
  const [{ data: keys }, { data: hooks }, { data: deliveries }] = await Promise.all([
    supabase
      .from("api_key")
      .select("id, name, prefix, scopes, created_at, last_used_at, revoked_at")
      .eq("organization_id", ctx.organization.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("webhook_endpoint")
      .select("id, url, description, events, created_at, disabled_at")
      .eq("organization_id", ctx.organization.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("webhook_delivery")
      .select("id, endpoint_id, event, status, attempts, last_status, last_error, created_at")
      .eq("organization_id", ctx.organization.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const docs = `${env.siteUrl}/api/v1/openapi.json`;

  return (
    <>
      <PageHeader title={t.title} help={t.lead} />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              {t.docsTitle}
              <HelpTip>{t.docsLead}</HelpTip>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <span>
              {t.baseUrl}: <code className="text-xs">{env.siteUrl}/api/v1</code>
            </span>
            <span>
              {t.spec}:{" "}
              <a className="underline" href={docs} target="_blank" rel="noreferrer">
                {docs}
              </a>
            </span>
            <span className="text-muted-foreground">{t.authHelp}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {t.keysTitle}
              <HelpTip>{t.keysLead}</HelpTip>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ApiKeyForm />
            <ul className="grid gap-2" data-testid="api-keys">
              {(keys ?? []).length === 0 ? (
                <li className="text-sm text-muted-foreground">{t.noKeys}</li>
              ) : null}
              {(keys ?? []).map((k) => (
                <li
                  key={k.id}
                  data-key={k.name}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm"
                >
                  <span className="grid gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{k.name}</span>
                      <code className="text-xs text-muted-foreground">{k.prefix}…</code>
                      {k.revoked_at ? <Badge variant="destructive">{t.revoked}</Badge> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">{k.scopes.join(", ")}</span>
                    <span className="text-xs text-muted-foreground">
                      {t.created} {when(k.created_at)} · {t.lastUsed} {when(k.last_used_at)}
                    </span>
                  </span>
                  {k.revoked_at ? null : (
                    <form action={revokeApiKeyAction.bind(null, k.id)}>
                      <SubmitButton variant="outline" size="sm">
                        {t.revoke}
                      </SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {t.webhooksTitle}
              <HelpTip>{t.webhooksLead}</HelpTip>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <WebhookForm />
            <ul className="grid gap-3" data-testid="webhooks">
              {(hooks ?? []).length === 0 ? (
                <li className="text-sm text-muted-foreground">{t.noWebhooks}</li>
              ) : null}
              {(hooks ?? []).map((h) => (
                <li
                  key={h.id}
                  data-url={h.url}
                  className="grid gap-2 rounded-lg border p-3 text-sm"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="grid gap-0.5">
                      <code className="text-xs break-all">{h.url}</code>
                      {h.description ? (
                        <span className="text-muted-foreground">{h.description}</span>
                      ) : null}
                      <span className="text-xs text-muted-foreground">{h.events.join(", ")}</span>
                    </span>
                    {h.disabled_at ? (
                      <Badge variant="secondary">{t.disabled}</Badge>
                    ) : (
                      <span className="flex gap-2">
                        <form action={pingWebhookAction.bind(null, h.id)}>
                          <SubmitButton variant="outline" size="sm">
                            {t.ping}
                          </SubmitButton>
                        </form>
                        <form action={disableWebhookAction.bind(null, h.id)}>
                          <SubmitButton variant="ghost" size="sm">
                            {t.disable}
                          </SubmitButton>
                        </form>
                      </span>
                    )}
                  </span>
                  <ul className="grid gap-1" data-testid="deliveries">
                    {(deliveries ?? [])
                      .filter((d) => d.endpoint_id === h.id)
                      .slice(0, 10)
                      .map((d) => (
                        <li
                          key={d.id}
                          data-event={d.event}
                          data-status={d.status}
                          className="flex flex-wrap gap-2 text-xs text-muted-foreground"
                        >
                          <span className="tabular">{when(d.created_at)}</span>
                          <code>{d.event}</code>
                          <span>{t.statuses[d.status as keyof typeof t.statuses]}</span>
                          {d.last_status ? <span>HTTP {d.last_status}</span> : null}
                          {d.attempts > 1 ? <span>{t.attempts(d.attempts)}</span> : null}
                          {d.status !== "delivered" && d.last_error ? (
                            <span>{d.last_error}</span>
                          ) : null}
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
