import type { Metadata } from "next";
import { Download, Trash2 } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableFoot,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { archiveProjectAction } from "@/lib/actions/projects";
import { loadProjectReport, reportFilter } from "@/lib/projects/load-report";
import { summarizeProjects } from "@/lib/domain/project-report";
import { formatHours } from "@/lib/domain/numbers";
import { formatDate } from "@/lib/format";
import { da } from "@/lib/i18n/da";
import { ProjectForm } from "./project-form";
import { EditProjectButton } from "./edit-project-button";

export const metadata: Metadata = { title: "Projekter" };

export default async function ProjectsPage({ searchParams }: PageProps<"/projekter">) {
  const ctx = await requireContext(["projects.view", "projects.manage"]);
  const sp = await searchParams;
  const supabase = await createClient();
  const t = da.projects;
  const filter = reportFilter(sp, ctx.organization.timezone);
  const { projects, departments, visibleDepartments, lines } = await loadProjectReport(
    supabase,
    ctx,
    filter,
  );
  const canView = Boolean(ctx.permissions["projects.view"]);
  const canManage = ctx.permissions["projects.manage"] === "organization";
  const byId = new Map(projects.map((p) => [p.id, p]));
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const summary = summarizeProjects(lines);
  const total = summary.reduce((s, p) => s + p.minutes, 0);
  const exportHref = `/projekter/eksport?${new URLSearchParams({
    fra: filter.from,
    til: filter.to,
    ...(filter.departmentId ? { afdeling: filter.departmentId } : {}),
  })}`;

  return (
    <>
      <PageHeader title={t.title} lead={t.lead} />

      {canView ? (
        <section className="mb-8 grid gap-4" aria-labelledby="report-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="report-title" className="text-lg font-semibold">
              {t.reportTitle}
            </h2>
            <form className="flex flex-wrap items-end gap-2" data-testid="report-filter">
              <label className="grid gap-1 text-xs text-muted-foreground">
                {t.from_}
                <Input type="date" name="fra" defaultValue={filter.from} className="w-40" />
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">
                {t.to_}
                <Input type="date" name="til" defaultValue={filter.to} className="w-40" />
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">
                {t.department}
                <NativeSelect name="afdeling" defaultValue={filter.departmentId ?? ""}>
                  <option value="">{t.allVisibleDepartments}</option>
                  {visibleDepartments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <Button type="submit" variant="outline">
                {t.show}
              </Button>
              <Button asChild>
                <a href={exportHref} download>
                  <Download /> {t.exportCsv}
                </a>
              </Button>
            </form>
          </div>
          <p className="text-sm text-muted-foreground">{t.reportLead}</p>
          {summary.length === 0 ? (
            <EmptyState>{t.emptyHours}</EmptyState>
          ) : (
            <Card className="py-0">
              <Table data-testid="project-summary">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.project}</TableHead>
                    <TableHead>{t.employee}</TableHead>
                    <TableHead className="text-right">{t.shifts}</TableHead>
                    <TableHead className="text-right">{t.hours}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.map((s) => {
                    const p = byId.get(s.projectId);
                    return (
                      <TableRow key={s.projectId} className="align-top">
                        <TableCell>
                          <div className="font-medium">
                            {p?.number} · {p?.name}
                          </div>
                          {p?.customer ? (
                            <div className="text-xs text-muted-foreground">{p.customer}</div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <ul className="grid gap-0.5 text-sm">
                            {s.employees.map((e) => (
                              <li
                                key={e.employeeId ?? "open"}
                                className="flex justify-between gap-4"
                              >
                                <span>{e.name ?? t.openShift}</span>
                                <span className="tabular text-muted-foreground">
                                  {formatHours(e.minutes)} t
                                </span>
                              </li>
                            ))}
                          </ul>
                        </TableCell>
                        <TableCell className="text-right tabular">{s.shiftCount}</TableCell>
                        <TableCell className="text-right font-semibold tabular">
                          {formatHours(s.minutes)} t
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFoot>
                  <TableRow>
                    <TableCell colSpan={3}>{t.total}</TableCell>
                    <TableCell
                      className="text-right font-semibold tabular"
                      data-testid="project-total"
                    >
                      {formatHours(total)} t
                    </TableCell>
                  </TableRow>
                </TableFoot>
              </Table>
            </Card>
          )}
          {lines.length ? (
            <details className="rounded-xl border bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                {t.details} ({lines.length})
              </summary>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.date}</TableHead>
                    <TableHead>{t.project}</TableHead>
                    <TableHead>{t.employee}</TableHead>
                    <TableHead>{t.department}</TableHead>
                    <TableHead>{t.status}</TableHead>
                    <TableHead className="text-right">{t.hours}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l, i) => (
                    <TableRow key={`${l.shiftId}-${l.projectId}-${i}`}>
                      <TableCell className="tabular">{formatDate(l.date)}</TableCell>
                      <TableCell>{byId.get(l.projectId)?.number}</TableCell>
                      <TableCell>{l.employeeName ?? t.openShift}</TableCell>
                      <TableCell>{l.departmentName}</TableCell>
                      <TableCell>{t.statuses[l.status]}</TableCell>
                      <TableCell className="text-right tabular">
                        {formatHours(l.minutes)} t
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </details>
          ) : null}
        </section>
      ) : (
        <p className="mb-6 text-sm text-muted-foreground">{t.noViewPermission}</p>
      )}

      {canManage ? (
        <section className="grid gap-4" aria-labelledby="manage-title">
          <h2 id="manage-title" className="text-lg font-semibold">
            {t.manageTitle}
          </h2>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.new}</CardTitle>
            </CardHeader>
            <CardContent>
              <ProjectForm departments={departments} />
            </CardContent>
          </Card>
          {projects.length === 0 ? (
            <EmptyState>{t.none}</EmptyState>
          ) : (
            <Card className="py-0">
              <Table data-testid="project-list">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.number}</TableHead>
                    <TableHead>{t.name}</TableHead>
                    <TableHead>{t.customer}</TableHead>
                    <TableHead>{t.departments}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects
                    .filter((p) => !p.archived)
                    .map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium tabular">{p.number}</TableCell>
                        <TableCell>{p.name}</TableCell>
                        <TableCell>{p.customer ?? "–"}</TableCell>
                        <TableCell>
                          {p.departmentIds.length === 0 ? (
                            <span className="text-muted-foreground">{t.allDepartments}</span>
                          ) : (
                            <span className="flex flex-wrap gap-1">
                              {p.departmentIds.map((d) => (
                                <Badge key={d} variant="secondary">
                                  {deptName.get(d)}
                                </Badge>
                              ))}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <EditProjectButton project={p} departments={departments} />
                          <form action={archiveProjectAction} className="inline">
                            <input type="hidden" name="id" value={p.id} />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="icon"
                              aria-label={`${t.archive} ${p.number}`}
                            >
                              <Trash2 />
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </section>
      ) : null}
    </>
  );
}
