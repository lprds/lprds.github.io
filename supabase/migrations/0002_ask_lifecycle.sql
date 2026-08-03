-- On It v2 — the state between "asked" and "done" (SPEC-v2 §1–§3)
--
-- The deadline is on the ANSWER, not the work: answer_by is when a reply is
-- expected. If none arrives, the resurface job re-asks on the owner's board —
-- board state only, never a message. Three new answer shapes live alongside
-- accept/decline: accepted-for-later, renegotiate (swap / pay / drop / talk),
-- and a resolved outcome that closes an item out of the "needs another plan"
-- pile. Dropping requires two distinct members, enforced in the API.

alter table tasks
  add column if not exists answer_by         timestamptz,
  add column if not exists seen_at           timestamptz,
  add column if not exists resurfaced_at     timestamptz,
  add column if not exists resurface_count   integer not null default 0,
  add column if not exists hard_deadline     boolean not null default false,
  add column if not exists deadline_on       date,
  add column if not exists renegotiate_route text,
  add column if not exists renegotiate_note  text,
  add column if not exists outcome           text,
  add column if not exists drop_proposed_by  uuid references members(id) on delete set null,
  add column if not exists drop_agreed_by    uuid references members(id) on delete set null;

alter table tasks drop constraint if exists tasks_status_check;
alter table tasks add constraint tasks_status_check
  check (status in ('requested','open','done','declined','renegotiate','archived'));

alter table tasks drop constraint if exists tasks_renegotiate_route_check;
alter table tasks add constraint tasks_renegotiate_route_check
  check (renegotiate_route is null or renegotiate_route in ('swap','pay','drop','talk'));

alter table tasks drop constraint if exists tasks_outcome_check;
alter table tasks add constraint tasks_outcome_check
  check (outcome is null or outcome in ('outsourced','dropped','swapped','taken_back'));

create index if not exists tasks_answer_due_idx
  on tasks(household_id, answer_by) where status = 'requested';

-- The re-asking runs here, every 15 minutes, whether or not any phone is open.
-- First pass fires once answer_by is behind us; a second no sooner than 20h
-- later. It stops at two — rung 3 of the ladder is "go talk", rendered by the
-- client from resurface_count, and the app never escalates past that.
create or replace function onit_resurface_asks() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
begin
  for r in
    select id, household_id, resurface_count
    from public.tasks
    where status = 'requested'
      and answer_by is not null
      and answer_by < now()
      and resurface_count < 2
      and (resurfaced_at is null or resurfaced_at < now() - interval '20 hours')
  loop
    update public.tasks
      set resurfaced_at = now(), resurface_count = resurface_count + 1
      where id = r.id;
    insert into public.events (household_id, task_id, actor_id, kind, detail)
      values (r.household_id, r.id, null, 'resurfaced',
              jsonb_build_object('n', r.resurface_count + 1));
  end loop;
end;
$$;

revoke all on function onit_resurface_asks() from public, anon, authenticated;

select cron.schedule('onit-resurface', '*/15 * * * *',
  $$select public.onit_resurface_asks()$$);
