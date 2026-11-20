import type { Metadata } from "next";
import Link from "next/link";
import { Columns3, Lock, Star } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasOrg, isPermissionKey, type Permissions } from "@/lib/permissions";
import { setDefaultProfileAction } from "@/lib/actions/access";
import { da } from "@/lib/i18n/da";
import { cn } from "@/lib/utils";
import { ArchiveProfileForm, CreateProfileForm, GrantMatrix } from "./forms";

export const metadata: Metadata = { title: "Rettighedsprofiler" };

export default async function ProfilesPage({
  searchParams,
}: PageProps<"/indstillinger/rettigheder">) {
  const ctx = await requireContext(["users.manage"]);
  const { profil } = await searchParams;
  const supabase = await createClient();
  const t = da.profiles;

  const [
    { data: profiles },
    { data: grants },
    { data: memberships },
    { data: org },
    { count: withoutLogin },
  ] = await Promise.all([
    supabase
      .from("permission_profile")
      .select("id, name, description, is_owner")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("is_owner", { ascending: false })
      .order("name"),
    supabase
      .from("permission_grant")
      .select("profile_id, permission, scope")
      .eq("organization_id", ctx.organization.id),
    supabase.from("membership").select("profile_id").eq("organization_id", ctx.organization.id),
    supabase
      .from("organization")
      .select("default_profile_id")
      .eq("id", ctx.organization.id)
      .single(),
    // Employees without a login get the default profile when they are invited.
    supabase
      .from("employee")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organization.id)
      .is("user_id", null)
      .is("archived_at", null),
  ]);
  const list = profiles ?? [];
  const selected = list.find((p) => p.id === profil) ?? list[0];
  const grantsOf = (id: string): Permissions => {
    const out: Permissions = {};
    for (const g of grants ?? [])
      if (g.profile_id === id && isPermissionKey(g.permission)) out[g.permission] = g.scope;
    return out;
  };
  const memberCount = (id: string) => (memberships ?? []).filter((m) => m.profile_id === id).length;

  return (
    <>
      <PageHeader
        title={t.title}
        lead={t.lead}
        actions={
          list.length > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/indstillinger/rettigheder/sammenlign" data-testid="compare-profiles">
                <Columns3 className="size-4" />
                {t.compareLink}
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <div className="grid content-start gap-3">
          <nav aria-label={t.title} className="grid gap-1.5">
            {list.map((p) => (
              <Link
                key={p.id}
                href={`/indstillinger/rettigheder?profil=${p.id}`}
                aria-current={p.id === selected?.id ? "page" : undefined}
                className={cn(
                  "rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted",
                  p.id === selected?.id && "border-primary bg-secondary hover:bg-secondary",
                )}
              >
                <span className="flex items-center justify-between gap-2 font-medium">
                  {p.name}
                  {p.is_owner ? (
                    <Lock className="size-3.5 text-muted-foreground" aria-label={t.locked} />
                  ) : null}
                  {org?.default_profile_id === p.id ? (
                    <Star className="size-3.5 fill-signal text-signal" aria-label={t.default} />
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground" data-testid="profile-count">
                  {t.members(memberCount(p.id))}
                  {org?.default_profile_id === p.id && (withoutLogin ?? 0) > 0
                    ? ` · ${t.withoutLogin(withoutLogin ?? 0)}`
                    : ""}
                </span>
              </Link>
            ))}
          </nav>
          <Card className="py-4">
            <CardContent className="px-4">
              <CreateProfileForm />
            </CardContent>
          </Card>
        </div>
        {selected ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
                {selected.name}
                {selected.is_owner ? <Badge variant="outline">{t.locked}</Badge> : null}
                {org?.default_profile_id === selected.id ? (
                  <Badge variant="signal">{t.default}</Badge>
                ) : null}
              </CardTitle>
              <CardDescription>
                {selected.is_owner ? t.lockedHelp : (selected.description ?? "")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              <GrantMatrix
                key={selected.id}
                profileId={selected.id}
                grants={grantsOf(selected.id)}
                locked={selected.is_owner}
              />
              {selected.is_owner ? null : (
                <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                  {org?.default_profile_id !== selected.id &&
                  hasOrg(ctx.permissions, "settings.manage") ? (
                    <form action={setDefaultProfileAction}>
                      <input type="hidden" name="profile_id" value={selected.id} />
                      <Button type="submit" variant="outline" size="sm">
                        {t.makeDefault}
                      </Button>
                    </form>
                  ) : null}
                  <ArchiveProfileForm profileId={selected.id} />
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
