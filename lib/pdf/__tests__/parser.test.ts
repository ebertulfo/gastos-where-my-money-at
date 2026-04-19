/**
 * Direct port of the Python feedback-driven regression suite at
 * bank-transactions-extraction-experiment/tests/test_parser_feedback.py.
 *
 * Fixtures construct TextLine objects directly so these tests never need a
 * real PDF — the parser is pure once word coordinates exist.
 */

import { describe, it, expect } from "vitest";
import { GenericTransactionParser } from "../parser";
import type { TextLine, Transaction } from "../models";

function textLine(text: string, opts?: { x0?: number; y0?: number }): TextLine {
  const x0 = opts?.x0 ?? 0;
  const y0 = opts?.y0 ?? 0;
  return {
    text,
    words: [],
    x0,
    y0,
    x1: x0 + text.length * 5,
    y1: y0 + 10,
  };
}

function positionedTextLine(
  tokens: Array<[text: string, x0: number, x1: number]>,
  opts?: { y0?: number }
): TextLine {
  const y0 = opts?.y0 ?? 0;
  const words = tokens.map(([text, x0, x1]) => ({
    x0,
    y0,
    x1,
    y1: y0 + 10,
    text,
  }));
  return {
    text: tokens.map(([text]) => text).join(" "),
    words,
    x0: Math.min(...tokens.map(([, x0]) => x0)),
    y0,
    x1: Math.max(...tokens.map(([, , x1]) => x1)),
    y1: y0 + 10,
  };
}

function parseTexts(
  texts: string[],
  opts?: { sourceFile?: string }
): { parser: GenericTransactionParser; transactions: Transaction[] } {
  const parser = new GenericTransactionParser();
  const sourceFile = opts?.sourceFile ?? "statement.pdf";
  const { transactions } = parser.parseLines(
    texts.map((t, i) => textLine(t, { y0: i * 12 })),
    {
      sourceFile,
      statementName: sourceFile.replace(/\.pdf$/i, ""),
      pageNumber: 1,
      extractionMethod: "text",
    }
  );
  return { parser, transactions };
}

