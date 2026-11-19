-- Keyword search alongside semantic search: titles ("Attempt to murder") are weighted highest.

alter table public.statute_sections
  add column if not exists fts tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(text, '')), 'B')
  ) stored;

create index if not exists statute_sections_fts_idx on public.statute_sections using gin (fts);

-- query: a tsquery string built by the caller, e.g. 'attempt | murder'
create or replace function public.search_statute_text(
  query text,
  match_count int default 15,
  filter_acts text[] default null
)
returns table (section_id uuid, act text, section text, title text, rank real)
language sql stable
set search_path = public
as $$
  select s.id, s.act, s.section, s.title,
         ts_rank_cd(s.fts, to_tsquery('english', query), 32) as rank
  from statute_sections s
  where s.fts @@ to_tsquery('english', query)
    and (filter_acts is null or s.act = any(filter_acts))
  order by rank desc
  limit match_count;
$$;

revoke execute on function public.search_statute_text(text, int, text[]) from public, anon, authenticated;
grant  execute on function public.search_statute_text(text, int, text[]) to service_role;
