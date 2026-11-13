import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getAppContext } from "@/lib/auth";
import { signOutAction } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { da } from "@/lib/i18n/da";

export const metadata: Metadata = { title: "Ingen adgang" };

/** Signed in, but without an active organization (e.g. an archived customer). */
export default async function NoAccessPage() {
  if (await getAppContext()) redirect("/oversigt");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  const { data: platform } = await supabase.rpc("is_platform_admin");
  if (platform === true) redirect("/platform");
  const t = da.auth;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">{t.noOrganizationTitle}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t.noOrganizationLead}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <form action={signOutAction}>
          <Button type="submit" variant="outline">
            {da.nav.signOut}
          </Button>
        </form>
      </div>
    </div>
  );
}