describe("ParserFeedbackTests — parity with Python test_parser_feedback.py", () => {
  it("previous balance section is excluded but new transactions remain", () => {
    const { parser, transactions } = parseTexts(
      [
        "PREVIOUS BALANCE",
        "04 DEC BILL PAYMENT - DBS INTERNET/WIRELESS 4,700.55 CR",
        "REF NO: 17648556978814396751",
        "NEW TRANSACTIONS",
        "26 JAN Google One 25.45 CR",
      ],
      { sourceFile: "2025-12-Altitude-CC.pdf" }
    );

    expect(transactions).toHaveLength(1);
    expect(transactions[0].transactionDate).toBe("26 JAN");
    expect(transactions[0].description).toBe("Google One");
    expect(transactions[0].amount).toBe(-25.45);
    expect(transactions[0].debitCredit).toBe("credit");
    expect(parser.lastRejections.map((r) => r.reason)).toContain("summary_section");
  });

  it("day-month dates do not swallow numeric merchant prefixes", () => {
    const parsed = parseTexts(
      [
        "26 DEC 99 RANCH STORE TAGUIG PH 115.07",
        "30 DEC 001APPLE R633 MARINA BAY 12 (09) 279.08",
        "INSTALMENT PLANS SUMMARY",
      ],
      { sourceFile: "2025-12-Altitude-CC.pdf" }
    );

    expect(parsed.transactions).toHaveLength(2);
    expect(parsed.transactions[0].transactionDate).toBe("26 DEC");
    expect(parsed.transactions[0].description.startsWith("99 RANCH STORE")).toBe(true);
    expect(parsed.transactions[0].amount).toBe(115.07);
    expect(parsed.transactions[1].transactionDate).toBe("30 DEC");
    expect(parsed.transactions[1].description.startsWith("001APPLE R633")).toBe(true);
    expect(parsed.transactions[1].rawLine).not.toContain("INSTALMENT PLANS SUMMARY");

    const parser = new GenericTransactionParser();
    const indented = parser.parseLines(
      [
        textLine("30 DEC 001APPLE R633 MARINA BAY 12 (09) 279.08"),
        textLine("INSTALMENT PLANS SUMMARY", { x0: 80 }),
        textLine("PLAN PRINCIPAL AMT INSTALMENT MTHS REMAINING INSTALMENT OUTSTANDING AMT", { x0: 80 }),
        textLine("PDS_CRCRDGCE_LOC_ESTMT_0fb1015e0000004a_09058", { x0: 80 }),
      ],
      {
        sourceFile: "2025-12-Altitude-CC.pdf",
        statementName: "2025-12-Altitude-CC",
        pageNumber: 1,
        extractionMethod: "text",
      }
    );
    expect(indented.transactions[0].rawLine).not.toContain("INSTALMENT PLANS SUMMARY");
    expect(indented.transactions[0].rawLine).not.toContain("PLAN PRINCIPAL");
    expect(indented.transactions[0].rawLine).not.toContain("PDS_CRCRDGCE");
  });

  it("account overview and balance rows are excluded", () => {
    const { parser, transactions } = parseTexts(
      [
        "eMySavings Account 592-05826-0 SGD 0.00 0.00",
        "01/10/2025 Monthly Savings Amount for MySavings/POSB 100.00 100.05",
        "(08/2014) Balance Carried Forward SGD 114.03",
        "PDS_MMCON_X_ONSH_0fb301090000005a_00741",
      ],
      { sourceFile: "2025-12-Ed-ATM.pdf" }
    );

    expect(transactions).toEqual([]);
    const reasons = new Set(parser.lastRejections.map((r) => r.reason));
    expect(reasons.has("account_overview")).toBe(true);
    expect(reasons.has("balance_carried_forward")).toBe(true);
    expect(reasons.has("embedded_date")).toBe(true);
  });

  it("investment section rows are excluded", () => {
    const { parser, transactions } = parseTexts(
      [
        "Unit Trusts",
        "Fund Name Units Market Value",
        "08/12/2025 Example Fund 1,000.00 2,000.00",
      ],
      { sourceFile: "2025-12-Ed-ATM.pdf" }
    );

    expect(transactions).toEqual([]);
    expect(parser.lastRejections.map((r) => r.reason)).toContain("investment_section");
  });

  it("Altitude credit card credits reduce statement total", () => {
    const { transactions } = parseTexts(
      [
        "NEW TRANSACTIONS",
        "26 JAN Google One 25.45 CR",
        "22 DEC GOMO MOBILE PLAN 25.45",
      ],
      { sourceFile: "2025-12-Altitude-CC.pdf" }
    );

    expect(transactions).toHaveLength(2);
    expect(transactions[0].debitCredit).toBe("credit");
    expect(transactions[0].amount).toBe(-25.45);
    expect(transactions[1].debitCredit).toBe("debit");
    expect(transactions[1].amount).toBe(25.45);
    const sum = transactions.reduce((acc, tx) => acc + tx.amount, 0);
    expect(sum).toBe(0);
  });

  it("DBS ATM uses withdrawal and deposit columns for side", () => {
    const parser = new GenericTransactionParser();
    const withdrawalLine = positionedTextLine([
      ["04/12/2025", 45.4, 90.4],
      ["Advice", 113.1, 140.1],
      ["Bill", 142.6, 154.6],
      ["Payment", 157.1, 192.6],
      ["4,700.55", 359.9, 394.9],
      ["1,029.44", 512.7, 547.8],
    ]);
    const depositLine = positionedTextLine(
      [
        ["04/12/2025", 45.4, 90.4],
        ["Advice", 113.1, 140.1],
        ["FAST", 142.6, 165.6],
        ["Payment", 168.1, 203.7],
        ["/", 206.2, 208.7],
        ["Receipt", 211.2, 241.7],
        ["5,600.00", 439.0, 474.0],
        ["5,729.99", 512.7, 547.8],
      ],
      { y0: 12.0 }
    );

    const { transactions } = parser.parseLines([withdrawalLine, depositLine], {
      sourceFile: "2025-12-Ed-ATM.pdf",
      statementName: "2025-12-Ed-ATM",
      pageNumber: 4,
      extractionMethod: "text",
    });

    expect(transactions).toHaveLength(2);
    expect(transactions[0].amount).toBe(-4700.55);
    expect(transactions[0].debitCredit).toBe("debit");
    expect(transactions[0].runningBalance).toBe(1029.44);
    expect(transactions[1].amount).toBe(5600);
    expect(transactions[1].debitCredit).toBe("credit");
    expect(transactions[1].runningBalance).toBe(5729.99);
  });

  it("DBS multiplier transaction section survives account header", () => {
    const { parser, transactions } = parseTexts(
      [
        "Transaction Details",
        "eMySavings Account Account No. 592-05826-0",
        "Date Description Withdrawal (-) Deposit (+) Balance (SGD)",
        "01/10/2025 Monthly Savings Amount for MySavings/POSB 100.00 100.05",
        "DBS Multiplier Account Account No. 120-322628-5",
        "Date Description Withdrawal (-) Deposit (+) Balance",
        "30/11/2025 Advice Point-Of-Sale Transaction or Proceeds 11.00 8,191.60",
        "NETS QR PAYMENT 533411452378797",
      ],
      { sourceFile: "2025-12-Ed-ATM.pdf" }
    );

    expect(transactions).toHaveLength(1);
    expect(transactions[0].transactionDate).toBe("30/11/2025");
    expect(transactions[0].description).toBe("Advice Point-Of-Sale Transaction or Proceeds");
    expect(transactions[0].amount).toBe(11);
    expect(transactions[0].runningBalance).toBe(8191.6);
    expect(parser.lastRejections.map((r) => r.reason)).toContain("account_overview");
  });

  it("generic bank row with running balance still parses", () => {
    const { transactions } = parseTexts(["01/12/2025 Merchant Name 10.00 100.00"]);

    expect(transactions).toHaveLength(1);
    expect(transactions[0].transactionDate).toBe("01/12/2025");
    expect(transactions[0].description).toBe("Merchant Name");
    expect(transactions[0].amount).toBe(10);
    expect(transactions[0].runningBalance).toBe(100);
  });
});
