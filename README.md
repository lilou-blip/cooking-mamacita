# Cooking Mamacita

App web (React + TypeScript + Vite) de carnet de recettes, garde-manger, menus et courses, installable comme PWA sur mobile.

- **Backend** : [Supabase](https://supabase.com) (Postgres + Auth + Edge Functions), voir `supabase/migrations/` pour le schéma et `supabase/functions/` pour les fonctions IA (`ai-proxy`, `fetch-page`).
- **Config locale** : copier `.env.example` en `.env.local` et renseigner l'URL et la clé publique (anon) du projet Supabase.

## Développement

```bash
npm install
npm run dev
```

## Tests

```bash
npm run test
```
