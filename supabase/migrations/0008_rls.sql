-- ═══════════════════════════════════════════════════════════════
-- 0008_rls — Row Level Security
-- Principe : tout est fermé par défaut. Le public ne lit que le
-- contenu publié. Les données personnelles et financières ne
-- sortent que pour l'admin ou pour le membre concerné.
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles              enable row level security;
alter table public.contacts              enable row level security;
alter table public.contact_tags          enable row level security;
alter table public.tags                  enable row level security;
alter table public.events                enable row level security;
alter table public.event_ticket_types    enable row level security;
alter table public.event_attendees       enable row level security;
alter table public.tickets               enable row level security;
alter table public.booking_services      enable row level security;
alter table public.booking_availability  enable row level security;
alter table public.booking_blackouts     enable row level security;
alter table public.bookings              enable row level security;
alter table public.products              enable row level security;
alter table public.plans                 enable row level security;
alter table public.orders                enable row level security;
alter table public.order_items           enable row level security;
alter table public.payments              enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.subscriptions         enable row level security;
alter table public.videos                enable row level security;
alter table public.galleries             enable row level security;
alter table public.gallery_items         enable row level security;
alter table public.groups                enable row level security;
alter table public.group_members         enable row level security;
alter table public.group_posts           enable row level security;
alter table public.group_post_comments   enable row level security;
alter table public.cms_collections       enable row level security;
alter table public.cms_entries           enable row level security;
alter table public.contact_messages      enable row level security;

-- ── Administration : accès complet sur tout ───────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','contacts','contact_tags','tags','events','event_ticket_types',
    'event_attendees','tickets','booking_services','booking_availability',
    'booking_blackouts','bookings','products','plans','orders','order_items',
    'payments','payment_webhook_events','subscriptions','videos','galleries',
    'gallery_items','groups','group_members','group_posts','group_post_comments',
    'cms_collections','cms_entries','contact_messages'
  ] loop
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format(
      'create policy admin_all on public.%I for all to authenticated
         using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- ── Lecture publique : uniquement le contenu publié ───────────
drop policy if exists public_read on public.events;
create policy public_read on public.events for select to anon, authenticated
  using (status = 'published' and deleted_at is null);

drop policy if exists public_read on public.event_ticket_types;
create policy public_read on public.event_ticket_types for select to anon, authenticated
  using (exists (select 1 from public.events e
                  where e.id = event_id and e.status = 'published' and e.deleted_at is null));

drop policy if exists public_read on public.products;
create policy public_read on public.products for select to anon, authenticated
  using (is_active and deleted_at is null);

drop policy if exists public_read on public.plans;
create policy public_read on public.plans for select to anon, authenticated
  using (is_active and deleted_at is null);

drop policy if exists public_read on public.booking_services;
create policy public_read on public.booking_services for select to anon, authenticated
  using (is_active and deleted_at is null);

drop policy if exists public_read on public.booking_availability;
create policy public_read on public.booking_availability for select to anon, authenticated
  using (exists (select 1 from public.booking_services s
                  where s.id = service_id and s.is_active and s.deleted_at is null));

drop policy if exists public_read on public.videos;
create policy public_read on public.videos for select to anon, authenticated
  using (status = 'published' and is_public and deleted_at is null);

drop policy if exists public_read on public.galleries;
create policy public_read on public.galleries for select to anon, authenticated
  using (status = 'published' and deleted_at is null);

drop policy if exists public_read on public.gallery_items;
create policy public_read on public.gallery_items for select to anon, authenticated
  using (exists (select 1 from public.galleries g
                  where g.id = gallery_id and g.status = 'published' and g.deleted_at is null));

drop policy if exists public_read on public.cms_collections;
create policy public_read on public.cms_collections for select to anon, authenticated using (true);

drop policy if exists public_read on public.cms_entries;
create policy public_read on public.cms_entries for select to anon, authenticated
  using (status = 'published' and deleted_at is null);

drop policy if exists public_read on public.groups;
create policy public_read on public.groups for select to anon, authenticated
  using (visibility = 'public' and status = 'published' and deleted_at is null);

drop policy if exists public_read on public.tags;
create policy public_read on public.tags for select to anon, authenticated using (true);

-- ── Espace membre : chacun voit ses propres données ───────────
drop policy if exists own_profile on public.profiles;
create policy own_profile on public.profiles for select to authenticated
  using (id = auth.uid());

drop policy if exists own_contact on public.contacts;
create policy own_contact on public.contacts for select to authenticated
  using (user_id = auth.uid() and deleted_at is null);

drop policy if exists own_rows on public.orders;
create policy own_rows on public.orders for select to authenticated
  using (contact_id = public.my_contact_id());

drop policy if exists own_rows on public.order_items;
create policy own_rows on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o
                  where o.id = order_id and o.contact_id = public.my_contact_id()));

