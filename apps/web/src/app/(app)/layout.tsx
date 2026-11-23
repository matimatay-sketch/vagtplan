import { Logo } from "@/components/brand/logo";
import { HelpToggle } from "@/components/help/help";
import { Nav } from "@/components/shell/nav";
import { UserMenu } from "@/components/shell/user-menu";
import { requireContext } from "@/lib/auth";
import { fullName } from "@/lib/format";
import { ImpersonationBanner } from "@/components/impersonation/banner";
import { createClient } from "@/lib/supabase/server";
import { hasDepartmentScope } from "@/lib/permissions";
import { da } from "@/lib/i18n/da";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireContext();
  // Badge on "Beskeder": unread messages plus swaps and afbud waiting for the user.
  const supabase = await createClient();
  const [{ data: unread }, { data: waiting }] = await Promise.all([
    supabase.rpc("unread_message_count", { p_org: ctx.organization.id }),
    supabase.rpc("waiting_items", { p_org: ctx.organization.id }),
  ]);
  const messageCount = (unread ?? 0) + (waiting ?? []).length;
  const name = ctx.employee ? fullName(ctx.employee) : ctx.email;
  const menu = {
    name,
    email: ctx.email,
    profileName: ctx.profile.name,
    organizationId: ctx.organization.id,
    organizations: ctx.organizations,
    isPlatformAdmin: ctx.isPlatformAdmin,
  };
  return (
    <div className="flex min-h-dvh">
      <div className="hidden w-64 shrink-0 bg-sidebar md:block">
        <aside className="sticky top-0 flex h-dvh flex-col p-4 text-sidebar-foreground">
          <div className="px-2 py-1">
            <Logo className="text-white" />
            <p
              className="mt-3 truncate text-xs tracking-wide text-sidebar-muted uppercase"
              data-testid="org-name"
            >
              {ctx.organization.name}
            </p>
          </div>
          <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
            <Nav
              permissions={ctx.permissions}
              hasEmployee={Boolean(ctx.employee)}
              isApprover={ctx.timeApproverOf.length > 0}
              messageCount={messageCount}
              variant="sidebar"
            />
          </div>
          <div className="border-t border-sidebar-border pt-3">
            <UserMenu {...menu} tone="dark" />
          </div>
        </aside>
      </div>
      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <ImpersonationBanner />
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/85 px-4 py-2 backdrop-blur md:hidden">
          <Logo />
          <div className="flex items-center gap-2">
            <HelpToggle />
            <div className="w-44">
              <UserMenu {...menu} tone="light" />
            </div>
          </div>
        </header>
        {/* Desktop: the "?" sits in the top-right corner of the page. */}
        <div className="fixed top-3 right-4 z-30 hidden md:block">
          <HelpToggle />
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6 lg:p-8">
          {/* Department-scoped rights only reach departments the user is responsible for. */}
          {hasDepartmentScope(ctx.permissions) && ctx.responsibleDepartmentIds.length === 0 ? (
            <p
              role="status"
              className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-foreground"
              data-testid="no-responsibility"
            >
              {da.users.noResponsibilityNotice}
            </p>
          ) : null}
          {children}
        </main>
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 py-1.5 backdrop-blur md:hidden">
          <Nav
            permissions={ctx.permissions}
            hasEmployee={Boolean(ctx.employee)}
            isApprover={ctx.timeApproverOf.length > 0}
            messageCount={messageCount}
            variant="bar"
          />
        </div>
      </div>
    </div>
  );
}
