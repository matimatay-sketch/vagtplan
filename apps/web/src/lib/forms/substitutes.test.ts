import { describe, expect, it } from "vitest";
import { substituteSchema, substituteStatus } from "./substitutes";

const lise = "10000000-0000-0000-0000-000000000002";
const mads = "10000000-0000-0000-0000-000000000003";

describe("substituteSchema", () => {
  it("reads the form", () => {
    expect(
      substituteSchema.parse({
        absent_user_id: lise,
        substitute_user_id: mads,
        valid_from: "2026-12-21",
        valid_to: "2027-01-03",
        note: " Juleferie ",
      }),
    ).toEqual({
      absent_user_id: lise,
      substitute_user_id: mads,
      valid_from: "2026-12-21",
      valid_to: "2027-01-03",
      note: "Juleferie",
    });
  });

  it("needs both people, different, and a period that ends on or after it starts", () => {
    const r = substituteSchema.safeParse({
      absent_user_id: lise,
      substitute_user_id: lise,
      valid_from: "2026-12-21",
      valid_to: "2026-12-20",
    });
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["substitute_user_id", "valid_to"]));
    expect(substituteSchema.safeParse({ valid_from: "2026-12-21" }).success).toBe(false);
  });
});

describe("substituteStatus", () => {
  const s = { valid_from: "2026-12-21", valid_to: "2027-01-03", archived_at: null };
  it("is upcoming, active (first and last day included) or over", () => {
    expect(substituteStatus(s, "2026-12-20")).toBe("upcoming");
    expect(substituteStatus(s, "2026-12-21")).toBe("active");
    expect(substituteStatus(s, "2027-01-03")).toBe("active");
    expect(substituteStatus(s, "2027-01-04")).toBe("over");
  });
  it("an ended substitution is over at once", () => {
    expect(substituteStatus({ ...s, archived_at: "2026-12-22T10:00:00Z" }, "2026-12-22")).toBe(
      "ended",
    );
  });
});
