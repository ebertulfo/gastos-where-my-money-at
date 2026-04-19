-- Tag embeddings. Makes suggestions work zero-shot: a transaction like
-- "MOBILE ICOCA OSAKA JP" can match a tag whose description captures the
-- same semantic cues, without needing a prior tagged transaction on file.

-- description stores user-editable (and LLM auto-seeded) semantic cues —
-- e.g. for tag "japan": "Japan travel. Tokyo, Osaka, Kyoto, ICOCA, JR Pass,
-- Suica, Yen JPY". embedding = vector({name}\n{description}).
alter table public.tags
  add column description text,
  add column embedding vector(1536);

-- HNSW on cosine distance, same class of index used for transactions. Per-
-- user tag counts are small (tens) so even without the user_id filter the
-- scan is cheap; the RPC below filters by user_id anyway.
create index idx_tags_embedding
  on public.tags
  using hnsw (embedding vector_cosine_ops);

-- KNN over the user's own tags. Returns tags ordered by cosine similarity
-- to the target embedding. Mirrors knn_neighbour_tags in shape so the
-- suggest path can batch both round-trips similarly.
create or replace function public.knn_nearest_tags(
  p_user_id uuid,
  p_embedding vector(1536),
  p_limit integer default 10
)
returns table (
  id uuid,
  name text,
  similarity double precision
)
language sql
security invoker
stable
as $$
  select
    t.id,
    t.name,
    1 - (t.embedding <=> p_embedding) as similarity
  from public.tags t
  where t.user_id = p_user_id
    and t.embedding is not null
  order by t.embedding <=> p_embedding
  limit p_limit;
$$;
