-- Fix RLS policy for transaction_tags

-- Drop existing policies for transaction_tags to ensure clean slate
drop policy if exists "Users can view tags of their transactions" on public.transaction_tags;
drop policy if exists "Users can add tags to their transactions" on public.transaction_tags;
drop policy if exists "Users can remove tags from their transactions" on public.transaction_tags;

-- Re-create policies with correct checks
-- For SELECT, check if the transaction belongs to the user
create policy "Users can view tags of their transactions"
  on public.transaction_tags for select
  using (
    exists (
      select 1 from public.transactions
      where transactions.id = transaction_tags.transaction_id
      and transactions.user_id = auth.uid()
    )
  );

-- For INSERT, use 'transaction_id' directly to refer to the new row column
-- and ensure we don't alias the new row which can cause shadowing issues
create policy "Users can add tags to their transactions"
  on public.transaction_tags for insert
  with check (
    exists (
      select 1 from public.transactions
      where transactions.id = transaction_id
      and transactions.user_id = auth.uid()
    )
  );

-- For DELETE, check the transaction_id of the row being deleted
create policy "Users can remove tags from their transactions"
  on public.transaction_tags for delete
  using (
    exists (
      select 1 from public.transactions
      where transactions.id = transaction_tags.transaction_id
      and transactions.user_id = auth.uid()
    )
  );
