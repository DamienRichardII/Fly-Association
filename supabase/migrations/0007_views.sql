-- ═══════════════════════════════════════════════════════════════
-- 0007_views — Vues transverses : c'est ici que les modules
-- cessent d'être des applications séparées.
-- ═══════════════════════════════════════════════════════════════

-- ── Historique unifié d'un contact ────────────────────────────
-- Une seule requête alimente la fiche CRM : réservations,
-- billets, commandes, paiements, abonnements, groupes.
create or replace view public.contact_timeline as
  select b.contact_id, 'booking'::text as kind, b.id as ref_id,
         s.name as label, b.status::text as status, null::integer as amount_cents,
         b.starts_at as happened_at
    from public.bookings b join public.booking_services s on s.id = b.service_id
  union all
  select k.contact_id, 'ticket', k.id,
         e.title, k.status::text, tt.price_cents, k.issued_at
    from public.tickets k
    join public.events e on e.id = k.event_id
    join public.event_ticket_types tt on tt.id = k.ticket_type_id
  union all
  select a.contact_id, 'event_registration', a.id,
         e.title, a.status::text, null, a.registered_at
    from public.event_attendees a join public.events e on e.id = a.event_id
  union all
  select o.contact_id, 'order', o.id,
         o.order_number, o.status::text, o.total_cents, o.created_at
    from public.orders o
  union all
  select p.contact_id, 'payment', p.id,
         coalesce(p.provider, 'manuel'), p.status::text, p.amount_cents, p.created_at
    from public.payments p
  union all
  select s.contact_id, 'subscription', s.id,
         pl.name, s.status::text, pl.price_cents, s.created_at
    from public.subscriptions s join public.plans pl on pl.id = s.plan_id
  union all
  select gm.contact_id, 'group', g.id,
         g.name, 'member', null, gm.joined_at
    from public.group_members gm join public.groups g on g.id = gm.group_id;

-- ── Fiche CRM enrichie ────────────────────────────────────────
create or replace view public.contacts_overview as
select
  c.*,
  trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,''))      as full_name,
  coalesce(t.tags, '{}')                                                  as tags,
  coalesce(s.orders_count, 0)                                             as orders_count,
  coalesce(s.tickets_count, 0)                                            as tickets_count,
  coalesce(s.bookings_count, 0)                                           as bookings_count,
  coalesce(s.lifetime_value_cents, 0)                                     as lifetime_value_cents
from public.contacts c
left join lateral (
  select array_agg(tag order by tag) as tags
    from public.contact_tags where contact_id = c.id
) t on true
left join lateral (
  select
    (select count(*) from public.orders   where contact_id = c.id and status <> 'cancelled') as orders_count,
    (select count(*) from public.tickets  where contact_id = c.id and status in ('valid','used')) as tickets_count,
    (select count(*) from public.bookings where contact_id = c.id and status <> 'cancelled') as bookings_count,
    (select coalesce(sum(amount_cents), 0) from public.payments
      where contact_id = c.id and status = 'paid')                                          as lifetime_value_cents
) s on true
where c.deleted_at is null;

-- ── Commandes enrichies (liste "Ventes / Commandes") ──────────
create or replace view public.orders_overview as
select
  o.*,
  trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,''))      as customer_name,
  c.email                                                                 as customer_email,
  coalesce(i.items_count, 0)                                              as items_count,
  i.items_label,
  coalesce(p.paid_cents, 0)                                               as paid_cents,
  case
    when coalesce(p.paid_cents, 0) >= o.total_cents and o.total_cents > 0 then 'paid'
    when coalesce(p.paid_cents, 0) > 0                                    then 'partial'
    when exists (select 1 from public.payments where order_id = o.id and status = 'failed') then 'failed'
    else 'pending'
  end                                                                     as payment_state
from public.orders o
join public.contacts c on c.id = o.contact_id
left join lateral (
  select count(*) as items_count, string_agg(label, ' · ' order by label) as items_label
    from public.order_items where order_id = o.id
) i on true
left join lateral (
  select sum(amount_cents) as paid_cents
    from public.payments where order_id = o.id and status = 'paid'
) p on true;

-- ── Réservations enrichies (agenda) ───────────────────────────
create or replace view public.bookings_overview as
select
  b.*,
  s.name      as service_name,
  s.duration_minutes,
  s.price_cents,
  trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) as customer_name,
  c.email     as customer_email,
  c.phone     as customer_phone
from public.bookings b
join public.booking_services s on s.id = b.service_id
join public.contacts c         on c.id = b.contact_id;

-- ── Chiffres du tableau de bord ───────────────────────────────
create or replace view public.dashboard_stats as
select
  (select count(*) from public.events where deleted_at is null
     and status = 'published' and coalesce(end_at, start_at) >= now())          as upcoming_events,
  (select count(*) from public.tickets where status in ('valid','used'))         as tickets_sold,
  (select count(*) from public.bookings
     where status in ('pending','confirmed') and starts_at >= now())             as upcoming_bookings,
  (select count(*) from public.contacts where deleted_at is null)                as contacts_total,
  (select count(*) from public.contacts where deleted_at is null
     and created_at >= now() - interval '30 days')                               as contacts_last_30d,
  (select coalesce(sum(amount_cents), 0) from public.payments
     where status = 'paid')                                                      as revenue_total_cents,
  (select coalesce(sum(amount_cents), 0) from public.payments
     where status = 'paid' and paid_at >= date_trunc('month', now()))            as revenue_month_cents,
  (select count(*) from public.subscriptions where status = 'active')            as active_subscriptions,
  (select count(*) from public.orders where status = 'pending')                  as pending_orders,
  (select count(*) from public.contact_messages where handled = false)           as unread_messages;
