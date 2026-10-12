-- ═══════════════════════════════════════════════════════════════
-- 0002_contacts — CRM : fiche unique par personne
-- Toute vente, réservation, inscription ou abonnement pointe ici.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.contacts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid unique references auth.users(id) on delete set null,
  first_name       text,
  last_name        text,
  email            citext,
  phone            text,
  address_line     text,
  postal_code      text,
  city             text,
  country          text default 'France',
  source           text,                         -- billetterie, réservation, formulaire…
  notes            text,
  marketing_optin  boolean not null default false,
  last_activity_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint contacts_identifiable check (
    email is not null or phone is not null or last_name is not null
  )
);

-- Anti-doublon : un seul contact actif par email
create unique index if not exists contacts_email_unique
  on public.contacts (email) where deleted_at is null and email is not null;
create index if not exists contacts_name_idx on public.contacts (last_name, first_name);
create index if not exists contacts_activity_idx on public.contacts (last_activity_at desc nulls last);
create index if not exists contacts_created_idx on public.contacts (created_at desc);

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

-- ── Tags (Prospect, Client, Membre, Adhérent, Participant…) ────
create table if not exists public.tags (
  slug   text primary key,
  label  text not null,
  color  text not null default '#213A83'
);

insert into public.tags (slug, label) values
  ('prospect','Prospect'), ('client','Client'), ('membre','Membre'),
  ('adherent','Adhérent'), ('participant','Participant'), ('benevole','Bénévole'),
  ('partenaire','Partenaire'), ('coach','Coach')
on conflict (slug) do nothing;

create table if not exists public.contact_tags (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tag        text not null references public.tags(slug) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (contact_id, tag)
);
create index if not exists contact_tags_tag_idx on public.contact_tags (tag);

-- ── Dédoublonnage : retrouver ou créer une fiche ───────────────
-- Utilisée par tous les parcours d'achat / inscription.
create or replace function public.upsert_contact(
  p_email      citext default null,
  p_first_name text  default null,
  p_last_name  text  default null,
  p_phone      text  default null,
  p_source     text  default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_email is not null then
    select id into v_id from public.contacts
      where email = p_email and deleted_at is null limit 1;
  end if;

  if v_id is null and p_phone is not null then
    select id into v_id from public.contacts
      where phone = p_phone and deleted_at is null limit 1;
  end if;

  if v_id is null then
    insert into public.contacts (email, first_name, last_name, phone, source)
    values (p_email, p_first_name, p_last_name, p_phone, p_source)
    returning id into v_id;
  else
    -- on complète les champs vides sans jamais écraser une donnée existante
    update public.contacts set
      first_name = coalesce(first_name, p_first_name),
      last_name  = coalesce(last_name,  p_last_name),
      phone      = coalesce(phone,      p_phone)
    where id = v_id;
  end if;

  return v_id;
end $$;

-- Horodatage de la dernière activité, appelé par les triggers métier
create or replace function public.touch_contact(p_contact_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.contacts set last_activity_at = now() where id = p_contact_id;
$$;

-- Contact rattaché à l'utilisateur connecté (espace membre)
create or replace function public.my_contact_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.contacts where user_id = auth.uid() and deleted_at is null limit 1;
$$;
