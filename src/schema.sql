-- Up Next — Supabase schema for accounts + private/shared lists.
--
-- Run this whole file (down to, but NOT including, the "LEGACY DATA
-- MIGRATION" block at the bottom) once in the Supabase SQL editor:
-- https://supabase.com/dashboard/project/_/sql
--
-- Then sign up in the app with the email you'll edit into the migration
-- block below, and run that block separately afterwards to reattach any
-- pre-existing `items` rows to your account.

-- =========================================================
-- STEP 1: extensions, tables, columns
-- =========================================================
create extension if not exists pgcrypto;

-- Public-safe per-user display name (no email exposed), used to label
-- shared-list tabs like "Oleh & Sasha" in the UI.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists lists (
  id uuid primary key default gen_random_uuid(),
  name text,
  -- Defaults to the caller's own id so the client never has to (and can
  -- never mistakenly) send an owner_id that doesn't match auth.uid() —
  -- see the `alter table ... set default auth.uid()` re-assertion below,
  -- which also covers a `lists` table that already existed without this.
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  invite_code text unique,
  -- The one list every user gets automatically at signup (see
  -- handle_new_user below). Nobody can ever join a personal list — it has
  -- no invite code and join_list_by_code refuses to match one. Inviting a
  -- friend from a personal list creates a *separate*, non-personal list
  -- instead (see useLists.js's createSharedList) — your personal list and
  -- its items are never exposed to anyone else.
  is_personal boolean not null default false,
  created_at timestamptz not null default now()
);

-- In case `lists` already existed from an earlier run of this file
-- (before is_personal existed), add it now.
alter table lists add column if not exists is_personal boolean;

-- Belt-and-suspenders re-assertion of the column's real definition — if an
-- earlier, partially-applied run of this file left is_personal existing
-- but without its default/not-null (e.g. a later statement in that run
-- errored out), ADD COLUMN IF NOT EXISTS above would have silently skipped
-- fixing it. This backfills any nulls and re-declares default/not-null
-- unconditionally, so a null-owner_id insert can never sneak past the
-- lists_insert policy's `not is_personal` check below.
update lists set is_personal = false where is_personal is null;
alter table lists alter column is_personal set default false;
alter table lists alter column is_personal set not null;

-- Same re-assertion for owner_id's default, for a `lists` table that
-- already existed before this default was added.
alter table lists alter column owner_id set default auth.uid();

-- Safe to re-run: if this column already existed with everything defaulted
-- to false, this reclassifies each user's very first (chronologically
-- oldest) list as personal — which is always correct under this schema,
-- since handle_new_user creates exactly one list before anything else can.
update lists set is_personal = true, invite_code = null
where id in (select distinct on (owner_id) id from lists order by owner_id, created_at asc)
  and not exists (select 1 from lists l2 where l2.owner_id = lists.owner_id and l2.is_personal);

create unique index if not exists lists_one_personal_per_owner
  on lists (owner_id) where is_personal;

-- No "role" column: every member of a list has equal rights. owner_id on
-- `lists` is bookkeeping only (who created it / legacy migration), it does
-- not grant extra permissions once other members join.
--
-- user_id references `profiles`, not `auth.users`, directly — this is what
-- lets PostgREST embed `profiles(display_name)` in a `list_members` select
-- (see useLists.js), since it can only auto-detect relationships from a
-- real foreign key between the two public-schema tables. profiles.id
-- itself references auth.users(id), and a profile row always exists before
-- a matching list_members row (both are created together, profiles first,
-- by handle_new_user / join_list_by_code), so this chains correctly.
create table if not exists list_members (
  list_id uuid not null references lists(id) on delete cascade,
  -- Same reasoning as lists.owner_id above: defaults to the caller so the
  -- client never has to send it.
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (list_id, user_id)
);
alter table list_members alter column user_id set default auth.uid();

alter table items add column if not exists list_id uuid references lists(id) on delete cascade;

-- =========================================================
-- STEP 2: invite code generation (trigger, on lists insert)
-- =========================================================
create or replace function generate_invite_code()
returns text language plpgsql as $$
declare
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no O/0, I/1, L
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from lists where invite_code = code);
  end loop;
  return code;
end $$;

create or replace function set_invite_code()
returns trigger language plpgsql as $$
begin
  -- Personal lists never get a code — there is nothing to invite anyone
  -- into on a list only its owner can ever see.
  if new.invite_code is null and not new.is_personal then
    new.invite_code := generate_invite_code();
  end if;
  return new;
end $$;

drop trigger if exists trg_lists_invite_code on lists;
create trigger trg_lists_invite_code
before insert on lists
for each row execute function set_invite_code();

-- =========================================================
-- STEP 3: new-user bootstrap (profile + personal list + membership)
-- =========================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_display_name text;
  v_list_id uuid;
