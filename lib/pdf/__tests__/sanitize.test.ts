import { describe, it, expect } from "vitest";
import { sanitizeDescription } from "../types";

describe("sanitizeDescription", () => {
  describe("card-number-like sequences (PAN-like)", () => {
    it("masks 16-digit numbers with spaces", () => {
      expect(sanitizeDescription("PAYMENT 1234 5678 9012 3456 RECEIVED")).toBe(
        "PAYMENT <card_redacted> RECEIVED"
      );
    });

    it("masks 16-digit numbers with dashes", () => {
      expect(sanitizeDescription("CARD 1234-5678-9012-3456 USED")).toBe(
        "CARD <card_redacted> USED"
      );
    });

    it("masks 16-digit numbers without separators", () => {
      expect(sanitizeDescription("REF 1234567890123456 DONE")).toBe(
        "REF <card_redacted> DONE"
      );
    });

    it("masks multiple card numbers in same string", () => {
      expect(
        sanitizeDescription("FROM 1234567890123456 TO 9876543210987654")
      ).toBe("FROM <card_redacted> TO <card_redacted>");
    });
  });

  describe("segmented account-number-like sequences", () => {
    it("masks account numbers like 123-456-789", () => {
      expect(sanitizeDescription("ACCT 123-456-789 TRANSFER")).toBe(
        "ACCT <account_redacted> TRANSFER"
      );
    });

    it("masks longer segmented numbers", () => {
      expect(sanitizeDescription("REF 1234-5678-9012 PAYMENT")).toBe(
        "REF <account_redacted> PAYMENT"
      );
    });

    it("masks multiple segmented numbers", () => {
      expect(sanitizeDescription("FROM 111-222-333 TO 444-555-666")).toBe(
        "FROM <account_redacted> TO <account_redacted>"
      );
    });
  });

  describe("long digit sequences (8+ digits)", () => {
    it("masks 9-digit sequences", () => {
      expect(sanitizeDescription("REF 123456789 COMPLETE")).toBe(
        "REF <digits_redacted> COMPLETE"
      );
    });

    it("masks 12-digit sequences", () => {
      expect(sanitizeDescription("TXN 123456789012 PROCESSED")).toBe(
        "TXN <digits_redacted> PROCESSED"
      );
    });

    it("masks 8-digit sequences (catches SG mobiles + ATM transaction refs)", () => {
      expect(sanitizeDescription("REF 12345678 DONE")).toBe(
        "REF <digits_redacted> DONE"
      );
    });

    it("masks bare 8-digit ATM transaction refs", () => {
      expect(sanitizeDescription("PLUS ATM Transaction 67215799,LOCATION")).toBe(
        "PLUS ATM Transaction <digits_redacted>,LOCATION"
      );
    });

    it("does not mask 7-digit sequences (still permits short codes)", () => {
      expect(sanitizeDescription("REF 1234567 DONE")).toBe("REF 1234567 DONE");
    });
  });

  describe("person recipient on transfer rails", () => {
    it("masks recipient on PAYNOW TO", () => {
      expect(sanitizeDescription("PAYNOW TO ALICE SMITH")).toBe(
        "PAYNOW TO <name_redacted>"
      );
    });

    it("masks sender on BT TRANSFER FROM", () => {
      expect(sanitizeDescription("BT TRANSFER FROM JOHN DOE 123")).toBe(
        "BT TRANSFER FROM <name_redacted>"
      );
    });

    it("masks recipient on FUND TRANSFER TO", () => {
      expect(sanitizeDescription("FUND TRANSFER TO ALICE SMITH REF1234")).toBe(
        "FUND TRANSFER TO <name_redacted>"
      );
    });

    it("masks recipient on BT TRF TO", () => {
      expect(sanitizeDescription("BT TRF TO ALICE SMITH")).toBe(
        "BT TRF TO <name_redacted>"
      );
    });

    it("masks recipient on FAST TO", () => {
      expect(sanitizeDescription("FAST TO ALICE SMITH")).toBe(
        "FAST TO <name_redacted>"
      );
    });

    it("masks recipient on FAST TRANSFER FROM", () => {
      expect(sanitizeDescription("FAST TRANSFER FROM JOHN DOE")).toBe(
        "FAST TRANSFER FROM <name_redacted>"
      );
    });

    it("does NOT mask GIRO recipients (corporate, kept for tagging signal)", () => {
      expect(sanitizeDescription("GIRO PAYMENT HSBC LIFE INSURANCE")).toBe(
        "GIRO PAYMENT HSBC LIFE INSURANCE"
      );
    });

    it("does NOT mask plain TO/FROM in merchant text", () => {
      expect(sanitizeDescription("TOM N TOMS AIRPORT")).toBe(
        "TOM N TOMS AIRPORT"
      );
    });

    it("does NOT mask the rail keyword alone (no recipient)", () => {
      expect(sanitizeDescription("PAYNOW TO")).toBe("PAYNOW TO");
    });
  });

  describe("HDB / condo unit refs", () => {
    it("masks #XX-XX patterns", () => {
      expect(sanitizeDescription("STARBUCKS BLK 123 #03-15")).toBe(
        "STARBUCKS BLK 123 <unit_redacted>"
      );
    });

    it("masks #XX-XXX patterns", () => {
      expect(sanitizeDescription("MERCHANT #12-345")).toBe(
        "MERCHANT <unit_redacted>"
      );
    });

    it("masks unit refs with en-dash", () => {
      expect(sanitizeDescription("SHOP #03–15 LEVEL 3")).toBe(
        "SHOP <unit_redacted> LEVEL 3"
      );
    });

    it("does not mask plain hashtag with too few digits", () => {
      expect(sanitizeDescription("STARBUCKS #5678")).toBe("STARBUCKS #5678");
    });
  });

  describe("Singapore postal codes near street keywords", () => {
    it("masks 6-digit postal after SINGAPORE", () => {
      expect(sanitizeDescription("MERCHANT SINGAPORE 049315")).toBe(
        "MERCHANT SINGAPORE <postal_redacted>"
      );
    });

    it("masks 6-digit postal after BLOCK", () => {
      expect(sanitizeDescription("FOOD CENTRE BLOCK 511025")).toBe(
        "FOOD CENTRE BLOCK <postal_redacted>"
      );
    });

    it("does not mask standalone 6-digit codes (insufficient context)", () => {
      expect(sanitizeDescription("MERCHANT 049315 OK")).toBe(
        "MERCHANT 049315 OK"
      );
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
        "TRANSFER <card_redacted> REF <ref_id_redacted> ACCT <account_redacted>";
      expect(sanitizeDescription(input)).toBe(expected);
    });

    it("handles mixed content with merchant name and card number", () => {
      expect(
        sanitizeDescription("GRAB PAYMENT 1234-5678-9012-3456 SINGAPORE")
      ).toBe("GRAB PAYMENT <card_redacted> SINGAPORE");
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
