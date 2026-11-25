import type { Metadata } from "next";
import { HelpTip } from "@/components/help/help";
import { MapPin } from "lucide-react";
import { LazyDetails } from "@/components/lazy-details";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { da } from "@/lib/i18n/da";
import { DeleteWorkplaceButton, WorkplaceForm, type WorkplaceRow } from "./forms";

export const metadata: Metadata = { title: "Arbejdspladser" };

export default async function WorkplacesPage() {
  const ctx = await requireContext(["settings.manage"]);
  const supabase = await createClient();
  const t = da.workplaces;
  const [{ data: rows }, { data: departments }] = await Promise.all([
    supabase
      .from("workplace")
      .select(
        "id, name, address, latitude, longitude, radius_m, workplace_department (department_id)",
      )
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("department")
      .select("id, name")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("name"),
  ]);
  const depts = departments ?? [];
  const deptName = new Map(depts.map((d) => [d.id, d.name]));
  const workplaces: WorkplaceRow[] = (rows ?? []).map((w) => ({
    id: w.id,
    name: w.name,
    address: w.address,
    latitude: w.latitude,
    longitude: w.longitude,
    radius_m: w.radius_m,
    department_ids: w.workplace_department.map((x) => x.department_id),
  }));

  return (
    <>
      <PageHeader title={t.title} help={t.help} />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              {t.newTitle}
              <HelpTip>{t.coordinatesHelp}</HelpTip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <WorkplaceForm departments={depts} />
          </CardContent>
        </Card>
        {workplaces.length === 0 ? (
          <EmptyState>{t.empty}</EmptyState>
        ) : (
          <ul className="grid gap-3" data-testid="workplaces">
            {workplaces.map((w) => (
              <li key={w.id} data-workplace={w.name}>
                <Card className="gap-3 py-4">
                  <CardContent className="grid gap-2 px-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <MapPin className="mt-0.5 size-5 text-primary" aria-hidden />
                        <div>
                          <p className="font-medium">{w.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {[
                              w.address,
                              t.radiusShort(w.radius_m),
                              w.department_ids.length
                                ? w.department_ids.map((d) => deptName.get(d) ?? "").join(", ")
                                : t.allDepartments,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          <a
                            href={`https://www.openstreetmap.org/?mlat=${w.latitude}&mlon=${w.longitude}#map=17/${w.latitude}/${w.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-primary underline-offset-4 hover:underline"
                          >
                            {t.showOnMap}
                          </a>
                        </div>
                      </div>
                      <DeleteWorkplaceButton id={w.id} name={w.name} />
                    </div>
                    <LazyDetails summary={t.edit} summaryClassName="text-sm">
                      <div className="mt-3">
                        <WorkplaceForm initial={w} departments={depts} />
                      </div>
                    </LazyDetails>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
