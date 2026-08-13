# Deploying DayFlow

Goal: DayFlow on your iPhone, 24/7, with your Mac closed, for **$0/month**.

Three services, in this order. The order matters — each step needs a URL from the one before it.

---

## The dependency loop, and how to break it

The API needs to know the web app's origin (for CORS). The web app needs to know the API's URL. Neither exists yet. So:

1. Deploy the **database** — depends on nothing.
2. Deploy the **API** with a placeholder `CORS_ORIGINS`; note its URL.
3. Deploy the **web app** pointing at the API URL; note its URL.
4. **Go back and fix `CORS_ORIGINS`** on the API to the real web URL.

Step 4 is the one everyone forgets. Symptom: the site loads but every action fails, and the browser console says the origin was blocked by CORS.

---

## 1. Database — Supabase

1. [supabase.com](https://supabase.com) → **New project**. Pick a region near you. Save the database password somewhere — it is shown once.
2. **Project Settings → Database → Connection string**, and copy two:
   - **Transaction pooler** (port `6543`) → this is `DATABASE_URL`. Keep `?pgbouncer=true` on the end.
   - **Direct connection** (port `5432`) → this is `DIRECT_URL`.

Two URLs because pgbouncer in transaction mode cannot run DDL, and Prisma Migrate issues DDL.

> **Free-tier catch:** Supabase pauses a project after **7 days** with no database activity, and a paused project is fully offline. Step 4 below prevents this.

---

## 2. API — Render

1. Push this repo to GitHub.
2. [render.com](https://render.com) → **New → Blueprint** → select the repo. It reads `backend/render.yaml`.
3. Render will prompt for the values marked `sync: false`. Set:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Supabase **pooler** string (6543) |
   | `DIRECT_URL` | Supabase **direct** string (5432) |
   | `CORS_ORIGINS` | `https://placeholder.vercel.app` for now |

   `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are generated automatically — do not paste your local ones.

4. Deploy. The start command runs `prisma migrate deploy`, so your tables are created on first boot.
5. Confirm it worked:
   ```
   https://dayflow-api.onrender.com/health/db
   ```
   You want `{"ok":true,"database":"reachable",...}`. If `database` says `unreachable`, the connection strings are wrong.

---

## 3. Web app — Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → same repo.
2. Set **Root Directory** to `app`. Vercel picks up `app/vercel.json` for the rest.
3. Add an environment variable:

   | Variable | Value |
   |---|---|
   | `EXPO_PUBLIC_API_URL` | `https://dayflow-api.onrender.com` (no trailing slash) |

   > `EXPO_PUBLIC_*` values are baked into the JavaScript bundle and are readable by anyone. Only ever put the API's public URL there — never a secret.

4. Deploy, and note the URL, e.g. `https://dayflow.vercel.app`.

### Now close the loop

Go back to **Render → dayflow-api → Environment** and set `CORS_ORIGINS` to your real Vercel URL. Save; Render redeploys. Skipping this is the single most common way to end up with a site that loads but does nothing.

---

## 4. Keep-alive — UptimeRobot

Two different free-tier sleep timers, both solved by one monitor:

- **Render** spins the API down after **15 minutes** idle (30–60s cold start on the next request).
- **Supabase** pauses the database after **7 days** idle.

Set up at [uptimerobot.com](https://uptimerobot.com):

| Setting | Value |
|---|---|
| Monitor type | HTTP(s) |
| URL | `https://dayflow-api.onrender.com/health/db` |
| Interval | 5 minutes |

**Use `/health/db`, not `/health`.** `/health` returns static JSON without touching Postgres — it would keep Render awake while Supabase quietly paused underneath it after a week. `/health/db` runs a real `SELECT 1`, so one monitor keeps both alive.

> **Instance-hours maths:** Render grants 750 free instance hours per month; a month is ~730 hours. Keeping one service awake round-the-clock fits with ~20 hours to spare. That budget covers exactly one always-on free service — a second one will run you out.

---

## 5. Install on your iPhone

1. Open your Vercel URL in **Safari** (this does not work from Chrome on iOS).
2. Tap **Share** → **Add to Home Screen**.
3. Name it DayFlow → **Add**.

You now have a real icon on your home screen. It opens full-screen with no browser chrome, works on any network, and needs nothing running on your Mac. `app.json` already declares `display: standalone`, the theme colour and the icons that make this work.

**Updating it:** push to GitHub, Vercel rebuilds, and the app picks up the new version next launch. No reinstall, no App Store review.

---

## What this does not give you

- **Push notifications.** iOS supports web push for home-screen PWAs, but DayFlow does not implement it.
- **True offline use.** There is no service worker or write queue yet; the app needs a connection.
- **App Store presence.** That needs a native EAS build plus the Apple Developer Program at **$99/year** — without it a sideloaded build stops working after 7 days. The codebase is ready for it (`eas build --platform ios`) whenever you decide it's worth paying for.

---

## Cost

| Service | Plan | Cost |
|---|---|---|
| Supabase | Free (500MB) | $0 |
| Render | Free (750 hrs) | $0 |
| Vercel | Hobby | $0 |
| UptimeRobot | Free (50 monitors) | $0 |

The first upgrade worth paying for is **Render Starter (~$7/mo)**, which removes spin-down entirely and makes the keep-alive monitor unnecessary.
