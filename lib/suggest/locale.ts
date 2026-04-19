// Map ISO country codes (as collected by the onboarding wizard) to friendly
// names for the LLM prompt. Only includes the codes the wizard offers; falls
// back gracefully for anything else.
const COUNTRY_NAMES: Record<string, string> = {
  SG: 'Singapore',
  US: 'the United States',
  GB: 'the United Kingdom',
  EU: 'Europe',
  AU: 'Australia',
  MY: 'Malaysia',
  ID: 'Indonesia',
  PH: 'the Philippines',
  TH: 'Thailand',
  JP: 'Japan',
}

export function friendlyCountry(code: string | null | undefined): string {
  if (!code) return 'their region'
  return COUNTRY_NAMES[code] ?? code
}
