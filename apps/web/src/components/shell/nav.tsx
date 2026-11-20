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
  Menu,
} from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  // Only the most specific matching item is active (e.g. /vagtplan/turnus, not /vagtplan).
  const matches = (h: string) => pathname === h || pathname.startsWith(`${h}/`);
  const isActive = (href: string) =>
    matches(href) && !visible.some((o) => o.href.length > href.length && matches(o.href));

  if (variant === "bar") return <BottomBar items={visible} isActive={isActive} />;
  return (
    <nav aria-label="Hovedmenu" className="grid gap-0.5">
      {visible.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-white shadow-[inset_3px_0_0_var(--signal)]"
                : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <Icon className={cn("size-4", active && "text-signal")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The phone's daily destinations first; the rest goes under "Mere". */
const BAR_PRIORITY = [
  "/oversigt",
  "/min-vagtplan",
  "/tid",
  "/vagtplan",
  "/tid/godkend",
  "/fravaer",
];
const BAR_SLOTS = 5;

/**
 * Bottom bar on phones: at most five targets of at least 44 px. With more
 * items, four stay in the bar and the rest open in a sheet ("Mere").
 */
function BottomBar({ items, isActive }: { items: Item[]; isActive: (href: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const rank = (href: string) => {
    const i = BAR_PRIORITY.indexOf(href);
    return i === -1 ? BAR_PRIORITY.length : i;
  };
  const ordered = [...items].sort((a, b) => rank(a.href) - rank(b.href));
  const overflow = items.length > BAR_SLOTS;
  const shown = overflow ? ordered.slice(0, BAR_SLOTS - 1) : ordered;
  const rest = overflow ? items.filter((i) => !shown.includes(i)) : [];
  const moreActive = rest.some((i) => isActive(i.href));
  const cell =
    "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[11px] leading-tight font-medium transition-colors";
  return (
    <nav aria-label="Hovedmenu" className="flex gap-1 px-2">
      {shown.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(cell, active ? "text-primary" : "text-muted-foreground")}
          >
            <Icon className="size-5" />
            <span className="max-w-full truncate">{label}</span>
          </Link>
        );
      })}
      {overflow ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            className={cn(cell, moreActive ? "text-primary" : "text-muted-foreground")}
            aria-current={moreActive ? "page" : undefined}
          >
            <Menu className="size-5" />
            {da.nav.more}
          </DialogTrigger>
          <DialogContent className="top-auto bottom-0 left-0 w-full max-w-none translate-x-0 translate-y-0 rounded-b-none pb-[max(1.25rem,env(safe-area-inset-bottom))] data-[state=open]:slide-in-from-bottom-4 data-[state=open]:zoom-in-100">
            <DialogHeader>
              <DialogTitle>{da.nav.more}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-1.5" data-testid="nav-more">
              {rest.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-2.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      active ? "border-primary bg-secondary text-primary" : "hover:bg-muted",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </nav>
  );
}
