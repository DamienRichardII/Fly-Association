-- ═══════════════════════════════════════════════════════════════
-- 0009_crm — Phase B : écriture CRM, tags, fusion de doublons
-- Toutes les fonctions sont SECURITY DEFINER + is_admin(), pour
-- que la RLS de public.contacts ne bloque pas l'admin qui écrit.
-- ═══════════════════════════════════════════════════════════════

-- ── Créer / mettre à jour une fiche depuis l'admin ────────────
create or replace function public.admin_upsert_contact(
  p_id              uuid default null,
  p_first_name      text default null,
  p_last_name       text default null,
  p_email           citext default null,
  p_phone           text default null,
  p_address_line    text default null,
  p_postal_code     text default null,
  p_city            text default null,
  p_country         text default 'France',
  p_notes           text default null,
  p_marketing_optin boolean default false,
  p_source          text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_dupe uuid;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  if p_email is not null then
    select id into v_dupe from public.contacts
      where email = p_email and deleted_at is null and id is distinct from p_id
      limit 1;
    if v_dupe is not null then
      raise exception 'Un contact existe déjà avec cet email : %', p_email
        using errcode = 'unique_violation', hint = v_dupe::text;
    end if;
  end if;

  if p_id is null then
    insert into public.contacts (first_name, last_name, email, phone, address_line,
      postal_code, city, country, notes, marketing_optin, source, last_activity_at)
    values (p_first_name, p_last_name, p_email, p_phone, p_address_line,
      p_postal_code, p_city, coalesce(p_country,'France'), p_notes,
      coalesce(p_marketing_optin,false), coalesce(p_source,'admin'), now())
    returning id into v_id;
  else
    update public.contacts set
      first_name      = p_first_name,
      last_name       = p_last_name,
      email           = p_email,
      phone           = p_phone,
      address_line    = p_address_line,
      postal_code     = p_postal_code,
      city            = p_city,
      country         = coalesce(p_country,'France'),
      notes           = p_notes,
      marketing_optin = coalesce(p_marketing_optin,false)
    where id = p_id and deleted_at is null
    returning id into v_id;

    if v_id is null then
      raise exception 'Contact introuvable ou supprimé' using errcode = 'no_data_found';
    end if;
  end if;

  return v_id;
end $$;

-- ── Suppression logique ────────────────────────────────────────
create or replace function public.admin_delete_contact(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Accès refusé' using errcode = '42501'; end if;
  update public.contacts set deleted_at = now() where id = p_id;
end $$;

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

-- ── Détection de doublons potentiels ──────────────────────────
-- Utilisée par la fiche contact pour proposer une fusion.
create or replace function public.admin_find_duplicate_contacts(p_contact_id uuid)
returns table (id uuid, full_name text, email citext, phone text, match_reason text)
language sql stable security definer set search_path = public as $$
  select c2.id,
         trim(coalesce(c2.first_name,'') || ' ' || coalesce(c2.last_name,'')),
         c2.email, c2.phone,
         case when c2.phone is not null and c2.phone = c1.phone then 'Même téléphone'
              when lower(c2.last_name) = lower(c1.last_name) and c1.last_name is not null then 'Même nom'
              else 'Similaire' end
    from public.contacts c1
    join public.contacts c2
      on c2.id <> c1.id and c2.deleted_at is null
     and (c2.phone = c1.phone or lower(c2.last_name) = lower(c1.last_name))
   where c1.id = p_contact_id and c1.deleted_at is null and c1.phone is not null
   limit 5;
$$;

alter function public.admin_find_duplicate_contacts set search_path = public;

-- ── Droits d'exécution ─────────────────────────────────────────
-- Fonctions SECURITY DEFINER : la vérification is_admin() à
-- l'intérieur est ce qui protège réellement ces écritures.
grant execute on function public.admin_upsert_contact          to authenticated;
grant execute on function public.admin_delete_contact          to authenticated;
grant execute on function public.admin_set_contact_tags        to authenticated;
grant execute on function public.admin_merge_contacts          to authenticated;
grant execute on function public.admin_find_duplicate_contacts to authenticated;
