"use client";
import { useTransition } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyPreviousWeekAction } from "@/lib/actions/schedule";
import { da } from "@/lib/i18n/da";

export function CopyWeekButton({
  departmentId,
  weekStart,
}: {
  departmentId: string;
  weekStart: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await copyPreviousWeekAction({ departmentId, weekStart });
          if (r.ok) toast.success(r.message);
          else toast.message(r.message ?? da.common.unknownError);
        })
      }
    >
      <Copy /> {da.schedule.copyWeek}
    </Button>
  );
}
