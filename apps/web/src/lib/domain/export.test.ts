import { describe, expect, it } from "vitest";
import { GENERIC_CSV, exportSettingsSchema, renderExport, type ExportRow } from "./export";

const row = (over: Partial<ExportRow>): ExportRow => ({
  employeeNumber: "1002",
  employeeName: "Mads Medarbejder",
  payCode: "NORMAL",
  label: "Normaltimer",
  unit: "hours",
  quantityMinutes: 450,
  rateOre: 15000,
  amountOre: 112500,
  periodStart: "2027-01-04",
  periodEnd: "2027-01-17",
  ...over,
});

describe("renderExport – the generic CSV", () => {
  it("one row per employee, pay code and rate; Danish decimals; semicolon, CRLF and BOM", () => {
    const r = renderExport(GENERIC_CSV, [
      row({}),
      row({ quantityMinutes: 30, amountOre: 7500 }),
      row({
        payCode: "AFTEN",
        label: "Aftentillæg",
        quantityMinutes: 90,
        rateOre: 2500,
        amountOre: 3750,
      }),
    ]);
    expect(r.rowCount).toBe(2);
    expect(r.text).toBe(
      "﻿" +
        "Medarbejdernr.;Navn;Lønart;Tekst;Timer;Sats;Beløb;Fra;Til\r\n" +
        "1002;Mads Medarbejder;AFTEN;Aftentillæg;1,50;25,00;37,50;2027-01-04;2027-01-17\r\n" +
        "1002;Mads Medarbejder;NORMAL;Normaltimer;8,00;150,00;1200,00;2027-01-04;2027-01-17\r\n",
    );
  });
});

describe("renderExport – configured", () => {
  const settings = exportSettingsSchema.parse({
    separator: "\t",
    decimal: ".",
    header: false,
    bom: false,
    lineEnding: "lf",
    dateFormat: "ddmmyyyy",
    grouping: "employee_code",
    unmapped: "skip",
    codeMap: { NORMAL: "0100", AFTEN: "0210", SYG: null },
    columns: [
      { field: "constant", value: "L", header: "" },
      { field: "employee_number", header: "" },
      { field: "pay_code_external", header: "" },
      { field: "quantity_hours", header: "" },
      { field: "quantity_minutes", header: "" },
      { field: "period_end", header: "" },
    ],
  });

  it("maps pay codes, skips unmapped and excluded codes, and formats as configured", () => {
    const r = renderExport(settings, [
      row({}),
      row({ payCode: "AFTEN", quantityMinutes: 90, rateOre: 2500, amountOre: 3750 }),
      row({ payCode: "SYG", quantityMinutes: 444 }),
      row({ payCode: "UKENDT", quantityMinutes: 60 }),
    ]);
    expect(r.text).toBe("L\t1002\t0100\t7.50\t450\t17012027\nL\t1002\t0210\t1.50\t90\t17012027\n");
    expect(r.rowCount).toBe(2);
    expect(r.skippedCodes).toEqual(["SYG", "UKENDT"]);
  });

  it("can write one row per line, and keeps unmapped codes when asked", () => {
    const perLine = exportSettingsSchema.parse({
      ...settings,
      grouping: "line",
      unmapped: "keep",
      columns: [
        { field: "pay_code_external", header: "Kode" },
        { field: "amount", header: "Beløb" },
      ],
      header: true,
    });
    const r = renderExport(perLine, [
      row({}),
      row({ quantityMinutes: 30, amountOre: 7500 }),
      row({ payCode: "UKENDT" }),
    ]);
    expect(r.text).toBe("Kode\tBeløb\n0100\t1125.00\n0100\t75.00\nUKENDT\t1125.00\n");
  });

  it("quotes values containing the separator, quotes or line breaks", () => {
    const comma = exportSettingsSchema.parse({ ...GENERIC_CSV, separator: ",", decimal: "." });
    const r = renderExport(comma, [row({ employeeName: 'Hansen, "Mads"' })]);
    expect(r.text.split("\r\n")[1]).toBe(
      '1002,"Hansen, ""Mads""",NORMAL,Normaltimer,7.50,150.00,1125.00,2027-01-04,2027-01-17',
    );
  });

  it("negative amounts and other date formats", () => {
    const s = exportSettingsSchema.parse({
      ...GENERIC_CSV,
      header: false,
      bom: false,
      dateFormat: "dd.mm.yyyy",
      columns: [
        { field: "amount", header: "" },
        { field: "period_start", header: "" },
      ],
    });
    expect(renderExport(s, [row({ amountOre: -1250 })]).text).toBe("-12,50;04.01.2027\r\n");
  });

  it("settings are validated: at least one column and a single-character separator", () => {
    expect(exportSettingsSchema.safeParse({ ...GENERIC_CSV, columns: [] }).success).toBe(false);
    expect(exportSettingsSchema.safeParse({ ...GENERIC_CSV, separator: ";;" }).success).toBe(false);
  });
});
