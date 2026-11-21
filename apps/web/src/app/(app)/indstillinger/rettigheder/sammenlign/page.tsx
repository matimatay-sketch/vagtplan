import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  PERMISSIONS,
  isPermissionKey,
  scopeLabel,
  type PermissionKey,
  type Permissions,
} from "@/lib/permissions";
import { compareProfiles, type CompareScope } from "@/lib/domain/profile-compare";
import { da } from "@/lib/i18n/da";
import { cn } from "@/lib/utils";
import { CompareControls } from "./controls";

export const metadata: Metadata = { title: "Sammenlign rettighedsprofiler" };

function ScopeCell({ perm, scope }: { perm: PermissionKey; scope: CompareScope | null }) {
  const label = scopeLabel(perm, scope ?? "");
  if (scope === null)
    return label === da.profiles.none ? (
      <span className="text-muted-foreground" aria-label={label}>
        –
      </span>
    ) : (
      <span className="text-muted-foreground">{label}</span>
    );
  return <Badge variant={scope === "organization" ? "default" : "secondary"}>{label}</Badge>;
}

export default async function CompareProfilesPage({
  searchParams,
}: PageProps<"/indstillinger/rettigheder/sammenlign">) {
  const ctx = await requireContext(["users.manage"]);
  const sp = await searchParams;
  const supabase = await createClient();
  const t = da.profiles;

  const [{ data: profiles }, { data: grants }, { data: memberships }] = await Promise.all([
    supabase
      .from("permission_profile")
      .select("id, name, is_owner")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("is_owner", { ascending: false })
      .order("name"),
    supabase
      .from("permission_grant")
      .select("profile_id, permission, scope")
      .eq("organization_id", ctx.organization.id),
    supabase.from("membership").select("profile_id").eq("organization_id", ctx.organization.id),
  ]);
  const list = profiles ?? [];
  const wanted = [sp.p ?? []].flat();
  // No choice in the URL: compare all profiles.
  const chosen = wanted.length ? list.filter((p) => wanted.includes(p.id)) : list;
  const onlyDifferences = sp.forskelle === "1";

  const grantsOf = (id: string): Permissions => {
    const out: Permissions = {};
    for (const g of grants ?? [])
      if (g.profile_id === id && isPermissionKey(g.permission)) out[g.permission] = g.scope;
    return out;
  };
  const result = compareProfiles(
    PERMISSIONS,
    chosen.map((p) => ({ id: p.id, grants: grantsOf(p.id) })),
    { onlyDifferences },
  );
  const members = (id: string) => (memberships ?? []).filter((m) => m.profile_id === id).length;

  return (
    <>
      <PageHeader
        title={t.compare.title}
        help={t.compare.lead}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/indstillinger/rettigheder">
              <ArrowLeft className="size-4" />
              {t.title}
            </Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="grid gap-4">
          <CompareControls
            profiles={list.map((p) => ({ id: p.id, name: p.name }))}
            selected={chosen.map((p) => p.id)}
            onlyDifferences={onlyDifferences}
          />
          <p className="text-sm text-muted-foreground" data-testid="compare-summary">
            {chosen.length < 2 ? t.compare.pickTwo : t.compare.summary(result.differences)}
          </p>
          {chosen.length ? (
            <div className="relative w-full overflow-x-auto rounded-lg border">
              <table className="w-full text-sm" data-testid="compare-table">
                <thead>
                  <tr className="border-b bg-muted">
                    <th
                      scope="col"
                      className="sticky left-0 z-10 min-w-36 bg-muted sm:min-w-48 px-3 py-2 text-left font-medium"
                    >
                      {t.compare.permission}
                    </th>
                    {chosen.map((p, i) => (
                      <th
                        key={p.id}
                        scope="col"
                        className="min-w-32 px-3 py-2 text-left align-bottom font-medium"
                      >
                        <Link
                          href={`/indstillinger/rettigheder?profil=${p.id}`}
                          className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
                        >
                          {p.name}
                          {p.is_owner ? (
                            <Lock
                              className="size-3.5 text-muted-foreground"
                              aria-label={t.locked}
                            />
                          ) : null}
                        </Link>
                        <span className="block text-xs font-normal text-muted-foreground">
                          {t.compare.columnInfo(result.counts[i] ?? 0, members(p.id))}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                {result.groups.map((g) => (
                  <tbody key={g.group}>
                    <tr className="border-b">
                      <th
                        scope="colgroup"
                        colSpan={chosen.length + 1}
                        className="sticky left-0 bg-card px-3 pt-4 pb-1 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        {g.group}
                      </th>
                    </tr>
                    {g.rows.map((r) => (
                      <tr
                        key={r.key}
                        data-testid="compare-row"
                        data-permission={r.key}
                        data-differs={r.differs ? "true" : undefined}
                        className={cn("border-b last:border-0", r.differs && "bg-accent/30")}
                      >
                        <th
                          scope="row"
                          className={cn(
                            "sticky left-0 z-10 px-3 py-2 text-left font-normal",
                            r.differs ? "bg-accent/30 backdrop-blur" : "bg-card",
                          )}
                        >
                          {r.label}
                          {r.differs ? (
                            <span className="sr-only"> ({t.compare.differs})</span>
                          ) : null}
                        </th>
                        {r.scopes.map((s, i) => (
                          <td key={chosen[i]!.id} className="px-3 py-2">
                            <ScopeCell perm={r.key as PermissionKey} scope={s} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
