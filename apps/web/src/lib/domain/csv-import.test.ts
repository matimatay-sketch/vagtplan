import { describe, expect, it } from "vitest";
import { decodeCsvBytes, parseCsv, readImport, templateCsv } from "./csv-import";

describe("decodeCsvBytes", () => {
  it("reads UTF-8 (with or without BOM)", () => {
    const utf8 = new TextEncoder().encode("﻿navn\nKøkken");
    expect(decodeCsvBytes(utf8)).toBe("navn\nKøkken");
  });

  it("falls back to Windows-1252, as Excel saves Danish CSV files", () => {
    // "Køkken" in Windows-1252: ø = 0xF8.
    const bytes = new Uint8Array([0x4b, 0xf8, 0x6b, 0x6b, 0x65, 0x6e]);
    expect(decodeCsvBytes(bytes)).toBe("Køkken");
  });
});

describe("parseCsv", () => {
  it("finds the separator (semicolon, comma or tab) and keeps line numbers", () => {
    expect(parseCsv("a;b\r\n1;2\r\n\r\n3;4\r\n")).toEqual({
      header: ["a", "b"],
      rows: [
        { line: 2, cells: ["1", "2"] },
        { line: 4, cells: ["3", "4"] },
      ],
    });
    expect(parseCsv("a,b\n1,2").rows[0]!.cells).toEqual(["1", "2"]);
    expect(parseCsv("a\tb\n1\t2").rows[0]!.cells).toEqual(["1", "2"]);
  });

  it("handles quotes, separators and line breaks inside quotes", () => {
    const csv = 'navn;note\n"Hansen; Ole";"sagde ""hej""\npå to linjer"\nB;x';
    expect(parseCsv(csv).rows).toEqual([
      { line: 2, cells: ["Hansen; Ole", 'sagde "hej"\npå to linjer'] },
      { line: 4, cells: ["B", "x"] },
    ]);
  });
});

describe("readImport: departments", () => {
  it("knows the columns by Danish names and aliases, in any order and case", () => {
    const r = readImport("departments", parseCsv("Nyt navn;Afdeling\nBageri;Bager\n;Butik"));
    expect(r.problems).toEqual([]);
    expect(r.rows).toEqual([
      { line: 2, values: { name: "Bager", new_name: "Bageri" } },
      { line: 3, values: { name: "Butik", new_name: null } },
    ]);
  });

  it("reports a missing required column and unknown columns", () => {
    const r = readImport("departments", parseCsv("nyt_navn;farve\nX;rød"));
    expect(r.problems).toEqual([
      { line: 1, message: 'Kolonnen "navn" mangler' },
      { line: 1, message: 'Kolonnen "farve" kendes ikke og bliver ikke indlæst' },
    ]);
    expect(r.fatal).toBe(true);
  });
});

describe("readImport: employees", () => {
  const head =
    "medarbejdernummer;fornavn;efternavn;fødselsdato;e-mail;telefon;afdeling;overenskomst;timer pr. uge;lønform;lønperiode;kontrakt fra";

  it("reads dates in Danish formats, hours with a decimal comma and the pay form in words", () => {
    const r = readImport(
      "employees",
      parseCsv(
        `${head}\n1010;Ole;Hansen;03-02-1990;ole@firma.dk;12345678;Butik;Detail;37,5;Timeløn;Hver 14. dag;01.12.2026`,
      ),
    );
    expect(r.problems).toEqual([]);
    expect(r.rows[0]!.values).toEqual({
      employee_number: "1010",
      first_name: "Ole",
      last_name: "Hansen",
      birth_date: "1990-02-03",
      email: "ole@firma.dk",
      phone: "12345678",
      hired_on: null,
      department: "Butik",
      agreement: "Detail",
      weekly_minutes: 2250,
      pay_form: "hourly",
      pay_period_group: "Hver 14. dag",
      contract_from: "2026-12-01",
    });
  });

  it("an empty cell means 'no change', but a wrong value is an error on its line", () => {
    const r = readImport(
      "employees",
      parseCsv(`${head}\n1011;;;31-02-1990;ikke-en-mail;;;;90;ugeløn;;`),
    );
    expect(r.rows).toEqual([]);
    expect(r.problems).toEqual([
      { line: 2, column: "fødselsdato", message: "Ugyldig dato: 31-02-1990" },
      { line: 2, column: "e-mail", message: "Ugyldig e-mail: ikke-en-mail" },
      { line: 2, column: "timer pr. uge", message: "Timer pr. uge skal være mellem 0 og 80" },
      {
        line: 2,
        column: "lønform",
        message: "Ukendt lønform: ugeløn (brug timeløn eller månedsløn)",
      },
    ]);
  });

  it("the employee number is always required, and the same number twice is an error", () => {
    const r = readImport("employees", parseCsv(`${head}\n;Ole\n1010;A\n1010;B`));
    expect(r.problems).toEqual([
      { line: 2, column: "medarbejdernummer", message: "Medarbejdernummer mangler" },
      {
        line: 4,
        column: "medarbejdernummer",
        message: "Medarbejdernummer 1010 står også i linje 3",
      },
    ]);
    expect(r.rows.map((x) => x.line)).toEqual([3]);
  });
});