drop policy if exists own_rows on public.payments;
create policy own_rows on public.payments for select to authenticated
  using (contact_id = public.my_contact_id());

drop policy if exists own_rows on public.tickets;
create policy own_rows on public.tickets for select to authenticated
  using (contact_id = public.my_contact_id());

drop policy if exists own_rows on public.bookings;
create policy own_rows on public.bookings for select to authenticated
  using (contact_id = public.my_contact_id());

drop policy if exists own_rows on public.subscriptions;
create policy own_rows on public.subscriptions for select to authenticated
  using (contact_id = public.my_contact_id());

drop policy if exists own_rows on public.event_attendees;
create policy own_rows on public.event_attendees for select to authenticated
  using (contact_id = public.my_contact_id());

-- ── Groupes : les membres voient leur groupe et son fil ───────
drop policy if exists member_read on public.groups;
create policy member_read on public.groups for select to authenticated
  using (exists (select 1 from public.group_members m
                  where m.group_id = id and m.contact_id = public.my_contact_id()));

drop policy if exists member_read on public.group_members;
create policy member_read on public.group_members for select to authenticated
  using (exists (select 1 from public.group_members m
                  where m.group_id = group_members.group_id and m.contact_id = public.my_contact_id()));

drop policy if exists member_read on public.group_posts;
create policy member_read on public.group_posts for select to authenticated
  using (deleted_at is null and exists (
    select 1 from public.group_members m
     where m.group_id = group_posts.group_id and m.contact_id = public.my_contact_id()));

drop policy if exists member_write on public.group_posts;
create policy member_write on public.group_posts for insert to authenticated
  with check (author_contact_id = public.my_contact_id() and exists (
    select 1 from public.group_members m
     where m.group_id = group_posts.group_id and m.contact_id = public.my_contact_id()));

drop policy if exists member_read on public.group_post_comments;
create policy member_read on public.group_post_comments for select to authenticated
  using (deleted_at is null and exists (
    select 1 from public.group_posts p
      join public.group_members m on m.group_id = p.group_id
     where p.id = post_id and m.contact_id = public.my_contact_id()));

-- ── Formulaire de contact : dépôt public, lecture admin ───────
drop policy if exists public_insert on public.contact_messages;
create policy public_insert on public.contact_messages for insert to anon, authenticated
  with check (true);

-- ── Webhooks : jamais exposés au navigateur ───────────────────
-- Aucune policy `anon`/`authenticated` : seule la clé service_role
-- (fonction serverless Vercel) peut écrire dans cette table.

-- ── Vues : héritent de la RLS des tables sous-jacentes ────────
alter view public.events_overview    set (security_invoker = on);
alter view public.contacts_overview  set (security_invoker = on);
alter view public.contact_timeline   set (security_invoker = on);
alter view public.orders_overview    set (security_invoker = on);
alter view public.bookings_overview  set (security_invoker = on);
alter view public.catalog_view       set (security_invoker = on);
alter view public.dashboard_stats    set (security_invoker = on);
