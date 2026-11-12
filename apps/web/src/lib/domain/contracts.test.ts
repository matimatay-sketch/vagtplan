import { describe, expect, it } from "vitest";
import { contractStatus, findActiveContract } from "./contracts";

const c = (valid_from: string, valid_to: string | null) => ({ valid_from, valid_to });

describe("contractStatus", () => {
  it("is active on first and last day (inclusive)", () => {
    expect(contractStatus(c("2026-01-01", "2026-06-30"), "2026-01-01")).toBe("active");
    expect(contractStatus(c("2026-01-01", "2026-06-30"), "2026-06-30")).toBe("active");
  });
  it("is ended the day after valid_to", () => {
    expect(contractStatus(c("2026-01-01", "2026-06-30"), "2026-07-01")).toBe("ended");
  });
  it("is future before valid_from", () => {
    expect(contractStatus(c("2026-01-01", null), "2025-12-31")).toBe("future");
  });
  it("is active when open-ended", () => {
    expect(contractStatus(c("2026-01-01", null), "2099-01-01")).toBe("active");
  });
});

describe("findActiveContract", () => {
  it("returns the contract covering the date when contracts switch mid-period", () => {
    const list = [c("2026-01-01", "2026-11-30"), c("2026-12-01", null)];
    expect(findActiveContract(list, "2026-11-30")).toBe(list[0]);
    expect(findActiveContract(list, "2026-12-01")).toBe(list[1]);
    expect(findActiveContract(list, "2025-01-01")).toBeUndefined();
  });
});
