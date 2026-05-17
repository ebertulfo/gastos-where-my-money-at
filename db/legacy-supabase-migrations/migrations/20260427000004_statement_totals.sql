-- Slice: statement totals for parser-integrity reconciliation.
--
-- The point of these columns is to answer a single question on the review
-- screen: "did the parser extract every transaction the statement says
-- should be there?" We do that by recording the headline figure printed
-- on the statement (varies by type) and the interpretation, so the review
-- code knows how to compare it against sum(transaction_imports.amount).
--
-- Kind values (free-form text — not constrained yet so future profiles
-- can add their own without a migration):
--   cc_new_charges_signed   credit cards: total_outstanding − previous_balance
--                            should ≈ sum(extracted imports, signed)
--   bank_withdrawals_abs    bank statements: total withdrawals (positive)
--                            should ≈ sum(abs(extracted imports))
--
-- previous_balance is only populated on credit cards; bank statements
-- don't need it. All three columns are nullable so older rows (and any
-- statement type we can't reconcile) just don't show a banner.

alter table public.statements
  add column if not exists expected_total numeric(15, 2),
  add column if not exists expected_total_kind text,
  add column if not exists previous_balance numeric(15, 2);
