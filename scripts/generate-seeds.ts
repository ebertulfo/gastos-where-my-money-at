#!/usr/bin/env tsx
/**
 * Generate a country category seed via LLM. Output is printed to stdout as
 * a TypeScript SeedNode[] literal that you copy-paste into
 * lib/categories/seeds.ts after eyeball review.
 *
 * Usage:
 *   npx tsx scripts/generate-seeds.ts SG
 *   npx tsx scripts/generate-seeds.ts JP > /tmp/jp-seed.ts
 *
 * Why a script and not at-runtime: we want deterministic, reviewed seeds.
 * Run this once per new country, eyeball the output for hallucinated
 * merchants or weird sub-categories, then commit. Users don't pay LLM
 * cost at signup; they get the curated result.
 *
 * Requires OPENAI_API_KEY in env (same key the app uses).
 */

import OpenAI from 'openai'
import { COMMON_TOP_LEVEL_NAMES } from '@/lib/categories/seeds'

const SYSTEM_PROMPT = `You generate household-spending category seeds for a personal-finance app.

The output is a hierarchical taxonomy: ~12 top-level categories, with up to 5 sub-categories each.
Each node has a "name" (lowercase, hyphen-separated, no spaces) and a "description".
Descriptions are merchant-rich semantic cues — comma-separated brand names, transaction verbs,
payment-rail terms — NOT prose. Example: "ntuc fairprice, sheng siong, cold storage, supermarket, wet market".

Rules:
- Names are lowercase, hyphen-separated. No emoji, no punctuation other than hyphens.
- Top-level names should match the canonical set: ${COMMON_TOP_LEVEL_NAMES.join(', ')}.
- Sub-category names can be anything appropriate for the country.
- Descriptions should mention real, locally-recognised merchants and brands.
- Currency mentions ok in descriptions (sgd, jpy, usd) but don't lead with them.
- No more than 5 children per top-level. Some top-levels can have zero children.

Return strictly valid JSON in this shape:
{
  "country": "<ISO code>",
  "seed": [
    { "name": "food", "description": "...", "children": [
      { "name": "groceries", "description": "..." },
      ...
    ]},
    ...
  ]
}`

async function main() {
  const country = process.argv[2]
  if (!country) {
    console.error('Usage: npx tsx scripts/generate-seeds.ts <ISO_COUNTRY_CODE>')
    process.exit(1)
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('OPENAI_API_KEY is required')
    process.exit(1)
  }

  const client = new OpenAI({ apiKey })

  const completion = await client.chat.completions.create({
    model: 'gpt-4.1-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Generate the seed taxonomy for country: ${country.toUpperCase()}.\nFocus on merchants and brands a typical household in that country would actually see on their bank statement.`,
      },
    ],
  })

  const raw = completion.choices[0]?.message?.content
  if (!raw) {
    console.error('Empty response from LLM')
    process.exit(1)
  }

  // Eyeball before commit — print as-is. The human pastes/curates into seeds.ts.
  console.log(raw)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
