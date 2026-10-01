-- Optional short description between case year and court.
-- Existing cases retain NULL descriptions; permissions are unchanged.
begin;
alter table public.cases add column if not exists case_description text;
notify pgrst, 'reload schema';
commit;