begin
  v_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    split_part(new.email, '@', 1)
  );

  insert into profiles (id, display_name) values (new.id, v_display_name)
  on conflict (id) do nothing;

  insert into lists (owner_id, is_personal) values (new.id, true) returning id into v_list_id;
  insert into list_members (list_id, user_id) values (v_list_id, new.id);

  return new;
end $$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- =========================================================
-- STEP 4: non-recursive membership helper
-- =========================================================
create or replace function is_list_member(target_list_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from list_members
    where list_id = target_list_id and user_id = auth.uid()
  );
$$;

-- =========================================================
-- STEP 5: RLS
-- =========================================================
alter table profiles enable row level security;
alter table lists enable row level security;
alter table list_members enable row level security;
alter table items enable row level security;

-- RLS policies below are what actually decide which *rows* are visible —
-- but Postgres separately requires the baseline table-level privilege to
-- attempt the operation at all. Supabase normally grants this by default
-- for tables created in `public`, but making it explicit costs nothing and
-- rules out "42501 insufficient privilege" being a plain missing GRANT
-- instead of an RLS policy actually rejecting the row.
grant usage on schema public to authenticated;
grant select, insert, update, delete on profiles, lists, list_members, items to authenticated;

-- Postgres has no "CREATE POLICY IF NOT EXISTS" / "OR REPLACE", so every
-- policy is dropped first — this is what actually makes the whole file
-- safe to paste and run again (e.g. after pulling a schema.sql update).

-- Display names are non-sensitive; any signed-in user may read them so
-- shared-list tabs can show co-members' names.
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated using (true);
drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles for update using (id = auth.uid());

drop policy if exists lists_select on lists;
create policy lists_select on lists for select using (is_list_member(id));
drop policy if exists lists_update on lists;
create policy lists_update on lists for update using (is_list_member(id));
-- Clients may only insert non-personal (shared) lists — the one personal
-- list per user is created exclusively by the handle_new_user trigger,
-- which runs as table owner and therefore bypasses this check anyway.
drop policy if exists lists_insert on lists;
create policy lists_insert on lists for insert with check (owner_id = auth.uid() and not is_personal);
-- No delete policy: deleting a shared list is not supported yet (default
-- deny keeps one member from wiping a list the other still needs).

drop policy if exists list_members_select on list_members;
create policy list_members_select on list_members for select using (is_list_member(list_id));
-- The only direct (non-RPC) way to insert a membership row: inserting
-- yourself into a list you just created. References `lists`, not
-- `list_members` — no recursive policy evaluation.
drop policy if exists list_members_insert_self_on_own_list on list_members;
create policy list_members_insert_self_on_own_list on list_members
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from lists l where l.id = list_id and l.owner_id = auth.uid())
  );
-- Leave a list yourself. Removing another member is not supported yet.
drop policy if exists list_members_delete_self on list_members;
create policy list_members_delete_self on list_members
  for delete using (user_id = auth.uid());

drop policy if exists items_select on items;
create policy items_select on items for select using (is_list_member(list_id));
drop policy if exists items_insert on items;
create policy items_insert on items for insert with check (is_list_member(list_id));
drop policy if exists items_update on items;
create policy items_update on items for update using (is_list_member(list_id));
drop policy if exists items_delete on items;
create policy items_delete on items for delete using (is_list_member(list_id));

-- =========================================================
-- STEP 6: join-by-code RPC (bypasses RLS to resolve code -> list)
-- =========================================================
-- `returns table (list_id uuid)` turns `list_id` into an implicit
-- PL/pgSQL variable for the whole function body, which then collides with
-- the *column* `list_members.list_id` referenced a few lines down
-- ("column reference \"list_id\" is ambiguous"). A plain scalar return
-- avoids introducing that name into scope at all.
drop function if exists join_list_by_code(text);
create or replace function join_list_by_code(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_list_id uuid;
begin
  select id into v_list_id from lists
  where invite_code = upper(trim(p_code)) and not is_personal;
  if v_list_id is null then
    raise exception 'Invalid invite code';
  end if;
  insert into list_members (list_id, user_id)
  values (v_list_id, auth.uid())
  on conflict (list_id, user_id) do nothing;
  return v_list_id;
end $$;

grant execute on function join_list_by_code(text) to authenticated;

-- =========================================================
-- STEP 7: create-shared-list RPC (bypasses RLS for the same reason
-- join_list_by_code does)
-- =========================================================
-- Doing this as two separate client-side inserts (lists, then
-- list_members) has a chicken-and-egg problem: `.insert(...).select()`
-- asks Postgres to RETURN the new row, and RETURNING re-checks it against
-- lists_select's `is_list_member(id)` — which is false because the
-- matching list_members row doesn't exist *yet* (it's the next, separate
-- call). Postgres reports that exactly like a WITH CHECK failure ("new row
-- violates row-level security policy"), even though lists_insert itself
-- allowed the row. A security definer function does both inserts and
-- returns the id without ever going through the caller's RLS at all.
drop function if exists create_shared_list();
create or replace function create_shared_list()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_list_id uuid;
begin
  insert into lists (owner_id, is_personal) values (auth.uid(), false) returning id into v_list_id;
  insert into list_members (list_id, user_id) values (v_list_id, auth.uid());
  return v_list_id;
end $$;

grant execute on function create_shared_list() to authenticated;

-- =========================================================
-- STEP 8: auto-delete a list once its last member leaves
-- =========================================================
-- Leaving is just a client-side `delete from list_members where user_id =
-- auth.uid()` — already allowed by list_members_delete_self, no RPC
-- needed. This trigger is what makes leaving as the last remaining member
-- actually remove the now-empty list (and, via `items.list_id ... on
-- delete cascade`, its items) instead of leaving an orphaned list behind
-- that nobody can ever see again. security definer so it can delete from
-- `lists` regardless of the caller's own RLS (there's deliberately no
-- lists delete policy for anyone).
create or replace function cleanup_empty_list()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from list_members where list_id = old.list_id) then
    delete from lists where id = old.list_id;
  end if;
  return old;
