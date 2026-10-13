-- ═══════════════════════════════════════════════════════════════
-- 0012 — Le CA d'un événement inclut les participations payées
-- (inscriptions marquées « payé » dans Joueurs inscrits), en plus
-- des billets émis par le circuit commande.
-- ═══════════════════════════════════════════════════════════════
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
  coalesce(r.revenue_cents, 0) + coalesce(p.paid_cents, 0)        as revenue_cents
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
left join lateral (
  select sum(tt.price_cents) as paid_cents
    from public.event_attendees ea
    join public.event_ticket_types tt on tt.id = ea.ticket_type_id
   where ea.event_id = e.id and ea.paid and ea.status <> 'cancelled'
) p on true
where e.deleted_at is null;
alter view public.events_overview set (security_invoker = on);
