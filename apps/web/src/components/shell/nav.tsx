"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarX,
  Plane,
  ClipboardCheck,
  Timer,
  FolderKanban,
  Building2,
  CalendarClock,
  CalendarHeart,
  FileText,
  KeyRound,
  Settings,
  Repeat,
  LayoutDashboard,
  UserRound,
  Users,
  Wallet,
  Tags,
  Car,
  Receipt,
  Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { da } from "@/lib/i18n/da";
import { hasAny, type PermissionKey, type Permissions } from "@/lib/permissions";

type Item = {
  href: string;
  label: string;
  icon: typeof Users;
  /** Visible when the user has any of these permissions; empty = everyone. */
  anyOf: readonly PermissionKey[];
  needsEmployee?: boolean;
  /** Also visible for personal time approvers ("Godkendes af"). */
  forApprovers?: boolean;
};

const items: Item[] = [
  { href: "/oversigt", label: da.nav.overview, icon: LayoutDashboard, anyOf: [] },
  {
    href: "/vagtplan",
    label: da.nav.schedule,
    icon: CalendarClock,
    anyOf: ["schedule.view", "schedule.manage"],
  },
  {
    href: "/min-vagtplan",
    label: da.nav.mySchedule,
    icon: CalendarHeart,
    anyOf: [],
    needsEmployee: true,
  },
  {
    href: "/medarbejdere",
    label: da.nav.employees,
    icon: Users,
    anyOf: ["employees.view", "employees.manage"],
  },
  {
    href: "/afdelinger",
    label: da.nav.departments,
    icon: Building2,
    anyOf: ["departments.manage", "users.manage", "employees.view"],
  },
  {
    href: "/indstillinger/rettigheder",
    label: da.nav.profiles,
    icon: KeyRound,
    anyOf: ["users.manage"],
  },
  { href: "/vagtplan/turnus", label: da.nav.turnus, icon: Repeat, anyOf: ["schedule.manage"] },
  { href: "/tid", label: da.nav.time, icon: Timer, anyOf: [], needsEmployee: true },
  {
    href: "/tid/godkend",
    label: da.nav.approveTime,
    icon: ClipboardCheck,
    anyOf: ["time.view", "time.manage", "time.approve"],
    forApprovers: true,
  },
  { href: "/koersel", label: da.nav.expenses, icon: Car, anyOf: [], needsEmployee: true },
  { href: "/lon", label: da.nav.payroll, icon: Wallet, anyOf: ["payroll.view", "payroll.manage"] },
  { href: "/fravaer", label: da.nav.absence, icon: Plane, anyOf: [], needsEmployee: true },
  {
    href: "/fravaer/godkend",
    label: da.nav.absenceAdmin,
    icon: CalendarX,
    anyOf: ["absence.view", "absence.manage", "absence.approve"],
    forApprovers: true,
  },
  {
    href: "/projekter",
    label: da.nav.projects,
    icon: FolderKanban,
    anyOf: ["projects.view", "projects.manage"],
  },
  {
    href: "/indstillinger/opsaetning",
    label: da.nav.settings,
    icon: Settings,
    anyOf: ["settings.manage"],
  },
  {
    href: "/indstillinger/lonperioder",
    label: da.nav.payPeriodGroups,
    icon: Wallet,
    anyOf: ["settings.manage"],
  },
  {
    href: "/indstillinger/overenskomster",
    label: da.nav.agreements,
    icon: FileText,
    anyOf: ["agreements.manage"],
  },
  {
    href: "/indstillinger/kontering",
    label: da.nav.posting,
    icon: Tags,
    anyOf: ["posting.manage"],
  },
  {
    href: "/indstillinger/koersel",
    label: da.nav.expenseSettings,
    icon: Receipt,
    anyOf: ["expenses.manage"],
  },
  {
    href: "/indstillinger/integrationer",
    label: da.nav.integrations,
    icon: Plug,
    anyOf: ["integrations.manage"],
  },
  { href: "/profil", label: da.nav.myProfile, icon: UserRound, anyOf: [], needsEmployee: true },
];

export function Nav({
  permissions,
  hasEmployee,
  isApprover = false,
  variant,
}: {
  permissions: Permissions;
  hasEmployee: boolean;
  isApprover?: boolean;
  variant: "sidebar" | "bar";
}) {
  const pathname = usePathname();
  const visible = items.filter(
    (i) =>
      (i.anyOf.length === 0 || hasAny(permissions, i.anyOf) || (i.forApprovers && isApprover)) &&
      (!i.needsEmployee || hasEmployee),
  );
  return (
    <nav
      aria-label="Hovedmenu"
      className={variant === "sidebar" ? "grid gap-0.5" : "flex gap-1 overflow-x-auto px-2"}
    >
      {visible.map(({ href, label, icon: Icon }) => {
        // Only the most specific matching item is active (e.g. /vagtplan/turnus, not /vagtplan).
        const matches = (h: string) => pathname === h || pathname.startsWith(`${h}/`);
        const active =
          matches(href) && !visible.some((o) => o.href.length > href.length && matches(o.href));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              variant === "sidebar"
                ? active
                  ? "bg-sidebar-accent text-white shadow-[inset_3px_0_0_var(--signal)]"
                  : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                : cn(
                    "shrink-0 flex-col gap-1 px-3 py-1.5 text-[11px]",
                    active ? "text-primary" : "text-muted-foreground",
                  ),
            )}
          >
            <Icon
              className={cn(
                "size-4",
                variant === "bar" && "size-5",
                active && variant === "sidebar" && "text-signal",
              )}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
