-- ============================================================================
-- HealthJob Global — safe, incremental migration (001)
-- Run in: Supabase Dashboard > SQL Editor. Safe to run more than once.
-- It NEVER drops tables or deletes data.
--
-- ASSUMPTIONS (verify with the inspection queries in README step 3):
--   * public.jobs and public.service_orders already exist with the columns you listed.
--   * jobs.deadline is a date or timestamptz column.
--   * jobs.id / service_orders.job_id types are whatever you already have
--     (bigint identity or uuid) — this script does not change them.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Inspection helpers (read-only). Uncomment to view current state.
-- ---------------------------------------------------------------------------
-- select table_name, column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema='public' and table_name in ('jobs','service_orders')
--  order by table_name, ordinal_position;
-- select schemaname, tablename, policyname, roles, cmd, qual, with_check
--   from pg_policies where schemaname='public' order by tablename, policyname;

-- ---------------------------------------------------------------------------
-- 1. Admin registry (the ONLY source of admin authority)
--    Not user-editable metadata. No public write access.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

revoke all on public.admin_users from anon, authenticated;
-- A signed-in user may read only their own row (nothing else, no writes).
grant select on public.admin_users to authenticated;

drop policy if exists "admin_users: read own row" on public.admin_users;
create policy "admin_users: read own row"
  on public.admin_users for select to authenticated
  using (user_id = auth.uid());

-- Admin check used by every admin policy. SECURITY DEFINER so it can read
-- admin_users regardless of the caller's rights; search_path pinned for safety.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. jobs: extra columns for source tracking / future lead collection
-- ---------------------------------------------------------------------------
alter table public.jobs add column if not exists source_name         text;
alter table public.jobs add column if not exists fingerprint         text;
alter table public.jobs add column if not exists collected_at        timestamptz;
alter table public.jobs add column if not exists verification_status text not null default 'manual_entry';

-- updated_at auto-maintenance
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_jobs_updated_at on public.jobs;
create trigger trg_jobs_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- Constraints (NOT VALID = enforced for new/changed rows, does not fail on old data).
do $$
begin
  if not exists (select 1 from pg_constraint where conname='jobs_status_chk') then
    alter table public.jobs add constraint jobs_status_chk
      check (status in ('pending','approved','rejected','expired')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='jobs_country_chk') then
    alter table public.jobs add constraint jobs_country_chk
      check (country in ('Bangladesh','UAE','Saudi Arabia','Qatar','Kuwait','Oman','Bahrain','Other')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='jobs_source_url_chk') then
    alter table public.jobs add constraint jobs_source_url_chk
      check (source_url is null or source_url ~* '^https?://') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='jobs_apply_url_chk') then
    alter table public.jobs add constraint jobs_apply_url_chk
      check (apply_url is null or apply_url ~* '^https?://') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='jobs_verification_chk') then
    alter table public.jobs add constraint jobs_verification_chk
      check (verification_status in ('manual_entry','collected_unverified','admin_verified')) not valid;
  end if;
end $$;

create index if not exists jobs_public_idx on public.jobs (status, published_at desc);
create index if not exists jobs_country_idx on public.jobs (country);

-- Duplicate protection by source URL (skipped with a notice if old duplicates exist).
do $$
begin
  begin
    create unique index if not exists jobs_source_url_uniq
      on public.jobs (lower(source_url)) where source_url is not null;
  exception when unique_violation then
    raise notice 'jobs_source_url_uniq NOT created: duplicate source_url values already exist. Clean them, then re-run.';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 3. service_orders: constraints
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname='so_status_chk') then
    alter table public.service_orders add constraint so_status_chk
      check (status in ('pending','in_progress','completed','cancelled')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='so_name_len_chk') then
    alter table public.service_orders add constraint so_name_len_chk
      check (char_length(customer_name) between 2 and 100) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='so_contact_len_chk') then
    alter table public.service_orders add constraint so_contact_len_chk
      check (char_length(contact) between 5 and 200) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='so_message_len_chk') then
    alter table public.service_orders add constraint so_message_len_chk
      check (message is null or char_length(message) <= 1000) not valid;
  end if;
end $$;

-- status default so anonymous inserts need not (and cannot) set it
alter table public.service_orders alter column status set default 'pending';

