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
  MessageSquare,
  FileBarChart,
  Upload,
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
  group: GroupKey;
};

/** Menu sections, in order. With few items the menu stays a flat list. */
const GROUPS = ["overview", "mine", "planning", "approvals", "staff", "pay", "settings"] as const;
type GroupKey = (typeof GROUPS)[number];
const FLAT_UP_TO = 7;

const items: Item[] = [
  {
    href: "/oversigt",
    group: "overview",
    label: da.nav.overview,
    icon: LayoutDashboard,
    anyOf: [],
  },
  {
    href: "/beskeder",
    group: "overview",
    label: da.nav.messages,
    icon: MessageSquare,
    anyOf: [],
  },
  {
    href: "/vagtplan",
    group: "planning",
    label: da.nav.schedule,
    icon: CalendarClock,
    anyOf: ["schedule.view", "schedule.manage"],
  },
  {
    href: "/min-vagtplan",
    group: "mine",
    label: da.nav.mySchedule,
    icon: CalendarHeart,
    anyOf: [],
    needsEmployee: true,
  },
  {
    href: "/medarbejdere",
    group: "staff",
    label: da.nav.employees,
    icon: Users,
    anyOf: ["employees.view", "employees.manage"],
  },
  {
    href: "/afdelinger",
    group: "staff",
    label: da.nav.departments,
    icon: Building2,
    anyOf: ["departments.manage", "users.manage", "employees.view"],
  },
  {
    href: "/indstillinger/rettigheder",
    group: "staff",
    label: da.nav.profiles,
    icon: KeyRound,
    anyOf: ["users.manage"],
  },
  {
    href: "/vagtplan/turnus",
    group: "planning",
    label: da.nav.turnus,
    icon: Repeat,
    anyOf: ["schedule.manage"],
  },
  { href: "/tid", group: "mine", label: da.nav.time, icon: Timer, anyOf: [], needsEmployee: true },
  {
    href: "/tid/godkend",
    group: "approvals",
    label: da.nav.approveTime,
    icon: ClipboardCheck,
    anyOf: ["time.view", "time.manage", "time.approve"],
    forApprovers: true,
  },
  {
    href: "/koersel",
    group: "mine",
    label: da.nav.expenses,
    icon: Car,
    anyOf: [],
    needsEmployee: true,
  },
  {
    href: "/lon",
    group: "pay",
    label: da.nav.payroll,
    icon: Wallet,
    anyOf: ["payroll.view", "payroll.manage"],
  },
  {
    href: "/fravaer",
    group: "mine",
    label: da.nav.absence,
    icon: Plane,
    anyOf: [],
    needsEmployee: true,
  },
  {
    href: "/fravaer/godkend",
    group: "approvals",
    label: da.nav.absenceAdmin,
    icon: CalendarX,
    anyOf: ["absence.view", "absence.manage", "absence.approve"],
    forApprovers: true,
  },
  {
    href: "/indlaes",
    group: "staff",
    label: da.nav.import,
    icon: Upload,
    anyOf: ["departments.manage", "employees.manage", "schedule.manage", "absence.manage"],
  },
  {
    href: "/rapporter",
    group: "pay",
    label: da.nav.reports,
    icon: FileBarChart,
    anyOf: ["reports.view"],
  },
  {
    href: "/projekter",
    group: "pay",
    label: da.nav.projects,
    icon: FolderKanban,
    anyOf: ["projects.view", "projects.manage"],
  },
  {
    href: "/indstillinger/opsaetning",
    group: "settings",
    label: da.nav.settings,
    icon: Settings,
    anyOf: ["settings.manage"],
  },
  {
    href: "/indstillinger/lonperioder",
    group: "settings",
    label: da.nav.payPeriodGroups,
    icon: Wallet,
    anyOf: ["settings.manage"],
  },
  {
    href: "/indstillinger/overenskomster",
    group: "settings",
    label: da.nav.agreements,
    icon: FileText,
    anyOf: ["agreements.manage"],
  },
  {
    href: "/indstillinger/kontering",
    group: "settings",
    label: da.nav.posting,
    icon: Tags,
    anyOf: ["posting.manage"],
  },
  {
    href: "/indstillinger/koersel",
    group: "settings",
    label: da.nav.expenseSettings,
    icon: Receipt,
    anyOf: ["expenses.manage"],
  },
  {
    href: "/indstillinger/integrationer",
    group: "settings",
    label: da.nav.integrations,
    icon: Plug,
    anyOf: ["integrations.manage"],
  },
  {
    href: "/profil",
    group: "mine",
    label: da.nav.myProfile,
    icon: UserRound,
    anyOf: [],
    needsEmployee: true,
  },
];

