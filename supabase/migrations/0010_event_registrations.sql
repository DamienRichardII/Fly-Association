-- ═══════════════════════════════════════════════════════════════
-- 0010_event_registrations — Inscriptions aux événements
-- Pré-inscription publique (site) + gestion des participants (admin).
-- Sert notamment aux tournois : catégorie, paiement sur place, pointage.
-- Toutes les écritures passent par des fonctions SECURITY DEFINER.
-- ═══════════════════════════════════════════════════════════════

alter table public.event_attendees
  add column if not exists ticket_type_id uuid references public.event_ticket_types(id) on delete set null,
  add column if not exists paid           boolean not null default false,
  add column if not exists payment_method text,           -- especes | virement | helloasso | autre
  add column if not exists notes          text,
  add column if not exists source         text not null default 'site';  -- site | admin

create index if not exists attendees_type_idx on public.event_attendees (ticket_type_id);

-- ── Cœur commun : crée l'inscription (contact dédoublonné, quotas) ──
create or replace function public._register_attendee(
  p_event uuid, p_ticket_type uuid, p_first text, p_last text, p_email text,
  p_phone text, p_notes text, p_source text, p_check_published boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ev     public.events%rowtype;
  v_tt     public.event_ticket_types%rowtype;
  v_contact uuid;
  v_id     uuid;
  v_count  integer;
begin
  select * into v_ev from public.events where id = p_event and deleted_at is null;
  if not found or (p_check_published and v_ev.status <> 'published') then
    raise exception 'Cet événement n’est pas ouvert aux inscriptions.';
  end if;
  if p_check_published and coalesce(v_ev.end_at, v_ev.start_at) < now() then
    raise exception 'Les inscriptions sont closes.';
  end if;

  if nullif(trim(p_first), '') is null or nullif(trim(p_last), '') is null then
    raise exception 'Prénom et nom obligatoires.';
  end if;
  if p_email is null or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse e-mail invalide.';
  end if;

  if p_ticket_type is not null then
    select * into v_tt from public.event_ticket_types
      where id = p_ticket_type and event_id = p_event;
    if not found then raise exception 'Catégorie inconnue.'; end if;
    if p_check_published then
      if v_tt.sales_start_at is not null and v_tt.sales_start_at > now() then
        raise exception 'Les inscriptions ne sont pas encore ouvertes.';
      end if;
      if v_tt.sales_end_at is not null and v_tt.sales_end_at < now() then
        raise exception 'Les inscriptions sont closes pour cette catégorie.';
      end if;
    end if;
    if v_tt.quantity_total is not null then
      select count(*) into v_count from public.event_attendees
        where ticket_type_id = p_ticket_type and status <> 'cancelled';
      if v_count >= v_tt.quantity_total then
        raise exception 'Cette catégorie est complète.';
      end if;
    end if;
  end if;

  if v_ev.capacity is not null then
    select count(*) into v_count from public.event_attendees
      where event_id = p_event and status <> 'cancelled';
    if v_count >= v_ev.capacity then raise exception 'Événement complet.'; end if;
  end if;

  v_contact := public.upsert_contact(lower(trim(p_email))::citext, trim(p_first), trim(p_last),
                                     nullif(trim(p_phone), ''), 'event:' || v_ev.slug);

  if exists (select 1 from public.event_attendees
              where event_id = p_event and contact_id = v_contact and status <> 'cancelled') then
    raise exception 'Cette personne est déjà inscrite.';
  end if;

  -- une inscription annulée est réactivée plutôt que dupliquée (contrainte unique)
  insert into public.event_attendees (event_id, contact_id, ticket_type_id, notes, source)
  values (p_event, v_contact, p_ticket_type, nullif(trim(p_notes), ''), p_source)
  on conflict (event_id, contact_id) do update
    set status = 'registered', ticket_type_id = excluded.ticket_type_id,
        notes = excluded.notes, source = excluded.source, registered_at = now(),
        paid = false, payment_method = null, checked_in_at = null
  returning id into v_id;

  perform public.touch_contact(v_contact);
  return v_id;
end $$;

-- ── Public : pré-inscription depuis le site ─────────────────────
create or replace function public.register_for_event(
  p_event uuid, p_ticket_type uuid, p_first text, p_last text, p_email text,
  p_phone text default null, p_notes text default null
) returns uuid
language sql security definer set search_path = public as $$
  select public._register_attendee(p_event, p_ticket_type, p_first, p_last, p_email,
                                   p_phone, p_notes, 'site', true);
$$;

-- ── Admin : ajout manuel d'un participant ───────────────────────
create or replace function public.admin_add_attendee(
  p_event uuid, p_ticket_type uuid, p_first text, p_last text, p_email text,
  p_phone text default null, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Accès refusé' using errcode = '42501'; end if;
  return public._register_attendee(p_event, p_ticket_type, p_first, p_last, p_email,
                                   p_phone, p_notes, 'admin', false);
end $$;

-- ── Admin : statut, paiement, pointage, notes ───────────────────
create or replace function public.admin_update_attendee(
  p_id uuid, p_status attendee_status, p_paid boolean, p_payment_method text, p_notes text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Accès refusé' using errcode = '42501'; end if;
  update public.event_attendees set
    status = p_status,
    paid = p_paid,
    payment_method = case when p_paid then nullif(p_payment_method, '') else null end,
    notes = nullif(trim(p_notes), ''),
    checked_in_at = case when p_status = 'attended' then coalesce(checked_in_at, now()) else null end
  where id = p_id;
  if not found then raise exception 'Inscription introuvable'; end if;
end $$;

grant execute on function public.register_for_event(uuid, uuid, text, text, text, text, text) to anon, authenticated;
revoke execute on function public._register_attendee(uuid, uuid, text, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.admin_add_attendee(uuid, uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.admin_update_attendee(uuid, attendee_status, boolean, text, text) from public, anon;
