# Kirana Smart Orders — Setup Guide

## Architecture

```
React PWA  →  Express API (Railway)  →  Supabase PostgreSQL
(frontend)     (backend)                (database)
```

---

## Step 1 — Supabase

1. Create a free project at https://supabase.com
2. Go to **SQL Editor** and run the contents of `supabase/migrations/001_init.sql`
3. From **Project Settings → API**, copy:
   - `Project URL`  → `SUPABASE_URL`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 2 — Backend (Railway)

1. Push this repo to GitHub
2. Go to https://railway.app → **New Project → Deploy from GitHub repo**
3. Select the repo and set **Root Directory** to `backend`
4. Add these environment variables in Railway:

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
JWT_SECRET=some-long-random-string-min-32-chars
FRONTEND_URL=https://your-frontend.railway.app
PORT=3001
```

5. Railway will auto-detect Node.js and run `node src/index.js`
6. Copy the deployed backend URL (e.g. `https://kirana-api.up.railway.app`)

---

## Step 3 — Frontend (Railway)

1. In Railway, create a **second service** in the same project
2. Set **Root Directory** to `/` (the repo root)
3. Add this environment variable:

```
VITE_API_URL=https://kirana-api.up.railway.app
```

4. Set build command: `npm run build`
5. Set start command: `npx serve dist -l $PORT`
   (or use Railway's static site hosting)

---

## Local Development

### Backend
```bash
cd backend
cp .env.example .env        # fill in your Supabase credentials
npm install
npm run dev                 # runs on http://localhost:3001
```

### Frontend
```bash
cp .env.example .env        # VITE_API_URL=http://localhost:3001
npm install
npm run dev                 # runs on http://localhost:5173
```

---

## How it works

| Layer | Tech | Where |
|-------|------|-------|
| Database | PostgreSQL via Supabase | Supabase cloud |
| API | Express.js + JWT auth | Railway service 1 |
| Frontend | React PWA | Railway service 2 |

- Supabase **service-role key** only lives in the backend — never exposed to the browser
- JWT tokens (30-day expiry) authenticate shop owners
- Frontend caches data in localStorage for offline use; syncs to API when online
- WhatsApp integration via deep links — no API key needed

---

## Security notes

- Each shop's data is isolated by `shop_id` in every query
- PINs are bcrypt-hashed (cost 10) before storage
- RLS is enabled on all Supabase tables (service role bypasses it, but it's a safety net)
- CORS is restricted to `FRONTEND_URL` in production
