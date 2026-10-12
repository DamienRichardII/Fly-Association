# Base de données — Le Fly Association

Schéma Supabase / PostgreSQL du back-office.
Voir `../ARCHITECTURE.md` pour le modèle complet et les choix techniques.

## Exécution

Dans le SQL Editor de Supabase, exécuter les fichiers **dans l'ordre** :

```
0001_init.sql        extensions, types énumérés, profils, helpers d'autorisation
0002_contacts.sql    CRM, tags, fonction de dédoublonnage
0003_events.sql      événements, catégories de billets, inscrits, billets
0004_bookings.sql    services réservables, disponibilités, réservations
0005_commerce.sql    produits, formules, commandes, paiements, abonnements
0006_media_cms.sql   vidéos, galeries, groupes, CMS, messages de contact
0007_views.sql       vues transverses (timeline contact, CA, tableau de bord)
0008_rls.sql         Row Level Security sur les 29 tables
0009_crm.sql         phase B — écritures CRM : upsert, tags, fusion de doublons
```

Les fichiers sont idempotents (`create ... if not exists`, `drop policy if exists`) :
les rejouer ne casse rien.

## Créer le premier administrateur

```sql
-- après avoir créé l'utilisateur dans Authentication → Users
update public.profiles set role = 'admin' where email = 'email-de-valentin';
```

## Buckets Storage à créer

| Bucket | Accès | Contenu |
|---|---|---|
| `media` | public | couvertures d'événements, photos de galerie, miniatures |
| `videos` | public | vidéos hébergées (source `upload`) |

## Points de vigilance

- **Ne jamais exposer la clé `service_role`** dans `admin/js/config.js`. Elle
  contourne la RLS. Sa place est dans les variables d'environnement Vercel.
- Les vues sont en `security_invoker = on` : elles héritent de la RLS des tables
  sous-jacentes plutôt que de la contourner.
- `payment_webhook_events` n'a **aucune policy** pour `anon` / `authenticated` :
  seule une fonction serveur peut y écrire. C'est volontaire.
- La suppression est logique (`deleted_at`) partout où l'historique compte.
  Un événement passé et ses billets ne sont jamais supprimés.
- Les écritures CRM (`admin_upsert_contact`, `admin_delete_contact`,
  `admin_set_contact_tags`, `admin_merge_contacts`, `admin_find_duplicate_contacts`)
  sont en `SECURITY DEFINER` : elles contournent la RLS par construction, donc
  chacune vérifie `is_admin()` en première ligne. C'est cette vérification,
  pas la RLS, qui protège ces tables en écriture.
