/**
 * Country-aware category seeds. AI-generated, human-reviewed, committed.
 *
 * Names are lowercase to match the existing `tags_name_lowercase_chk`.
 * Descriptions are merchant-rich semantic cues — embedded by `embedTags`
 * after seeding so KNN/tag-embed can match transaction descriptions
 * against them at ingest. Description style follows seed-tag-description's
 * format: comma-separated brand/keyword/payment-rail terms, no prose.
 *
 * To regenerate or extend: see scripts/generate-seeds.ts. After any change
 * here, users created BEFORE the change keep their original seed; the
 * `restoreDefaultCategories` action re-runs the seed and only inserts
 * names the user is missing.
 */

export interface SeedNode {
  name: string
  description: string
  children?: SeedNode[]
}

const COMMON_TOP_LEVEL_NAMES = [
  'food',
  'transport',
  'housing',
  'utilities',
  'shopping',
  'entertainment',
  'health',
  'education',
  'travel',
  'subscriptions',
  'financial',
  'other',
] as const

const SG_SEED: SeedNode[] = [
  {
    name: 'food',
    description: 'meals, groceries, dining, hawker, kopitiam, food delivery, restaurants, cafes',
    children: [
      { name: 'groceries', description: 'NTUC FairPrice, Cold Storage, Sheng Siong, Giant, Mustafa, Don Don Donki, supermarket, wet market' },
      { name: 'dining', description: 'restaurants, bistros, casual dining, jumbo, paradise group, putien, sushi, ramen, korean bbq' },
      { name: 'hawker', description: 'hawker centre, food court, kopitiam, koufu, foodfare, koi, prata, char kway teow, chicken rice' },
      { name: 'coffee', description: 'starbucks, toast box, ya kun kaya toast, coffee bean, percolate, the coffee academics, common man, kopi' },
      { name: 'delivery', description: 'grabfood, foodpanda, deliveroo, oddle, chope, takeaway' },
    ],
  },
  {
    name: 'transport',
    description: 'commuting, taxi, ride-hailing, parking, fuel, public transit, mrt, bus',
    children: [
      { name: 'public-transit', description: 'mrt, lrt, smrt, sbs transit, bus, ezlink, simplygo, transitlink' },
      { name: 'ride-hailing', description: 'grab, gojek, tada, ryde, zig, comfortdelgro app' },
      { name: 'taxi', description: 'comfort taxi, citycab, transcab, premier, prime taxi, smrt taxi' },
      { name: 'fuel', description: 'esso, shell, caltex, spc, sinopec, petrol, diesel, fuel pump' },
      { name: 'parking', description: 'parking.sg, hdb parking, season parking, urawise, evp, ev charging, sp mobility' },
    ],
  },
  {
    name: 'housing',
    description: 'rent, mortgage, condo, hdb, property tax, conservancy, maintenance, agent fees',
    children: [
      { name: 'rent', description: 'monthly rent, landlord, lease payment, propertyguru, 99co' },
      { name: 'mortgage', description: 'home loan, mortgage payment, hdb loan, dbs home loan, ocbc home loan, uob home loan' },
      { name: 'maintenance', description: 'mcst, condo management, conservancy charges, town council, repairs, plumber, electrician, painter' },
    ],
  },
  {
    name: 'utilities',
    description: 'electricity, water, gas, internet, mobile, broadband, phone bill',
    children: [
      { name: 'electricity-water-gas', description: 'sp services, sp group, geneco, tuas power, keppel electric, senoko energy, city gas' },
      { name: 'internet', description: 'singtel, starhub, m1, mynetfone, viewqwest, broadband, fibre, wifi' },
      { name: 'mobile', description: 'singtel mobile, starhub mobile, m1, circles.life, giga, simba, redone, postpaid, prepaid, top-up' },
    ],
  },
  {
    name: 'shopping',
    description: 'online shopping, retail, fashion, electronics, household goods, marketplaces',
    children: [
      { name: 'online', description: 'shopee, lazada, amazon sg, qoo10, taobao, ezbuy, ebay, etsy, ali express, redmart' },
      { name: 'fashion', description: 'uniqlo, zara, h&m, cotton on, charles & keith, pedro, mango, gucci, lv, sephora, lush' },
      { name: 'electronics', description: 'apple, courts, harvey norman, challenger, gainmart, best denki, audio house, gain city' },
      { name: 'household', description: 'ikea, daiso, miniso, mr diy, sephora, watsons, guardian, unity pharmacy, fairprice xtra' },
    ],
  },
  {
    name: 'entertainment',
    description: 'cinema, concerts, attractions, gaming, sports, hobbies, books',
    children: [
      { name: 'cinema-events', description: 'golden village, gv, shaw theatres, cathay, sistic, sportshub, esplanade, mbs theatre, klook event' },
      { name: 'gaming', description: 'steam, playstation, nintendo, xbox, riot, epic games, valve, in-app purchase' },
      { name: 'attractions', description: 'sentosa, universal studios, gardens by the bay, zoo, river wonders, klook, trip, wildlife' },
      { name: 'books-hobbies', description: 'kinokuniya, popular bookstore, books actually, art friend, hobbies, craft, music store' },
    ],
  },
  {
    name: 'health',
    description: 'medical, pharmacy, dental, optical, fitness, gym, healthcare',
    children: [
      { name: 'medical', description: 'gp clinic, polyclinic, raffles medical, parkway, mount elizabeth, sgh, ttsh, nuh, kkh, specialist, x-ray, blood test' },
      { name: 'pharmacy', description: 'guardian, watsons, unity pharmacy, polyclinic pharmacy, panadol, prescription, supplements' },
      { name: 'fitness', description: 'gym, fitness first, anytime fitness, virgin active, classpass, yoga, pilates, crossfit, personal trainer' },
      { name: 'dental-optical', description: 'dentist, dental clinic, q&m, smilefocus, optical, owndays, lenscrafters, capitol optical, contact lens' },
    ],
  },
  {
    name: 'education',
    description: 'tuition, courses, school fees, books, learning, kids classes',
    children: [
      { name: 'tuition-courses', description: 'tuition centre, math monkey, kumon, mindchamps, course fee, udemy, coursera, skillsfuture' },
      { name: 'school-fees', description: 'school fees, university, polytechnic, jc, primary school, secondary school, kindergarten, preschool' },
    ],
  },
  {
    name: 'subscriptions',
    description: 'streaming, software, news, apps, monthly subscriptions, recurring',
    children: [
      { name: 'streaming', description: 'netflix, spotify, disney+, apple music, youtube premium, hbo go, viu, amazon prime, hulu' },
      { name: 'software', description: 'icloud, google one, microsoft 365, adobe, dropbox, notion, github, openai, claude' },
      { name: 'news-other', description: 'straits times, business times, ft, nyt, substack, medium, magazine, newspaper' },
    ],
  },
  {
    name: 'financial',
    description: 'bank fees, credit card fees, interest, transfers, taxes, insurance premiums',
    children: [
      { name: 'fees-interest', description: 'service charge, late payment fee, finance charge, interest, atm fee, foreign txn fee, gst' },
      { name: 'insurance', description: 'aia, prudential, ntuc income, great eastern, manulife, axa, msig, allianz, life insurance, health insurance' },
      { name: 'taxes', description: 'iras, income tax, property tax, gst, motor tax, road tax' },
      { name: 'investments', description: 'syfe, stashaway, endowus, tiger brokers, moomoo, ibkr, fsmone, dollarcosting, sgx' },
    ],
  },
  { name: 'other', description: 'miscellaneous, uncategorized, gifts, donations, charity, cash withdrawal, atm' },
]

