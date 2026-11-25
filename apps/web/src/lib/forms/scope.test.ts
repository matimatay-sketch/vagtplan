import { describe, expect, it } from "vitest";
import { groupsFromForm, scopeFromForm } from "./scope";

const a = "30000000-0000-0000-0000-000000000001";
const b = "a0000000-0000-0000-0000-000000000002";

describe("scopeFromForm", () => {
  it("reads the chosen lists; nothing chosen is an empty list (= all)", () => {
    const fd = new FormData();
    fd.append("department_ids", a);
    fd.append("agreement_ids", b);
    expect(scopeFromForm(fd)).toEqual({ department_ids: [a], agreement_ids: [b] });
    expect(groupsFromForm(fd)).toEqual({ employee_group_ids: [] });
    expect(scopeFromForm(new FormData())).toEqual({ department_ids: [], agreement_ids: [] });
  });

  it("refuses anything but ids", () => {
    const fd = new FormData();
    fd.append("department_ids", "Butik");
    expect(() => scopeFromForm(fd)).toThrow();
  });
});
