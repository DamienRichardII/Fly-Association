# Le Fly Association — Architecture du back-office

Phases A et B du cahier des charges. Ce document fait foi pour les phases suivantes.
Dernière mise à jour : 17 septembre 2026 (phase B — CRM).

---

## 1. Audit de l'existant

| Élément | État constaté |
|---|---|
| Frontend | HTML5 / CSS3 / JS vanilla — 9 pages statiques, `assets/css/style.css` (23 Ko), `assets/js/main.js` (1,7 Ko) |
| Framework / build | Aucun. Pas de `package.json`, pas d'étape de compilation |
| Backend | **Aucun** |
| Base de données | **Aucune** |
| Authentification | **Aucune** |
| Gestion des utilisateurs | **Aucune** |
| Stockage fichiers | `assets/img/` — images statiques versionnées dans Git |
| Paiement | **Aucun** — le bouton « Acheter ma place » renvoie vers `evenements.html` |
| Dashboard / admin | **Aucun** |
| Routes API | **Aucune** |
| Tables / collections | **Aucune** |
| Dépôt | `github.com/DamienRichardII/Fly-Association`, branche `main`, déploiement Vercel |

**Conclusion :** aucune des 14 rubriques demandées n'existe, même partiellement.
Rien n'est à réutiliser côté données, rien n'est à recréer non plus : tout le socle
est neuf. La seule chose à préserver — et elle l'est intégralement — est la
direction artistique et les 9 pages publiques, qui ne sont pas modifiées.

Migrations nécessaires : la totalité du schéma (voir §4).

---

## 2. Architecture retenue

Décision validée avec le client : **site statique conservé + Supabase**.

```
Navigateur public            Navigateur admin           Serveur
─────────────────            ────────────────           ───────
9 pages HTML statiques  ──┐  /admin/ (shell JS)  ──┐
                          │                        │
                          └──────► Supabase ◄──────┘
                                   Postgres + Auth + Storage
                                   protégé par RLS
                                          ▲
                                          │ clé service_role
                                          │
                              Fonctions serverless Vercel
                              (webhooks de paiement)
```

**Ce qui ne change pas**
- Les 9 pages publiques restent du HTML statique, servies telles quelles par Vercel.
- La charte (navy `#213A83`, Anton / Barlow Condensed / Barlow) est reprise à
  l'identique par le back-office.
- Le flux de déploiement reste `git push` → Vercel.

**Ce qui s'ajoute**
- `admin/` : application d'administration, une seule page avec navigation par
  ancre. Un seul shell, une seule feuille de style, un module par rubrique.
