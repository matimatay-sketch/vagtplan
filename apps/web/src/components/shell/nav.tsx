"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
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
  { href: "/profil", label: da.nav.myProfile, icon: UserRound, anyOf: [], needsEmployee: true },
];

export function Nav({
  permissions,
  hasEmployee,
  variant,
}: {
  permissions: Permissions;
  hasEmployee: boolean;
  variant: "sidebar" | "bar";
}) {
  const pathname = usePathname();
  const visible = items.filter(
    (i) =>
      (i.anyOf.length === 0 || hasAny(permissions, i.anyOf)) && (!i.needsEmployee || hasEmployee),
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
