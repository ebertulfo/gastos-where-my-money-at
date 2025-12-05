import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import {
  generateTransactionIdentifier,
  normalizeDateToYyyyMmDd,
} from "../transaction-identifier";

const shortHash = (value: string) =>
  createHash("sha256").update(value.trim()).digest("hex").slice(0, 8);

describe("generateTransactionIdentifier", () => {
  it("matches the spec example with normalized values", () => {
    const description =
      "Advice Bill Payment DBSC-4119110095321011 : I-BANK VALUE DATE : 01/09/2024";

    const id = generateTransactionIdentifier({
      date: "01/09/2024",
      description,
      amount: "8,104.86",
      balance: "4,188.45",
    });

    expect(id).toBe(`20240901-8104.86-4188.45-${shortHash(description)}`);
  });

  it("removes commas and formats numbers to two decimals", () => {
    const id = generateTransactionIdentifier({
      date: "2024-09-01",
      description: "Sample Transaction",
      amount: "1,234",
      balance: "5,678.5",
    });

    expect(id).toBe(`20240901-1234.00-5678.50-${shortHash("Sample Transaction")}`);
  });

  it("trims description before hashing", () => {
    const withPadding = generateTransactionIdentifier({
      date: "2024/12/31",
      description: "  Grocery Run  ",
      amount: "123.4",
      balance: "999.99",
    });

    const trimmed = generateTransactionIdentifier({
      date: "2024/12/31",
      description: "Grocery Run",
      amount: "123.4",
      balance: "999.99",
    });

    expect(withPadding).toBe(trimmed);
  });

  it("supports multiple date formats", () => {
    expect(normalizeDateToYyyyMmDd("01/09/24")).toBe("20240901");
    expect(normalizeDateToYyyyMmDd("1 Sep 2024")).toBe("20240901");
    expect(normalizeDateToYyyyMmDd("2024-9-1")).toBe("20240901");
  });

  it("uses defaultYear when day+month has no year", () => {
    expect(normalizeDateToYyyyMmDd("19 SEP", { defaultYear: 2024 })).toBe(
      "20240919"
    );
  });

  it("rejects dates without a resolvable year", () => {
    expect(() => normalizeDateToYyyyMmDd("29 AUG")).toThrow(
      /Cannot normalize date/
    );
  });
});
