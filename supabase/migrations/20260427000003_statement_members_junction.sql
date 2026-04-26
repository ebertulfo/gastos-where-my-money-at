-- Slice 2 follow-up: many-to-many statement ↔ household_members.
--
-- A single statement can legitimately belong to more than one member
-- (joint credit card with supplementary cards, shared bank account, etc.).
-- The single statements.member_id FK from the previous migration can't
-- express that. Replace it with a junction table.
--
-- Carry-forward: any existing single-attribution rows (statements with a
-- non-null member_id) are migrated into the junction so we don't lose
-- attribution data on the way through.

create table public.statement_members (
    statement_id uuid not null references public.statements(id) on delete cascade,
    member_id uuid not null references public.household_members(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (statement_id, member_id)
);

create index statement_members_member_id_idx on public.statement_members (member_id);
create index statement_members_statement_id_idx on public.statement_members (statement_id);

alter table public.statement_members enable row level security;

-- All policies route through the parent statement's uploaded_by — same
-- pattern used by transaction_imports / transaction_tags. Keeps the
-- ownership check in one place.
create policy "Users can view their own statement members"
    on public.statement_members for select
    using (
        exists (
            select 1 from public.statements
            where statements.id = statement_members.statement_id
              and statements.uploaded_by = auth.uid()
        )
    );

create policy "Users can create statement members for their statements"
    on public.statement_members for insert
    with check (
        exists (
            select 1 from public.statements
            where statements.id = statement_members.statement_id
              and statements.uploaded_by = auth.uid()
        )
    );

create policy "Users can delete their own statement members"
    on public.statement_members for delete
    using (
        exists (
            select 1 from public.statements
            where statements.id = statement_members.statement_id
              and statements.uploaded_by = auth.uid()
        )
    );

-- Migrate existing single-attribution data into the junction.
insert into public.statement_members (statement_id, member_id)
select id, member_id from public.statements where member_id is not null
on conflict do nothing;

-- Drop the now-redundant single FK column and its index.
drop index if exists public.statements_member_id_idx;
alter table public.statements drop column if exists member_id;
