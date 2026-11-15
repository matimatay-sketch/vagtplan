import { Logo } from "@/components/brand/logo";
import { brand } from "@/lib/brand";

const week = [
  { day: "Man", bars: [[8, 16]] },
  { day: "Tir", bars: [[12, 20]] },
  { day: "Ons", bars: [] },
  { day: "Tor", bars: [[6, 14]] },
  { day: "Fre", bars: [[15, 23]] },
  { day: "Lør", bars: [[9, 15]] },
  { day: "Søn", bars: [[22, 24]] },
] as const;

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex lg:flex-col">
        <Logo />
        <div className="mt-auto max-w-md">
          <p className="font-display text-4xl leading-tight font-semibold text-white">
            Vagter, stempling og løn – efter de regler, der faktisk gælder.
          </p>
          <p className="mt-4 text-sidebar-muted">{brand.tagline}.</p>
          <div className="mt-10 space-y-2" aria-hidden>
            {week.map(({ day, bars }) => (
              <div key={day} className="flex items-center gap-3">
                <span className="w-8 text-xs text-sidebar-muted">{day}</span>
                <div className="relative h-5 flex-1 rounded-md bg-sidebar-accent">
                  {bars.map(([from, to]) => (
                    <span
                      key={from}
                      className="absolute inset-y-0.5 rounded bg-signal/90"
                      style={{
                        left: `${(from / 24) * 100}%`,
                        width: `${((to - from) / 24) * 100}%`,
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-primary/40 blur-3xl" />
      </aside>
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
