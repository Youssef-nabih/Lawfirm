-- Run in Supabase SQL Editor before deploying management name checks.
-- Existing duplicate names cause the entire migration to roll back; no records
-- are removed or renamed. Resolve those duplicates deliberately, then rerun.
begin;

create or replace function public.office_normalize_record_name(value text)
returns text language sql immutable strict parallel safe
set search_path = pg_catalog
as $$
    select lower(btrim(regexp_replace(
        regexp_replace(normalize(value, NFKC), '[ً-ٰٟـ]', '', 'g'),
        '[[:space:]]+', ' ', 'g'
    )));
$$;

-- Indexes enforce uniqueness atomically, even across different user sessions.
-- Blank and NULL legacy names are left alone. Existing RLS is unchanged.
create unique index if not exists office_unique_companies_name
    on public.companies (public.office_normalize_record_name(name))
    where public.office_normalize_record_name(name) <> '';
create unique index if not exists office_unique_cases_name
    on public.cases (public.office_normalize_record_name(name))
    where public.office_normalize_record_name(name) <> '';
create unique index if not exists office_unique_clients_name
    on public.clients (public.office_normalize_record_name(name))
    where public.office_normalize_record_name(name) <> '';
commit;
