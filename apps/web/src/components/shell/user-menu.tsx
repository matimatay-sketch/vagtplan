"use client";
import { Check, ChevronsUpDown, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTransition } from "react";
import { signOutAction, switchOrganizationAction } from "@/lib/actions/auth";
import { da } from "@/lib/i18n/da";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  email: string;
  profileName: string;
  organizationId: string;
  organizations: { id: string; name: string }[];
  tone: "dark" | "light";
};

export function UserMenu({ name, email, profileName, organizationId, organizations, tone }: Props) {
  const [, startTransition] = useTransition();
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-3 rounded-lg p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
          tone === "dark" ? "hover:bg-sidebar-accent" : "hover:bg-muted",
        )}
        data-testid="user-menu"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn("block truncate text-sm font-medium", tone === "dark" && "text-white")}
          >
            {name}
          </span>
          <span
            className={cn(
              "block truncate text-xs",
              tone === "dark" ? "text-sidebar-muted" : "text-muted-foreground",
            )}
          >
            {profileName}
          </span>
        </span>
        <ChevronsUpDown className="size-4 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{email}</DropdownMenuLabel>
        {organizations.length > 1 ? (
          <>
            <DropdownMenuSeparator />
            {organizations.map((o) => (
              <DropdownMenuItem
                key={o.id}
                onSelect={() => startTransition(() => switchOrganizationAction(o.id))}
              >
                <Check className={cn(o.id === organizationId ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{o.name}</span>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => startTransition(() => signOutAction())}>
          <LogOut />
          {da.nav.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
