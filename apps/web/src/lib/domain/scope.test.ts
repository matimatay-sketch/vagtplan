import { describe, expect, it } from "vitest";
import { inScope, type Who } from "./scope";

const mads: Who = {
  departmentIds: ["butik", "cafe"],
  agreementIds: ["detail"],
  groupId: "drivers",
};
const none = { department_ids: [], agreement_ids: [], employee_group_ids: [] };

describe("inScope", () => {
  it("empty lists mean everyone", () => {
    expect(inScope(none, mads)).toBe(true);
  });

  it("every list that is filled in must match", () => {
    expect(inScope({ ...none, department_ids: ["cafe"] }, mads)).toBe(true);
    expect(inScope({ ...none, department_ids: ["lager"] }, mads)).toBe(false);
    expect(inScope({ ...none, agreement_ids: ["detail", "kl"] }, mads)).toBe(true);
    expect(inScope({ ...none, agreement_ids: ["kl"] }, mads)).toBe(false);
    expect(inScope({ ...none, employee_group_ids: ["drivers"] }, mads)).toBe(true);
    expect(
      inScope({ ...none, department_ids: ["cafe"], employee_group_ids: ["office"] }, mads),
    ).toBe(false);
  });

  it("an employee without a group or contract is outside a list of groups or agreements", () => {
    const anne: Who = { departmentIds: [], agreementIds: [], groupId: null };
    expect(inScope({ ...none, employee_group_ids: ["drivers"] }, anne)).toBe(false);
    expect(inScope({ ...none, agreement_ids: ["detail"] }, anne)).toBe(false);
  });

  it("unknown parts (an open shift has no employee) are not checked", () => {
    const open: Who = { departmentIds: ["cafe"], agreementIds: null, groupId: undefined };
    expect(inScope({ ...none, agreement_ids: ["detail"], department_ids: ["cafe"] }, open)).toBe(
      true,
    );
    expect(inScope({ ...none, department_ids: ["butik"] }, open)).toBe(false);
  });

  it("works without a list of groups (supplement types have none)", () => {
    expect(inScope({ department_ids: ["butik"], agreement_ids: [] }, mads)).toBe(true);
  });
});
