-- Slice 2 (revised): generic household_members table.
--
-- Earlier draft used a CHECK-constrained ('partner_a', 'partner_b', 'joint',
-- 'unspecified') text column on statements. That model can't represent
-- households with kids, roommates, or multi-generational arrangements.
-- This replaces it with a per-user table of named members; the user owns
-- the vocabulary.
--
-- Joint is just a member whose name happens to be "Joint" (or whatever the
-- user calls it). No special schema flag — keeps the model honest.
--
-- statements.member_id is nullable so existing rows (and uploads where the
-- user skips attribution) remain valid. ON DELETE SET NULL preserves the
-- statement when a member is removed.

create table public.household_members (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    color text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- One name per household (case-insensitive). Lets the UI guarantee
-- "Edrian" and "edrian" don't split data without forcing a particular case.
create unique index household_members_user_name_lower_idx
    on public.household_members (user_id, lower(name));

create index household_members_user_id_idx
    on public.household_members (user_id);

create trigger update_household_members_updated_at
    before update on public.household_members
    for each row execute function update_updated_at_column();

alter table public.household_members enable row level security;

create policy "Users can view their own household members"
    on public.household_members for select
    using (auth.uid() = user_id);

create policy "Users can create their own household members"
    on public.household_members for insert
    with check (auth.uid() = user_id);

create policy "Users can update their own household members"
    on public.household_members for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "Users can delete their own household members"
    on public.household_members for delete
    using (auth.uid() = user_id);

-- Per-statement attribution. Nullable = "unspecified" (statement uploaded
-- before the user picked a member, or they skipped on purpose).
alter table public.statements
    add column member_id uuid references public.household_members(id) on delete set null;

create index statements_member_id_idx on public.statements (uploaded_by, member_id);
