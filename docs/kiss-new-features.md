8. Trip / Event Tags with Auto-Suggest from is_travel
User problem. Quicken, Lunch Money, Moneon, Tiller, and Spendee all converged on the same insight: categories are not enough — users want to ask "how much did our Bali trip cost across flights, food, hotels, and Grab rides?" The is_travel flag already exists in Gastos Together; it currently just toggles a view but doesn't group. Mileage-credit-card users (a huge SEA segment) also need a way to see foreign-transaction totals as a group.
KISS fit — Step 5 (Categorize). When is_travel = true for a contiguous run of transactions across statements (clustered by date proximity + currency), auto-suggest an event tag like "Bali · Aug 14–21, 2025" using the existing tag-embedding infrastructure. User accepts/edits the name. Then in Step 6 those tag totals roll up as their own card.
Implementation complexity. Low–medium. Heuristic clustering on (member_id, is_travel, currency, date_proximity ≤ 4 days). Tag schema already exists. The "auto-suggested name" is one LLM call per cluster, well within the gpt-5.4-mini budget.
Prior art. Quicken Mac tags ("Florida vacation"); Lunch Money tags; Moneon "Spain 2017"; Wallet by BudgetBakers events. QuickenMoneon
Couples angle. Per-trip split — show how much each partner paid for the shared Bali trip; the natural follow-on to Feature #2 above.

9. Bulk-Categorize "Like This Row" with Embedding Similarity
User problem. Power users in Copilot and Monarch reviews universally cite rules engines as the make-or-break feature ("Copilot's rules are the most granular of any budgeting app… but you can't see or edit rules once created — that's the #1 1-star complaint"). Lunch Money's bulk-categorize requires manual tag selection. StackSwitchApp Store
KISS fit — Step 4 / Step 5 (Review + Categorize). While reviewing staged rows, click any transaction and a "Find similar" action does a pgvector cosine-similarity query on the merchant + amount embedding. Returns 5–25 rows; user can categorize/tag them all in one click. Equivalent UX to "select all from this merchant" but powered by embeddings, so it works even on noisy strings ("AMZN MKTPLA2X3", "AMAZON.SG1234", "AMAZON SG").
Implementation complexity. Low. pgvector ANN query, same embeddings used elsewhere. Reuses existing categorize controls.
Prior art. Copilot Money's pattern-rule creation; Lunch Money's auto-categorization rules; UPSTO patents (Intuit) on "transaction-level + merchant-level + account-merchant features" → exactly the embedding-friendly framing. Quickenuspto
Couples angle. Use the household's combined history as the lookup corpus, so María's category choice for "FAVE *KOPITIAM" becomes the suggestion when Adrian's statement parses the same merchant — the "personal merchant dictionary" in-flight, but extended to "household merchant dictionary."

10. Reconciliation Quality Score per Statement
User problem. The reconciliation banner (extracted vs. printed total) is shipped, but it's pass/fail. Users want to know where the gap is — which page/section likely failed to parse — so they can decide whether to re-upload or accept. DocuClipper, Bankstatemently, and Sensible all advertise "in-app reconciliation checks" precisely because lenders/accountants demand them, and a household app can borrow this trust UX.
KISS fit — Step 3 (Extract) → Step 4 (Review). When extracted total ≠ printed total, the banner expands into a per-page or per-section breakdown ("Page 3 of 6: extracted S$1,243.10, expected S$1,401.55, Δ S$158.45 — 2 ambiguous rows highlighted below"). Click jumps to those rows.
Implementation complexity. Medium. Requires the layout-aware parser to retain page-level subtotals when banks print them (DBS, UOB, HSBC, Citibank Singapore statements all do; UOB additionally omits the year, which is a documented tripping hazard). Add a parse_confidence field to each staged row. Bankstatemently
Prior art. DocuClipper's "built-in reconciliation that cross-checks extracted totals against statement reported balances"; Bankstatemently's UOB-specific validation rules; Microsoft Dynamics' per-line bank-rec workflow. Bankstatemently
Couples angle. Less direct, but a reconciled statement is the foundation that makes any per-person attribution trustworthy — without this, fairness numbers are suspect.

