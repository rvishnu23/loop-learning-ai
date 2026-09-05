create table if not exists public.loop_state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.loop_files (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.loop_state enable row level security;
alter table public.loop_files enable row level security;