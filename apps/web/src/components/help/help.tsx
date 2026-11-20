"use client";
import * as React from "react";
import { Popover as P } from "radix-ui";
import { CircleHelp } from "lucide-react";
import { HELP_KEY, helpEnabled } from "@/lib/domain/help-mode";
import { da } from "@/lib/i18n/da";
import { cn } from "@/lib/utils";

/*
 * Help mode: the "?" button turns explanations on and off. When on, the root
 * element gets data-help="on" and every HelpTip shows a small "?" that opens
 * the explanation on hover, tap or keyboard. The choice is kept per device.
 */
const EVENT = "turnus:help";
const subscribe = (fn: () => void) => {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
};
const read = () => {
  try {
    return helpEnabled(window.localStorage.getItem(HELP_KEY));
  } catch {
    return false;
  }
};

export function HelpToggle({ className }: { className?: string }) {
  const on = React.useSyncExternalStore(subscribe, read, () => false);
  const toggle = () => {
    const next = !on;
    try {
      window.localStorage.setItem(HELP_KEY, next ? "on" : "off");
    } catch {
      // Private mode: the choice lasts until the page is closed.
    }
    if (next) document.documentElement.dataset.help = "on";
    else delete document.documentElement.dataset.help;
    window.dispatchEvent(new Event(EVENT));
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? da.help.turnOff : da.help.turnOn}
      title={on ? da.help.turnOff : da.help.turnOn}
      data-testid="help-toggle"
      className={cn(
        "grid size-9 cursor-pointer place-items-center rounded-full border shadow-xs transition-colors pointer-coarse:size-11",
        on
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <CircleHelp className="size-5" />
    </button>
  );
}

/** A "?" next to a heading or field; shown only while help is on. */
export function HelpTip({ children, label }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<number | undefined>(undefined);
  const hover = (next: boolean) => (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    window.clearTimeout(closeTimer.current);
    if (next) setOpen(true);
    else closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };
  return (
    <span className="hidden align-middle [[data-help=on]_&]:inline-flex" data-help-tip>
      <P.Root open={open} onOpenChange={setOpen}>
        <P.Trigger
          type="button"
          aria-label={label ? `${da.help.explain}: ${label}` : da.help.explain}
          onPointerEnter={hover(true)}
          onPointerLeave={hover(false)}
          className="ml-1.5 grid size-6 cursor-pointer place-items-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:size-8"
        >
          <span className="text-xs font-bold" aria-hidden>
            ?
          </span>
        </P.Trigger>
        <P.Portal>
          <P.Content
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            onPointerEnter={hover(true)}
            onPointerLeave={hover(false)}
            className="z-50 max-w-80 rounded-lg border bg-popover px-3 py-2 text-sm font-normal text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0"
            data-testid="help-content"
          >
            {children}
          </P.Content>
        </P.Portal>
      </P.Root>
    </span>
  );
}
