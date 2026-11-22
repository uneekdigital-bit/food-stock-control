begin;
create table public.qa_calls (
  id bigint generated always as identity primary key,
  batch_id bigint not null references public.batches(id),
  expiry_date date not null,
  requested_by uuid not null,
  created_at timestamptz not null default now(),
  responder uuid,
  responder_name text,
  unique(batch_id,expiry_date)
);
alter table public.qa_calls enable row level security;
revoke all on public.qa_calls from public,anon,authenticated;
grant select on public.qa_calls to authenticated;
create policy staff_read_calls on public.qa_calls for select to authenticated
using (exists(select 1 from public.profiles where user_id=auth.uid()));

create table public.qa_push_devices (
  endpoint text primary key,
  owner_id uuid not null,
  subscription jsonb not null
);
alter table public.qa_push_devices enable row level security;
revoke all on public.qa_push_devices from public,anon,authenticated;
grant all on public.qa_push_devices to service_role;

create function public.call_expiry_qa(batch bigint)
returns table(call_id bigint, is_new boolean)
language plpgsql security definer set search_path=public as $$
declare ref bigint; expiry date;
begin
  if not exists(select 1 from profiles where user_id=auth.uid()) then
    raise exception 'Staff sign-in required';
  end if;
  select b.expiry_date into expiry from batches b where b.id=batch and b.quantity>0
    and b.expiry_date < (now() at time zone 'Europe/London')::date for update;
  if not found then raise exception 'This batch is not expired or has no stock'; end if;
  insert into qa_calls(batch_id,expiry_date,requested_by) values(batch,expiry,auth.uid())
    on conflict(batch_id,expiry_date) do nothing returning id into ref;
  if ref is not null then return query select ref,true;
  else return query select c.id,false from qa_calls c where c.batch_id=batch and c.expiry_date=expiry;
  end if;
end $$;

create function public.ack_expiry_qa(call_id bigint) returns void
language plpgsql security definer set search_path=public as $$
begin
  update qa_calls c set responder=p.user_id,responder_name=coalesce(nullif(p.display_name,''),'QA')
    from profiles p where p.user_id=auth.uid() and p.role in ('qa','qa_manager')
    and c.id=call_id and c.responder is null;
  if not found then raise exception 'Request already claimed or QA access required'; end if;
end $$;
revoke all on function public.call_expiry_qa(bigint),public.ack_expiry_qa(bigint) from public,anon;
grant execute on function public.call_expiry_qa(bigint),public.ack_expiry_qa(bigint) to authenticated;
commit;
