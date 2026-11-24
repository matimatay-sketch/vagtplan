"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { discardProposalAction } from "@/lib/actions/assistant";
import { da } from "@/lib/i18n/da";

const t = da.assistant;

export function ProposalBanner({
  proposals,
  canManage,
}: {
  proposals: { id: string; shiftCount: number; note: string | null; source: string }[];
  canManage: boolean;
}) {
  const [busy, start] = useTransition();
  const router = useRouter();
  return (
    <>
      {proposals.map((p) => (
        <Alert key={p.id} className="mb-4" data-testid="proposal-banner">
          <AlertDescription className="grid gap-2">
            <span className="flex items-center gap-2 font-medium text-foreground">
              <Sparkles className="size-4" />{" "}
              {p.source === "auto"
                ? da.autoSchedule.proposalBanner(p.shiftCount)
                : t.proposalBanner(p.shiftCount)}
            </span>
            {p.note ? <span className="whitespace-pre-wrap">{p.note}</span> : null}
            {canManage ? (
              <span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    start(async () => {
                      const r = await discardProposalAction(p.id);
                      if (r.ok) {
                        toast.success(t.discarded);
                        router.refresh();
                      }
                    })
                  }
                >
                  {t.discard}
                </Button>
              </span>
            ) : null}
          </AlertDescription>
        </Alert>
      ))}
    </>
  );
}
