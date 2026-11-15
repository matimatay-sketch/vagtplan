import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("uses semicolons, CRLF and a BOM for Danish Excel, and escapes values", () => {
    const csv = toCsv(
      ["Projekt", "Timer"],
      [
        ["Ombygning; etape 1", "7,5"],
        ['Sagt "hej"', "1"],
      ],
    );
    expect(csv).toBe('﻿Projekt;Timer\r\n"Ombygning; etape 1";7,5\r\n"Sagt ""hej""";1\r\n');
  });
});
