-- Translation now works both ways (Indian language ⇄ English); record the target language.
alter table public.translated_documents add column if not exists target_language text not null default 'English';
