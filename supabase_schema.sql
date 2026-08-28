create table if not exists public.study_documents (
  doc_key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.study_documents enable row level security;

drop policy if exists "public read study documents" on public.study_documents;
create policy "public read study documents"
on public.study_documents for select
to anon, authenticated
using (true);

drop policy if exists "public insert study documents" on public.study_documents;
create policy "public insert study documents"
on public.study_documents for insert
to anon, authenticated
with check (true);

drop policy if exists "public update study documents" on public.study_documents;
create policy "public update study documents"
on public.study_documents for update
to anon, authenticated
using (true)
with check (true);

grant select, insert, update on public.study_documents to anon, authenticated;
