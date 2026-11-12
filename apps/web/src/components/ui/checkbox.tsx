import * as React from "react";
import { cn } from "@/lib/utils";

/** Native checkbox so it posts "on" in FormData without client JS. */
function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn("size-4 shrink-0 rounded border-input accent-primary", className)}
      {...props}
    />
  );
}

export { Checkbox };
