-- Tagging redesign: split the existing free-form `tags` table into two
-- coexisting kinds:
--   kind='category' — singular, hierarchical bucket per transaction.
--                     Country-seeded at signup, fully user-editable, AI
--                     auto-applies during ingest.
--   kind='label'    — many free-form per transaction. User only.
--
-- Categories drive insights rollups; labels become filter chips. The old
-- `transaction_tags` table now stores labels only; categories live on a new
-- `transactions.category_id` column for clean GROUP BY.
--
-- Existing data is nuked: this app has no production users, and any test
-- rows would conflict with the new kind enforcement.

-- 1. Distinguish kinds in the existing tags table.
alter table public.tags
  add column kind text not null default 'label'
    check (kind in ('category', 'label'));

create index idx_tags_kind on public.tags(kind);

-- 2. Singular category on transaction.
alter table public.transactions
  add column category_id uuid references public.tags(id) on delete set null,
  add column category_source text
    check (category_source in ('user', 'ai'));

create index idx_transactions_category_id on public.transactions(category_id);

-- Same on staging so review-time category assignment survives the promote
-- to transactions.
alter table public.transaction_imports
  add column category_id uuid references public.tags(id) on delete set null,
  add column category_source text
    check (category_source in ('user', 'ai'));

-- 3. Embed transaction_imports descriptions so KNN/tag-embed can match
-- during ingest, not just after confirm. Mirrors `transactions.description_embedding`.
alter table public.transaction_imports
  add column description_embedding vector(1536);

create index idx_transaction_imports_description_embedding
  on public.transaction_imports
  using hnsw (description_embedding vector_cosine_ops);

-- 4. Clean slate. User has no production data; truncate cascades through
-- statement_members → statements → transaction_imports → transactions →
-- transaction_tags. Categories haven't been seeded yet so `tags` clears too.
truncate table public.transaction_tags cascade;
truncate table public.transaction_imports cascade;
truncate table public.transactions cascade;
truncate table public.statement_members cascade;
truncate table public.statements cascade;
delete from public.tags;

-- 5. KNN RPCs scoped to categories. Variants of knn_neighbour_tags /
-- knn_nearest_tags but joining on transactions.category_id (not the
-- transaction_tags junction) and filtering candidate tags by kind.

-- Neighbour categories: vote from the user's prior tagged transactions.
create or replace function public.knn_neighbour_categories(
  p_user_id uuid,
  p_exclude_id uuid,
  p_embedding vector(1536),
  p_limit integer default 20
)
returns table (
  id uuid,
  description text,
  similarity double precision,
  category_id uuid
)
language sql
security invoker
stable
as $$
  select
    t.id,
    t.description,
    1 - (t.description_embedding <=> p_embedding) as similarity,
    t.category_id
  from public.transactions t
  where t.user_id = p_user_id
    and t.id <> coalesce(p_exclude_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and t.description_embedding is not null
    and t.status = 'active'
    and t.category_id is not null
  order by t.description_embedding <=> p_embedding
  limit p_limit;
$$;

-- Same but votes from staging transactions during ingest. Identical shape;
-- the auto-apply pipeline picks the variant matching its source row.
create or replace function public.knn_neighbour_categories_for_imports(
  p_user_id uuid,
  p_exclude_id uuid,
  p_embedding vector(1536),
  p_limit integer default 20
)
returns table (
  id uuid,
  description text,
  similarity double precision,
  category_id uuid
)
language sql
security invoker
stable
as $$
  -- Vote from confirmed transactions (the user's tagged history). We do
  -- NOT vote from other staging rows in the same import — they're equally
  -- uncertain and would echo each other.
  select
    t.id,
    t.description,
    1 - (t.description_embedding <=> p_embedding) as similarity,
    t.category_id
  from public.transactions t
  where t.user_id = p_user_id
    and t.id <> coalesce(p_exclude_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and t.description_embedding is not null
    and t.status = 'active'
    and t.category_id is not null
  order by t.description_embedding <=> p_embedding
  limit p_limit;
$$;

-- Nearest categories: zero-shot match against the user's category
-- descriptions. Only returns kind='category' rows.
create or replace function public.knn_nearest_categories(
  p_user_id uuid,
  p_embedding vector(1536),
  p_limit integer default 10
)
returns table (
  id uuid,
  name text,
  parent_id uuid,
  similarity double precision
)
language sql
security invoker
stable
as $$
  select
    t.id,
    t.name,
    t.parent_id,
    1 - (t.embedding <=> p_embedding) as similarity
  from public.tags t
  where t.user_id = p_user_id
    and t.kind = 'category'
    and t.embedding is not null
  order by t.embedding <=> p_embedding
  limit p_limit;
$$;
