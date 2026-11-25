"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { da } from "@/lib/i18n/da";
import { hasAny, type PermissionKey, type Permissions } from "@/lib/permissions";

type Tab = {
  href: string;
  label: string;
  anyOf?: readonly PermissionKey[];
  needsEmployee?: boolean;
  forApprovers?: boolean;
};

const t = da.sectionTabs;

/**
 * The band under the page header: the pages that belong together with the one
 * open, so you move between them without the menu. Which band shows follows
 * the page (and so the item chosen in the menu).
 */
const SECTIONS: Tab[][] = [
  [
    { href: "/min-vagtplan", label: t.shifts, needsEmployee: true },
    { href: "/tid", label: t.time, needsEmployee: true },
    { href: "/fravaer", label: t.absence, needsEmployee: true },
    { href: "/koersel", label: t.expenses, needsEmployee: true },
    { href: "/profil", label: t.profile },
  ],
  [
    {
      href: "/aktiviteter",
      label: t.requests,
      anyOf: ["schedule.manage", "time.approve", "absence.approve", "expenses.manage"],
      forApprovers: true,
    },
    {
      href: "/aktiviteter/stemplinger",
      label: t.stamps,
      anyOf: ["time.view", "time.manage", "time.approve"],
      forApprovers: true,
    },
    {
      href: "/tid/godkend",
      label: t.approveTime,
      anyOf: ["time.view", "time.manage", "time.approve"],
      forApprovers: true,
    },
    {
      href: "/fravaer/godkend",
      label: t.approveAbsence,
      anyOf: ["absence.view", "absence.manage", "absence.approve"],
      forApprovers: true,
    },
  ],
  [
    { href: "/vagtplan", label: t.schedule, anyOf: ["schedule.view", "schedule.manage"] },
    { href: "/vagtplan/skabeloner", label: t.templates, anyOf: ["schedule.manage"] },
    { href: "/vagtplan/turnus", label: t.turnus, anyOf: ["schedule.manage"] },
  ],
  [
    { href: "/medarbejdere", label: t.employees, anyOf: ["employees.view", "employees.manage"] },
    {
      href: "/afdelinger",
      label: t.departments,
      anyOf: ["departments.manage", "users.manage", "employees.view"],
    },
    { href: "/indstillinger/rettigheder", label: t.profiles, anyOf: ["users.manage"] },
    {
      href: "/indlaes",
      label: t.import,
      anyOf: ["departments.manage", "employees.manage", "schedule.manage", "absence.manage"],
    },
  ],
  [
    { href: "/lon", label: t.payroll, anyOf: ["payroll.view", "payroll.manage"] },
    { href: "/rapporter", label: t.reports, anyOf: ["reports.view"] },
    { href: "/projekter", label: t.projects, anyOf: ["projects.view", "projects.manage"] },
  ],
  [
    { href: "/indstillinger/opsaetning", label: t.settings, anyOf: ["settings.manage"] },
    { href: "/indstillinger/arbejdspladser", label: t.workplaces, anyOf: ["settings.manage"] },
    { href: "/indstillinger/lonperioder", label: t.payPeriods, anyOf: ["settings.manage"] },
    { href: "/indstillinger/overenskomster", label: t.agreements, anyOf: ["agreements.manage"] },
    { href: "/indstillinger/kontering", label: t.posting, anyOf: ["posting.manage"] },
    { href: "/indstillinger/integrationer", label: t.integrations, anyOf: ["integrations.manage"] },
  ],
];

export function SectionTabs({
  permissions,
  hasEmployee,
  isApprover,
}: {
  permissions: Permissions;
  hasEmployee: boolean;
  isApprover: boolean;
}) {
  const pathname = usePathname();
  const allowed = (tab: Tab) =>
    (!tab.anyOf || hasAny(permissions, tab.anyOf) || (tab.forApprovers && isApprover)) &&
    (!tab.needsEmployee || hasEmployee);
  const matches = (h: string) => pathname === h || pathname.startsWith(`${h}/`);
  // The most specific tab that matches the page decides the band.
  const all = SECTIONS.flatMap((tabs, i) => tabs.filter(allowed).map((tab) => ({ tab, i })));
  const current = all
    .filter((x) => matches(x.tab.href))
    .sort((a, b) => b.tab.href.length - a.tab.href.length)[0];
  if (!current) return null;
  const tabs = all.filter((x) => x.i === current.i).map((x) => x.tab);
  if (tabs.length < 2) return null;
  return (
    <nav aria-label={t.label} className="mb-5 -mt-1 sm:mb-6" data-testid="section-tabs">
      <ul className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-1 [scrollbar-width:none] md:w-fit">
        {tabs.map((tab) => {
          const active = tab.href === current.tab.href;
          return (
            <li key={tab.href} className="flex-1 md:flex-none">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-9 items-center justify-center rounded-lg px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11",
                  active
                    ? "bg-card font-medium text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