describe("readImport: shifts", () => {
  const head = "medarbejdernummer;afdeling;dato;start;slut;pause (min);type;betegnelse";

  it("reads times, unpaid break minutes and the kind; no employee number = an open shift", () => {
    const r = readImport(
      "shifts",
      parseCsv(
        `${head}\n1002;Butik;2026-12-07;8.00;16:00;30;arbejde;Kasse\n;Butik;7/12/2026;22:00;06:00;;rådighed;`,
      ),
    );
    expect(r.problems).toEqual([]);
    expect(r.rows.map((x) => x.values)).toEqual([
      {
        employee_number: "1002",
        department: "Butik",
        date: "2026-12-07",
        start: "08:00",
        end: "16:00",
        break_minutes: 30,
        kind: "work",
        label: "Kasse",
      },
      {
        employee_number: null,
        department: "Butik",
        date: "2026-12-07",
        start: "22:00",
        end: "06:00",
        break_minutes: 0,
        kind: "on_call",
        label: null,
      },
    ]);
  });

  it("department, date, start and end are required on every line", () => {
    const r = readImport("shifts", parseCsv(`${head}\n1002;;2026-12-07;25:00;;;;`));
    expect(r.problems).toEqual([
      { line: 2, column: "afdeling", message: "Afdeling mangler" },
      { line: 2, column: "start", message: "Ugyldigt klokkeslæt: 25:00" },
      { line: 2, column: "slut", message: "Slut mangler" },
    ]);
  });
});

describe("readImport: balances", () => {
  const head = "medarbejdernummer;saldo;dage;pr. dato;begrundelse";

  it("reads days in hundredths, signed, with a decimal comma", () => {
    const r = readImport(
      "balances",
      parseCsv(
        `${head}\n1002;Ferie;12,5;01-12-2026;Saldo fra gammelt system\n1003;feriefridage;-1;;Rettelse`,
      ),
    );
    expect(r.problems).toEqual([]);
    expect(r.rows.map((x) => x.values)).toEqual([
      {
        employee_number: "1002",
        account: "Ferie",
        hundredths: 1250,
        as_of: "2026-12-01",
        note: "Saldo fra gammelt system",
      },
      {
        employee_number: "1003",
        account: "feriefridage",
        hundredths: -100,
        as_of: null,
        note: "Rettelse",
      },
    ]);
  });

  it("a reason of at least 5 characters is required (it stays on the posting)", () => {
    const r = readImport("balances", parseCsv(`${head}\n1002;Ferie;2;;kort`));
    expect(r.problems).toEqual([
      { line: 2, column: "begrundelse", message: "Skriv en begrundelse på mindst 5 tegn" },
    ]);
  });
});

describe("limits and templates", () => {
  it("refuses files with too many lines", () => {
    const body = Array.from({ length: 5001 }, (_, i) => `Afd ${i}`).join("\n");
    const r = readImport("departments", parseCsv(`navn\n${body}`));
    expect(r.fatal).toBe(true);
    expect(r.problems[0]!.message).toBe("Filen har 5001 linjer. Højst 5000 kan indlæses ad gangen");
  });

  it("each kind has a template that reads back without problems", () => {
    for (const kind of ["departments", "employees", "shifts", "balances"] as const) {
      const r = readImport(kind, parseCsv(templateCsv(kind).replace(/^﻿/, "")));
      expect(r.problems, kind).toEqual([]);
      expect(r.rows.length, kind).toBeGreaterThan(0);
    }
  });
});
