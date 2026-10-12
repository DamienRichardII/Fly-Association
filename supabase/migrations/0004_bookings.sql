-- ═══════════════════════════════════════════════════════════════
-- 0004_bookings — Services réservables et agenda
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.booking_services (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  slug             text not null unique,
  description      text,
  image_url        text,
  duration_minutes integer not null check (duration_minutes between 5 and 1440),
  price_cents      integer not null default 0 check (price_cents >= 0),
  currency         char(3) not null default 'EUR',
  staff_name       text,
  location         text,
  capacity         integer not null default 1 check (capacity > 0),
  buffer_minutes   integer not null default 0 check (buffer_minutes >= 0),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index if not exists services_active_idx on public.booking_services (is_active) where deleted_at is null;

drop trigger if exists services_set_updated_at on public.booking_services;
create trigger services_set_updated_at before update on public.booking_services
  for each row execute function public.set_updated_at();

-- ── Disponibilités hebdomadaires récurrentes ──────────────────
create table if not exists public.booking_availability (
  id         uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.booking_services(id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),   -- 0 = dimanche
  start_time time not null,
  end_time   time not null,
  constraint availability_window_ok check (end_time > start_time)
);
create index if not exists availability_service_idx on public.booking_availability (service_id, weekday);

-- ── Fermetures exceptionnelles (vacances, jours fériés…) ──────
create table if not exists public.booking_blackouts (
  id         uuid primary key default gen_random_uuid(),
  service_id uuid references public.booking_services(id) on delete cascade, -- null = tous les services
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text,
  constraint blackout_window_ok check (ends_at > starts_at)
);
create index if not exists blackouts_range_idx on public.booking_blackouts (starts_at, ends_at);

-- ── Réservations ──────────────────────────────────────────────
create table if not exists public.bookings (
  id           uuid primary key default gen_random_uuid(),
  service_id   uuid not null references public.booking_services(id) on delete restrict,
  contact_id   uuid not null references public.contacts(id) on delete restrict,
  order_id     uuid,                                   -- FK ajoutée en 0005
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  status       booking_status not null default 'pending',
  party_size   integer not null default 1 check (party_size > 0),
  notes        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint bookings_window_ok check (ends_at > starts_at)
);
create index if not exists bookings_service_time_idx on public.bookings (service_id, starts_at);
create index if not exists bookings_contact_idx      on public.bookings (contact_id);
create index if not exists bookings_status_idx       on public.bookings (status, starts_at);

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

-- ── Contrôle de capacité côté serveur ─────────────────────────
-- Empêche toute sur-réservation, y compris via un appel API direct.
create or replace function public.check_booking_capacity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_capacity integer; v_taken integer;
begin
  if new.status in ('cancelled') then return new; end if;

  select capacity into v_capacity
    from public.booking_services where id = new.service_id;

  select coalesce(sum(party_size), 0) into v_taken
    from public.bookings
   where service_id = new.service_id
     and status in ('pending','confirmed','completed')
     and id <> new.id
     and tstzrange(starts_at, ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)');

  if v_taken + new.party_size > v_capacity then
    raise exception 'Capacité dépassée pour ce créneau (% / %)', v_taken + new.party_size, v_capacity
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.booking_blackouts b
     where (b.service_id = new.service_id or b.service_id is null)
       and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception 'Créneau indisponible (fermeture exceptionnelle)'
      using errcode = 'check_violation';
  end if;

  perform public.touch_contact(new.contact_id);
  return new;
end $$;

drop trigger if exists bookings_check_capacity on public.bookings;
create trigger bookings_check_capacity before insert or update on public.bookings
  for each row execute function public.check_booking_capacity();
