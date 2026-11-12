"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, FileText, LayoutDashboard, UserRound, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { da } from "@/lib/i18n/da";
import type { AppRole } from "@/lib/auth";

const items = [
  {
    href: "/oversigt",
    label: da.nav.overview,
    icon: LayoutDashboard,
    roles: ["admin", "manager", "employee"],
  },
  { href: "/medarbejdere", label: da.nav.employees, icon: Users, roles: ["admin", "manager"] },
  { href: "/afdelinger", label: da.nav.departments, icon: Building2, roles: ["admin", "manager"] },
  {
    href: "/indstillinger/lonperioder",
    label: da.nav.payPeriodGroups,
    icon: Wallet,
    roles: ["admin"],
  },
  {
    href: "/indstillinger/overenskomster",
    label: da.nav.agreements,
    icon: FileText,
    roles: ["admin"],
  },
  {
    href: "/profil",
    label: da.nav.myProfile,
    icon: UserRound,
    roles: ["admin", "manager", "employee"],
    needsEmployee: true,
  },
] as const;

export function Nav({
  role,
  hasEmployee,
  variant,
}: {
  role: AppRole;
  hasEmployee: boolean;
  variant: "sidebar" | "bar";
}) {
  const pathname = usePathname();
  const visible = items.filter(
    (i) =>
      (i.roles as readonly AppRole[]).includes(role) && (!("needsEmployee" in i) || hasEmployee),
  );
  return (
    <nav
      aria-label="Hovedmenu"
      className={variant === "sidebar" ? "grid gap-0.5" : "flex gap-1 overflow-x-auto px-2"}
    >
      {visible.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
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
