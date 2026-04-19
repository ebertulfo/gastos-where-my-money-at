/**
 * Tiny statement profile hook — picks per-layout behavior by filename/heading
 * heuristics. Mirrors src/parser.py:141-161 and _select_profile at :309.
 */

import type { TextLine } from "./models";

export type StatementProfile = {
  name: "generic" | "altitude_credit_card" | "dbs_deposit_investment";
  /** Whether this layout puts the transaction date in the first cell of a row. */
  dateFirstRows: boolean;
};

export const GENERIC_PROFILE: StatementProfile = {
  name: "generic",
  dateFirstRows: true,
};

export const ALTITUDE_PROFILE: StatementProfile = {
  name: "altitude_credit_card",
  dateFirstRows: true,
};

export const DBS_PROFILE: StatementProfile = {
  name: "dbs_deposit_investment",
  dateFirstRows: true,
};

export function selectProfile(
  sourceFile: string,
  statementName: string,
  lines: TextLine[]
): StatementProfile {
  // Scan a generous slice of the page so brand markers like "DBS ALTITUDE"
  // that appear below the address/header block are still picked up. The
  // Python reference relies heavily on the filename carrying the brand name;
  // when we get a raw Buffer (no filename) we need a wider fallback window.
  const head = lines.slice(0, 50).map((l) => l.text).join(" ");
  const haystack = `${sourceFile} ${statementName} ${head}`.toLowerCase();

  // Altitude check runs first because Altitude statements also mention "DBS"
  // (the issuer), and the DBS deposit/ATM layout must not win on them.
  if (haystack.includes("altitude")) return ALTITUDE_PROFILE;
  if (
    haystack.includes("dbs multiplier") ||
    haystack.includes("emysavings") ||
    haystack.includes("posb") ||
    haystack.includes("ed-atm")
  ) {
    return DBS_PROFILE;
  }
  return GENERIC_PROFILE;
}
