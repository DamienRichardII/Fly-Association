-- ═══════════════════════════════════════════════════════════════
-- 0011_repair_and_contact — Rattrapage + formulaire de contact
--  · admin_set_contact_tags / admin_merge_contacts (définies dans 0009
--    mais absentes de la base en production)
--  · admin_save_event, versionnée ici
--  · submit_contact_message : formulaire de contact du site → CRM
-- ═══════════════════════════════════════════════════════════════

-- ── Tags : ajouter / retirer ───────────────────────────────────
create or replace function public.admin_set_contact_tags(p_contact_id uuid, p_tags text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Accès refusé' using errcode = '42501'; end if;

  delete from public.contact_tags
   where contact_id = p_contact_id and tag <> all(coalesce(p_tags, '{}'));

  insert into public.contact_tags (contact_id, tag)
    select p_contact_id, t from unnest(coalesce(p_tags, '{}')) as t
  on conflict (contact_id, tag) do nothing;
end $$;

-- ── Fusion de doublons ─────────────────────────────────────────
-- Toutes les lignes liées basculent sur le contact conservé ;
-- le doublon devient une fiche supprimée (traçabilité conservée).
-- Règle §10 : ne jamais perdre d'historique en fusionnant.
create or replace function public.admin_merge_contacts(p_keep_id uuid, p_merge_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Accès refusé' using errcode = '42501'; end if;
  if p_keep_id = p_merge_id then raise exception 'Impossible de fusionner un contact avec lui-même'; end if;
  if not exists (select 1 from public.contacts where id = p_keep_id and deleted_at is null) then
    raise exception 'Contact à conserver introuvable';
  end if;
  if not exists (select 1 from public.contacts where id = p_merge_id and deleted_at is null) then
    raise exception 'Contact à fusionner introuvable';
  end if;

  update public.event_attendees set contact_id = p_keep_id where contact_id = p_merge_id
    and not exists (select 1 from public.event_attendees e2
                      where e2.event_id = event_attendees.event_id and e2.contact_id = p_keep_id);
  delete from public.event_attendees where contact_id = p_merge_id;  -- doublons restants

  update public.tickets              set contact_id = p_keep_id where contact_id = p_merge_id;
  update public.bookings             set contact_id = p_keep_id where contact_id = p_merge_id;
  update public.orders               set contact_id = p_keep_id where contact_id = p_merge_id;
  update public.payments             set contact_id = p_keep_id where contact_id = p_merge_id;
  update public.subscriptions        set contact_id = p_keep_id where contact_id = p_merge_id;
  update public.contact_messages     set contact_id = p_keep_id where contact_id = p_merge_id;

  update public.group_members set contact_id = p_keep_id where contact_id = p_merge_id
    and not exists (select 1 from public.group_members g2
                      where g2.group_id = group_members.group_id and g2.contact_id = p_keep_id);
  delete from public.group_members where contact_id = p_merge_id;

  update public.group_posts          set author_contact_id = p_keep_id where author_contact_id = p_merge_id;
  update public.group_post_comments  set author_contact_id = p_keep_id where author_contact_id = p_merge_id;

  insert into public.contact_tags (contact_id, tag)
    select p_keep_id, tag from public.contact_tags where contact_id = p_merge_id
  on conflict (contact_id, tag) do nothing;
  delete from public.contact_tags where contact_id = p_merge_id;

  -- Complète les champs vides du contact conservé avec ceux du doublon
  update public.contacts k set
    first_name   = coalesce(k.first_name, m.first_name),
    last_name    = coalesce(k.last_name, m.last_name),
    phone        = coalesce(k.phone, m.phone),
    address_line = coalesce(k.address_line, m.address_line),
    postal_code  = coalesce(k.postal_code, m.postal_code),
    city         = coalesce(k.city, m.city),
    notes        = case when m.notes is null or m.notes = '' then k.notes
                        when k.notes is null or k.notes = '' then m.notes
                        else k.notes || E'\n---\n' || m.notes end,
    last_activity_at = greatest(k.last_activity_at, m.last_activity_at)
  from public.contacts m
  where k.id = p_keep_id and m.id = p_merge_id;

  update public.contacts
     set deleted_at = now(),
         email = null,  -- libère l'email pour respecter l'unicité sur les fiches actives
         notes = coalesce(notes,'') || E'\nFusionné dans ' || p_keep_id::text
   where id = p_merge_id;
end $$;

-- ── Événements : écriture depuis l'assistant (versionnée ici ; créée
--    à l'origine directement dans Supabase) ───────────────────
create or replace function public.admin_save_event(p_id uuid, p_event jsonb, p_tickets jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_slug text;
  v_status event_status;
  v_kind event_kind;
  t jsonb;
  v_pos integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  v_status := coalesce(nullif(p_event->>'status',''), 'draft')::event_status;
  v_kind   := (p_event->>'kind')::event_kind;
  v_slug   := nullif(p_event->>'slug','');

  if p_id is null then
    if v_slug is null then v_slug := 'evenement'; end if;
    if exists (select 1 from public.events where slug = v_slug) then
      v_slug := v_slug || '-' || substr(md5(random()::text), 1, 5);
    end if;

    insert into public.events (kind, status, title, slug, short_description, description,
      cover_url, category, organizer, start_at, end_at, location_type, venue_name,
      address_line, city, postal_code, access_info, online_url, capacity, published_at, created_by)
    values (v_kind, v_status, p_event->>'title', v_slug,
      nullif(p_event->>'short_description',''), nullif(p_event->>'description',''),
      nullif(p_event->>'cover_url',''), nullif(p_event->>'category',''),
      coalesce(nullif(p_event->>'organizer',''), 'Le Fly Association'),
      (p_event->>'start_at')::timestamptz, nullif(p_event->>'end_at','')::timestamptz,
      coalesce(nullif(p_event->>'location_type',''), 'onsite')::location_type,
      nullif(p_event->>'venue_name',''), nullif(p_event->>'address_line',''),
      nullif(p_event->>'city',''), nullif(p_event->>'postal_code',''),
      nullif(p_event->>'access_info',''), nullif(p_event->>'online_url',''),
      nullif(p_event->>'capacity','')::integer,
      case when v_status = 'published' then now() end, auth.uid())
    returning id into v_id;
  else
    update public.events set
      kind = v_kind, status = v_status, title = p_event->>'title',
      short_description = nullif(p_event->>'short_description',''),
      description = nullif(p_event->>'description',''),
      cover_url = nullif(p_event->>'cover_url',''),
      category = nullif(p_event->>'category',''),
      organizer = coalesce(nullif(p_event->>'organizer',''), 'Le Fly Association'),
      start_at = (p_event->>'start_at')::timestamptz,
      end_at = nullif(p_event->>'end_at','')::timestamptz,
      location_type = coalesce(nullif(p_event->>'location_type',''), 'onsite')::location_type,
      venue_name = nullif(p_event->>'venue_name',''),
      address_line = nullif(p_event->>'address_line',''),
      city = nullif(p_event->>'city',''),
      postal_code = nullif(p_event->>'postal_code',''),
      access_info = nullif(p_event->>'access_info',''),
      online_url = nullif(p_event->>'online_url',''),
      capacity = nullif(p_event->>'capacity','')::integer,
      published_at = case when v_status = 'published' then coalesce(published_at, now()) else published_at end
    where id = p_id and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'Événement introuvable' using errcode = 'no_data_found';
    end if;
  end if;

  if v_kind = 'ticketed' then
    for t in select * from jsonb_array_elements(coalesce(p_tickets, '[]'::jsonb)) loop
      v_pos := v_pos + 1;
      if nullif(t->>'id','') is null then
        insert into public.event_ticket_types (event_id, name, description, is_free, price_cents,
          quantity_total, max_per_order, sales_start_at, sales_end_at, position)
        values (v_id, t->>'name', nullif(t->>'description',''),
          coalesce((t->>'is_free')::boolean, false), coalesce((t->>'price_cents')::integer, 0),
          nullif(t->>'quantity_total','')::integer, coalesce(nullif(t->>'max_per_order','')::integer, 10),
          nullif(t->>'sales_start_at','')::timestamptz, nullif(t->>'sales_end_at','')::timestamptz, v_pos);
      else
        update public.event_ticket_types set
          name = t->>'name', description = nullif(t->>'description',''),
          is_free = coalesce((t->>'is_free')::boolean, false),
          price_cents = coalesce((t->>'price_cents')::integer, 0),
          quantity_total = nullif(t->>'quantity_total','')::integer,
          max_per_order = coalesce(nullif(t->>'max_per_order','')::integer, 10),
          sales_start_at = nullif(t->>'sales_start_at','')::timestamptz,
          sales_end_at = nullif(t->>'sales_end_at','')::timestamptz,
          position = v_pos
        where id = (t->>'id')::uuid and event_id = v_id;
      end if;
    end loop;
  end if;

  return v_id;
end $$;

-- ── Formulaire de contact du site ──────────────────────────────
-- Dépose le message, retrouve/crée la fiche contact (CRM).
create or replace function public.submit_contact_message(
  p_first text, p_last text, p_email text, p_subject text, p_message text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_contact uuid; v_id uuid;
begin
  if p_email is null or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse e-mail invalide.';
  end if;
  if nullif(trim(p_message), '') is null then raise exception 'Message vide.'; end if;
  if length(p_message) > 5000 then raise exception 'Message trop long.'; end if;

  v_contact := public.upsert_contact(lower(trim(p_email))::citext, nullif(trim(p_first), ''),
                                     nullif(trim(p_last), ''), null, 'contact');
  insert into public.contact_messages (contact_id, first_name, last_name, email, subject, message)
  values (v_contact, nullif(trim(p_first), ''), nullif(trim(p_last), ''), lower(trim(p_email))::citext,
          left(nullif(trim(p_subject), ''), 200), trim(p_message))
  returning id into v_id;
  perform public.touch_contact(v_contact);
  return v_id;
end $$;
grant execute on function public.submit_contact_message(text, text, text, text, text) to anon, authenticated;

create or replace function public.admin_set_message_handled(p_id uuid, p_handled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Accès refusé' using errcode = '42501'; end if;
  update public.contact_messages set handled = p_handled where id = p_id;
end $$;
revoke execute on function public.admin_set_message_handled(uuid, boolean) from public, anon;