const JP_SEED: SeedNode[] = [
  {
    name: 'food',
    description: 'meals, groceries, dining, konbini, izakaya, restaurants, cafes',
    children: [
      { name: 'groceries', description: 'aeon, ito-yokado, life, summit, gyomu super, seijo ishii, supermarket' },
      { name: 'dining', description: 'restaurant, ramen, sushi, izakaya, yakitori, tonkatsu, soba, udon, kaiseki' },
      { name: 'konbini', description: '7-eleven, lawson, familymart, ministop, daily yamazaki, newdays, convenience store' },
      { name: 'coffee', description: 'starbucks, doutor, tully\'s, komeda, ueshima, blue bottle, coffee, kissaten' },
      { name: 'delivery', description: 'uber eats japan, demae-can, wolt, doordash, takeout' },
    ],
  },
  {
    name: 'transport',
    description: 'jr, metro, shinkansen, taxi, suica, pasmo, ic card, fuel',
    children: [
      { name: 'public-transit', description: 'jr, metro, shinkansen, suica, pasmo, ic card, tokyo metro, toei, jre, train, subway' },
      { name: 'ride-hailing-taxi', description: 'uber, didi, go, mobile taxi, taxi, kyo-taxi' },
      { name: 'fuel', description: 'eneos, idemitsu, shell, esso, cosmo, kyodo, gasoline, petrol' },
      { name: 'parking', description: 'times parking, repark, coin parking, monthly parking, etc' },
    ],
  },
  {
    name: 'housing',
    description: 'rent, mortgage, apartment, mansion, real estate, management fee',
    children: [
      { name: 'rent', description: 'rent, yachin, leopalace, daiwa house, monthly mansion, gaijinhouse' },
      { name: 'mortgage', description: 'mortgage, jutaku loan, mizuho home loan, smbc, mufg home loan' },
      { name: 'maintenance', description: 'kanrihi, management fee, repair fund, shuzen, building maintenance' },
    ],
  },
  {
    name: 'utilities',
    description: 'electricity, gas, water, internet, mobile, denryoku, gasu, suidou',
    children: [
      { name: 'electricity-water-gas', description: 'tepco, kepco, tokyo gas, osaka gas, suidou-kyoku, water bureau, denryoku' },
      { name: 'internet', description: 'nuro, ocn, softbank hikari, au hikari, docomo hikari, biglobe, fibre, wifi' },
      { name: 'mobile', description: 'docomo, au, softbank, rakuten mobile, ahamo, povo, linemo, ymobile, sim' },
    ],
  },
  {
    name: 'shopping',
    description: 'online, retail, fashion, electronics, depato, drugstore',
    children: [
      { name: 'online', description: 'amazon japan, rakuten, mercari, yahoo shopping, zozotown, qoo10' },
      { name: 'fashion', description: 'uniqlo, gu, muji, beams, united arrows, zara, h&m, isetan, mitsukoshi, takashimaya' },
      { name: 'electronics', description: 'yodobashi, bic camera, edion, yamada denki, sofmap, apple' },
      { name: 'household-drugstore', description: 'don quijote, donki, matsumoto kiyoshi, sundrug, welcia, daiso, can do, 100yen' },
    ],
  },
  {
    name: 'entertainment',
    description: 'cinema, karaoke, gaming, attractions, hobby',
    children: [
      { name: 'cinema-events', description: 'toho cinemas, 109 cinemas, united cinemas, ticket pia, eplus, lawson ticket' },
      { name: 'gaming', description: 'steam, playstation store, nintendo, xbox, app store, google play' },
      { name: 'attractions', description: 'tokyo disneyland, usj, fujikyu, hakone, asakusa, ghibli, klook' },
      { name: 'hobbies', description: 'tower records, hmv, animate, mandarake, book off, kinokuniya, craft, hobby' },
    ],
  },
  {
    name: 'health',
    description: 'clinic, hospital, pharmacy, dental, gym',
    children: [
      { name: 'medical', description: 'byouin, clinic, hospital, doctor, isha, prescription, kusuri' },
      { name: 'pharmacy-drug', description: 'matsumoto kiyoshi, sundrug, welcia, tomod\'s, drugstore, dispensary' },
      { name: 'fitness', description: 'gym, konami, tipness, gold gym, anytime fitness, yoga, pilates' },
      { name: 'dental-optical', description: 'dentist, shika, eye clinic, jins, zoff, owndays, megane, contact lens' },
    ],
  },
  { name: 'education', description: 'juku, school, university, course, learning, books', children: [] },
  {
    name: 'subscriptions',
    description: 'streaming, software, news, recurring',
    children: [
      { name: 'streaming', description: 'netflix, hulu japan, amazon prime, dazn, abema, spotify, apple music, youtube premium' },
      { name: 'software', description: 'icloud, google one, microsoft 365, adobe, dropbox, notion' },
    ],
  },
  {
    name: 'financial',
    description: 'fees, interest, taxes, insurance, investments',
    children: [
      { name: 'fees-interest', description: 'tesuryou, atm fee, finance charge, interest, kinri, late fee, foreign fee' },
      { name: 'insurance', description: 'kokumin kenkou hoken, life insurance, dai-ichi, nippon life, sumitomo, sompo, tokio marine' },
      { name: 'taxes', description: 'jumin-zei, shotoku-zei, income tax, residence tax, property tax, kotsu-zei' },
      { name: 'investments', description: 'sbi, rakuten securities, monex, tokyo stock, ideco, nisa, tsumitate' },
    ],
  },
  { name: 'other', description: 'misc, uncategorized, gifts, donations, atm cash withdrawal' },
]

