import { describe, expect, it } from "vitest";
import {
  REPORTS,
  hoursText,
  normMinutes,
  normReport,
  parseReportQuery,
  toCsv,
  type ReportTable,
} from "./reports";

describe("parseReportQuery", () => {
  it("reads the report, the dates and the department; defaults to employees and this month", () => {
    expect(parseReportQuery({}, "2026-11-18")).toEqual({
      report: "employees",
      from: "2026-11-01",
      to: "2026-11-30",
      departmentId: null,
    });
    expect(
      parseReportQuery(
        { rapport: "time", fra: "2026-11-10", til: "2026-11-02", afdeling: "abc" },
        "2026-11-18",
      ),
    ).toEqual({ report: "time", from: "2026-11-02", to: "2026-11-10", departmentId: "abc" });
    expect(parseReportQuery({ rapport: "bogus" }, "2026-11-18").report).toBe("employees");
    expect(REPORTS).toEqual(["employees", "time", "absence", "shifts", "norm"]);
  });

  it("caps the range at 366 days (2025 has 365, so the 366th day is 1 January 2026)", () => {
    expect(parseReportQuery({ fra: "2025-01-01", til: "2026-12-31" }, "2026-11-18").to).toBe(
      "2026-01-01",
    );
  });
});

describe("toCsv", () => {
  const table: ReportTable = {
    columns: [
      { key: "name", label: "Navn" },
      { key: "hours", label: "Timer", numeric: true },
    ],
    rows: [
      { name: "Mads; Medarbejder", hours: "7,50" },
      { name: 'Ida "Ung"', hours: "" },
    ],
  };
  it("semicolons, BOM, CRLF and quoting for Excel", () => {
    expect(toCsv(table)).toBe('﻿Navn;Timer\r\n"Mads; Medarbejder";7,50\r\n"Ida ""Ung""";\r\n');
  });
});

describe("hoursText", () => {
  it("minutes as Danish hours with two decimals", () => {
    expect(hoursText(450)).toBe("7,50");
    expect(hoursText(0)).toBe("0,00");
    expect(hoursText(-90)).toBe("-1,50");
    expect(hoursText(20)).toBe("0,33");
  });
});

describe("normMinutes", () => {
  it("1/7 of the weekly norm per calendar day the contract runs in the range", () => {
    // 37 h a week for a whole week = 37 h.
    expect(
      normMinutes([{ from: "2026-01-01", to: null, weeklyMinutes: 2220 }], {
        from: "2026-11-16",
        to: "2026-11-22",
      }),
    ).toBe(2220);
    // Contract changes mid-week: 3 days at 37 h, 4 days at 20 h → 951,43 + 685,71 = 1637.
    expect(
      normMinutes(
        [
          { from: "2026-01-01", to: "2026-11-18", weeklyMinutes: 2220 },
          { from: "2026-11-19", to: null, weeklyMinutes: 1200 },
        ],
        { from: "2026-11-16", to: "2026-11-22" },
      ),
    ).toBe(1637);
    // Starts after the range: no norm.
    expect(
      normMinutes([{ from: "2026-12-01", to: null, weeklyMinutes: 2220 }], {
        from: "2026-11-16",
        to: "2026-11-22",
      }),
    ).toBe(0);
  });
});

describe("normReport", () => {
  it("norm, planned and registered hours per employee, with the difference", () => {
    const t = normReport([
      {
        number: "1002",
        name: "Mads Medarbejder",
        weeklyMinutes: 2220,
        normMinutes: 2220,
        plannedMinutes: 2400,
        registeredMinutes: 2130,
      },
    ]);
    expect(t.columns.map((c) => c.key)).toEqual([
      "number",
      "name",
      "weekly",
      "norm",
      "planned",
      "registered",
      "difference",
    ]);
    expect(t.rows[0]).toEqual({
      number: "1002",
      name: "Mads Medarbejder",
      weekly: "37,00",
      norm: "37,00",
      planned: "40,00",
      registered: "35,50",
      difference: "-1,50",
    });
  });
});
