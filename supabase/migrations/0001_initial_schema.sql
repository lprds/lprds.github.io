-- On It — shared household task board for couples (ADHD-marriage informed)
--
-- All tables are RLS-enabled with NO policies: the anon/publishable key can read
-- and write nothing directly. The `api` edge function is the only access path and
-- authenticates callers by opaque device token.

create table if not exists households (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  timezone    text not null default 'America/Los_Angeles',
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists members (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name         text not null,
  color        text not null default 'teal',
  is_owner     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists members_household_idx on members(household_id);

create table if not exists devices (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  member_id    uuid not null references members(id) on delete cascade,
  token        text not null unique,
  label        text,
  kiosk        boolean not null default false,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists devices_household_idx on devices(household_id);

create table if not exists tasks (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id) on delete cascade,
  title          text not null,
  notes          text not null default '',
  owner_id       uuid references members(id) on delete set null,
  requested_by   uuid references members(id) on delete set null,
  -- requested = an ask awaiting the owner's yes; open = agreed and live
  status         text not null default 'open'
                 check (status in ('requested','open','done','declined','archived')),
  due_on         date,
  time_of_day    text not null default 'anytime'
                 check (time_of_day in ('morning','afternoon','evening','anytime')),
  est_minutes    integer check (est_minutes is null or est_minutes between 1 and 600),
  matters        boolean not null default false,
  repeat_rule    text not null default 'none'
                 check (repeat_rule in ('none','daily','weekdays','weekly','biweekly','monthly')),
  steps          jsonb not null default '[]'::jsonb,
  decline_reason text,
  defer_count    integer not null default 0,
  nudged_at      timestamptz,
  nudge_count    integer not null default 0,
  series_id      uuid,
  created_by     uuid references members(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  completed_at   timestamptz,
  completed_by   uuid references members(id) on delete set null
);
create index if not exists tasks_household_status_idx on tasks(household_id, status);
create index if not exists tasks_household_due_idx    on tasks(household_id, due_on);
create index if not exists tasks_household_updated_idx on tasks(household_id, updated_at desc);

-- Append-only history. This is what ends "I told you" / "you never told me".
create table if not exists events (
  id           bigint generated always as identity primary key,
  household_id uuid not null references households(id) on delete cascade,
  task_id      uuid references tasks(id) on delete cascade,
  actor_id     uuid references members(id) on delete set null,
  kind         text not null,
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists events_household_idx on events(household_id, id desc);

create table if not exists kudos (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  task_id      uuid references tasks(id) on delete set null,
  from_member  uuid references members(id) on delete set null,
  to_member    uuid references members(id) on delete set null,
  emoji        text not null default '💛',
  message      text not null default '',
  created_at   timestamptz not null default now(),
  seen_at      timestamptz
);
create index if not exists kudos_household_idx on kudos(household_id, created_at desc);

-- Throttles brute-forcing of household join codes.
create table if not exists join_attempts (
  id         bigint generated always as identity primary key,
  ip         text not null,
  ok         boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists join_attempts_ip_idx on join_attempts(ip, created_at desc);

create or replace function touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tasks_touch_updated_at on tasks;
create trigger tasks_touch_updated_at
  before update on tasks
  for each row execute function touch_updated_at();

alter table households    enable row level security;
alter table members       enable row level security;
alter table devices       enable row level security;
alter table tasks         enable row level security;
alter table events        enable row level security;
alter table kudos         enable row level security;
alter table join_attempts enable row level security;
