import { describe, expect, it } from "vitest";
import {
  API_SCOPES,
  WEBHOOK_EVENTS,
  isAllowedWebhookUrl,
  parseRange,
  parsePaging,
  retryDelayMinutes,
} from "./api";

describe("API scopes and events", () => {
  it("match the database checks", () => {
    expect(API_SCOPES.map((s) => s.key)).toEqual([
      "employees.read",
      "employees.write",
      "schedule.read",
      "time.read",
      "time.stamp",
      "absence.read",
      "payroll.read",
      "posting.read",
    ]);
    expect(WEBHOOK_EVENTS.map((e) => e.key)).toEqual([
      "time_entry.approved",
      "pay_period.closed",
      "absence.decided",
      "schedule.published",
      "employee.created",
      "employee.updated",
    ]);
  });
});

describe("parseRange", () => {
  const q = (s: string) => new URLSearchParams(s);
  it("needs from and to as dates, at most the maximum days apart", () => {
    expect(parseRange(q("from=2027-01-01&to=2027-01-31"))).toEqual({
      from: "2027-01-01",
      to: "2027-01-31",
    });
    expect(parseRange(q("from=2027-01-01"))).toEqual({
      error: "from and to (YYYY-MM-DD) are required",
    });
    expect(parseRange(q("from=2027-01-31&to=2027-01-01"))).toEqual({
      error: "to must not be before from",
    });
    expect(parseRange(q("from=2027-01-01&to=2027-06-01"))).toEqual({
      error: "at most 93 days per request",
    });
    expect(parseRange(q("from=2027-02-30&to=2027-03-01"))).toMatchObject({
      error: expect.any(String),
    });
  });
});

describe("parsePaging", () => {
  it("defaults to 100 and caps at 1000", () => {
    expect(parsePaging(new URLSearchParams(""))).toEqual({ limit: 100, offset: 0 });
    expect(parsePaging(new URLSearchParams("limit=5000&offset=20"))).toEqual({
      limit: 1000,
      offset: 20,
    });
    expect(parsePaging(new URLSearchParams("limit=x&offset=-3"))).toEqual({
      limit: 100,
      offset: 0,
    });
  });
});

describe("retryDelayMinutes", () => {
  it("doubles after each failed attempt (same as the database)", () => {
    expect([1, 2, 3, 4, 8].map(retryDelayMinutes)).toEqual([1, 2, 4, 8, 128]);
  });
});

describe("isAllowedWebhookUrl", () => {
  it("allows public https only", () => {
    expect(isAllowedWebhookUrl("https://lon.example.dk/hooks/turnus")).toBe(true);
    for (const bad of [
      "http://lon.example.dk/hook",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://10.0.0.5/x",
      "https://192.168.1.2/x",
      "https://172.20.0.1/x",
      "https://169.254.169.254/latest",
      "https://[::1]/x",
      "https://user:pw@example.dk/x",
      "ikke en url",
    ])
      expect(isAllowedWebhookUrl(bad), bad).toBe(false);
  });
  it("allows http and local hosts in tests and local development", () => {
    expect(isAllowedWebhookUrl("http://127.0.0.1:4545/__webhook", true)).toBe(true);
    expect(isAllowedWebhookUrl("ftp://example.dk", true)).toBe(false);
  });
});
