-- Full statute text, old→new section mappings and semantic search.
-- Additive only: existing tables (including legal_sections) are untouched.

create extension if not exists vector with schema extensions;

-- One row per section (or schedule) of an Act, from the official Gazette / India Code text
create table if not exists public.statute_sections (
  id             uuid primary key default gen_random_uuid(),
  act            text not null,              -- BNS, BNSS, BSA, IPC, CrPC, IEA
  act_name       text not null,              -- Bharatiya Nyaya Sanhita, 2023
  section        text not null,              -- '318', '53A', 'Schedule First'
  title          text not null,
  chapter        text,
  chapter_title  text,
  text           text not null,
  in_force_from  date,                       -- 2024-07-01 for BNS/BNSS/BSA
  in_force_until date,                       -- 2024-06-30 for IPC/CrPC/IEA
  source         text not null,              -- e.g. 'Gazette of India, CG-DL-E-25122023-250883'
  created_at     timestamptz not null default now(),
  unique (act, section)
);

-- Search chunks: long sections (e.g. definitions) are split so each embedding stays focused
create table if not exists public.statute_chunks (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references public.statute_sections(id) on delete cascade,
  chunk_index int  not null,
  content     text not null,                 -- includes act/section/title header for context
  embedding   extensions.vector(768) not null,
  unique (section_id, chunk_index)
);

create index if not exists statute_chunks_embedding_idx
  on public.statute_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- Official correspondence between repealed and new codes (IPC→BNS, CrPC→BNSS, IEA→BSA)
create table if not exists public.section_mappings (
  id          uuid primary key default gen_random_uuid(),
  old_act     text not null,
  old_section text not null,
  new_act     text not null,
  new_section text not null,                 -- may include sub-section, e.g. '318(4)'
  note        text,                          -- e.g. 'new offence', 'merged', 'modified'
  source      text not null,
  unique (old_act, old_section, new_act, new_section)
);
create index if not exists section_mappings_new_idx on public.section_mappings (new_act, new_section);

-- Backend-only access (service key). No anon/authenticated policies on purpose.
alter table public.statute_sections enable row level security;
alter table public.statute_chunks   enable row level security;
alter table public.section_mappings enable row level security;

-- Semantic search over chunks, optionally restricted to certain Acts
create or replace function public.match_statute_chunks(
  query_embedding extensions.vector(768),
  match_count int default 12,
  filter_acts text[] default null
)
returns table (section_id uuid, act text, section text, title text, content text, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select s.id, s.act, s.section, s.title, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from statute_chunks c
  join statute_sections s on s.id = c.section_id
  where filter_acts is null or s.act = any(filter_acts)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function public.match_statute_chunks(extensions.vector, int, text[]) from public, anon, authenticated;
grant  execute on function public.match_statute_chunks(extensions.vector, int, text[]) to service_role;
