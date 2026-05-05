# KAFS Scenario Lab

IFRS 17 decision-support tool. Static client-rendered app (Vite) with Supabase email/password auth gating the entire UI.

## Setup

1. Install dependencies:
   ```
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in your Supabase project URL and anon key (already configured in the committed `.env` for this project).
3. In the Supabase dashboard → **Authentication → Providers**, ensure **Email** is enabled. By default Supabase requires email confirmation on sign-up — disable it under **Authentication → Sign In / Providers → Email** if you want instant access for testing.

## Develop

```
npm run dev
```

Opens on http://localhost:5173. The auth overlay covers the app until a user signs in; on sign-out the page reloads.

## Build

```
npm run build
```

Outputs to `dist/`. Preview the production build with `npm run preview`.

## Project structure

```
index.html           Vite entry, contains app markup + auth overlay
src/
  main.js            Wires auth + imports the app
  supabase.js        Supabase client (reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
  auth.js            Login/sign-up form logic and session handling
  script.js          Existing scenario-lab app
  style.css          Existing styles + auth UI
.env                 Supabase credentials (gitignored)
```

Original CodePen: [https://codepen.io/Shem-Maundu/pen/KwgJyze](https://codepen.io/Shem-Maundu/pen/KwgJyze)