end $$;

drop trigger if exists trg_list_members_cleanup on list_members;
create trigger trg_list_members_cleanup
after delete on list_members
for each row execute function cleanup_empty_list();

-- =========================================================
-- STEP 9: realtime — live-sync shared lists across members
-- =========================================================
-- Adds `items` to Supabase's built-in `supabase_realtime` publication so
-- clients can subscribe to postgres_changes on it (see the "Live sync"
-- effect in App.jsx). Without this, INSERT/UPDATE/DELETE on `items` never
-- reach other members' browsers and they'd need to reload to see changes.
-- RLS still applies to realtime the same as to normal selects, via
-- items_select — a client only ever receives change events for rows it's
-- allowed to read (i.e. lists it's a member of).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'items'
  ) then
    alter publication supabase_realtime add table items;
  end if;
end $$;

-- By default Postgres only puts a table's primary key into the "old row"
-- image it sends out for UPDATE/DELETE (REPLICA IDENTITY DEFAULT) — for
-- `items` that's just `id`, without `list_id`. The live-sync effect's
-- subscription filters on `list_id=eq.${activeListId}`, and that filter is
-- evaluated against the old row for DELETE, so with only `id` present the
-- filter can never match and DELETE events silently never arrive (INSERT
-- and UPDATE are unaffected — those filter on the *new* row, which always
-- has every column). Symptom: adding an item to a shared list shows up
-- live for everyone, but removing one doesn't until the page is reloaded.
-- REPLICA IDENTITY FULL makes the old row image include every column, so
-- the filter has `list_id` to match against on DELETE too.
alter table items replica identity full;

-- Same idea for `list_members`, so the "live sync" effect in useLists.js
-- can pick up someone joining or leaving a shared list (e.g. the
-- "Oleg & Sasha" tab label) without a reload. RLS via list_members_select
-- applies here too — a client only receives change events for lists it's
-- already a member of.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'list_members'
  ) then
    alter publication supabase_realtime add table list_members;
  end if;
end $$;

-- =========================================================
-- LEGACY DATA MIGRATION — run separately, AFTER you've signed up
-- =========================================================
-- Edit v_owner_email below to the address you actually sign up with, then
-- run this block by itself. Safe to re-run (no-ops once items are migrated).
do $$
declare
  v_owner_email text := 'otoporovych2@gmail.com';
  v_owner_id uuid;
  v_legacy_list_id uuid;
begin
  select id into v_owner_id from auth.users where email = v_owner_email;
  if v_owner_id is null then
    raise notice 'No user with email % yet — sign up first, then re-run this block.', v_owner_email;
    return;
  end if;

  if exists (select 1 from items where list_id is null) then
    -- name left null on purpose: like every other shared list, its tab
    -- label is computed client-side from its members' display names (see
    -- useLists.js) — e.g. becomes "You & whoever you invite" once someone
    -- joins, instead of staying stuck as a literal "Legacy Queue".
    insert into lists (owner_id) values (v_owner_id)
    returning id into v_legacy_list_id;

    insert into list_members (list_id, user_id)
    values (v_legacy_list_id, v_owner_id)
    on conflict (list_id, user_id) do nothing;

    update items set list_id = v_legacy_list_id where list_id is null;
  end if;

  -- One-off cleanup for anyone who already ran this block back when it
  -- still hard-coded the name: clears it so the label goes back to being
  -- computed from members, same as any other shared list.
  update lists set name = null where name = 'Legacy Queue' and owner_id = v_owner_id;
end $$;
