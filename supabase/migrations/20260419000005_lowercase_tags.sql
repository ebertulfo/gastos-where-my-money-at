-- Normalize all tag names to lowercase. Fold any case-collision duplicates
-- (e.g. "Japan" + "japan") per user into a single canonical row, repointing
-- transaction_tags and tag.parent_id references while preserving the
-- "exactly one primary tag per transaction" invariant.

-- Merge plan: for each (user_id, lower(name)) group, earliest-created row
-- (id as deterministic tiebreaker) is the winner; the rest are losers.
create temporary table _tag_merge_plan on commit drop as
with ranked as (
  select
    id,
    user_id,
    lower(name) as canonical_name,
    row_number() over (
      partition by user_id, lower(name)
      order by created_at asc, id asc
    ) as rn
  from public.tags
),
winners as (
  select user_id, canonical_name, id as winner_id
  from ranked where rn = 1
)
select r.id as loser_id, w.winner_id
from ranked r
join winners w
  on w.user_id = r.user_id and w.canonical_name = r.canonical_name
where r.rn > 1;

-- Fix-up set: transactions whose primary tag is a loser AND the winner is
-- already attached (non-primary). After deleting the loser row the tx would
-- have zero primaries, violating idx_transaction_tags_one_primary; we
-- promote the winner right after the delete.
create temporary table _primary_fixups on commit drop as
select tt_l.transaction_id, p.winner_id
from _tag_merge_plan p
join public.transaction_tags tt_l
  on tt_l.tag_id = p.loser_id and tt_l.is_primary = true
join public.transaction_tags tt_w
  on tt_w.tag_id = p.winner_id
  and tt_w.transaction_id = tt_l.transaction_id;

-- 1. Drop (tx, loser) rows that collide with an existing (tx, winner).
delete from public.transaction_tags tt
using _tag_merge_plan p
where tt.tag_id = p.loser_id
  and exists (
    select 1 from public.transaction_tags t2
    where t2.transaction_id = tt.transaction_id
      and t2.tag_id = p.winner_id
  );

-- 2. Promote winner -> primary wherever the loser used to be primary.
update public.transaction_tags tt
set is_primary = true
from _primary_fixups f
where tt.transaction_id = f.transaction_id
  and tt.tag_id = f.winner_id
  and tt.is_primary = false;

-- 3. Repoint remaining (tx, loser) rows onto the winner. Safe: step 1
-- removed every collision, preserving both the (tx, tag) PK and the
-- is_primary carry-over.
update public.transaction_tags tt
set tag_id = p.winner_id
from _tag_merge_plan p
where tt.tag_id = p.loser_id;

-- 4. Repoint tag.parent_id references onto the winner. Must run before the
-- loser delete or the FK would block us.
update public.tags t
set parent_id = p.winner_id
from _tag_merge_plan p
where t.parent_id = p.loser_id;

-- 5. Drop loser tag rows.
delete from public.tags t
using _tag_merge_plan p
where t.id = p.loser_id;

-- 6. Lowercase every remaining tag name.
update public.tags set name = lower(name) where name <> lower(name);

-- 7. Enforce lowercase going forward so the invariant can't drift.
alter table public.tags
  add constraint tags_name_lowercase_chk check (name = lower(name));
