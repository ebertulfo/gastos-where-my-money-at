-- Boolean flag marking transactions that occurred during travel (foreign-
-- currency / overseas spend, irrespective of category). Set heuristically
-- at ingest from the description (foreign country / currency tokens).
-- Future: groups consecutive is_travel rows into trips with user-named
-- labels (e.g. "japan-2026").
--
-- Lives separately from category_id so a foreign supermarket can stay
-- in Food/Groceries (its real spend type) while still being marked as
-- travel.

alter table public.transactions
  add column is_travel boolean not null default false;

alter table public.transaction_imports
  add column is_travel boolean not null default false;

create index idx_transactions_is_travel
  on public.transactions(user_id, is_travel)
  where is_travel = true;
