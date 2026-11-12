import { Logo } from "@/components/brand/logo";
import { Nav } from "@/components/shell/nav";
import { UserMenu } from "@/components/shell/user-menu";
import { requireContext } from "@/lib/auth";
import { fullName } from "@/lib/format";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireContext();
  const name = ctx.employee ? fullName(ctx.employee) : ctx.email;
  const menu = {
    name,
    email: ctx.email,
    role: ctx.role,
    organizationId: ctx.organization.id,
    organizations: ctx.organizations,
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
          <div className="mt-6 flex-1">
            <Nav role={ctx.role} hasEmployee={Boolean(ctx.employee)} variant="sidebar" />
          </div>
          <div className="border-t border-sidebar-border pt-3">
            <UserMenu {...menu} tone="dark" />
          </div>
        </aside>
      </div>
      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/85 px-4 py-2 backdrop-blur md:hidden">
          <Logo />
          <div className="w-44">
            <UserMenu {...menu} tone="light" />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 py-1.5 backdrop-blur md:hidden">
          <Nav role={ctx.role} hasEmployee={Boolean(ctx.employee)} variant="bar" />
        </div>
      </div>
    </div>
  );
}
