/**
 * Pseudonymization for the AI assistant: people and departments are replaced
 * by codes (MEDARBEJDER_1, AFDELING_1) before anything leaves Turnus, and the
 * codes are mapped back to names in the answer. Pure and browser-safe.
 */

export type PseudonymKind = "employee" | "department";
const PREFIX: Record<PseudonymKind, string> = { employee: "MEDARBEJDER", department: "AFDELING" };
const CODE = /\b(MEDARBEJDER|AFDELING)_\d+\b/g;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export class Pseudonyms {
  private byId = new Map<string, string>();
  private entries = new Map<string, { id: string; name: string; kind: PseudonymKind }>();
  private counters: Record<PseudonymKind, number> = { employee: 0, department: 0 };

  /** The code for an id (the same code every time). */
  code(kind: PseudonymKind, id: string, name: string): string {
    const key = `${kind}:${id}`;
    const existing = this.byId.get(key);
    if (existing) return existing;
    const code = `${PREFIX[kind]}_${++this.counters[kind]}`;
    this.byId.set(key, code);
    this.entries.set(code, { id, name: name.trim(), kind });
    return code;
  }

  /** The real id behind a code, or null for an unknown code. */
  idOf(code: string): string | null {
    return this.entries.get(code)?.id ?? null;
  }

  /**
   * Replaces known names (full names, then first names of people), e-mail
   * addresses and runs of 6+ digits in free text written by the user.
   */
  scrub(text: string): string {
    let out = text
      .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[e-mail]")
      .replace(/\d[\d -]{4,}\d/g, (m) => (m.replace(/\D/g, "").length >= 6 ? "[nummer]" : m));
    const names: { name: string; code: string }[] = [];
    for (const [code, e] of this.entries) {
      if (e.name) names.push({ name: e.name, code });
      const first = e.name.split(/\s+/)[0];
      if (e.kind === "employee" && first && first !== e.name) names.push({ name: first, code });
    }
    names.sort((a, b) => b.name.length - a.name.length);
    for (const { name, code } of names)
      out = out.replace(new RegExp(`(?<![\\p{L}\\d])${escape(name)}(?![\\p{L}\\d])`, "giu"), code);
    return out;
  }

  /** Replaces codes in a text with the names they stand for. */
  restore(text: string): string {
    return text.replace(CODE, (code) => this.entries.get(code)?.name ?? code);
  }
}
