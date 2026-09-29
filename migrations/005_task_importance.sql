-- Run in Supabase SQL Editor before publishing the task importance controls.
-- Existing tasks remain normal. Existing RLS policies continue to apply.
begin;
alter table public.tasks add column if not exists is_important boolean not null default false;
alter table if exists public.company_tasks add column if not exists is_important boolean not null default false;
notify pgrst, 'reload schema';
commit;
