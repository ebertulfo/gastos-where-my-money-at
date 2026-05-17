-- AI auto-tagging on ingest + insights' primary-tag aggregation.
--
-- Suggestions live on the staging row (transaction_imports), not on the
-- final `transactions` row, because they're created during the async
-- after() hook on the ingest API route — before the user has confirmed
-- the import. Once accepted, they're inserted into transaction_tags
-- alongside any user-added tags during confirmStatementImport.

alter table public.transaction_imports
  add column suggested_tag_ids uuid[] default '{}'::uuid[] not null,
  add column ai_suggestion_status text default 'pending' not null
    check (ai_suggestion_status in ('pending', 'completed', 'failed', 'skipped', 'disabled')),
  add column ai_model_version text,
  add column ai_suggested_at timestamptz;

-- Index for the polling endpoint that asks "is anything still pending
-- for this statement?"
create index idx_transaction_imports_ai_status
  on public.transaction_imports(ai_suggestion_status)
  where ai_suggestion_status = 'pending';

-- Per-user opt-out + cost ceiling for the LLM call. Default $5/mo
-- (~50 statements). UI for adjusting these is Track C.
alter table public.user_settings
  add column auto_tag_enabled boolean default true not null,
  add column ai_monthly_budget_cents integer default 500 not null,
  add column ai_spent_this_month_cents integer default 0 not null,
  add column ai_budget_reset_at timestamptz default now() not null;

-- Primary tag for clean insights aggregation. Each transaction
-- contributes its full amount to exactly one tag (or "Untagged"). When
-- the AI / user assigns multiple tags, the first becomes primary;
-- siblings are kept for filtering but don't double-count in totals.
alter table public.transaction_tags
  add column is_primary boolean default true not null;

-- Exactly one primary per transaction.
create unique index idx_transaction_tags_one_primary
  on public.transaction_tags(transaction_id)
  where is_primary = true;
