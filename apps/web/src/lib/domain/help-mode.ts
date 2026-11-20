/** Help mode ("?" explanations) is kept per device in localStorage. Pure. */
export const HELP_KEY = "turnus.help";

export const helpEnabled = (stored: string | null): boolean => stored === "on";

/** Runs before React so the page does not flash without the "?" icons. */
export const HELP_BOOT_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(HELP_KEY)})==="on")document.documentElement.dataset.help="on"}catch(e){}`;
