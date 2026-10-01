-- Run once if the earlier version of 006 was applied.
-- Case subjects can repeat; only the old case-name uniqueness index is removed.
-- Companies, clients, existing case records and RLS policies remain unchanged.
begin;
drop index if exists public.office_unique_cases_name;
commit;
