-- db/init.sql — fresh-DB initialization for Neon.
-- Replaces the 20 supabase/migrations/* files with the consolidated final
-- state. RLS is dropped (isolation enforced in app code via explicit
-- where user_id = $clerkId on every read/write). user_id columns are text
-- (Clerk IDs, e.g. user_2abc...) instead of uuid + auth.users FKs.
--
-- Apply once against a fresh Neon DB:
--   psql "$DATABASE_URL_UNPOOLED" -f db/init.sql

-- ============================================================================
-- EXTENSIONS
-- ============================================================================
create extension if not exists "uuid-ossp";
create extension if not exists vector;

-- ============================================================================
-- ENUMS
-- ============================================================================
create type statement_type as enum ('debit', 'credit', 'investment');
create type statement_status as enum ('parsed', 'ingesting', 'ingested', 'failed');
create type import_resolution as enum ('pending', 'accepted', 'rejected');
create type transaction_status as enum ('active', 'voided');

-- ============================================================================
-- updated_at trigger fn
-- ============================================================================
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================================
-- TABLES
-- ============================================================================

-- statements: uploaded bank/credit-card/investment statements
create table statements (
  id uuid primary key default gen_random_uuid(),
  source_file_name text not null,
  source_file_sha256 text not null,
  bank text,
  account_last4 text,
  statement_type statement_type not null,
  period_start date not null,
  period_end date not null,
  timezone text not null default 'Asia/Manila',
  currency text not null default 'PHP',
  uploaded_by text not null,
  uploaded_at timestamptz not null default now(),
  status statement_status not null default 'parsed',
  expected_total numeric(15, 2),
  expected_total_kind text,
  previous_balance numeric(15, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index statements_user_file_hash_idx
  on statements (uploaded_by, source_file_sha256);

-- household_members: per-user named members for statement attribution
create table household_members (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index household_members_user_name_lower_idx
  on household_members (user_id, lower(name));
create index household_members_user_id_idx on household_members (user_id);

-- tags: dual-kind (category | label). Categories drive insights rollups;
-- labels are free-form filter chips. Self-referential parent_id for hierarchy.
create table tags (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  parent_id uuid references tags(id),
  color text,
  kind text not null default 'label' check (kind in ('category', 'label')),
  description text,
  embedding vector(1536),
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (user_id, name),
  constraint tags_name_lowercase_chk check (name = lower(name))
);

create index idx_tags_kind on tags(kind);
create index idx_tags_embedding on tags using hnsw (embedding vector_cosine_ops);

-- transactions: confirmed rows promoted from transaction_imports.
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  statement_id uuid not null references statements(id) on delete cascade,
  transaction_identifier text not null,
  date date not null,
  month_bucket text not null,
  description text not null,
  amount decimal(15, 2) not null,
  balance decimal(15, 2),
  statement_page integer,
  line_number integer,
  status transaction_status not null default 'active',
  is_excluded boolean default false not null,
  exclusion_reason text,
  description_embedding vector(1536),
  category_id uuid references tags(id) on delete set null,
  category_source text check (category_source in ('user', 'ai')),
  is_travel boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index transactions_user_identifier_idx
  on transactions (user_id, transaction_identifier);
create index transactions_month_bucket_idx
  on transactions (user_id, month_bucket);
create index transactions_statement_id_idx on transactions (statement_id);
create index transactions_date_idx on transactions (user_id, date desc);
create index idx_transactions_description_embedding
  on transactions using hnsw (description_embedding vector_cosine_ops);
create index idx_transactions_category_id on transactions(category_id);
create index idx_transactions_is_travel
  on transactions(user_id, is_travel) where is_travel = true;

-- transaction_imports: staging area for transactions pending user review.
create table transaction_imports (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references statements(id) on delete cascade,
  transaction_identifier text not null,
  date date not null,
  month_bucket text not null,
  description text not null,
  amount decimal(15, 2) not null,
  balance decimal(15, 2),
  statement_page integer,
  line_number integer,
  resolution import_resolution not null default 'pending',
  existing_transaction_id uuid references transactions(id) on delete set null,
  notes text,
  is_excluded boolean default false,
  exclusion_reason text,
  description_embedding vector(1536),
  category_id uuid references tags(id) on delete set null,
  category_source text check (category_source in ('user', 'ai')),
  is_travel boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transaction_imports_statement_id_idx
  on transaction_imports (statement_id);
create index transaction_imports_resolution_idx
  on transaction_imports (statement_id, resolution);
create index idx_transaction_imports_description_embedding
  on transaction_imports using hnsw (description_embedding vector_cosine_ops);

-- transaction_tags: many-to-many. is_primary enforces "exactly one primary
-- per transaction" via partial unique index.
create table transaction_tags (
  transaction_id uuid not null references transactions(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  is_primary boolean default true not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (transaction_id, tag_id)
);

create unique index idx_transaction_tags_one_primary
  on transaction_tags(transaction_id) where is_primary = true;

-- user_settings: per-user prefs + AI budget tracking.
create table user_settings (
  user_id text not null primary key,
  currency text not null default 'SGD',
  country text not null default 'SG',
  auto_tag_enabled boolean default true not null,
  ai_monthly_budget_cents integer default 500 not null,
  ai_spent_this_month_cents integer default 0 not null,
  ai_budget_reset_at timestamptz default now() not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- statement_members: junction (statement ↔ household_members), many-to-many.
create table statement_members (
  statement_id uuid not null references statements(id) on delete cascade,
  member_id uuid not null references household_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (statement_id, member_id)
);

create index statement_members_member_id_idx on statement_members (member_id);
create index statement_members_statement_id_idx on statement_members (statement_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================
create trigger update_statements_updated_at
  before update on statements
  for each row execute function update_updated_at_column();

create trigger update_transactions_updated_at
  before update on transactions
  for each row execute function update_updated_at_column();

create trigger update_transaction_imports_updated_at
  before update on transaction_imports
  for each row execute function update_updated_at_column();

create trigger update_household_members_updated_at
  before update on household_members
  for each row execute function update_updated_at_column();

-- ============================================================================
-- KNN FUNCTIONS (p_user_id changed from uuid to text for Clerk IDs)
-- ============================================================================

-- Vote from the user's prior tagged transactions (label-based).
create or replace function knn_neighbour_tags(
  p_user_id text,
  p_exclude_id uuid,
  p_embedding vector(1536),
  p_limit integer default 20
)
returns table (
  id uuid,
  description text,
  similarity double precision,
  transaction_tags jsonb
)
language sql security invoker stable as $$
  with neighbours as (
    select
      t.id,
      t.description,
      1 - (t.description_embedding <=> p_embedding) as similarity
    from transactions t
    where t.user_id = p_user_id
      and t.id <> p_exclude_id
      and t.description_embedding is not null
      and t.status = 'active'
      and exists (
        select 1 from transaction_tags tt where tt.transaction_id = t.id
      )
    order by t.description_embedding <=> p_embedding
    limit p_limit
  )
  select
    n.id,
    n.description,
    n.similarity,
    coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'tag_id', tt.tag_id,
          'is_primary', tt.is_primary
        ))
        from transaction_tags tt
        where tt.transaction_id = n.id
      ),
      '[]'::jsonb
    ) as transaction_tags
  from neighbours n;
$$;

-- Zero-shot match: nearest user's own tag-label embeddings.
create or replace function knn_nearest_tags(
  p_user_id text,
  p_embedding vector(1536),
  p_limit integer default 10
)
returns table (
  id uuid,
  name text,
  similarity double precision
)
language sql security invoker stable as $$
  select
    t.id,
    t.name,
    1 - (t.embedding <=> p_embedding) as similarity
  from tags t
  where t.user_id = p_user_id
    and t.embedding is not null
  order by t.embedding <=> p_embedding
  limit p_limit;
$$;

-- Vote from confirmed transactions, scoped by category_id (for in-app review).
create or replace function knn_neighbour_categories(
  p_user_id text,
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
language sql security invoker stable as $$
  select
    t.id,
    t.description,
    1 - (t.description_embedding <=> p_embedding) as similarity,
    t.category_id
  from transactions t
  where t.user_id = p_user_id
    and t.id <> coalesce(p_exclude_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and t.description_embedding is not null
    and t.status = 'active'
    and t.category_id is not null
  order by t.description_embedding <=> p_embedding
  limit p_limit;
$$;

-- Same shape as knn_neighbour_categories; called from the ingest auto-apply
-- path. Kept as a separate symbol so callers can swap easily if the body
-- ever diverges (per the migration that introduced it).
create or replace function knn_neighbour_categories_for_imports(
  p_user_id text,
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
language sql security invoker stable as $$
  select
    t.id,
    t.description,
    1 - (t.description_embedding <=> p_embedding) as similarity,
    t.category_id
  from transactions t
  where t.user_id = p_user_id
    and t.id <> coalesce(p_exclude_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and t.description_embedding is not null
    and t.status = 'active'
    and t.category_id is not null
  order by t.description_embedding <=> p_embedding
  limit p_limit;
$$;

-- Zero-shot category match against the user's category descriptions.
create or replace function knn_nearest_categories(
  p_user_id text,
  p_embedding vector(1536),
  p_limit integer default 10
)
returns table (
  id uuid,
  name text,
  parent_id uuid,
  similarity double precision
)
language sql security invoker stable as $$
  select
    t.id,
    t.name,
    t.parent_id,
    1 - (t.embedding <=> p_embedding) as similarity
  from tags t
  where t.user_id = p_user_id
    and t.kind = 'category'
    and t.embedding is not null
  order by t.embedding <=> p_embedding
  limit p_limit;
$$;

-- "Find similar" — given a target row id (in transactions OR transaction_imports),
-- return its nearest-neighbour confirmed transactions by description-embedding
-- cosine similarity. Used by the bulk-categorize / bulk-label flow.
--
-- Self-resolves the target embedding: callers don't need to know which table
-- it lives in. Excludes the target itself when it's a confirmed transaction.
create or replace function find_similar_transactions(
  p_user_id text,
  p_target_id uuid,
  p_min_similarity double precision default 0.6,
  p_limit integer default 25
)
returns table (
  id uuid,
  description text,
  amount decimal(15, 2),
  date date,
  statement_id uuid,
  category_id uuid,
  category_source text,
  is_excluded boolean,
  similarity double precision
)
language sql security invoker stable as $$
  with target as (
    select description_embedding as emb
    from transactions
    where id = p_target_id and user_id = p_user_id
    union all
    select ti.description_embedding as emb
    from transaction_imports ti
    join statements s on s.id = ti.statement_id
    where ti.id = p_target_id and s.uploaded_by = p_user_id
    limit 1
  )
  select
    t.id,
    t.description,
    t.amount,
    t.date,
    t.statement_id,
    t.category_id,
    t.category_source,
    t.is_excluded,
    1 - (t.description_embedding <=> (select emb from target)) as similarity
  from transactions t
  where t.user_id = p_user_id
    and t.id <> p_target_id
    and t.status = 'active'
    and t.description_embedding is not null
    and (select emb from target) is not null
    and 1 - (t.description_embedding <=> (select emb from target)) >= p_min_similarity
  order by t.description_embedding <=> (select emb from target)
  limit p_limit;
$$;