const US_SEED: SeedNode[] = [
  {
    name: 'food',
    description: 'meals, groceries, dining, restaurants, cafes, coffee',
    children: [
      { name: 'groceries', description: 'whole foods, trader joe\'s, kroger, safeway, publix, costco, walmart grocery, aldi, h-e-b' },
      { name: 'dining', description: 'restaurant, chipotle, panera, sweetgreen, shake shack, cheesecake factory, olive garden' },
      { name: 'fast-food', description: 'mcdonald\'s, burger king, taco bell, wendy\'s, kfc, popeyes, subway, jersey mike\'s, in-n-out' },
      { name: 'coffee', description: 'starbucks, dunkin, peet\'s, blue bottle, philz, dutch bros, coffee bean' },
      { name: 'delivery', description: 'doordash, uber eats, grubhub, postmates, instacart, gopuff' },
    ],
  },
  {
    name: 'transport',
    description: 'commuting, ride-hailing, taxi, public transit, fuel, parking',
    children: [
      { name: 'public-transit', description: 'metro, mta, bart, cta, septa, wmata, subway, bus, light rail, transit card' },
      { name: 'ride-hailing', description: 'uber, lyft, via, curb' },
      { name: 'fuel', description: 'shell, exxon, chevron, bp, mobil, sunoco, costco gas, arco, gas station' },
      { name: 'parking-tolls', description: 'parking meter, parkmobile, e-zpass, fastrak, sunpass, garage, valet, toll' },
    ],
  },
  {
    name: 'housing',
    description: 'rent, mortgage, hoa, property tax, repairs',
    children: [
      { name: 'rent', description: 'rent, landlord, leasing office, apartments.com, zillow' },
      { name: 'mortgage', description: 'mortgage payment, wells fargo, chase, rocket mortgage, quicken loans, bank of america' },
      { name: 'hoa-maintenance', description: 'hoa, condo dues, property management, home depot, lowe\'s, handyman, plumber' },
    ],
  },
  {
    name: 'utilities',
    description: 'electricity, gas, water, internet, mobile, cable',
    children: [
      { name: 'electricity-water-gas', description: 'pg&e, con ed, duke energy, dominion, conedison, water bill, gas bill' },
      { name: 'internet', description: 'comcast, xfinity, spectrum, verizon fios, at&t fiber, cox, frontier, broadband' },
      { name: 'mobile', description: 't-mobile, verizon, at&t, cricket, mint mobile, visible, sprint, prepaid, postpaid' },
    ],
  },
  {
    name: 'shopping',
    description: 'online, retail, fashion, electronics, household',
    children: [
      { name: 'online', description: 'amazon, ebay, etsy, target.com, walmart.com, wayfair, shein, temu' },
      { name: 'fashion', description: 'nike, lululemon, gap, old navy, zara, h&m, nordstrom, macy\'s, sephora, ulta' },
      { name: 'electronics', description: 'apple, best buy, microcenter, b&h, newegg, gamestop' },
      { name: 'household', description: 'target, walmart, ikea, home depot, lowe\'s, costco, cvs, walgreens, dollar tree' },
    ],
  },
  {
    name: 'entertainment',
    description: 'movies, concerts, gaming, hobby',
    children: [
      { name: 'cinema-events', description: 'amc, regal, alamo drafthouse, ticketmaster, stubhub, eventbrite, axs' },
      { name: 'gaming', description: 'steam, playstation, xbox, nintendo, epic games, riot, blizzard' },
      { name: 'attractions', description: 'disney, universal, six flags, museum, zoo, aquarium, klook' },
      { name: 'hobbies', description: 'barnes & noble, half price books, michaels, hobby lobby, joann, music store' },
    ],
  },
  {
    name: 'health',
    description: 'medical, dental, vision, pharmacy, fitness',
    children: [
      { name: 'medical', description: 'doctor, urgent care, hospital, copay, lab corp, quest diagnostics, telehealth' },
      { name: 'pharmacy', description: 'cvs, walgreens, rite aid, walmart pharmacy, prescription, otc' },
      { name: 'fitness', description: 'gym, planet fitness, equinox, la fitness, peloton, classpass, yoga, pilates' },
      { name: 'dental-vision', description: 'dentist, orthodontist, optometrist, warby parker, lenscrafters, contact lens' },
    ],
  },
  {
    name: 'education',
    description: 'tuition, books, courses, school',
    children: [
      { name: 'tuition-courses', description: 'tuition, university, college, course, udemy, coursera, masterclass, khan academy' },
      { name: 'books-supplies', description: 'textbook, school supplies, staples, office depot, college bookstore' },
    ],
  },
  {
    name: 'subscriptions',
    description: 'streaming, software, news, apps',
    children: [
      { name: 'streaming', description: 'netflix, hulu, disney+, hbo max, apple tv+, peacock, paramount+, spotify, apple music, youtube premium' },
      { name: 'software', description: 'icloud, google one, microsoft 365, adobe, dropbox, notion, github, openai, claude' },
      { name: 'news-other', description: 'nyt, wsj, washington post, the atlantic, substack, medium, magazine' },
    ],
  },
  {
    name: 'financial',
    description: 'fees, interest, taxes, insurance, investments',
    children: [
      { name: 'fees-interest', description: 'service fee, late fee, finance charge, atm fee, foreign transaction fee, overdraft' },
      { name: 'insurance', description: 'geico, state farm, progressive, allstate, blue cross, aetna, cigna, kaiser, life insurance' },
      { name: 'taxes', description: 'irs, federal tax, state tax, property tax, turbotax, h&r block' },
      { name: 'investments', description: 'fidelity, vanguard, schwab, robinhood, coinbase, etrade, ibkr, m1, wealthfront' },
    ],
  },
  { name: 'other', description: 'misc, uncategorized, gifts, donations, charity, atm cash withdrawal' },
]