- `supabase/migrations/` : le schéma complet, versionné dans le dépôt.
- Plus tard : `api/` — fonctions serverless Vercel, uniquement pour ce qui ne
  peut pas vivre dans le navigateur (webhooks de paiement, envois d'e-mails).

**Pourquoi ce découpage.** Le site public n'a besoin d'aucun serveur : Supabase
expose directement les contenus publiés via une API REST, filtrée par RLS. Le
back-office parle à cette même API avec la session de l'administrateur. Les
seules opérations qui exigent un secret — encaisser un paiement — passent par une
fonction serverless. C'est le minimum de pièces mobiles pour le besoin.

### Sécurité, en trois règles

1. **Le navigateur ne porte que la clé `anon`.** La clé `service_role` vit
   exclusivement dans les variables d'environnement Vercel. Elle n'apparaît
   jamais dans `admin/js/config.js`.
2. **La base décide, pas le client.** RLS activée sur les 29 tables, fermée par
   défaut. Le public ne lit que le contenu publié ; un membre ne lit que ses
   propres lignes ; l'administration passe par `is_admin()`. Les prix facturés
   sont lus en base au moment de la commande, jamais envoyés par le client.
3. **Un paiement n'est jamais validé depuis le frontend.** Seul un webhook signé,
   traité côté serveur avec la clé `service_role`, peut faire passer un paiement
   à `paid`. La table `payment_webhook_events` garantit qu'un événement n'est
   traité qu'une fois.

---

## 3. Prestataire de paiement — décision en attente

Aucun prestataire n'existait dans le projet ; conformément au cahier des charges,
aucun n'a été choisi arbitrairement. La couche paiement est construite de manière
**indépendante du prestataire** :

- `payments.provider` est un simple texte (`stripe`, `helloasso`, `manual`…) ;
- les statuts sont figés : `pending` · `paid` · `failed` · `refunded` · `cancelled` ;
- `payment_webhook_events` reçoit le brut de n'importe quel prestataire ;
- un trigger fait avancer commande et abonnement dès qu'un paiement passe à `paid`.

Brancher un prestataire consiste donc à écrire **une seule** fonction serverless.

| Option | Pour | Contre |
|---|---|---|
| **HelloAsso** | Gratuit pour les associations loi 1901, billetterie + adhésions + dons, reçus fiscaux | API plus limitée pour une boutique de produits |
| **Stripe** | Couvre tout (billets, produits, abonnements récurrents), très bonne API | Commissions à la charge de l'association, pas de reçu fiscal |
| **Les deux** | HelloAsso pour billets/adhésions, Stripe pour la boutique | Deux intégrations à maintenir |

→ **À trancher avant la phase E.** Les phases B, C et D n'en dépendent pas.

---

## 4. Modèle de données

29 tables, 7 vues. Toutes en `public`, toutes avec `created_at`,
la plupart avec `updated_at` (trigger) et `deleted_at` (suppression logique).

### Identité
| Table | Rôle |
|---|---|
| `profiles` | Compte d'accès adossé à `auth.users`, porte le rôle `admin` / `staff` / `member` |

### CRM — le pivot de tout le système
| Table | Rôle |
|---|---|
| `contacts` | **Fiche unique par personne.** Email unique parmi les fiches actives |
| `tags` / `contact_tags` | Prospect, Client, Membre, Adhérent, Participant, Bénévole… |

`upsert_contact(email, prénom, nom, téléphone, source)` retrouve la fiche
existante avant d'en créer une. Un acheteur de billet qui réserve ensuite un
stage avec le même email reste **un seul contact**. La fonction complète les
champs vides sans jamais écraser une donnée déjà saisie.

### Événements
| Table | Rôle |
|---|---|
| `events` | Billetterie ou RSVP · `draft` / `published` / `cancelled` / `completed` |
| `event_ticket_types` | Catégories de billets : prix, quota, max par commande, fenêtre de vente |
| `event_attendees` | Inscrits et réponses au formulaire RSVP (`jsonb`) |
| `tickets` | Billets émis, code unique, rattachés à la ligne de commande |

**L'état « passé » n'est pas stocké, il est calculé** par la vue
`events_overview` à partir de la date de fin. Aucun cron, aucune dérive, et
surtout : **un événement terminé ne disparaît jamais**. Ses inscrits, billets,
acheteurs, paiements et chiffre d'affaires restent intégralement consultables.

Le stock de billets est tenu par un trigger en base (`quantity_sold`), avec une
contrainte `quantity_sold <= quantity_total`. Une sur-vente est impossible, même
par appel direct à l'API.

### Réservations
| Table | Rôle |
|---|---|
| `booking_services` | Service réservable : durée, prix, intervenant, lieu, capacité |
| `booking_availability` | Créneaux hebdomadaires récurrents |
| `booking_blackouts` | Fermetures exceptionnelles |
| `bookings` | Réservations · `pending` / `confirmed` / `cancelled` / `completed` |

Un trigger refuse tout dépassement de capacité et toute réservation sur une
fermeture — contrôle serveur, pas seulement à l'écran.

### Commerce
| Table | Rôle |
|---|---|
| `products` · `plans` | Produits et formules, logiques métier séparées |
| `catalog_view` | Vue d'union : une interface commune sans mélanger les métiers |
| `orders` · `order_items` | Commandes, numérotées `FLY-001000`. **Prix figé** à l'achat |
| `payments` | Transactions, indépendantes du prestataire |
| `payment_webhook_events` | Journal des webhooks, idempotence garantie |
| `subscriptions` | Adhésions : unique / hebdo / mensuel / annuel |

Les totaux de commande sont recalculés par la base à chaque mouvement de ligne.

### Contenus
`videos`, `galleries` + `gallery_items`, `groups` + `group_members` +
`group_posts` + `group_post_comments`, `cms_collections` + `cms_entries`,
`contact_messages`.

Les six collections CMS sont pré-créées : actualités, pages, équipe, partenaires,
FAQ, témoignages.

### Vues transverses — là où les modules cessent d'être séparés
| Vue | Usage |
|---|---|
| `contact_timeline` | Historique unifié d'un contact : réservations, billets, inscriptions, commandes, paiements, abonnements, groupes |
| `contacts_overview` | Fiche CRM enrichie : tags, nombre de commandes, valeur client cumulée |
| `events_overview` | État effectif, inscrits, billets vendus/restants, CA |
| `orders_overview` | Commande + client + articles + état de paiement consolidé |
| `bookings_overview` | Réservation + service + coordonnées client |
| `dashboard_stats` | Les 10 indicateurs de la page d'accueil |

---

## 5. Parcours de référence (§15 du cahier des charges)

Achat de 2 billets, de bout en bout :

1. `upsert_contact()` → retrouve ou crée la fiche contact
2. `INSERT orders` → commande en `pending`
3. `INSERT order_items` → prix lu **en base**, figé sur la ligne
4. Le total de la commande est recalculé par trigger
5. Redirection vers le prestataire de paiement
6. **Webhook signé** → `payments.status = 'paid'` (jamais depuis le navigateur)
7. Trigger → la commande passe en `confirmed`
8. `INSERT tickets` → trigger → `quantity_sold` mis à jour
9. Tout apparaît dans `contact_timeline`, et y reste après l'événement

Ce parcours a été exécuté sur une base PostgreSQL 16 réelle. Les huit contrôles
passent : dédoublonnage, total recalculé, commande confirmée par le paiement,
stock synchronisé, historique agrégé, CA calculé, sur-réservation bloquée,
événement passé conservé avec ses billets.

---

## 6. Ce qui est livré

```
supabase/migrations/     9 fichiers SQL, exécutés dans l'ordre
  0001_init.sql            extensions, types, profils, helpers
  0002_contacts.sql        CRM + dédoublonnage
  0003_events.sql          événements, billetterie, stock
  0004_bookings.sql        services, disponibilités, capacité
  0005_commerce.sql        catalogue, commandes, paiements, abonnements
  0006_media_cms.sql       vidéos, galeries, groupes, CMS
  0007_views.sql           vues transverses
  0008_rls.sql             Row Level Security
  0009_crm.sql              phase B — écritures CRM (voir §6bis)

admin/
  index.html             shell + navigation
  login.html             connexion Supabase, garde d'accès admin
  css/admin.css          charte Fly appliquée au back-office
  js/config.js           URL + clé anon (à renseigner)
  js/ui.js               formats, badges, tableaux, toasts, modales
  js/api.js              couche données — seul point de contact avec Supabase
  js/views.js            les 13 rubriques, dont la fiche contact complète (phase B)
  js/app.js              routeur + garde d'authentification + routes à paramètre
```

Phase A : les 13 rubriques affichent leurs filtres, colonnes, états vides et
squelettes de chargement. Phase B : la rubrique *Clients & prospects* passe en
lecture/écriture complète (voir §6bis). Les formulaires de création et
d'édition des autres rubriques arrivent aux phases suivantes.

### 6bis. Phase B — CRM (fiche contact, tags, historique, fusion)

Rubrique *Clients & prospects* entièrement fonctionnelle :

- **Fiche contact** (`#/contacts/:id`) : coordonnées éditables, notes,
  consentement marketing, tags (ajout/retrait en un clic), historique unifié
  (`contact_timeline` : commandes, billets, réservations, paiements,
  abonnements…), suppression logique avec confirmation.
- **Création** (`#/contacts/new`) : formulaire dédié, email rejeté s'il
  existe déjà parmi les fiches actives.
- **Détection de doublons** : à l'ouverture d'une fiche, `admin_find_duplicate_contacts`
  cherche les autres fiches partageant le même téléphone ou nom ; un bandeau
  propose la fusion si un doublon est trouvé.
- **Fusion** (`admin_merge_contacts`) : rattache à la fiche conservée tout
  l'historique de la fiche fusionnée (commandes, billets, réservations,
  paiements, abonnements, messages, groupes, tags), sans perte, puis
  supprime logiquement la fiche fusionnée et libère son email.

