-- ═══════════════════════════════════════════════════════════════
-- 0005_commerce — Catalogue, commandes, paiements, abonnements
-- Le prix facturé vient TOUJOURS de la base, jamais du client.
-- ═══════════════════════════════════════════════════════════════

-- ── Produits ──────────────────────────────────────────────────
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  image_url   text,
  price_cents integer not null check (price_cents >= 0),
  currency    char(3) not null default 'EUR',
  stock       integer check (stock is null or stock >= 0),  -- null = illimité
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- ── Formules / abonnements ────────────────────────────────────
create table if not exists public.plans (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  price_cents integer not null check (price_cents >= 0),
  currency    char(3) not null default 'EUR',
  period      plan_period not null,
  benefits    text[] not null default '{}',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at before update on public.plans
  for each row execute function public.set_updated_at();

-- ── Vue catalogue : interface commune, logiques métier séparées ─
create or replace view public.catalog_view as
  select 'product'::catalog_kind as kind, id, name, slug, description, image_url,
         price_cents, currency, is_active, null::integer as duration_minutes,
         null::plan_period as period, created_at
    from public.products where deleted_at is null
  union all
  select 'booking_service', id, name, slug, description, image_url,
         price_cents, currency, is_active, duration_minutes, null, created_at
    from public.booking_services where deleted_at is null
  union all
  select 'plan', id, name, slug, description, null,
         price_cents, currency, is_active, null, period, created_at
    from public.plans where deleted_at is null;

-- ── Commandes ─────────────────────────────────────────────────
create sequence if not exists public.order_number_seq start 1000;

create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  order_number   text not null unique default 'FLY-' || lpad(nextval('public.order_number_seq')::text, 6, '0'),
  contact_id     uuid not null references public.contacts(id) on delete restrict,
  status         order_status not null default 'pending',
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  total_cents    integer not null default 0 check (total_cents >= 0),
  currency       char(3) not null default 'EUR',
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  cancelled_at   timestamptz
);
create index if not exists orders_contact_idx on public.orders (contact_id);
create index if not exists orders_status_idx  on public.orders (status, created_at desc);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- ── Lignes de commande (prix figé à l'achat) ──────────────────
create table if not exists public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id) on delete cascade,
  kind             order_item_kind not null,
  product_id       uuid references public.products(id) on delete restrict,
  ticket_type_id   uuid references public.event_ticket_types(id) on delete restrict,
  service_id       uuid references public.booking_services(id) on delete restrict,
  plan_id          uuid references public.plans(id) on delete restrict,
  label            text not null,                       -- libellé figé
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity         integer not null default 1 check (quantity > 0),
  total_cents      integer not null check (total_cents >= 0),
  constraint order_item_one_target check (
    num_nonnulls(product_id, ticket_type_id, service_id, plan_id) = 1
  )
);
create index if not exists order_items_order_idx on public.order_items (order_id);

alter table public.tickets
  drop constraint if exists tickets_order_item_fk,
  add  constraint tickets_order_item_fk
       foreign key (order_item_id) references public.order_items(id) on delete set null;

alter table public.bookings
  drop constraint if exists bookings_order_fk,
  add  constraint bookings_order_fk
       foreign key (order_id) references public.orders(id) on delete set null;

-- Totaux recalculés par la base à chaque mouvement de ligne
create or replace function public.recalc_order_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_order uuid;
begin
  v_order := coalesce(new.order_id, old.order_id);
  update public.orders o
     set subtotal_cents = coalesce((select sum(total_cents) from public.order_items where order_id = o.id), 0),
         total_cents    = greatest(coalesce((select sum(total_cents) from public.order_items where order_id = o.id), 0) - o.discount_cents, 0)
   where o.id = v_order;
  return null;
end $$;

drop trigger if exists order_items_recalc on public.order_items;
create trigger order_items_recalc after insert or update or delete on public.order_items
  for each row execute function public.recalc_order_totals();

-- ── Abonnements ───────────────────────────────────────────────
create table if not exists public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  contact_id              uuid not null references public.contacts(id) on delete restrict,
  plan_id                 uuid not null references public.plans(id) on delete restrict,
  status                  subscription_status not null default 'pending',
  started_at              timestamptz,
  current_period_end      timestamptz,
  renews_at               timestamptz,
  ended_at                timestamptz,
  cancel_at_period_end    boolean not null default false,
  provider                text,
  provider_subscription_id text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);
create index if not exists subscriptions_contact_idx on public.subscriptions (contact_id);
create index if not exists subscriptions_status_idx  on public.subscriptions (status, renews_at);

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ═══ PAIEMENTS — couche indépendante du prestataire ═══════════
-- `provider` reste libre ('stripe', 'helloasso', 'manual'…).
-- Aucun paiement n'est validé depuis le frontend : seule une
-- écriture serveur (webhook signé) peut passer le statut à 'paid'.
create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid references public.orders(id) on delete set null,
  subscription_id     uuid references public.subscriptions(id) on delete set null,
  contact_id          uuid not null references public.contacts(id) on delete restrict,
  provider            text not null default 'manual',
  provider_payment_id text,
  provider_session_id text,
  amount_cents        integer not null check (amount_cents >= 0),
  currency            char(3) not null default 'EUR',
  status              payment_status not null default 'pending',
  failure_reason      text,
  paid_at             timestamptz,
  failed_at           timestamptz,
  refunded_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (provider, provider_payment_id)
);
create index if not exists payments_order_idx   on public.payments (order_id);
create index if not exists payments_contact_idx on public.payments (contact_id);
create index if not exists payments_status_idx  on public.payments (status, created_at desc);

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- Journal des webhooks : idempotence, un événement n'est traité qu'une fois
create table if not exists public.payment_webhook_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null,
  event_id     text not null,
  event_type   text,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text,
  unique (provider, event_id)
);

-- Un paiement encaissé fait avancer la commande et le contact
create or replace function public.on_payment_paid()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and coalesce(old.status, 'pending') <> 'paid' then
    if new.order_id is not null then
      update public.orders set status = 'confirmed' where id = new.order_id and status in ('draft','pending');
    end if;
    if new.subscription_id is not null then
      update public.subscriptions set status = 'active', started_at = coalesce(started_at, now())
       where id = new.subscription_id;
    end if;
    perform public.touch_contact(new.contact_id);
  end if;
  return new;
end $$;

drop trigger if exists payments_on_paid on public.payments;
create trigger payments_on_paid after insert or update of status on public.payments
  for each row execute function public.on_payment_paid();
