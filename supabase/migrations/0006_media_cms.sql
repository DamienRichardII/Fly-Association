-- ═══════════════════════════════════════════════════════════════
-- 0006_media_cms — Vidéos, galeries, groupes, CMS
-- ═══════════════════════════════════════════════════════════════

-- ── Vidéos ────────────────────────────────────────────────────
create table if not exists public.videos (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  category      text,
  source        media_source not null default 'youtube',
  url           text,                                  -- YouTube / Vimeo / URL directe
  storage_path  text,                                  -- bucket Supabase si source = upload
  thumbnail_url text,
  duration_sec  integer check (duration_sec is null or duration_sec > 0),
  position      integer not null default 0,
  status        publish_status not null default 'draft',
  is_public     boolean not null default true,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint video_has_source check (url is not null or storage_path is not null)
);
create index if not exists videos_status_idx on public.videos (status, position) where deleted_at is null;

drop trigger if exists videos_set_updated_at on public.videos;
create trigger videos_set_updated_at before update on public.videos
  for each row execute function public.set_updated_at();

-- ── Galeries photo ────────────────────────────────────────────
create table if not exists public.galleries (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  slug         text not null unique,
  description  text,
  cover_url    text,
  event_id     uuid references public.events(id) on delete set null,
  position     integer not null default 0,
  status       publish_status not null default 'draft',
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
drop trigger if exists galleries_set_updated_at on public.galleries;
create trigger galleries_set_updated_at before update on public.galleries
  for each row execute function public.set_updated_at();

create table if not exists public.gallery_items (
  id           uuid primary key default gen_random_uuid(),
  gallery_id   uuid not null references public.galleries(id) on delete cascade,
  storage_path text,
  url          text,
  caption      text,
  alt_text     text,
  width        integer,
  height       integer,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  constraint gallery_item_has_source check (url is not null or storage_path is not null)
);
create index if not exists gallery_items_idx on public.gallery_items (gallery_id, position);

-- ── Groupes (communauté) ──────────────────────────────────────
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  image_url   text,
  visibility  group_visibility not null default 'public',
  status      publish_status not null default 'draft',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
drop trigger if exists groups_set_updated_at on public.groups;
create trigger groups_set_updated_at before update on public.groups
  for each row execute function public.set_updated_at();

create table if not exists public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  role       text not null default 'member',
  joined_at  timestamptz not null default now(),
  primary key (group_id, contact_id)
);
create index if not exists group_members_contact_idx on public.group_members (contact_id);

-- Structure extensible pour les publications, volontairement minimale en v1
create table if not exists public.group_posts (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.groups(id) on delete cascade,
  author_contact_id uuid references public.contacts(id) on delete set null,
  body              text not null,
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index if not exists group_posts_idx on public.group_posts (group_id, created_at desc);

create table if not exists public.group_post_comments (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references public.group_posts(id) on delete cascade,
  author_contact_id uuid references public.contacts(id) on delete set null,
  body              text not null,
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index if not exists group_comments_idx on public.group_post_comments (post_id, created_at);

-- ── CMS ───────────────────────────────────────────────────────
create table if not exists public.cms_collections (
  key         text primary key,
  name        text not null,
  description text,
  position    integer not null default 0
);

insert into public.cms_collections (key, name, description, position) values
  ('actualites','Actualités','Articles et retours d''événements', 1),
  ('pages','Pages','Contenus éditoriaux des pages du site',        2),
  ('equipe','Équipe','Membres de l''équipe Le Fly',                3),
  ('partenaires','Partenaires','Partenaires et sponsors',          4),
  ('faq','FAQ','Questions fréquentes',                             5),
  ('temoignages','Témoignages','Retours des participants',         6)
on conflict (key) do nothing;

create table if not exists public.cms_entries (
  id            uuid primary key default gen_random_uuid(),
  collection    text not null references public.cms_collections(key) on delete cascade,
  slug          text not null,
  title         text not null,
  excerpt       text,
  body          text,
  cover_url     text,
  data          jsonb not null default '{}'::jsonb,   -- champs libres par collection
  position      integer not null default 0,
  status        publish_status not null default 'draft',
  published_at  timestamptz,
  author_id     uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (collection, slug)
);
create index if not exists cms_entries_idx on public.cms_entries (collection, status, position);

drop trigger if exists cms_entries_set_updated_at on public.cms_entries;
create trigger cms_entries_set_updated_at before update on public.cms_entries
  for each row execute function public.set_updated_at();

-- ── Messages du formulaire de contact ─────────────────────────
create table if not exists public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete set null,
  first_name text,
  last_name  text,
  email      citext not null,
  subject    text,
  message    text not null,
  handled    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists contact_messages_idx on public.contact_messages (handled, created_at desc);