Toutes les écritures passent par `supabase/migrations/0009_crm.sql`, des
fonctions `SECURITY DEFINER` gardées par `is_admin()` — jamais d'écriture
directe depuis le navigateur. Testé de bout en bout sur une base PostgreSQL
16 réelle (création, email en double rejeté, tags, détection par téléphone,
fusion avec réattribution de commande, email libéré après fusion, écriture
refusée à un compte non-admin).

---

## 7. Mise en route

1. Créer le projet sur [supabase.com](https://supabase.com) (région Europe).
2. SQL Editor → exécuter les 9 fichiers de `supabase/migrations/` **dans l'ordre**.
3. Authentication → Users → créer le compte de Valentin.
4. SQL Editor → lui donner les droits :
   ```sql
   update public.profiles set role = 'admin' where email = 'email-de-valentin';
   ```
5. Settings → API → copier l'URL et la clé `anon` dans `admin/js/config.js`.
6. `git push` → le back-office est en ligne sur `/admin/`.

Pour tester en local, servir le dossier par HTTP (`python -m http.server`) :
l'authentification Supabase ne fonctionne pas en `file://`.

---

## 8. Suite du programme

| Phase | Contenu | Dépend de |
|---|---|---|
| **A** ✅ | Audit, architecture, modèle de données, squelette admin | — |
| **B** ✅ | CRM : fiche contact complète, tags, historique, fusion de doublons | A |
| **C** | Événements : assistant de création en 5 étapes, billetterie, participants | B |
| **D** | Réservations : agenda jour/semaine/mois, création et annulation | B |
| **E** | Catalogue, commandes, **paiements**, abonnements | Choix du prestataire |
| **F** | Galerie, vidéos, groupes, CMS + branchement des pages publiques | A |
| **G** | Relations entre modules, tableaux de bord consolidés | B→F |
| **H** | Tests, sécurité, responsive, corrections | G |

À la fin de chaque phase : vérification desktop, mobile, absence de régression
sur les 9 pages publiques.
