-- Enable office backups after 001_company_tasks.sql. Run once in Supabase SQL Editor.
begin;
create or replace function public.office_backup_export()
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  t text; rows jsonb; contents jsonb := '{}'::jsonb; signature text;
  names constant text[] := array['companies','clients','cases','case_sessions','client_expenses','tasks','company_tasks'];
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='approved') then
    raise exception 'ADMIN_REQUIRED';
  end if;
  -- One consistent snapshot while all office tables are read.
  lock table public.companies,public.clients,public.cases,public.case_sessions,public.client_expenses,public.tasks,public.company_tasks in share mode;
  foreach t in array names loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by r.id), ''[]''::jsonb) from public.%I r',t) into rows;
    contents := contents || jsonb_build_object(t,rows);
  end loop;
  select md5(string_agg(table_name||':'||column_name||':'||udt_name||':'||is_nullable,',' order by table_name,ordinal_position))
    into signature from information_schema.columns where table_schema='public' and table_name=any(names);
  return jsonb_build_object('tables',contents,'schema',signature,'revision',md5(contents::text));
end $$;

-- Only this narrowly scoped helper needs owner rights to advance identity sequences.
create or replace function public.office_backup_adjust_sequences()
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare t text; seq text; max_id bigint; sequence_next bigint;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='approved') then raise exception 'ADMIN_REQUIRED'; end if;
  foreach t in array array['companies','clients','cases','case_sessions','client_expenses','tasks','company_tasks'] loop
    seq := pg_get_serial_sequence('public.'||quote_ident(t),'id');
    if seq is not null then
      execute format('select max(id) from public.%I',t) into max_id;
      if max_id is not null then
        sequence_next := nextval(seq::regclass);
        perform setval(seq::regclass,greatest(max_id,sequence_next),true);
      end if;
    end if;
  end loop;
end $$;
revoke all on function public.office_backup_adjust_sequences() from public,anon;
grant execute on function public.office_backup_adjust_sequences() to authenticated;

create or replace function public.office_backup_restore(p_tables jsonb,p_schema text,p_expected_revision text)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  t text; rows jsonb; snapshot jsonb; cols text; updates text;
  names constant text[] := array['companies','clients','cases','case_sessions','client_expenses','tasks','company_tasks'];
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='approved') then raise exception 'ADMIN_REQUIRED'; end if;
  if jsonb_typeof(p_tables) is distinct from 'object' then raise exception 'INVALID_BACKUP'; end if;
  if (select count(*) from jsonb_object_keys(p_tables)) <> cardinality(names) then raise exception 'INVALID_TABLES'; end if;
  lock table public.companies,public.clients,public.cases,public.case_sessions,public.client_expenses,public.tasks,public.company_tasks in exclusive mode;
  snapshot := public.office_backup_export();
  if p_schema is distinct from snapshot->>'schema' then raise exception 'SCHEMA_CHANGED'; end if;
  if p_expected_revision is distinct from snapshot->>'revision' then raise exception 'DATA_CHANGED'; end if;
  foreach t in array names loop
    rows := p_tables->t;
    if jsonb_typeof(rows) is distinct from 'array' then raise exception 'INVALID_TABLE: %',t; end if;
    if exists(select 1 from jsonb_array_elements(rows) r where jsonb_typeof(r) is distinct from 'object' or r->>'id' is null) then raise exception 'INVALID_ROWS: %',t; end if;
    if (select count(*) from jsonb_array_elements(rows)) <> (select count(distinct r->>'id') from jsonb_array_elements(rows) r) then raise exception 'DUPLICATE_IDS: %',t; end if;
    if exists(select 1 from jsonb_array_elements(rows) r cross join lateral jsonb_object_keys(r) k where not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=t and c.column_name=k)) then raise exception 'INVALID_COLUMNS: %',t; end if;
    select string_agg(format('%I',column_name),',' order by ordinal_position),
      string_agg(format('%I=excluded.%I',column_name,column_name),',' order by ordinal_position) filter(where column_name<>'id')
      into cols,updates from information_schema.columns where table_schema='public' and table_name=t and is_generated='NEVER';
    execute format('insert into public.%I (%s) overriding system value select %s from jsonb_populate_recordset(null::public.%I,$1) on conflict(id) do update set %s',t,cols,cols,t,updates) using rows;
  end loop;
  perform public.office_backup_adjust_sequences();
  return jsonb_build_object('restored',true);
end $$;
revoke all on function public.office_backup_export() from public,anon;
revoke all on function public.office_backup_restore(jsonb,text,text) from public,anon;
grant execute on function public.office_backup_export() to authenticated;
grant execute on function public.office_backup_restore(jsonb,text,text) to authenticated;
commit;
