-- Privacy strip at ingest (Slice 1 of stupid-simple-spec refocus).
--
-- 1. Drop statements.account_name — never persist the human name printed on
--    the statement; partner attribution lives in user_settings labels later.
-- 2. Rename statement_type enum values to match the new vocabulary that the
--    redacted filename format ({hash8}-{type}-{bank}-{MM-YYYY}.pdf) uses:
--      bank        → debit
--      credit_card → credit
--    and add 'investment' to cover DBS deposit-investment profiles.
-- 3. No data backfill needed — existing rows keep their values, just under
--    the new label (RENAME VALUE preserves all existing usage).

-- Drop account_name. Pre-existing rows lose this field; that's intentional.
alter table public.statements
  drop column if exists account_name;

-- Rename existing enum values in place (preserves data + indexes).
-- Requires PostgreSQL 10+. Supabase runs PG 15+.
alter type statement_type rename value 'bank' to 'debit';
alter type statement_type rename value 'credit_card' to 'credit';

-- Add investment as a new label. ADD VALUE works inside a transaction in
-- PG 12+, which Supabase satisfies.
alter type statement_type add value if not exists 'investment';
