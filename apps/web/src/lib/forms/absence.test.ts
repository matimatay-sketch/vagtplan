import { describe, expect, it } from "vitest";
import { absenceRequestSchema, leavePostingSchema } from "./absence";

describe("absenceRequestSchema", () => {
  it("parses a request; the end defaults to the start", () => {
    expect(
      absenceRequestSchema.parse({
        type_code: "vacation",
        from_date: "2027-07-05",
        to_date: "",
        note: " Sommer ",
      }),
    ).toEqual({
      employee_id: null,
      type_code: "vacation",
      from_date: "2027-07-05",
      to_date: "2027-07-05",
      note: "Sommer",
    });
  });
  it("rejects an end before the start and unknown codes", () => {
    const end = absenceRequestSchema.safeParse({
      type_code: "vacation",
      from_date: "2027-07-05",
      to_date: "2027-07-01",
    });
    expect(end.error!.issues.map((i) => i.path.join("."))).toEqual(["to_date"]);
    const code = absenceRequestSchema.safeParse({ type_code: "Ferie!", from_date: "2027-07-05" });
    expect(code.error!.issues.map((i) => i.path.join("."))).toEqual(["type_code"]);
  });
});

describe("leavePostingSchema", () => {
  it("days become hundredths; payouts are negative", () => {
    expect(
      leavePostingSchema.parse({
        employee_id: "50000000-0000-0000-0000-000000000002",
        account: "vacation",
        kind: "payout",
        period_start: "2025-09-01",
        usable_until: "2026-12-31",
        days: "2,5",
        note: "Udbetalt ved fratræden",
      }),
    ).toMatchObject({ hundredths: -250 });
  });
  it("adjustments keep their sign and need a reason", () => {
    const base = {
      employee_id: "50000000-0000-0000-0000-000000000002",
      account: "vacation",
      kind: "adjustment",
      period_start: "2025-09-01",
      usable_until: "2026-12-31",
    };
    expect(
      leavePostingSchema.parse({ ...base, days: "-1", note: "Rettelse af fejl" }),
    ).toMatchObject({ hundredths: -100 });
    const zero = leavePostingSchema.safeParse({ ...base, days: "0", note: "Rettelse af fejl" });
    expect(zero.error!.issues.map((i) => i.path.join("."))).toEqual(["days"]);
    const short = leavePostingSchema.safeParse({ ...base, days: "1", note: "x" });
    expect(short.error!.issues.map((i) => i.path.join("."))).toEqual(["note"]);
  });
});
