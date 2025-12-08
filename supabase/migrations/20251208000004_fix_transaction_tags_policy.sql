-- Fix RLS policy for transaction_tags (Attempt 3: Robust EXISTS with Aliasing)

drop policy if exists "Users can add tags to their transactions" on public.transaction_tags;
drop policy if exists "Users can remove tags from their transactions" on public.transaction_tags;

-- INSERT Policy: Use EXISTS with explicit table alias 't' to avoid ANY ambiguity.
-- We check that the transaction pointed to by the new tag association belongs to the current user.
create policy "Users can add tags to their transactions"
  on public.transaction_tags for insert
  with check (
    exists (
      select 1 from public.transactions t
      where t.id = transaction_tags.transaction_id
      and t.user_id = auth.uid()
    )
  );

-- DELETE Policy: Same logic
create policy "Users can remove tags from their transactions"
  on public.transaction_tags for delete
  using (
    exists (
      select 1 from public.transactions t
      where t.id = transaction_tags.transaction_id
      and t.user_id = auth.uid()
    )
  );
