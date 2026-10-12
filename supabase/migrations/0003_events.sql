-- ═══════════════════════════════════════════════════════════════
-- 0003_events — Événements, billetterie, participants
-- Règle : rien n'est supprimé après l'événement. L'historique
-- (inscrits, billets, acheteurs, CA) reste consultable.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.events (
  id                uuid primary key default gen_random_uuid(),
  kind              event_kind   not null,            -- billetterie | RSVP
  status            event_status not null default 'draft',
  title             text not null,
  slug              text not null unique,
  short_description text,
  description       text,
  cover_url         text,
  category          text,
  organizer         text,
  start_at          timestamptz not null,
  end_at            timestamptz,
  timezone          text not null default 'Europe/Paris',
  recurrence_rule   text,                              -- RRULE iCal, null si non récurrent
  location_type     location_type not null default 'onsite',
  venue_name        text,
  address_line      text,
  city              text,
  postal_code       text,
  access_info       text,
  online_url        text,
  capacity          integer check (capacity is null or capacity > 0),
  published_at      timestamptz,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint events_dates_ok    check (end_at is null or end_at >= start_at),
  constraint events_location_ok check (
    (location_type = 'online'  and online_url is not null) or
    (location_type = 'onsite'  and (city is not null or venue_name is not null)) or
    status = 'draft'                                    -- un brouillon peut rester incomplet
  )
);
create index if not exists events_status_idx on public.events (status) where deleted_at is null;
create index if not exists events_start_idx  on public.events (start_at desc);
create index if not exists events_kind_idx   on public.events (kind);

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at before update on public.events
  for each row execute function public.set_updated_at();

-- ── Catégories de billets ─────────────────────────────────────
create table if not exists public.event_ticket_types (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  name            text not null,
  description     text,
  is_free         boolean not null default false,
  price_cents     integer not null default 0 check (price_cents >= 0),
  currency        char(3) not null default 'EUR',
  quantity_total  integer check (quantity_total is null or quantity_total > 0),
  quantity_sold   integer not null default 0 check (quantity_sold >= 0),
  max_per_order   integer not null default 10 check (max_per_order > 0),
  sales_start_at  timestamptz,
  sales_end_at    timestamptz,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint ticket_price_ok check (
    (is_free and price_cents = 0) or (not is_free and price_cents > 0)
  ),
  constraint ticket_stock_ok check (
    quantity_total is null or quantity_sold <= quantity_total
  ),
  constraint ticket_sales_window_ok check (
    sales_end_at is null or sales_start_at is null or sales_end_at >= sales_start_at
  )
);
create index if not exists ticket_types_event_idx on public.event_ticket_types (event_id, position);

drop trigger if exists ticket_types_set_updated_at on public.event_ticket_types;
create trigger ticket_types_set_updated_at before update on public.event_ticket_types
  for each row execute function public.set_updated_at();

-- ── Inscrits / RSVP ───────────────────────────────────────────
create table if not exists public.event_attendees (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  contact_id    uuid not null references public.contacts(id) on delete restrict,
  status        attendee_status not null default 'registered',
  answers       jsonb not null default '{}'::jsonb,   -- réponses du formulaire RSVP
  registered_at timestamptz not null default now(),
  checked_in_at timestamptz,
  unique (event_id, contact_id)
);
create index if not exists attendees_event_idx   on public.event_attendees (event_id, status);
create index if not exists attendees_contact_idx on public.event_attendees (contact_id);

-- ── Billets émis ──────────────────────────────────────────────
create table if not exists public.tickets (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete restrict,
  ticket_type_id uuid not null references public.event_ticket_types(id) on delete restrict,
  order_item_id  uuid,                                 -- FK ajoutée en 0005
  contact_id     uuid not null references public.contacts(id) on delete restrict,
  code           text not null unique default encode(gen_random_bytes(6),'hex'),
  status         ticket_status not null default 'valid',
  holder_name    text,
  issued_at      timestamptz not null default now(),
  used_at        timestamptz
);
create index if not exists tickets_event_idx   on public.tickets (event_id, status);
create index if not exists tickets_contact_idx on public.tickets (contact_id);
create index if not exists tickets_type_idx    on public.tickets (ticket_type_id);

-- ── Stock de billets tenu par la base, jamais par le client ───
create or replace function public.sync_ticket_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_type uuid;
begin
  v_type := coalesce(new.ticket_type_id, old.ticket_type_id);
  update public.event_ticket_types t
     set quantity_sold = (
       select count(*) from public.tickets k
        where k.ticket_type_id = t.id and k.status in ('valid','used')
     )
   where t.id = v_type;
  if new.contact_id is not null then
    perform public.touch_contact(new.contact_id);
  end if;
  return null;
end $$;

drop trigger if exists tickets_sync_stock on public.tickets;
create trigger tickets_sync_stock after insert or update or delete on public.tickets
  for each row execute function public.sync_ticket_stock();

-- ── Vue : état effectif d'un événement + compteurs ────────────
-- "Passé" est calculé, jamais stocké : aucun cron, aucune dérive.
create or replace view public.events_overview as
select
  e.*,
  case
    when e.status = 'cancelled' then 'cancelled'
    when e.status = 'draft'     then 'draft'
    when coalesce(e.end_at, e.start_at) < now() then 'past'
    else 'published'
  end                                                             as effective_state,
  coalesce(t.tickets_sold, 0)                                     as tickets_sold,
  coalesce(t.tickets_available, 0)                                as tickets_available,
  coalesce(a.attendees_count, 0)                                  as attendees_count,
  coalesce(r.revenue_cents, 0)                                    as revenue_cents
from public.events e
left join lateral (
  select sum(tt.quantity_sold)                                    as tickets_sold,
         sum(coalesce(tt.quantity_total, 0) - tt.quantity_sold)   as tickets_available
    from public.event_ticket_types tt where tt.event_id = e.id
) t on true
left join lateral (
  select count(*) as attendees_count
    from public.event_attendees ea where ea.event_id = e.id and ea.status <> 'cancelled'
) a on true
left join lateral (
  select sum(tt.price_cents) as revenue_cents
    from public.tickets k
    join public.event_ticket_types tt on tt.id = k.ticket_type_id
   where k.event_id = e.id and k.status in ('valid','used')
) r on true
where e.deleted_at is null;