11. Year-in-Review ("Household Wrapped")
User problem. Spotify Wrapped is the cultural reference; Letterboxd, Strava, Goodreads, and bank apps have all copied it. Actual Budget shipped a "Wrapped" repo as a side project. For a couples-focused review app, an end-of-year retrospective is the natural marquee artifact — and it doubles as a viral/share moment that's friendlier than a "look at our debt!" screenshot. Yahoo!GitHub
KISS fit — Step 6 (Insights). A dedicated /wrapped/2025 route that walks through 8–12 stat cards: total spent, top merchant, top category, biggest single purchase, "the month that broke the budget," days you spent zero, who paid the most, "your most travelled month," top recurring subscription cost, etc. Auto-generated; no inputs.
Implementation complexity. Medium. Pure SQL aggregations on existing data plus design work. Storyboard-style scrollytelling using the existing Tailwind/Shadcn primitives.
Prior art. Actual Budget Wrapped (open source); 2025 Wrapped apps in the App Store; Monarch month-in-review; Modern Family Finance "Year in Review" methodology. GitHub
Couples angle. A household Wrapped — "Together you visited 4 currencies, ate at 17 hawker centres, and paid Spotify twice" — is content no solo Wrapped can produce.

14. Merchant Page (drill-into-merchant)
User problem. Bank of America's Better Money Habits and Huntington's Spend Analysis both have "click a category for details" but few have "click a merchant for a timeline." MoneyPatrol calls merchant-level reporting "patterns categories hide, especially with mixed retailers" — exactly the case for Amazon/Lazada/Shopee-heavy SEA shoppers. Huntington BankMoneyPatrol
KISS fit — Step 6 (Insights). Click any merchant in top-merchants; opens a merchant page with: 12-month timeline, average ticket, total spent, share by household member, % of merchant spend that is is_travel, list of all linked tags, refund/return pairs from Feature #4.
Implementation complexity. Low. New route, all data already in transactions table.
Prior art. Copilot merchant detail; Monarch merchant view; Lunch Money merchant filter.

18. Smart "Carryover" of Categorization Decisions
User problem. Copilot's "personalized AI model" markets that "each user gets their own private AI model" trained from ~30 reviewed transactions. Gastos Together's KNN-over-history is conceptually similar but currently single-user. The expansion is to make decisions household-scoped: when one partner labels "FAVE *KOPI" → "Coffee & Tea," that should immediately be the prior for the other partner's identical merchant string. ProductivewithchrisProductivewithchris
KISS fit — Step 5 (Categorize). Already mostly there with personal merchant dictionary in-flight; the change is scope = household not scope = user. Add a tiny attribution chip on the auto-suggestion ("María categorized this 4 weeks ago"), which is also a great trust-building UX.
Implementation complexity. Trivial. Schema change on the merchant-dictionary lookup.
Prior art. Copilot's per-user adaptive model; Monarch's rules can be applied across the household. Help
Couples angle. Combined household corpus = better KNN signal earlier (especially for new users who haven't yet built ~30 reviewed rows of their own).

21. "Sense-check" Cluster on Categorization (LLM fallback already exists)
User problem. Sometimes the AI categorization confidently miscategorizes a whole merchant cluster ("CIRCLES.LIFE" = telecom, not gym). Today the user has to find and fix each one. With embeddings already in place, the app can cluster the unreviewed rows by merchant-embedding and present them as cluster summaries: "47 transactions at 'CIRCLES.LIFE' all categorized as 'Telecom' — confirm or change?"
KISS fit — Step 5 (Categorize). A "Cluster review" mode in addition to row-by-row review. Speeds first-time onboarding dramatically (many statements at once).
Implementation complexity. Low–medium. Clustering: HDBSCAN on embeddings, or a simpler agglomerative pass using cosine similarity threshold.
Prior art. None directly; closest is Lunch Money's "re-run categorization rules" prompt. Lunchmoney