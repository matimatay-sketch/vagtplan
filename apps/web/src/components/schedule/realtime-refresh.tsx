"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { da } from "@/lib/i18n/da";

/** Re-renders the page when shifts or availability change (Supabase Realtime, RLS-filtered). */
export function RealtimeRefresh({ departmentId }: { departmentId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Never re-render under the user's hands: wait while a drag/resize is in progress.
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (document.body.dataset.scheduleBusy === "1") refresh();
        else router.refresh();
      }, 300);
    };
    const channel = supabase
      .channel(`schedule-${departmentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shift",
          filter: `department_id=eq.${departmentId}`,
        },
        refresh,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "availability" }, refresh)
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [departmentId, router]);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Radio className="size-3.5 text-success" /> {da.schedule.live}
    </span>
  );
}
