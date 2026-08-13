# DayFlow

Tasks, a daily timetable, and habit streaks — one account, synced across web, iOS and Android from a single codebase.

- **`/backend`** — Express + Prisma + PostgreSQL REST API
- **`/app`** — Expo (React Native + Expo Router), runs as a web app, an iOS app and an Android app

---

## Status

| Piece | State |
|---|---|
| Prisma schema + initial migration | Done, applied |
| Auth (signup / login / refresh / logout / me) | Done, 71 API tests passing |
| Tasks, Timetable, Habits CRUD + streaks | Done, 71 API tests passing |
| App: auth, To-Do, Timetable, Habits, Settings | Done, 22 browser tests passing |
| Web build | Verified in Chromium end-to-end |
| iOS bundle | Compiles clean (1197 modules, Hermes) |
| Google OAuth | **Not built** — see [Deviations](#deviations-from-the-original-spec) |
| Offline-first sync | **Not built** — was flagged nice-to-have |

---

## Prerequisites

- **Node 22.13+** (Expo SDK 57 requires it) — `brew install node`
- **PostgreSQL 16** — `brew install postgresql@16`, or a Supabase project
- **Expo Go** on your iPhone, for device testing

---

## Setup

### 1. Database

Local Postgres:

```bash
brew services start postgresql@16
createdb dayflow
```

The connection string is then `postgresql://$(whoami)@localhost:5432/dayflow`.

<details>
<summary>Using Supabase instead</summary>

Create a project at [supabase.com](https://supabase.com), then from **Project Settings → Database → Connection string** take both:

- the **Transaction pooler** URL (port `6543`) → `DATABASE_URL`, keep `?pgbouncer=true` on it
- the **Direct connection** URL (port `5432`) → `DIRECT_URL`

Two URLs are needed because pgbouncer in transaction mode cannot run DDL, and Prisma Migrate issues DDL. Nothing else changes — same schema, same migrations.
</details>

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Fill in `.env`. Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

| Variable | What it's for |
|---|---|
| `DATABASE_URL` | Postgres connection used by the running app |
| `DIRECT_URL` | Non-pooled connection, used only by Prisma Migrate |
| `JWT_ACCESS_SECRET` | Signs 15-minute access tokens |
| `JWT_REFRESH_SECRET` | HMAC key for refresh-token hashes — **must differ** from the access secret |
| `ACCESS_TOKEN_TTL` | Access token lifetime (default `15m`) |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh token lifetime (default `30`) |
| `PORT` | API port (default `4000`) |
| `CORS_ORIGINS` | Comma-separated origins allowed to send credentialed requests |
| `COOKIE_SECURE` | `true` only when served over HTTPS |

The server validates all of this at boot and exits with a readable message rather than failing on the first request.

Run the migration:

```bash
npm run migrate:dev
```

### 3. App

```bash
cd app
npm install
cp .env.example .env    # optional — see below
```

`EXPO_PUBLIC_API_URL` is **deliberately optional in development**. Left unset, the app works out where the API is:

- on web → `http://localhost:4000`
- in Expo Go → the LAN IP that served the bundle, port 4000

That second one is what makes iPhone testing work without hand-editing an IP every time your network hands out a new one. Set the variable explicitly once the backend is deployed.

> Anything prefixed `EXPO_PUBLIC_` is inlined into the JS bundle and visible to anyone who opens the app. Never put a secret there.

---

## Running locally

Two terminals:

```bash
# terminal 1
cd backend && npm run dev      # http://localhost:4000

# terminal 2
cd app && npm run web          # http://localhost:8081
```

Or from the repo root: `npm run dev:api` and `npm run dev:web`.

### On your iPhone

```bash
cd app && npm start
```

Scan the QR code with the Camera app and it opens in Expo Go.

**The firewall step everyone hits:** macOS blocks incoming connections to `node` by default, so your phone cannot reach the API even though the server is listening on all interfaces. The first time you run the backend, macOS shows *"Do you want the application node to accept incoming network connections?"* — click **Allow**. If you missed the prompt, go to **System Settings → Network → Firewall → Options** and allow `node`. Symptom of getting this wrong: the app loads on the phone but every screen shows "Can't reach the server."

Your Mac and iPhone must be on the same network.

---

## Testing

```bash
cd backend && npm run dev      # in one terminal
cd backend && npm run test:api # in another
```

`test:api` drives the real HTTP surface against the real database — 71 checks covering auth, validation, all three resources, streak edge cases, refresh-token rotation, and **tenant isolation** (it creates two users and proves user B cannot read, patch or delete user A's rows).

Typecheck everything from the root:

```bash
npm run typecheck
```

---

## Building

### Web

```bash
cd app && npx expo export --platform web
```

Output lands in `app/dist/` as a static SPA — deploy that directory anywhere. It is configured as `output: "single"` (a client-rendered SPA) rather than static prerendering, because every screen sits behind a login and there is nothing meaningful to prerender. It also ships PWA manifest fields (`display: standalone`, theme colour, icons), so **Add to Home Screen** on iOS gives you an installable app.

### iOS / Android

Native builds go through EAS:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios      # or android, or all
```

For a device build you can install without TestFlight: `eas build --profile development --platform ios`.

Bundle identifiers are already set to `com.jaiv.dayflow` in `app.json`.

---

## Hosting plan

**See [DEPLOYMENT.md](DEPLOYMENT.md)** for the step-by-step $0/month deploy (Supabase + Render + Vercel + UptimeRobot), including installing it on an iPhone as a PWA.

The shape of it:

| Piece | Where | Notes |
|---|---|---|
| Backend | **Railway** or **Render** | Build `npm run build`, start `npm start`. Run `npm run migrate:deploy` as a release step. Set every backend env var; `COOKIE_SECURE=true`. |
| Database | **Supabase** or Railway Postgres | Set both `DATABASE_URL` (pooler) and `DIRECT_URL` (direct). |
| Web | **Vercel** | Build `npx expo export --platform web`, output directory `dist`. Set `EXPO_PUBLIC_API_URL` to the deployed API. |
| Mobile | **EAS** | `eas build` / `eas submit`. |

Two things to remember when you deploy:

1. Add the web origin to `CORS_ORIGINS` on the backend, or the browser will refuse every request.
2. If the API and web app end up on different registrable domains, the refresh cookie needs `SameSite=None; Secure` instead of `Lax`. It is set in `backend/src/lib/tokens.ts` → `refreshCookieOptions()`.

---

## API

All routes except `/health` and `/auth/*` require `Authorization: Bearer <accessToken>`, and every query is scoped to the token's user.

| Method | Route | Notes |
|---|---|---|
| `POST` | `/auth/signup` | → `{ user, accessToken }` |
| `POST` | `/auth/login` | → `{ user, accessToken }` |
| `POST` | `/auth/refresh` | Rotates the refresh token |
| `POST` | `/auth/logout` | Revokes it server-side |
| `GET` | `/auth/me` | Current user |
| `GET/POST` | `/tasks`, `PATCH/DELETE /tasks/:id` | |
| `GET/POST` | `/timetable`, `PATCH/DELETE /timetable/:id` | `?date=` or `?from=&to=` |
| `GET/POST` | `/habits`, `PATCH/DELETE /habits/:id` | `?today=YYYY-MM-DD` |
| `POST` | `/habits/:id/log` | Toggles a day; returns the recomputed streak and 7-day grid |
| `GET` | `/habits/:id/streak` | `?today=YYYY-MM-DD` |

Errors are uniform: `{ "error": { "code", "message", "details?" } }`.

### How dates work

Every calendar day is a plain `YYYY-MM-DD` string on the wire and a `@db.Date` column in Postgres — never a timestamp. Times of day are integers, minutes from midnight (`570` = 09:30).

The **client** decides what "today" is and sends it explicitly. A phone in IST and a server in UTC disagree for five and a half hours a day; if the server picked, ticking a habit at 11pm would credit tomorrow. This is why `/habits` and `/habits/:id/streak` take a `today` parameter.

### How streaks work

`current` counts consecutive completed days ending today. **Not having ticked today does not break the streak** — the day isn't over. Counting starts at yesterday when today is unticked, so a 5-day streak still reads 5 all day, and only dies once a full day passes with nothing logged. `longest` is the best run anywhere in the history.

---

## Deviations from the original spec

Four, each deliberate:

**1. NativeWind was dropped.** It has no working release for Expo SDK 57. The stable v4 line depends on `react-native-css-interop@0.2.6`, built for the RN 0.7x era; the v5 preview replaces Metro's `transformerPath` wholesale, which collides with the transformer Expo SDK 57 installs for CSS and assets — Tailwind silently never runs and you get a stylesheet with no utilities in it. Rather than ship a preview dependency or downgrade the SDK (which would break Expo Go on current iPhones), styling uses React Native `StyleSheet` with a design-token system in `app/src/theme/`. Same tokens, same dark mode, no Tailwind class syntax. Revisit when NativeWind 5 is stable.

**2. There is a `RefreshToken` table** that wasn't in the spec's model list. `POST /auth/logout` is in the spec, but a stateless JWT cannot be invalidated — without server-side records, logout would be a no-op that only cleared the client. Only an HMAC of each token is stored, and tokens rotate on every refresh, so a stolen token is single-use.

**3. `User.passwordHash` is nullable.** A future Google-only account will never have a password. Making it non-null now would force a migration later.

**4. Timetable start/end are `Int` minutes,** not a time type. The day view is an hourly grid; integer minutes make positioning and overlap arithmetic trivial in JS without dragging a timezone into every comparison.

Two spec items are **not built**:

- **Google OAuth.** Needs a Google Cloud project and OAuth client IDs that only the repo owner can create. The auth layer is structured for it — nullable `passwordHash`, provider-agnostic session issuing in `establishSession()`.
- **Offline-first queueing.** Flagged nice-to-have. Screens do optimistic updates and roll back on failure, but there is no write queue that survives being offline.

---

## Repo layout

```
DayFlow/
├── backend/
│   ├── prisma/schema.prisma      # models + the date-handling rationale
│   ├── scripts/smoke.ts          # 71-check end-to-end API suite
│   └── src/
│       ├── lib/                  # tokens, password hashing, dates, streaks
│       ├── middleware/           # requireAuth, error handling
│       ├── routes/               # auth, tasks, timetable, habits
│       └── schemas/              # zod validation
└── app/
    └── src/
        ├── app/                  # expo-router routes
        │   ├── (auth)/           # login, signup
        │   └── (tabs)/           # to-do, timetable, habits, settings
        ├── components/           # ui primitives, task/event sheets
        ├── lib/                  # api client, auth context, dates, storage
        └── theme/                # design tokens, ThemeProvider, makeStyles
```

### Where the security lives

- `backend/src/middleware/auth.ts` — the only place a user id is established. Nothing downstream ever reads an id from a request body or query string.
- Every update and delete matches on `(id, userId)` together, so naming someone else's row affects zero rows and returns 404 rather than leaking whether it exists.
- `HabitLog` has no `userId`; ownership runs through `Habit`, so every log route resolves the habit first.
- Refresh tokens: web gets an httpOnly cookie JavaScript cannot read; native stores it in SecureStore (Keychain / Keystore).
- Login returns an identical error and burns comparable time whether or not the account exists, so response timing doesn't reveal which emails are registered.
