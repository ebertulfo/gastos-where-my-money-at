-- Hybrid tag suggestions: pgvector embeddings on transactions for KNN, plus
-- a `country` field on user_settings for the LLM cold-start prompt context.
--
-- Tears down the previous after-hook AI tagging schema (suggested_tag_ids,
-- ai_suggestion_status, ai_model_version, ai_suggested_at on
-- transaction_imports + the apply_import_suggestions RPC) since suggestions
-- are now computed in real time on TagInput open and never persisted on the
-- staging row.

create extension if not exists vector;

alter table public.transactions
  add column description_embedding vector(1536);

-- HNSW index for fast cosine-similarity KNN. Better recall on small per-user
-- datasets than ivfflat; no `lists` parameter to tune.
create index idx_transactions_description_embedding
  on public.transactions
  using hnsw (description_embedding vector_cosine_ops);

-- Locale for the LLM cold-start prompt ("user from {country}"). Onboarding
-- already collects this; we just persist it now.
alter table public.user_settings
  add column country text default 'SG' not null;

-- Drop the after-hook AI suggestion columns / index / RPC.
alter table public.transaction_imports
  drop column if exists suggested_tag_ids,
  drop column if exists ai_suggestion_status,
  drop column if exists ai_model_version,
  drop column if exists ai_suggested_at;

drop index if exists public.idx_transaction_imports_ai_status;
drop function if exists public.apply_import_suggestions(jsonb);

-- Keep user_settings.auto_tag_enabled / budget cols — apply to LLM fallback
-- spend. Keep transaction_tags.is_primary — used by /insights aggregation.
