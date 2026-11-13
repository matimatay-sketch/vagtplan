import { describe, expect, it } from "vitest";
import { customerFormSchema, inviteAdminSchema } from "./platform";

describe("customerFormSchema", () => {
  it("trims the name and lower-cases the e-mail", () => {
    expect(
      customerFormSchema.parse({ name: "  Bageriet ApS ", admin_email: " Konsulent@Firma.DK " }),
    ).toEqual({
      name: "Bageriet ApS",
      admin_email: "konsulent@firma.dk",
    });
  });
  it("requires a name and a valid e-mail", () => {
    const r = customerFormSchema.safeParse({ name: " ", admin_email: "ikke-en-mail" });
    expect(r.error!.issues.map((i) => i.path.join("."))).toEqual(["name", "admin_email"]);
  });
  it("limits the name to 200 characters", () => {
    expect(
      customerFormSchema.safeParse({ name: "x".repeat(201), admin_email: "a@b.dk" }).success,
    ).toBe(false);
  });
});

describe("inviteAdminSchema", () => {
  it("needs an organization id and an e-mail", () => {
    const id = "20000000-0000-0000-0000-000000000001";
    expect(inviteAdminSchema.parse({ organization_id: id, admin_email: "A@B.dk" })).toEqual({
      organization_id: id,
      admin_email: "a@b.dk",
    });
    expect(
      inviteAdminSchema.safeParse({ organization_id: "x", admin_email: "a@b.dk" }).success,
    ).toBe(false);
  });
});
