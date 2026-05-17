-- KNN helper for tag suggestions. Returns the user's other tagged
-- transactions sorted by cosine similarity to the input embedding, with
-- the joined transaction_tags collapsed into a JSON array per row.
--
-- We use an RPC so the suggest server action can do this in one round trip
-- and so we can project `1 - (description_embedding <=> embedding)` as the
-- similarity score (PostgREST's order-by alias support is fragile).

create or replace function public.knn_neighbour_tags(
  p_user_id uuid,
  p_exclude_id uuid,
  p_embedding vector(1536),
  p_limit integer default 20
)
returns table (
  id uuid,
  description text,
  similarity double precision,
  transaction_tags jsonb
)
language sql
security invoker
stable
as $$
  with neighbours as (
    select
      t.id,
      t.description,
      1 - (t.description_embedding <=> p_embedding) as similarity
    from public.transactions t
    where t.user_id = p_user_id
      and t.id <> p_exclude_id
      and t.description_embedding is not null
      and t.status = 'active'
      and exists (
        select 1 from public.transaction_tags tt where tt.transaction_id = t.id
      )
    order by t.description_embedding <=> p_embedding
    limit p_limit
  )
  select
    n.id,
    n.description,
    n.similarity,
    coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'tag_id', tt.tag_id,
          'is_primary', tt.is_primary
        ))
        from public.transaction_tags tt
        where tt.transaction_id = n.id
      ),
      '[]'::jsonb
    ) as transaction_tags
  from neighbours n;
$$;
