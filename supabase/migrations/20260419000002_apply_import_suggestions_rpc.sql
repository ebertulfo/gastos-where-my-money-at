-- Single-roundtrip batch update for AI tag suggestions.
--
-- Replaces the per-row update loop in suggestTagsForStatement (50
-- individual HTTP calls per batch) with one JSONB-driven RPC. Each
-- payload entry is `{ id, suggested_tag_ids, ai_suggestion_status,
-- ai_model_version, ai_suggested_at }`.

create or replace function public.apply_import_suggestions(payload jsonb)
returns integer
language plpgsql
security invoker
as $$
declare
  updated_count integer := 0;
begin
  if payload is null or jsonb_array_length(payload) = 0 then
    return 0;
  end if;

  with src as (
    select
      (item->>'id')::uuid as id,
      coalesce(
        (
          select array_agg(value::uuid)
          from jsonb_array_elements_text(item->'suggested_tag_ids') as value
        ),
        '{}'::uuid[]
      ) as suggested_tag_ids,
      item->>'ai_suggestion_status' as ai_suggestion_status,
      nullif(item->>'ai_model_version', '') as ai_model_version,
      (item->>'ai_suggested_at')::timestamptz as ai_suggested_at
    from jsonb_array_elements(payload) as item
  )
  update public.transaction_imports ti
  set
    suggested_tag_ids = src.suggested_tag_ids,
    ai_suggestion_status = src.ai_suggestion_status,
    ai_model_version = src.ai_model_version,
    ai_suggested_at = src.ai_suggested_at
  from src
  where ti.id = src.id;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;
