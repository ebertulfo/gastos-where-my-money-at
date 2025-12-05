import { describe, it, expect } from "vitest";
import { sanitizeDescription } from "../types";

describe("sanitizeDescription", () => {
  describe("card-number-like sequences (PAN-like)", () => {
    it("masks 16-digit numbers with spaces", () => {
      expect(sanitizeDescription("PAYMENT 1234 5678 9012 3456 RECEIVED")).toBe(
        "PAYMENT ****-****-****-**** RECEIVED"
      );
    });

    it("masks 16-digit numbers with dashes", () => {
      expect(sanitizeDescription("CARD 1234-5678-9012-3456 USED")).toBe(
        "CARD ****-****-****-**** USED"
      );
    });

    it("masks 16-digit numbers without separators", () => {
      expect(sanitizeDescription("REF 1234567890123456 DONE")).toBe(
        "REF ****-****-****-**** DONE"
      );
    });

    it("masks multiple card numbers in same string", () => {
      expect(
        sanitizeDescription("FROM 1234567890123456 TO 9876543210987654")
      ).toBe("FROM ****-****-****-**** TO ****-****-****-****");
    });
  });

  describe("segmented account-number-like sequences", () => {
    it("masks account numbers like 123-456-789", () => {
      expect(sanitizeDescription("ACCT 123-456-789 TRANSFER")).toBe(
        "ACCT ********** TRANSFER"
      );
    });

    it("masks longer segmented numbers", () => {
      expect(sanitizeDescription("REF 1234-5678-9012 PAYMENT")).toBe(
        "REF ********** PAYMENT"
      );
    });

    it("masks multiple segmented numbers", () => {
      expect(sanitizeDescription("FROM 111-222-333 TO 444-555-666")).toBe(
        "FROM ********** TO **********"
      );
    });
  });

  describe("long digit sequences (9+ digits)", () => {
    it("masks 9-digit sequences", () => {
      expect(sanitizeDescription("REF 123456789 COMPLETE")).toBe(
        "REF ********** COMPLETE"
      );
    });

    it("masks 12-digit sequences", () => {
      expect(sanitizeDescription("TXN 123456789012 PROCESSED")).toBe(
        "TXN ********** PROCESSED"
      );
    });

    it("does not mask 8-digit sequences", () => {
      expect(sanitizeDescription("REF 12345678 DONE")).toBe("REF 12345678 DONE");
    });
  });

  describe("long alphanumeric reference IDs", () => {
    it("masks 10+ character mixed alphanumeric IDs", () => {
      expect(sanitizeDescription("REF ABCD123456 PAYMENT")).toBe(
        "REF <ref_id_redacted> PAYMENT"
      );
    });

    it("masks longer reference IDs with mixed content", () => {
      expect(sanitizeDescription("TXN ABC123DEF456 DONE")).toBe(
        "TXN <ref_id_redacted> DONE"
      );
    });

    it("masks IDs starting with letters then numbers", () => {
      expect(sanitizeDescription("PIB2409013447443719")).toBe(
        "<ref_id_redacted>"
      );
    });

    it("masks IDs starting with numbers then letters", () => {
      expect(sanitizeDescription("20240901UOVBSGSGBRT6577846")).toBe(
        "<ref_id_redacted>"
      );
    });

    it("does not mask shorter IDs", () => {
      expect(sanitizeDescription("REF ABC123 DONE")).toBe("REF ABC123 DONE");
    });

    it("does not mask pure letter words (merchant names)", () => {
      // These are merchant names, not reference IDs
      expect(sanitizeDescription("MYREPUBLIC BROADBAND")).toBe("MYREPUBLIC BROADBAND");
      expect(sanitizeDescription("STARBUCKS COFFEE")).toBe("STARBUCKS COFFEE");
      expect(sanitizeDescription("MCDONALDS RESTAURANT")).toBe("MCDONALDS RESTAURANT");
    });

    it("does not mask lowercase text", () => {
      expect(sanitizeDescription("payment from john smith")).toBe(
        "payment from john smith"
      );
    });
  });

  describe("normal merchant names remain unchanged", () => {
    it("preserves normal merchant names", () => {
      expect(sanitizeDescription("GRAB *GRABTAXI")).toBe("GRAB *GRABTAXI");
    });

    it("preserves merchant names with numbers", () => {
      expect(sanitizeDescription("7-ELEVEN #1234")).toBe("7-ELEVEN #1234");
    });

    it("preserves SHOPEE transactions", () => {
      expect(sanitizeDescription("SHOPEE SG")).toBe("SHOPEE SG");
    });

    it("preserves AMAZON transactions", () => {
      expect(sanitizeDescription("AMAZON PRIME")).toBe("AMAZON PRIME");
    });

    it("preserves restaurant names", () => {
      expect(sanitizeDescription("STARBUCKS COFFEE #5678")).toBe(
        "STARBUCKS COFFEE #5678"
      );
    });

    it("preserves utility payments", () => {
      expect(sanitizeDescription("SP SERVICES BILL PAYMENT")).toBe(
        "SP SERVICES BILL PAYMENT"
      );
    });
  });

  describe("combined patterns", () => {
    it("handles multiple sensitive patterns in one string", () => {
      const input = "TRANSFER 1234567890123456 REF ABC1234567890 ACCT 123-456-789";
      const expected =
        "TRANSFER ****-****-****-**** REF <ref_id_redacted> ACCT **********";
      expect(sanitizeDescription(input)).toBe(expected);
    });

    it("handles mixed content with merchant name and card number", () => {
      expect(
        sanitizeDescription("GRAB PAYMENT 1234-5678-9012-3456 SINGAPORE")
      ).toBe("GRAB PAYMENT ****-****-****-**** SINGAPORE");
    });
  });

  describe("edge cases", () => {
    it("handles empty string", () => {
      expect(sanitizeDescription("")).toBe("");
    });

    it("handles string with only spaces", () => {
      expect(sanitizeDescription("   ")).toBe("   ");
    });

    it("handles amounts (should not mask)", () => {
      expect(sanitizeDescription("PAYMENT 123.45")).toBe("PAYMENT 123.45");
    });

    it("handles dates (should not mask)", () => {
      expect(sanitizeDescription("29 AUG 2024")).toBe("29 AUG 2024");
    });
  });
});
