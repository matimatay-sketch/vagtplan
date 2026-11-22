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

describe("renderExport – posting columns", () => {
  const settings = exportSettingsSchema.parse({
    separator: ";",
    decimal: ",",
    header: true,
    bom: false,
    lineEnding: "lf",
    dateFormat: "yyyy-mm-dd",
    grouping: "employee_code",
    unmapped: "keep",
    codeMap: {},
    columns: [
      { field: "employee_number", header: "Nr" },
      { field: "pay_code_external", header: "Lønart" },
      { field: "posting", dimension: "omkostningssted", header: "Omk.sted" },
      { field: "quantity_hours", header: "Timer" },
    ],
  });

  it("writes the value code per dimension and keeps postings apart when grouping", () => {
    const r = renderExport(settings, [
      row({ quantityMinutes: 300, posting: { omkostningssted: "1100" } }),
      row({ quantityMinutes: 180, posting: { omkostningssted: "1200" } }),
      row({ quantityMinutes: 60, posting: { omkostningssted: "1100" } }),
      row({ quantityMinutes: 30 }),
    ]);
    expect(r.text).toBe(
      "Nr;Lønart;Omk.sted;Timer\n1002;NORMAL;;0,50\n1002;NORMAL;1100;6,00\n1002;NORMAL;1200;3,00\n",
    );
  });

  it("a posting column needs a dimension key", () => {
    expect(
      exportSettingsSchema.safeParse({ ...settings, columns: [{ field: "posting", header: "X" }] })
        .success,
    ).toBe(false);
  });
});

describe("renderExport – km and fixed lines", () => {
  const settings = exportSettingsSchema.parse({
    header: false,
    bom: false,
    lineEnding: "lf",
    grouping: "line",
    columns: [
      { field: "pay_code", header: "" },
      { field: "quantity_hours", header: "" },
      { field: "quantity_km", header: "" },
      { field: "quantity", header: "" },
    ],
  });
  it("writes km for km lines and hours for time lines; the generic quantity is empty for fixed amounts", () => {
    const { text } = renderExport(settings, [
      row({ payCode: "KM_HOEJ", unit: "km", quantityMinutes: 42_500 }),
      row({ payCode: "NORMAL", unit: "hours", quantityMinutes: 450 }),
      row({ payCode: "UDLAEG", unit: "fixed", quantityMinutes: 0 }),
    ]);
    expect(text).toBe("KM_HOEJ;;42,50;42,50\nNORMAL;7,50;;7,50\nUDLAEG;0,00;;\n");
  });
});

describe("renderExport – date formats", () => {
  const formats: [string, string][] = [
    ["yyyy-mm-dd", "2027-01-04"],
    ["dd-mm-yyyy", "04-01-2027"],
    ["dd.mm.yyyy", "04.01.2027"],
    ["ddmmyyyy", "04012027"],
    ["dd/mm/yyyy", "04/01/2027"],
    ["mm/dd/yyyy", "01/04/2027"],
    ["yyyymmdd", "20270104"],
    ["ddmmyy", "040127"],
    ["dd-mm-yy", "04-01-27"],
    ["d.m.yyyy", "4.1.2027"],
  ];
  it.each(formats)("%s writes %s", (dateFormat, expected) => {
    const s = exportSettingsSchema.parse({
      dateFormat,
      header: false,
      bom: false,
      columns: [{ field: "period_start" }],
    });
    expect(renderExport(s, [row({})]).text).toBe(`${expected}\r\n`);
  });
});

describe("renderExport – pay lines, absence or both", () => {
  // Sick 2 days (7,40 h a day = 444 min) and vacation ½ day, each in the period.
  const sick = row({
    kind: "absence",
    payCode: "sick",
    label: "Sygdom",
    unit: "absence",
    quantityMinutes: 888,
    quantityDays: 200,
    rateOre: 0,
    amountOre: 0,
    dateFrom: "2027-01-05",
    dateTo: "2027-01-06",
  });
  const vacation = row({
    kind: "absence",
    payCode: "vacation",
    label: "Ferie",
    unit: "absence",
    quantityMinutes: 222,
    quantityDays: 50,
    rateOre: 0,
    amountOre: 0,
    dateFrom: "2027-01-08",
    dateTo: "2027-01-08",
  });
  const columns = [
    { field: "record_type", header: "Type" },
    { field: "pay_code_external", header: "Kode" },
    { field: "quantity", header: "Antal" },
    { field: "date_from", header: "Fra" },
    { field: "date_to", header: "Til" },
  ];
  const settings = (over: Record<string, unknown>) =>
    exportSettingsSchema.parse({ header: false, bom: false, lineEnding: "lf", columns, ...over });
  const rows = [row({}), sick, vacation];

  it("pay lines only by default (as before)", () => {
    expect(renderExport(settings({}), rows).text).toBe("Løn;NORMAL;7,50;2027-01-04;2027-01-17\n");
  });

  it("absence only, in hours", () => {
    expect(renderExport(settings({ content: "absence" }), rows).text).toBe(
      "Fravær;sick;14,80;2027-01-05;2027-01-06\nFravær;vacation;3,70;2027-01-08;2027-01-08\n",
    );
  });

  it("absence in days, both kinds, pay lines first", () => {
    expect(renderExport(settings({ content: "both", absenceUnit: "days" }), rows).text).toBe(
      "Løn;NORMAL;7,50;2027-01-04;2027-01-17\n" +
        "Fravær;sick;2,00;2027-01-05;2027-01-06\n" +
        "Fravær;vacation;0,50;2027-01-08;2027-01-08\n",
    );
  });

  it("absence codes follow the code map; days and hours columns; grouped per type", () => {
    const r = renderExport(
      exportSettingsSchema.parse({
        header: false,
        bom: false,
        lineEnding: "lf",
        content: "absence",
        codeMap: { sick: "S01", vacation: null },
        columns: [
          { field: "pay_code_external" },
          { field: "quantity_days" },
          { field: "quantity_hours" },
          { field: "amount" },
          { field: "date_from" },
          { field: "date_to" },
        ],
      }),
      [
        sick,
        {
          ...sick,
          quantityMinutes: 444,
          quantityDays: 100,
          dateFrom: "2027-01-12",
          dateTo: "2027-01-12",
        },
        vacation,
      ],
    );
    expect(r.text).toBe("S01;3,00;22,20;;2027-01-05;2027-01-12\n");
    expect(r.skippedCodes).toEqual(["vacation"]);
  });
});
