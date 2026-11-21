"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormMessage, SubmitButton, fieldProps } from "@/components/form";
import {
  deleteMessageAction,
  editMessageAction,
  markReadAction,
  replyAction,
  startConversationAction,
} from "@/lib/actions/messages";
import { initialActionState, type ActionState } from "@/lib/actions/state";
import { createClient } from "@/lib/supabase/client";
import { da } from "@/lib/i18n/da";

export type Recipient = {
  user_id: string;
  name: string;
  is_leader: boolean;
  department_names: string | null;
};

/** New conversation: recipients (leaders first), optional subject, text. */
export function NewMessageForm({
  recipients,
  preselected,
}: {
  recipients: Recipient[];
  preselected: string[];
}) {
  const [state, action] = useActionState(startConversationAction, initialActionState);
  const t = da.messages;
  const groups = [
    { label: t.leaders, people: recipients.filter((r) => r.is_leader) },
    { label: t.colleagues, people: recipients.filter((r) => !r.is_leader) },
  ].filter((g) => g.people.length);
  const chosen = new Set(state.values ? [] : preselected);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <fieldset
        className="grid gap-3"
        aria-invalid={state.errors?.to ? true : undefined}
        aria-describedby={state.errors?.to ? "to-error" : undefined}
      >
        <legend className="mb-1 text-sm font-medium">{t.to}</legend>
        {groups.map((g) => (
          <div key={g.label} className="grid gap-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {g.label}
            </p>
            <div className="grid gap-1 sm:grid-cols-2">
              {g.people.map((r) => (
                <label
                  key={r.user_id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted pointer-coarse:min-h-11"
                >
                  <Checkbox
                    id={`to-${r.user_id}`}
                    name="to"
                    value={r.user_id}
                    defaultChecked={chosen.has(r.user_id)}
                  />
                  <span>
                    {r.name}
                    {r.department_names ? (
                      <span className="block text-xs text-muted-foreground">
                        {r.department_names}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
        {state.errors?.to ? (
          <p id="to-error" className="text-sm text-destructive">
            {state.errors.to}
          </p>
        ) : null}
      </fieldset>
      <Field label={t.subject} htmlFor="subject" error={state.errors?.subject}>
        <Input {...fieldProps("subject", state)} maxLength={120} />
      </Field>
      <Field label={t.body} htmlFor="body" error={state.errors?.body}>
        <Textarea rows={5} {...fieldProps("body", state)} maxLength={4000} />
      </Field>
      <SubmitButton className="w-fit">{t.send}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function ReplyForm({ conversationId }: { conversationId: string }) {
  const [state, action] = useActionState(replyAction, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-2" noValidate>
      <input type="hidden" name="conversation_id" value={conversationId} />
      <Field label={da.messages.reply} htmlFor="body" error={state.errors?.body}>
        <Textarea
          rows={3}
          {...fieldProps("body", state)}
          maxLength={4000}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
              e.currentTarget.form?.requestSubmit();
          }}
        />
      </Field>
      <SubmitButton className="w-fit">{da.messages.sendReply}</SubmitButton>
      {state.ok ? null : <FormMessage state={state} />}
    </form>
  );
}

/** Edit and delete for one's own message. */
export function OwnMessageActions({ id, body }: { id: string; body: string }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await editMessageAction(prev, fd);
    if (r.ok) setEditing(false);
    return r;
  }, initialActionState);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const t = da.messages;
  if (editing)
    return (
      <form action={action} className="mt-2 grid gap-2">
        <input type="hidden" name="id" value={id} />
        <Textarea
          id={`edit-${id}`}
          name="body"
          aria-label={t.edit}
          defaultValue={body}
          rows={3}
          maxLength={4000}
        />
        <div className="flex gap-2">
          <SubmitButton size="sm">{t.saveEdit}</SubmitButton>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            {da.common.cancel}
          </Button>
        </div>
        <FormMessage state={state} />
      </form>
    );
  return (
    <span className="inline-flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={t.edit}
        onClick={() => setEditing(true)}
      >
        <Pencil />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={t.delete}
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t.deleteConfirm)) return;
          start(async () => {
            const r = await deleteMessageAction(id);
            setError(r.ok ? null : (r.message ?? null));
          });
        }}
      >
        <Trash2 />
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}

/** Marks the conversation as read while it is shown with unread messages. */
export function MarkRead({ conversationId, unread }: { conversationId: string; unread: boolean }) {
  useEffect(() => {
    if (unread) void markReadAction(conversationId);
  }, [conversationId, unread]);
  return null;
}

/** Re-renders when messages, swaps or afbud change (Realtime, RLS-filtered). */
export function MessagesRealtime({ conversationId }: { conversationId?: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };
    const channel = supabase
      .channel(`messages-${conversationId ?? "all"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message",
          ...(conversationId ? { filter: `conversation_id=eq.${conversationId}` } : {}),
        },
        refresh,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_swap" }, refresh)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shift_cancellation" },
        refresh,
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, router]);
  return null;
}
