import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getAppContext, requirePlatformAdmin } from "@/lib/auth";
import { signOutAction } from "@/lib/actions/auth";
import { da } from "@/lib/i18n/da";

/** Platform area: outside any organization, for platform administrators only. */
export default async function PlatformLayout({ children }: LayoutProps<"/platform">) {
  const { email } = await requirePlatformAdmin();
  const ctx = await getAppContext();
  return (
    <div className="min-h-dvh">
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="rounded-full bg-sidebar-accent px-2.5 py-0.5 text-xs font-medium tracking-wide text-white uppercase">
              Platform
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-sidebar-muted sm:inline">{email}</span>
            {ctx ? (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-white hover:bg-sidebar-accent"
              >
                <Link href="/oversigt">{da.platform.backToApp}</Link>
              </Button>
            ) : null}
            <form action={signOutAction}>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-white hover:bg-sidebar-accent"
              >
                <LogOut /> {da.nav.signOut}
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
