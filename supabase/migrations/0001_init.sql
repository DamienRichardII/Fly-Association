-- ═══════════════════════════════════════════════════════════════
-- 0001_init — extensions, types partagés, helpers, rôles
-- Le Fly Association · back-office
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- emails insensibles à la casse
create extension if not exists btree_gist; -- contraintes EXCLUDE sur plages

-- ── Types partagés ────────────────────────────────────────────
do $$ begin
  create type app_role          as enum ('admin','staff','member');
  create type publish_status    as enum ('draft','published');
  create type event_kind        as enum ('ticketed','rsvp');
  create type event_status      as enum ('draft','published','cancelled','completed');
  create type location_type     as enum ('onsite','online');
  create type attendee_status   as enum ('registered','confirmed','cancelled','attended','no_show');
  create type ticket_status     as enum ('valid','used','cancelled','refunded');
  create type booking_status    as enum ('pending','confirmed','cancelled','completed');
  create type order_status      as enum ('draft','pending','confirmed','completed','cancelled');
  create type payment_status    as enum ('pending','paid','failed','refunded','cancelled');
  create type subscription_status as enum ('pending','active','expired','cancelled');
  create type plan_period       as enum ('one_time','weekly','monthly','yearly');
  create type catalog_kind      as enum ('product','booking_service','plan');
  create type order_item_kind   as enum ('product','event_ticket','booking_service','plan');
  create type media_source      as enum ('upload','url','youtube','vimeo');
  create type group_visibility  as enum ('public','private','secret');
exception when duplicate_object then null; end $$;

-- ── updated_at automatique ────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── Profils (adossés à auth.users) ────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       citext not null,
  full_name   text,
  role        app_role not null default 'member',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists profiles_role_idx on public.profiles(role);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Création automatique du profil à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Helpers d'autorisation (utilisés par toutes les policies) ──
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','staff')
  );
$$;
