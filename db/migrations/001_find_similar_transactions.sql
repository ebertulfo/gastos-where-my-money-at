-- Forward migration: add find_similar_transactions RPC.
-- Apply once against the live DB:
--   psql "$DATABASE_URL_UNPOOLED" -f db/migrations/001_find_similar_transactions.sql
--
-- Idempotent (create or replace). Mirrors the canonical block in db/init.sql.

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
