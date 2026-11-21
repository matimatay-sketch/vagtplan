"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  archiveAgreementAction,
  copyAgreementAction,
  createAgreementAction,
  createLocalAction,
  newVersionAction,
} from "@/lib/actions/agreements";
import { newKitVersionAction } from "@/lib/actions/starter-kits";
import { da } from "@/lib/i18n/da";

export function CopyAgreementButton({ agreementId }: { agreementId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await copyAgreementAction(agreementId);
          if (r.message) (r.ok ? toast.success : toast.error)(r.message);
          if (r.id) router.push(`/indstillinger/overenskomster/${r.id}`);
        })
      }
    >
      <Copy /> {da.agreements.copy}
    </Button>
  );
}

export function NewAgreementForm({ defaultDate }: { defaultDate: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [validFrom, setValidFrom] = useState(defaultDate);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      data-testid="new-agreement"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createAgreementAction(name, validFrom);
          if (r.message) (r.ok ? toast.success : toast.error)(r.message);
          if (r.id) router.push(`/indstillinger/overenskomster/${r.id}`);
        });
      }}
    >
      <Input
        className="h-8 w-64"
        aria-label={da.agreements.newAgreementName}
        placeholder={da.agreements.newAgreementName}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        className="h-8 w-40"
        type="date"
        aria-label={da.agreements.validFrom}
        value={validFrom}
        onChange={(e) => setValidFrom(e.target.value)}
      />
      <Button size="sm" disabled={pending || !name.trim()} title={da.agreements.newAgreementHelp}>
        <Plus /> {da.agreements.newAgreement}
      </Button>
    </form>
  );
}

export function NewLocalForm({ parentId }: { parentId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createLocalAction(parentId, name);
          if (r.message) (r.ok ? toast.success : toast.error)(r.message);
          if (r.id) router.push(`/indstillinger/overenskomster/${r.id}`);
        });
      }}
    >
      <Input
        className="h-8"
        aria-label={da.agreements.localName}
        placeholder={da.agreements.localName}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Button size="sm" variant="outline" disabled={pending || !name.trim()}>
        <Plus /> {da.agreements.newLocal}
      </Button>
    </form>
  );
}

/** A new version from a date, in an own agreement or (with `kitKey`) a starter kit. */
export function NewVersionForm({
  agreementId,
  kitKey,
  defaultDate,
}: {
  agreementId?: string;
  kitKey?: string;
  defaultDate: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(defaultDate);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = kitKey
            ? await newKitVersionAction(kitKey, date)
            : await newVersionAction(agreementId ?? "", date);
          if (r.message) (r.ok ? toast.success : toast.error)(r.message);
          if (r.ok) router.refresh();
        });
      }}
    >
      <label className="grid gap-1 text-xs text-muted-foreground">
        {da.agreements.newVersionFrom}
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-44"
        />
      </label>
      <Button variant="outline" disabled={pending}>
        <Plus /> {da.agreements.newVersion}
      </Button>
    </form>
  );
}

export function DeleteAgreementButton({
  agreementId,
  name,
}: {
  agreementId: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-destructive"
      disabled={pending}
      data-testid="delete-agreement"
      onClick={() => {
        if (!window.confirm(da.agreements.deleteConfirm(name))) return;
        start(async () => {
          const r = await archiveAgreementAction(agreementId);
          if (r.message) (r.ok ? toast.success : toast.error)(r.message);
          if (r.ok) router.push("/indstillinger/overenskomster");
        });
      }}
    >
      <Trash2 /> {da.agreements.deleteAgreement}
    </Button>
  );
}
