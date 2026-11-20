import { cookies } from "next/headers";
import { SubmitButton } from "@/components/form";
import { UserRoundCog } from "lucide-react";
import { IMPERSONATION_COOKIE, createClient } from "@/lib/supabase/server";
import { stopImpersonationAction } from "@/lib/actions/impersonation";
import { da } from "@/lib/i18n/da";

/** Shown on every page while an administrator is logged in as an employee. */
export async function ImpersonationBanner() {
  const sid = (await cookies()).get(IMPERSONATION_COOKIE)?.value;
  if (!sid) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("impersonation_info", { p_session: sid });
  const info = data?.[0];
  return (
    <div
      className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-3 bg-signal px-4 py-2 text-sm font-medium text-signal-foreground"
      data-testid="impersonation-banner"
    >
      <UserRoundCog className="size-4" />
      <span>
        {info
          ? da.impersonation.banner(info.employee_name, info.admin_email)
          : da.impersonation.bannerEnded}
      </span>
      <form action={stopImpersonationAction}>
        <SubmitButton size="sm" variant="secondary">
          {da.impersonation.stop}
        </SubmitButton>
      </form>
    </div>
  );
}