export function Nav({
  permissions,
  hasEmployee,
  isApprover = false,
  messageCount = 0,
  variant,
}: {
  permissions: Permissions;
  hasEmployee: boolean;
  isApprover?: boolean;
  /** Unread messages and items waiting for the user, shown on "Beskeder". */
  messageCount?: number;
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

  const badge = (href: string) =>
    href === "/beskeder" && messageCount > 0 ? <CountBadge n={messageCount} /> : null;
  if (variant === "bar") return <BottomBar items={visible} isActive={isActive} badge={badge} />;
  return (
    <nav aria-label="Hovedmenu" className="grid gap-4">
      {sectionsOf(visible).map(({ group, items: section }) => (
        <div key={group ?? "top"} className="grid gap-0.5">
          {group ? (
            <p className="px-3 pb-1 text-[11px] font-medium tracking-wide text-sidebar-muted/80 uppercase">
              {da.nav.groups[group]}
            </p>
          ) : null}
          {section.map(({ href, label, icon: Icon }) => {
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
                {badge(href)}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span
      className="ml-auto min-w-5 rounded-full bg-signal px-1.5 text-center text-[11px] leading-5 font-semibold text-sidebar tabular"
      data-testid="message-count"
      aria-label={da.messages.unread(n)}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Sections in menu order; a short menu is one untitled section. */
function sectionsOf(items: Item[]): { group: GroupKey | null; items: Item[] }[] {
  if (items.length <= FLAT_UP_TO) return [{ group: null, items }];
  // "Oversigt" stands alone at the top without a heading.
  return GROUPS.map((g) => ({
    group: g === "overview" ? null : g,
    items: items.filter((i) => i.group === g),
  })).filter((x) => x.items.length > 0);
}

/** The phone's daily destinations first; the rest goes under "Mere". */
const BAR_PRIORITY = [
  "/oversigt",
  "/min-vagtplan",
  "/tid",
  "/vagtplan",
  "/beskeder",
  "/tid/godkend",
  "/fravaer",
];
/** Approvers manage from the phone: stamping is on Oversigt, approvals in the bar. */
const APPROVER_BAR_PRIORITY = [
  "/oversigt",
  "/vagtplan",
  "/tid/godkend",
  "/beskeder",
  "/min-vagtplan",
  "/tid",
  "/fravaer/godkend",
];
const BAR_SLOTS = 5;

/**
 * Bottom bar on phones: at most five targets of at least 44 px. With more
 * items, four stay in the bar and the rest open in a sheet ("Mere").
 */
function BottomBar({
  items,
  isActive,
  badge,
}: {
  items: Item[];
  isActive: (href: string) => boolean;
  badge: (href: string) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const priority = items.some((i) => i.href === "/tid/godkend")
    ? APPROVER_BAR_PRIORITY
    : BAR_PRIORITY;
  const rank = (href: string) => {
    const i = priority.indexOf(href);
    return i === -1 ? priority.length : i;
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
            className={cn(cell, "relative", active ? "text-primary" : "text-muted-foreground")}
          >
            <Icon className="size-5" />
            <span className="max-w-full truncate">{label}</span>
            {badge(href) ? <span className="absolute top-0 right-1/4">{badge(href)}</span> : null}
          </Link>
        );
      })}
      {overflow ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            className={cn(cell, moreActive ? "text-primary" : "text-muted-foreground")}
            aria-current={moreActive ? "page" : undefined}
          >
            <span className="relative">
              <Menu className="size-5" />
              {rest.some((i) => badge(i.href)) ? (
                <span
                  className="absolute -top-1 -right-1.5 size-2 rounded-full bg-signal"
                  aria-hidden
                />
              ) : null}
            </span>
            {da.nav.more}
          </DialogTrigger>
          <DialogContent className="top-auto bottom-0 left-0 w-full max-w-none translate-x-0 translate-y-0 rounded-b-none pb-[max(1.25rem,env(safe-area-inset-bottom))] data-[state=open]:slide-in-from-bottom-4 data-[state=open]:zoom-in-100">
            <DialogHeader>
              <DialogTitle>{da.nav.more}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4" data-testid="nav-more">
              {sectionsOf(rest).map(({ group, items: section }) => (
                <div key={group ?? "all"} className="grid gap-1.5">
                  {group ? (
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {da.nav.groups[group]}
                    </p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-1.5">
                    {section.map(({ href, label, icon: Icon }) => {
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
                          {badge(href)}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </nav>
  );
}
