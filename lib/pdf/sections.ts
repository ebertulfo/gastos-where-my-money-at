/**
 * Section markers + classifier — ports the constants block at
 * src/parser.py:80-138 and _classify_section_marker at :318.
 */

import type { StatementProfile } from "./profiles";

export const TRANSACTION_SECTION = "transaction_section";
export const SUMMARY_SECTION = "summary_section";
export const ACCOUNT_OVERVIEW = "account_overview";
export const INVESTMENT_SECTION = "investment_section";
export const UNKNOWN_SECTION = "unknown";

export type SectionLabel =
  | typeof TRANSACTION_SECTION
  | typeof SUMMARY_SECTION
  | typeof ACCOUNT_OVERVIEW
  | typeof INVESTMENT_SECTION
  | typeof UNKNOWN_SECTION;

export const TRANSACTION_SECTION_MARKERS = [
  "new transactions",
  "transaction details",
  "account activity",
  "account transactions",
  "details of transactions",
];

export const SUMMARY_SECTION_MARKERS = [
  "previous balance",
  "payment summary",
  "statement summary",
];

export const ACCOUNT_OVERVIEW_SECTION_MARKERS = ["account summary"];

export const ACCOUNT_OVERVIEW_ROW_MARKERS = [
  "account account no",
  "account no. balance",
  "emysavings account",
  "mysavings/posb",
];

export const TRANSACTION_ACCOUNT_SECTION_MARKERS = [
  "dbs multiplier account account no",
];

export const IGNORED_ACCOUNT_SECTION_MARKERS = [
  "emysavings account account no",
];

export const INVESTMENT_SECTION_MARKERS = [
  "investment",
  "unit trusts",
  "fund name",
  "market value",
];

export const BALANCE_CARRIED_FORWARD_MARKERS = [
  "balance carried forward",
  "balance brought forward",
];

export const CONTINUATION_NOISE_MARKERS = [
  "instalment plans summary",
  "plan principal",
  "mths remaining",
  "outstanding amt",
  "principal amt",
  "no expiry",
];

function containsAny(haystack: string, needles: string[]): boolean {
  for (const n of needles) {
    if (haystack.includes(n)) return true;
  }
  return false;
}

/**
 * Return the section label when a line establishes or belongs to one,
 * otherwise `null`. Mirrors _classify_section_marker.
 */
export function classifySectionMarker(
  text: string,
  _profile: StatementProfile
): SectionLabel | null {
  const lower = text.toLowerCase();
  if (containsAny(lower, TRANSACTION_SECTION_MARKERS)) return TRANSACTION_SECTION;
  if (containsAny(lower, SUMMARY_SECTION_MARKERS)) return SUMMARY_SECTION;
  if (containsAny(lower, INVESTMENT_SECTION_MARKERS)) return INVESTMENT_SECTION;
  if (containsAny(lower, TRANSACTION_ACCOUNT_SECTION_MARKERS)) return TRANSACTION_SECTION;
  if (containsAny(lower, IGNORED_ACCOUNT_SECTION_MARKERS)) return ACCOUNT_OVERVIEW;
  if (containsAny(lower, ACCOUNT_OVERVIEW_SECTION_MARKERS)) return ACCOUNT_OVERVIEW;
  return null;
}

export function contentRejectionReason(text: string): string | null {
  const lower = text.toLowerCase();
  if (containsAny(lower, BALANCE_CARRIED_FORWARD_MARKERS)) return "balance_carried_forward";
  if (containsAny(lower, ACCOUNT_OVERVIEW_ROW_MARKERS)) return ACCOUNT_OVERVIEW;
  if (containsAny(lower, INVESTMENT_SECTION_MARKERS)) return INVESTMENT_SECTION;
  return null;
}

export function sectionRejectionReason(section: SectionLabel): string | null {
  if (section === SUMMARY_SECTION) return SUMMARY_SECTION;
  if (section === ACCOUNT_OVERVIEW) return ACCOUNT_OVERVIEW;
  if (section === INVESTMENT_SECTION) return INVESTMENT_SECTION;
  return null;
}
