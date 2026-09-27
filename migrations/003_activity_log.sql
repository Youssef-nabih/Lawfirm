-- Apply after 001_company_tasks.sql. Logs successful data changes from this point onward.
begin;
create table public.activity_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  actor_id uuid,
  actor_name text not null,
  actor_username text,
  actor_role text,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  table_name text not null,
  record_id text,
  record_label text,
  changed_fields text[] not null default '{}'
);
create index activity_log_recent_idx on public.activity_log (occurred_at desc, id desc);
alter table public.activity_log enable row level security;
revoke all on public.activity_log from public, anon, authenticated;
grant select on public.activity_log to authenticated;
create policy activity_log_admin_read on public.activity_log for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.status = 'approved'));

create function public.capture_office_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  before_row jsonb;
  after_row jsonb;
  row_data jsonb;
  actor jsonb;
  fields text[] := '{}';
begin
  if TG_OP <> 'INSERT' then before_row := to_jsonb(OLD); end if;
  if TG_OP <> 'DELETE' then after_row := to_jsonb(NEW); end if;
  if TG_OP = 'UPDATE' then
    select coalesce(array_agg(key order by key), '{}'::text[]) into fields
    from jsonb_each(after_row) where value is distinct from before_row -> key;
    if cardinality(fields) = 0 then return NEW; end if;
  end if;
  row_data := coalesce(after_row, before_row);
  select to_jsonb(p) into actor from public.profiles p where p.id = auth.uid();
  insert into public.activity_log(actor_id, actor_name, actor_username, actor_role, action, table_name, record_id, record_label, changed_fields)
  values (auth.uid(), coalesce(nullif(actor->>'full_name',''), nullif(actor->>'username',''),
    case when auth.uid() is null then 'النظام' else 'مستخدم' end), actor->>'username', actor->>'role',
    TG_OP, TG_TABLE_NAME, row_data->>'id',
    coalesce(nullif(row_data->>'name',''), nullif(row_data->>'title',''), nullif(row_data->>'case_number',''),
      nullif(row_data->>'subject',''), row_data->>'id'), fields);
  return coalesce(NEW, OLD);
end;
$$;
revoke all on function public.capture_office_activity() from public, anon, authenticated;
do $$
declare target text;
begin
  foreach target in array array['companies','clients','cases','case_sessions','client_expenses','tasks','company_tasks'] loop
    execute format('create trigger office_activity_capture after insert or update or delete on public.%I for each row execute function public.capture_office_activity()', target);
  end loop;
end $$;
commit;
