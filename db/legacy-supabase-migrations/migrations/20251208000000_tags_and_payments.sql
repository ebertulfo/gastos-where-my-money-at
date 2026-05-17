-- Create tags table
create table public.tags (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  name text not null,
  parent_id uuid references public.tags(id),
  color text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, name)
);

-- Enable RLS for tags
alter table public.tags enable row level security;

create policy "Users can view their own tags"
  on public.tags for select
  using (auth.uid() = user_id);

create policy "Users can insert their own tags"
  on public.tags for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own tags"
  on public.tags for update
  using (auth.uid() = user_id);

create policy "Users can delete their own tags"
  on public.tags for delete
  using (auth.uid() = user_id);

-- Create transaction_tags junction table
create table public.transaction_tags (
  transaction_id uuid references public.transactions(id) on delete cascade not null,
  tag_id uuid references public.tags(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (transaction_id, tag_id)
);

-- Enable RLS for transaction_tags
alter table public.transaction_tags enable row level security;

create policy "Users can view tags of their transactions"
  on public.transaction_tags for select
  using (
    exists (
      select 1 from public.transactions
      where transactions.id = transaction_tags.transaction_id
      and transactions.user_id = auth.uid()
    )
  );

create policy "Users can add tags to their transactions"
  on public.transaction_tags for insert
  with check (
    exists (
      select 1 from public.transactions
      where transactions.id = transaction_tags.transaction_id
      and transactions.user_id = auth.uid()
    )
  );

create policy "Users can remove tags from their transactions"
  on public.transaction_tags for delete
  using (
    exists (
      select 1 from public.transactions
      where transactions.id = transaction_tags.transaction_id
      and transactions.user_id = auth.uid()
    )
  );

-- Add is_payment to transactions
alter table public.transactions
add column is_payment boolean default false not null;
