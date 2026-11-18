"use client";
import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { da } from "@/lib/i18n/da";

/** Shows a secret once, with a copy button. */
export function SecretBox({ secret, note }: { secret: string; note: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Alert data-testid="secret-box">
      <AlertDescription className="grid gap-2">
        <span className="font-medium text-foreground">{note}</span>
        <code className="rounded bg-muted px-2 py-1 text-xs break-all" data-testid="secret-value">
          {secret}
        </code>
        <span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(secret).catch(() => {});
              setCopied(true);
            }}
          >
            <Copy /> {copied ? da.integrations.copied : da.integrations.copy}
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}
