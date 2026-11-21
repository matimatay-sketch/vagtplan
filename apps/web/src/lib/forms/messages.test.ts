import { describe, expect, it } from "vitest";
import { cancellationSchema, newMessageSchema, swapSchema } from "./messages";

const id = "10000000-0000-0000-0000-000000000002";

describe("newMessageSchema", () => {
  it("needs a recipient and a text", () => {
    const r = newMessageSchema.safeParse({ to: [], body: "  " });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["to", "body"]));
  });

  it("trims the text and makes the subject optional", () => {
    const r = newMessageSchema.parse({ to: [id], body: " Hej " });
    expect(r).toEqual({ to: [id], subject: "", body: "Hej" });
  });
});

describe("swapSchema", () => {
  it("treats an empty colleague shift as giving the shift away", () => {
    const r = swapSchema.parse({ shift_id: id, target_employee_id: id, target_shift_id: "" });
    expect(r.target_shift_id).toBeNull();
  });

  it("needs a colleague", () => {
    expect(swapSchema.safeParse({ shift_id: id, target_employee_id: "" }).success).toBe(false);
  });
});

describe("cancellationSchema", () => {
  it("needs a reason", () => {
    expect(cancellationSchema.safeParse({ shift_id: id, reason: " " }).success).toBe(false);
  });
});
