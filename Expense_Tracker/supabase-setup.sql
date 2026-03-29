-- This setup allows anonymous public read/write access from a static site.
-- It is simple for GitHub Pages, but anyone with your site can modify the data.

create table if not exists public.expense_pages (
  scope text primary key,
  data jsonb not null default '{"transactions":[],"notes":{}}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint expense_pages_scope_check
    check (scope in ('general', 'creditcards', 'bills', 'savings'))
);

alter table public.expense_pages enable row level security;

create policy "Public can read expense pages"
on public.expense_pages
for select
to anon
using (true);

create policy "Public can insert expense pages"
on public.expense_pages
for insert
to anon
with check (true);

create policy "Public can update expense pages"
on public.expense_pages
for update
to anon
using (true)
with check (true);