const DEFAULT_SEED: SeedNode[] = [
  {
    name: 'food',
    description: 'meals, groceries, dining, restaurants, cafes, coffee, delivery',
    children: [
      { name: 'groceries', description: 'supermarket, grocery, market, fresh produce' },
      { name: 'dining', description: 'restaurant, dining, lunch, dinner, casual dining, fine dining' },
      { name: 'coffee', description: 'coffee shop, cafe, espresso, latte, americano' },
      { name: 'delivery', description: 'food delivery, takeaway, takeout, online order' },
    ],
  },
  {
    name: 'transport',
    description: 'commuting, taxi, ride-hailing, public transit, fuel, parking',
    children: [
      { name: 'public-transit', description: 'metro, train, bus, subway, transit card' },
      { name: 'ride-hailing', description: 'uber, lyft, grab, gojek, ride-hailing, ridesharing' },
      { name: 'fuel', description: 'gas station, petrol, diesel, fuel, filling station' },
    ],
  },
  {
    name: 'housing',
    description: 'rent, mortgage, maintenance, repairs, property',
    children: [
      { name: 'rent', description: 'rent, landlord, lease, monthly rental' },
      { name: 'mortgage', description: 'mortgage payment, home loan' },
      { name: 'maintenance', description: 'repairs, plumber, electrician, painter, maintenance fee' },
    ],
  },
  {
    name: 'utilities',
    description: 'electricity, water, gas, internet, mobile, broadband',
    children: [
      { name: 'electricity-water-gas', description: 'electricity, water, gas, utility bill, power' },
      { name: 'internet', description: 'broadband, fibre, internet provider, wifi' },
      { name: 'mobile', description: 'mobile phone, prepaid, postpaid, sim, top-up' },
    ],
  },
  {
    name: 'shopping',
    description: 'online, retail, fashion, electronics, household',
    children: [
      { name: 'online', description: 'amazon, ebay, online marketplace, e-commerce' },
      { name: 'fashion', description: 'clothing, apparel, shoes, accessories, fashion brand' },
      { name: 'electronics', description: 'apple, electronics store, gadgets, computers, phones' },
      { name: 'household', description: 'household goods, home, kitchen, daily essentials' },
    ],
  },
  {
    name: 'entertainment',
    description: 'cinema, concerts, gaming, hobbies',
    children: [
      { name: 'cinema-events', description: 'cinema, theatre, concert, ticket, event' },
      { name: 'gaming', description: 'steam, playstation, xbox, nintendo, video game' },
      { name: 'hobbies', description: 'books, hobby, music, art supplies' },
    ],
  },
  {
    name: 'health',
    description: 'medical, pharmacy, dental, fitness',
    children: [
      { name: 'medical', description: 'clinic, hospital, doctor, specialist, medical bill' },
      { name: 'pharmacy', description: 'pharmacy, drugstore, prescription, medicine' },
      { name: 'fitness', description: 'gym, fitness, yoga, pilates, personal trainer' },
    ],
  },
  { name: 'education', description: 'tuition, courses, school fees, books, learning' },
  {
    name: 'subscriptions',
    description: 'streaming, software, news, recurring',
    children: [
      { name: 'streaming', description: 'netflix, spotify, disney+, apple music, video streaming' },
      { name: 'software', description: 'icloud, google one, microsoft 365, adobe, dropbox' },
    ],
  },
  {
    name: 'financial',
    description: 'fees, interest, taxes, insurance, investments',
    children: [
      { name: 'fees-interest', description: 'service charge, late fee, atm fee, finance charge, interest' },
      { name: 'insurance', description: 'life insurance, health insurance, car insurance, premium' },
      { name: 'taxes', description: 'income tax, property tax, gst, vat' },
      { name: 'investments', description: 'broker, securities, stocks, bonds, etf, mutual fund, crypto' },
    ],
  },
  { name: 'other', description: 'miscellaneous, uncategorized, gifts, donations, atm withdrawal' },
]

export const SEED_BY_COUNTRY: Record<string, SeedNode[]> = {
  SG: SG_SEED,
  JP: JP_SEED,
  US: US_SEED,
  default: DEFAULT_SEED,
}

export function getSeedForCountry(country: string | null | undefined): SeedNode[] {
  if (!country) return SEED_BY_COUNTRY.default
  return SEED_BY_COUNTRY[country.toUpperCase()] ?? SEED_BY_COUNTRY.default
}

export { COMMON_TOP_LEVEL_NAMES }
