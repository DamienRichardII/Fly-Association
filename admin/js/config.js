/* ═══════════════════════════════════════════════════════════
   Configuration Supabase du back-office Le Fly.

   1. Créez le projet sur supabase.com
   2. Settings → API : copiez l'URL et la clé « anon / public »
   3. Collez-les ci-dessous, puis déployez.

   ⚠️  N'INSCRIVEZ JAMAIS ICI la clé « service_role ».
   Ce fichier part dans le navigateur de tous les visiteurs.
   La clé service_role reste uniquement dans les variables
   d'environnement Vercel, côté fonctions serverless.
   ═══════════════════════════════════════════════════════════ */

window.FLY_CONFIG = {
  SUPABASE_URL: 'https://wpwqmiefneagvudisapn.supabase.co',      // ex. https://xxxxxxxxxxxx.supabase.co
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd3FtaWVmbmVhZ3Z1ZGlzYXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MTA3MzIsImV4cCI6MjEwNzM4NjczMn0.nc-8o45mwTTaglMLZCYytGguWTS7zGhPp6QIF20vxYY',
  PREVIEW: true,   // TEMPORAIRE : aperçu sans connexion (lecture seule). Mettre false ou supprimer pour réactiver la connexion.
  CURRENCY: 'EUR',
  LOCALE: 'fr-FR'
};
