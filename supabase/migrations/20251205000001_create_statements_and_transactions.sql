-- Migration: Create statements, transactions, and transaction_imports tables
-- Based on: docs/specs/2-storing-transactions.md

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Enum for statement type
create type statement_type as enum ('bank', 'credit_card');

-- Enum for statement status
create type statement_status as enum ('parsed', 'ingesting', 'ingested', 'failed');

-- Enum for import resolution
create type import_resolution as enum ('pending', 'accepted', 'rejected');

-- Enum for transaction status
create type transaction_status as enum ('active', 'voided');

-- Statements table
create table statements (
  id uuid primary key default gen_random_uuid(),
  source_file_name text not null,
  source_file_sha256 text not null,
  bank text,
  account_name text,
  account_last4 text,
  statement_type statement_type not null,
  period_start date not null,
  period_end date not null,
  timezone text not null default 'Asia/Manila',
  currency text not null default 'PHP',
  uploaded_by uuid not null,
  uploaded_at timestamptz not null default now(),
  status statement_status not null default 'parsed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for idempotency check (same file uploaded by same user)
create unique index statements_user_file_hash_idx on statements (uploaded_by, source_file_sha256);

-- Transactions table
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  statement_id uuid not null references statements(id) on delete cascade,
  transaction_identifier text not null,
  date date not null,
  month_bucket text not null, -- YYYY-MM format for grouping
  description text not null,
  amount decimal(15, 2) not null,
  balance decimal(15, 2), -- nullable for credit cards
  statement_page integer,
  line_number integer,
  status transaction_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique constraint for deduplication across all user transactions
create unique index transactions_user_identifier_idx on transactions (user_id, transaction_identifier);

-- Index for month grouping queries
create index transactions_month_bucket_idx on transactions (user_id, month_bucket);

-- Index for statement lookup
create index transactions_statement_id_idx on transactions (statement_id);

-- Index for date ordering
create index transactions_date_idx on transactions (user_id, date desc);

-- Transaction imports (staging table for current upload)
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for statement lookup in imports
create index transaction_imports_statement_id_idx on transaction_imports (statement_id);

-- Index for finding pending imports
create index transaction_imports_resolution_idx on transaction_imports (statement_id, resolution);

-- Updated at trigger function
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply updated_at triggers
create trigger update_statements_updated_at
  before update on statements
  for each row execute function update_updated_at_column();

create trigger update_transactions_updated_at
  before update on transactions
  for each row execute function update_updated_at_column();

create trigger update_transaction_imports_updated_at
  before update on transaction_imports
  for each row execute function update_updated_at_column();

-- Comments for documentation
comment on table statements is 'Uploaded bank/credit card statements';
comment on table transactions is 'Committed transactions from processed statements';
comment on table transaction_imports is 'Staging area for transactions pending user review';
comment on column transactions.transaction_identifier is 'Unique identifier per user for deduplication (see Spec 1)';
comment on column transactions.month_bucket is 'YYYY-MM format derived from transaction date for grouping';
comment on column transaction_imports.existing_transaction_id is 'Points to existing transaction when duplicate detected';

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================
-- Enable RLS on all tables - this ensures no access without explicit policies

alter table statements enable row level security;
alter table transactions enable row level security;
alter table transaction_imports enable row level security;

-- -----------------------------------------------------------------------------
-- STATEMENTS POLICIES
-- Users can only access their own statements
-- -----------------------------------------------------------------------------

-- SELECT: Users can view their own statements
create policy "Users can view own statements"
  on statements for select
  using (auth.uid() = uploaded_by);

-- INSERT: Users can create statements for themselves
create policy "Users can create own statements"
  on statements for insert
  with check (auth.uid() = uploaded_by);

-- UPDATE: Users can update their own statements
create policy "Users can update own statements"
  on statements for update
  using (auth.uid() = uploaded_by)
  with check (auth.uid() = uploaded_by);

-- DELETE: Users can delete their own statements
create policy "Users can delete own statements"
  on statements for delete
  using (auth.uid() = uploaded_by);

-- -----------------------------------------------------------------------------
-- TRANSACTIONS POLICIES
-- Users can only access their own transactions
-- -----------------------------------------------------------------------------

-- SELECT: Users can view their own transactions
create policy "Users can view own transactions"
  on transactions for select
  using (auth.uid() = user_id);

-- INSERT: Users can create transactions for themselves
create policy "Users can create own transactions"
  on transactions for insert
  with check (auth.uid() = user_id);

-- UPDATE: Users can update their own transactions
create policy "Users can update own transactions"
  on transactions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- DELETE: Users can delete their own transactions (soft delete via status preferred)
create policy "Users can delete own transactions"
  on transactions for delete
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- TRANSACTION_IMPORTS POLICIES
-- Access controlled via statement ownership
-- -----------------------------------------------------------------------------

-- SELECT: Users can view imports for their own statements
create policy "Users can view own statement imports"
  on transaction_imports for select
  using (
    exists (
      select 1 from statements
      where statements.id = transaction_imports.statement_id
      and statements.uploaded_by = auth.uid()
    )
  );

-- INSERT: Users can create imports for their own statements
create policy "Users can create imports for own statements"
  on transaction_imports for insert
  with check (
    exists (
      select 1 from statements
      where statements.id = transaction_imports.statement_id
      and statements.uploaded_by = auth.uid()
    )
  );

-- UPDATE: Users can update imports for their own statements
create policy "Users can update own statement imports"
  on transaction_imports for update
  using (
    exists (
      select 1 from statements
      where statements.id = transaction_imports.statement_id
      and statements.uploaded_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from statements
      where statements.id = transaction_imports.statement_id
      and statements.uploaded_by = auth.uid()
    )
  );

-- DELETE: Users can delete imports for their own statements
create policy "Users can delete own statement imports"
  on transaction_imports for delete
  using (
    exists (
      select 1 from statements
      where statements.id = transaction_imports.statement_id
      and statements.uploaded_by = auth.uid()
    )
  );
