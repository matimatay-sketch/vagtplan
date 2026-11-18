"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form";
import { createApiKeyAction, createWebhookAction } from "@/lib/actions/integrations";
import { API_SCOPES, WEBHOOK_EVENTS } from "@/lib/domain/api";
import { da } from "@/lib/i18n/da";
import { SecretBox } from "./secret-box";

const t = da.integrations;

function Choices({
  options,
  value,
  onChange,
  legend,
}: {
  options: readonly { key: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  legend: string;
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {options.map((o) => (
        <label key={o.key} className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={value.includes(o.key)}
            onChange={(e) =>
              onChange(e.target.checked ? [...value, o.key] : value.filter((x) => x !== o.key))
            }
          />
          <code className="text-xs">{o.key}</code>
          <span className="text-muted-foreground">{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function ApiKeyForm() {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="grid gap-3" data-testid="api-key-form">
      {secret ? <SecretBox secret={secret} note={t.keyOnce} /> : null}
      <Field label={t.keyName} htmlFor="key-name" error={error ?? undefined}>
        <Input
          id="key-name"
          value={name}
          placeholder={t.keyNamePlaceholder}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Choices options={API_SCOPES} value={scopes} onChange={setScopes} legend={t.scopes} />
      <div>
        <Button
          disabled={busy || !name.trim() || scopes.length === 0}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await createApiKeyAction({ name, scopes });
              if (r.ok) {
                setSecret(r.secret);
                setName("");
                setScopes([]);
              } else setError(r.message);
            })
          }
        >
          {t.createKey}
        </Button>
      </div>
    </div>
  );
}

export function WebhookForm() {
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="grid gap-3" data-testid="webhook-form">
      {secret ? <SecretBox secret={secret} note={t.secretOnce} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.url} htmlFor="hook-url" error={error ?? undefined}>
          <Input
            id="hook-url"
            value={url}
            placeholder="https://"
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        <Field label={`${t.description} (${da.common.optional})`} htmlFor="hook-description">
          <Input
            id="hook-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </div>
      <Choices options={WEBHOOK_EVENTS} value={events} onChange={setEvents} legend={t.events} />
      <div>
        <Button
          disabled={busy || !url.trim() || events.length === 0}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await createWebhookAction({ url, description, events });
              if (r.ok) {
                setSecret(r.secret);
                setUrl("");
                setDescription("");
                setEvents([]);
              } else setError(r.message);
            })
          }
        >
          {t.createWebhook}
        </Button>
      </div>
    </div>
  );
}
