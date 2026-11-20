import { describe, expect, it } from "vitest";
import { HELP_BOOT_SCRIPT, HELP_KEY, helpEnabled } from "./help-mode";

describe("help mode", () => {
  it("is off unless explicitly turned on", () => {
    expect(helpEnabled(null)).toBe(false);
    expect(helpEnabled("off")).toBe(false);
    expect(helpEnabled("on")).toBe(true);
  });

  it("the boot script reads the same key", () => {
    expect(HELP_BOOT_SCRIPT).toContain(JSON.stringify(HELP_KEY));
  });
});