-- ---------------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.jobs           enable row level security;
alter table public.service_orders enable row level security;

-- Remove ONLY the policies this migration owns (so re-runs don't duplicate).
-- If you have older policies you no longer want, list them with the query in
-- section 0 and drop them by name manually after reviewing.
drop policy if exists "hj jobs: public read approved"  on public.jobs;
drop policy if exists "hj jobs: admin read all"        on public.jobs;
drop policy if exists "hj jobs: admin insert"          on public.jobs;
drop policy if exists "hj jobs: admin update"          on public.jobs;
drop policy if exists "hj jobs: admin delete"          on public.jobs;
drop policy if exists "hj orders: public insert"       on public.service_orders;
drop policy if exists "hj orders: admin read"          on public.service_orders;
drop policy if exists "hj orders: admin update"        on public.service_orders;
drop policy if exists "hj orders: admin delete"        on public.service_orders;

-- jobs: public sees only approved, unexpired rows
create policy "hj jobs: public read approved"
  on public.jobs for select to anon, authenticated
  using (status = 'approved' and (deadline is null or deadline >= current_date));

create policy "hj jobs: admin read all"
  on public.jobs for select to authenticated
  using (public.is_admin());

create policy "hj jobs: admin insert"
  on public.jobs for insert to authenticated
  with check (public.is_admin());

create policy "hj jobs: admin update"
  on public.jobs for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "hj jobs: admin delete"
  on public.jobs for delete to authenticated
  using (public.is_admin());

-- service_orders: anyone may submit a PENDING request; only admins read/change
create policy "hj orders: public insert"
  on public.service_orders for insert to anon, authenticated
  with check (
    status = 'pending'
    and char_length(customer_name) between 2 and 100
    and char_length(contact) between 5 and 200
    and (message is null or char_length(message) <= 1000)
    and service_type in ('cv_writing','job_application','exam_prep',
                         'interview_prep','study_materials','career_guidance')
  );

create policy "hj orders: admin read"
  on public.service_orders for select to authenticated
  using (public.is_admin());

create policy "hj orders: admin update"
  on public.service_orders for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "hj orders: admin delete"
  on public.service_orders for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Table/column privileges (RLS decides rows; GRANTs decide the door)
-- ---------------------------------------------------------------------------
revoke all on public.jobs           from anon, authenticated;
revoke all on public.service_orders from anon, authenticated;

-- Anonymous: only public job columns (internal fields stay hidden).
-- The website therefore selects explicit columns, never select('*').
grant select (id, title, hospital_name, country, profession, description,
              requirements, salary_text, source_url, apply_url,
              published_at, deadline, status)
  on public.jobs to anon;

-- Signed-in users: RLS limits non-admins to the same approved rows; admins get all.
grant select, insert, update, delete on public.jobs to authenticated;

-- Anonymous may insert only these columns (status falls back to its default 'pending').
grant insert (customer_name, contact, service_type, job_id, message)
  on public.service_orders to anon, authenticated;
grant select, update, delete on public.service_orders to authenticated;

-- Sequence permission for admin inserts (only if id is serial/identity-backed).
do $$
declare seq text;
begin
  seq := pg_get_serial_sequence('public.jobs','id');
  if seq is not null then
    execute format('grant usage, select on sequence %s to authenticated', seq);
  end if;
  seq := pg_get_serial_sequence('public.service_orders','id');
  if seq is not null then
    execute format('grant usage, select on sequence %s to anon, authenticated', seq);
  end if;
end $$;

-- Optional admin helper: flip approved jobs past their deadline to 'expired'.
create or replace function public.expire_old_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update public.jobs set status='expired'
   where status='approved' and deadline is not null and deadline < current_date;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.expire_old_jobs() from public, anon;
grant execute on function public.expire_old_jobs() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. REGISTER YOUR ADMIN (run separately, once, after you find your UUID)
--    Dashboard > Authentication > Users > copy the "User UID" of your admin.
--    Replace the placeholder below, uncomment, and run.
-- ---------------------------------------------------------------------------
-- insert into public.admin_users (user_id, note)
-- values ('00000000-0000-0000-0000-000000000000', 'primary admin')
-- on conflict (user_id) do nothing;
