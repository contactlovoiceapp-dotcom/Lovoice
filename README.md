<!--
  Read this file FIRST at the beginning of every new development phase.
  It is the canonical onboarding for any LLM (or human) joining the project.
  Sources of truth: this README + docs/ARCHITECTURE.md + docs/ROADMAP.md.
-->

# Lovoice — Mobile App (React Native / Expo)

> **LLM, read this entire file before doing anything else.**
> Then read `docs/ARCHITECTURE.md` and the relevant phase in `docs/ROADMAP.md`.
> Never deviate from the architecture or constraints below without explicit user approval.

The product ships in **two deliverables**:
1. **The mobile app** (this repo) — what end users install on iOS/Android.
2. **A small admin back-office web app** (separate Next.js repo, see Phase 6.bis in `docs/ROADMAP.md`) — a CRUD interface used exclusively by the operator (the client) to triage reports and moderate content. The client is **non-technical**: she must never have to write SQL or open Supabase Studio. All moderation actions happen in this web app, point-and-click only.

---

## 1. Product summary

Lovoice is a **voice-first dating app** for French-speaking Europe (FR / BE / CH).
Each user records a short **voice** (max 1 min 30 s) that introduces them.
Other users discover these voices through a **vertical TikTok-style feed**.

There is **NO swipe-and-match mechanic**. The interactions are:

- **Listen** to voices in the Discover feed (auto-advance optional).
- **Like** a voice (the author gets a notification).
- **Reply** to a voice with a text or voice message → starts a conversation.
- **Chat** in a built-in messenger (text + voice messages).
- **Get notified** of likes (visible in the Likes screen) and new messages (visible in the Messages screen) via push notifications.

Voice is the core medium. Recording and playback **must feel instant and reliable**.

---

## 2. Target & scale

- V1 goal: **validate the market** with 5–10k users.
- Geography: France, Belgium, Switzerland (phone verification restricted to +33 / +32 / +41).
- Single developer (the user) + LLM pair-programming.
- Infra must stay frugal: prefer managed services with generous free tiers and pay-as-you-go pricing over fixed-cost platforms. Any new third-party introduced in a phase must be justified against this constraint.

---

## 3. Tech stack (locked-in choices — do not change without approval)

### Mobile (this repo)
- **Expo SDK 54**, React Native 0.81, **TypeScript strict**.
- **NativeWind 4** is installed (see `global.css`) but components use **inline `style` props** with the constants from `src/theme.ts` (`COLORS`, `FONT`, `RADIUS`, etc.) rather than Tailwind class names. Do not use `className` props — follow the existing inline-style convention.
- **`expo-router`** for navigation.
- **`expo-audio`** for recording and playback (NOT `expo-av`, which is deprecated since SDK 54).
- **`expo-secure-store`** for tokens.
- **`expo-notifications`** for push.
- **City search geocoding** for profile location: the app asks for a city/village name, resolves it to coordinates with an explicit search action, and stores only `profiles.city` + `profiles.location`. V1 does **not** request device GPS permission, does **not** use `expo-location`, and does **not** implement live autocomplete.
- State: React Query (`@tanstack/react-query`) for server state, Zustand for local UI state. No Redux.

### Admin back-office (companion web app, separate repo) — committed in V1 MVP
- **Next.js 14** (App Router), **TypeScript strict**, **Tailwind CSS**.
- **`@supabase/supabase-js`** client, anon key only — no service-role in the browser, ever.
- Auth: **Supabase Auth, email + magic link**, gated by an `admin_users` table (see `docs/ARCHITECTURE.md`).
- All write actions (takedowns, bans) go through Edge Functions that re-check `is_admin()` server-side.
- Hosted on **Vercel** (EU region `fra1`), free tier.
- Repo: separate from this one (suggested name `lovoice-admin`), shares the generated Supabase types via copy or a small published package.

### Backend — committed in V1 MVP
- **Supabase** (EU region — Frankfurt) hosts everything:
  - **Postgres** (with PostGIS for geo) — single source of truth.
  - **Auth** — phone OTP via Twilio Verify provider.
  - **Storage** — two buckets: `voices` (public-read via signed URLs) and `messages` (private, RLS-gated).
  - **Realtime** — WebSocket subscriptions on `messages` table for chat, plus Broadcast/Presence for typing indicators.
  - **Edge Functions** (Deno) — for any server logic that cannot live in a SQL trigger (upload commit, push dispatch, account deletion).
- **Twilio Verify** — SMS OTP (FR / BE / CH only).
- **Expo Push Service** — push notifications (free, sufficient at this scale).
- **Sentry** — crash & error reporting (mobile + Edge Functions).

### Backend — post-MVP, scheduled
These features are **not** part of the V1 MVP commitment but **are planned**. The vendors below are the committed implementations when the work is scheduled — they were selected against our EU residency and frugality constraints.

- **AssemblyAI** — automatic voice transcription (FR). Used to fill `voices.transcript` and `messages` transcripts. **Scheduled for ~Q3 2026 (Phase 10, ≈3 months post-MVP).**
- **Hive Moderation** — automatic audio + text moderation pipeline (see `docs/ARCHITECTURE.md` §4.3.b). **Scheduled for ~Q3 2026 (Phase 10, ≈3 months post-MVP).**
- **PostHog (EU)** — product analytics for retention and funnel analysis. Optional, scheduled in V1.x if needed (Phase 10.bis).

In V1 MVP, content safety relies on **reactive moderation** (block + report + manual takedown by the operator) and product insight relies on Sentry + raw Supabase queries. See constraint #4 below.

### Audio format
- **AAC in `.m4a` container, mono, 32 kbps, 22050 Hz.** Always.
- 1 min 30 s hard cap, enforced client-side AND server-side (Edge Function rejects > 2 MB or > 90_000 ms).

---

## 3.bis Naming & terminology (LOCKED)

The product term used in **every UI string (in French)** and in **every code identifier (in English)** is:

| Concept | French (UI) | English (code) |
|---|---|---|
| The voice introduction recorded by a user | **"voix"**, **"ta voix"** | `voice` (table `voices`, bucket `voices`, route `/voice`, hook `useVoice...`) |
| A voice message sent in a conversation | **"message vocal"** | `message` with `kind = 'voice'` |
| The act of listening | **"écouter"** | `play` |
| The act of recording | **"enregistrer"** | `record` |
| The Discover feed | **"Découvrir"** | `feed` / `discover` |
| The Likes screen | **"Likes"** | `likes` |

**The word "vibe" is forbidden.** It was used in the prototype and has been fully removed as part of Phase 0.

If you ever need to refer to the user's voice introduction, the only acceptable terms are:
- French UI: **"ta voix"**, **"sa voix"**, **"ma voix"**, **"voix enregistrée"**, **"enregistrer ta voix"**
- Code: `voice`, `voiceId`, `voicePath`, `userVoice`, `activeVoice`

---

## 4. Non-negotiable constraints

These rules apply to **every line of code** written for this project.

1. **Privacy first.** RLS is enabled on every table from day 1. No table is ever readable without RLS policies. A user can only read their own data and what is explicitly shared with them.
2. **No client-side trust.** Anything security-relevant (limits, ownership, moderation status) is enforced on the server (RLS + Edge Functions). The client is treated as hostile.
3. **No proxy upload.** Audio files go **directly client → Supabase Storage** via signed upload URLs. The backend never streams audio bytes.
4. **Reactive moderation in V1 MVP, via a dedicated back-office.** New voices and voice messages are visible immediately after upload (`status = 'approved'` by default). Safety relies on the block + report flow plus manual takedown by the operator from the admin back-office (a rejected row sets `status = 'rejected'` and the content disappears from the feed and chats). **The operator is non-technical: every moderation action must be reachable point-and-click in the back-office. No SQL, no Supabase Studio access for moderation.** The async pre-moderation pipeline (default `pending` until cleared by AssemblyAI + Hive) is the **target design** documented in `docs/ARCHITECTURE.md` §4.3.b — it is **scheduled for ~Q3 2026 (Phase 10, ≈3 months post-MVP)** and must ship before scaling beyond the validation cohort. The `status` column and its enum (`pending`, `approved`, `rejected`, `manual_review`) are kept in the schema from day 1 so Phase 10 is a localized addition, not a migration; the back-office gains a `manual_review` tab at that point.
5. **Account deletion is real.** A "delete my account" Edge Function purges users + voices + messages + storage objects + push tokens. Required by Apple and RGPD.
6. **EU data residency.** Supabase project must be in `eu-central-1` (Frankfurt). Any third-party processor must offer an EU DPA.
7. **No PII in logs.** Sentry/PostHog scrub phone numbers, transcripts, message contents.
8. **Audio session done right.** `playsInSilentModeIOS = true`, `staysActiveInBackground = true`, interruption handler for incoming calls. Test with phone on silent mode.
9. **Offline-tolerant chat.** Postgres is the source of truth. On reconnect, client refetches messages since `last_synced_at`. Never store chat in AsyncStorage as the source of truth.
10. **No `expo-av`.** Use `expo-audio`. If you see `expo-av` referenced anywhere in code, it is wrong.
11. **No `any` in TypeScript.** Generate Supabase types with `supabase gen types typescript` and use them.
12. **One feature = one PR-sized phase.** See `docs/ROADMAP.md`. Don't mix concerns across phases.
13. **Admin / user separation.** The `admin_users` table is the single source of truth for who can moderate. The `is_admin()` SQL helper is used in every admin-facing RLS policy and re-checked inside every admin Edge Function. The service-role key is **never** shipped to the back-office front-end — admin actions go through Edge Functions that verify the caller's JWT against `admin_users`.

---

## 5. Project structure (target after Phase 0 refactor)

```
LOVOICE_EXPO/
├── README.md                  ← you are here
├── docs/
│   ├── ARCHITECTURE.md        ← system design, data model, RLS, audio pipeline
│   └── ROADMAP.md             ← phased dev plan (read the relevant phase)
├── app/                       ← expo-router routes
│   ├── (auth)/                ← onboarding stack
│   ├── (main)/                ← tab navigator (discover, likes, messages, profile)
│   └── _layout.tsx
├── src/
│   ├── components/            ← reusable UI primitives
│   ├── features/              ← feature folders (auth, voices, feed, chat, likes, push)
│   │   └── <feature>/
│   │       ├── api/           ← Supabase queries (React Query hooks)
│   │       ├── hooks/
│   │       ├── components/
│   │       └── types.ts
│   ├── lib/                   ← supabase client, audio helpers, push helpers
│   ├── theme.ts
│   └── types/
│       └── database.ts        ← generated from Supabase
├── supabase/
│   ├── migrations/            ← SQL migrations (versioned)
│   ├── functions/             ← Edge Functions
│   └── seed.sql
├── assets/
└── eas.json                   ← EAS Build + Submit profiles
```

The admin back-office lives in a **sibling repository** (suggested name `lovoice-admin/`), created in Phase 6.bis. It consumes the same Supabase project. Its target structure:

```
lovoice-admin/
├── README.md
├── app/                       ← Next.js App Router
│   ├── (auth)/login/
│   ├── (admin)/reports/
│   ├── (admin)/users/[id]/
│   ├── (admin)/banned/
│   └── layout.tsx
├── src/
│   ├── lib/supabase.ts
│   ├── components/
│   └── types/database.ts      ← copied from the mobile repo, regenerated together
├── public/
└── next.config.ts
```

The `src/components/onboarding/*` are **prototype components**. They will be progressively refactored or deleted as phases progress. Treat them as visual reference, not as architecture.

> **Server-side types**: every type that describes server-stored data comes from `src/types/database.ts` (generated from Supabase via `supabase gen types typescript`). The feed feature exposes its own narrowed view types in `src/features/feed/types.ts` (`FeedItem`, `FeedItemTheme`, `FeedPage`) — they are derived from the `Database` type, not handwritten.

---

## 6. Workflow rules for the LLM

When starting any task:

1. **Re-read this README and `docs/ARCHITECTURE.md`.**
2. **Open `docs/ROADMAP.md` and find the current phase.** Stick to its scope.
3. **Never invent a new dependency** without a clear justification matching the constraints above. Default to "use what's already in `package.json`".
4. **Never store secrets in the repo.** Use `app.config.ts` + `expo-constants` + `EAS Secrets`.
5. **Never run destructive shell or git commands** without asking.
6. **Always propose a commit message** at the end of a phase, following Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`).
7. **No dead code, no commented-out blocks, no obvious comments.** Each file starts with a one-line purpose comment in English.
8. **TypeScript strict mode is on.** No `any`, no `@ts-ignore` without a comment explaining why.
9. **Run tests before finishing.** At the end of every phase, run `npm test` and verify all tests pass. Do not propose a commit if any test fails. When adding new logic (helpers, hooks, services), add corresponding unit tests in a `__tests__/` folder colocated with the source file.
10. **Address pending follow-ups before adding scope.** Before starting a phase, grep for `TODO(phase-N)` and `TODO(any-phase)` in the codebase, and read the "Cleanup before scope" subsection (if any) of the phase in `docs/ROADMAP.md`. Resolve what applies as the first step of the phase, in its own dedicated commit before the scope work.

---

## 7. Quick commands

```bash
npm install
npx expo start         # Start Metro dev server (use this to develop day-to-day)
npx expo run:ios       # Compile and install the dev build on iOS simulator (required after erasing simulator or first install)
npx expo run:android   # Compile and install the dev build on Android emulator
npm run check-env      # verify local .env.local matches .env.example
npm run sync-eas-env   # push .env.local values to EAS environments
npm test               # Run test suite (Jest + React Testing Library)
npm run test:watch     # Watch mode for development
npx supabase start     # local Supabase stack (after Phase 1 setup)
npx supabase db push   # apply migrations
npx supabase functions serve <name>  # run Edge Function locally
```

### Admin provisioning

To grant back-office access to a new operator, run `scripts/seed-admin.sql`
against the Supabase project's Postgres database (never via `supabase db push`):

```bash
psql "$SUPABASE_DB_URL" -f scripts/seed-admin.sql
```

The target person must already have an `auth.users` row. See the script header
for full prerequisites and the revocation one-liner.

> **Dev build vs Expo Go:** this project uses `expo-dev-client`. You **cannot** use the standard Expo Go app.
> The dev build (`npx expo run:ios`) must be installed once on the target device/simulator.
> After that, `npx expo start` + pressing `i` is enough for day-to-day development — no recompile needed.
> Rerun `npx expo run:ios` only when native dependencies change or after erasing the simulator.

> **Resetting a dev account for signup re-testing:**
> ```bash
> npx tsx scripts/reset-dev-account.ts +33XXXXXXXXX
> ```
> Requires `SUPABASE_SECRET_KEY` (legacy `service_role` JWT from Supabase Dashboard → Settings → API → Legacy keys) in `.env.local`. Never committed.

### Environment variables

`.env.example` is the source of truth for **required** mobile environment variable names. `.env.local` contains local development values and is never committed. Whenever you add a new **required** `EXPO_PUBLIC_*` variable:

1. Add its name to `.env.example` with an empty value.
2. Add the real local value to `.env.local`.
3. Run `npm run check-env`.
4. Run `npm run sync-eas-env` so EAS Cloud builds (TestFlight / production) receive the same value.
5. Rebuild the app, because Expo public env values are embedded at build time.

For **optional** `EXPO_PUBLIC_*` variables (e.g. third-party services that a contributor can opt out of locally), skip step 1 — `sync-eas-env` also picks up any `EXPO_PUBLIC_*` key present in `.env.local` even if it is not declared in `.env.example`.

Only use `EXPO_PUBLIC_*` for values that are safe to ship in the client bundle. Supabase URL and publishable key are public by design; secrets belong in Supabase Edge Functions or EAS Secrets, not in the mobile app.

#### Optional: Sentry crash reporting

Set `EXPO_PUBLIC_SENTRY_DSN` in `.env.local`, then run `npm run sync-eas-env` to push it to EAS. The DSN is a public identifier (safe to ship in the client bundle). When the DSN is missing, `initSentry()` is a no-op so the app still runs cleanly without it. Edge Functions use a separate secret `SENTRY_DSN` on Supabase — full details in **`docs/SENTRY.md`**.

### App Store / TestFlight (EAS)

`eas.json` defines **two** profile families with the same names (`production`, `preview`, …): **`build.*`** (native compile) and **`submit.*`** (upload to App Store Connect). `npm run submit:ios` uses `--profile production`, so a matching **`submit.production`** entry must exist.

- **Marketing version** — set `version` in `app.config.ts` (e.g. `0.2.2`). This is `CFBundleShortVersionString` / what users see as the app version.
- **iOS build number** — `eas.json` sets `cli.appVersionSource: "remote"` and the production build profile uses `autoIncrement: true`, so EAS stores and bumps the build number on the server. To reset or set it explicitly: `eas build:version:set --platform ios --profile production`.

```bash
npm run build:ios      # cloud build, store distribution, production channel
npm run submit:ios     # submit latest production iOS build to App Store Connect → TestFlight
```

Optional: under `submit.production.ios`, add `appleId`, `ascAppId` (numeric App ID in App Store Connect → App Information), and `appleTeamId` so `eas submit` does not prompt every time. Never commit secrets; use EAS Secrets or local env if needed.

---

## 8. Where to find what

| Question | File |
|---|---|
| What is the product? | this README, section 1 |
| What stack are we on? | this README, section 3 |
| What are the rules I must follow? | this README, section 4 |
| How is the data modeled? | `docs/ARCHITECTURE.md` |
| How does audio upload work? | `docs/ARCHITECTURE.md` |
| How does the admin back-office work? | `docs/ARCHITECTURE.md` §13 |
| What am I supposed to build right now? | `docs/ROADMAP.md` (current phase) |
| Anything chat audio / voice playback related (bug, refactor, regression)? | `docs/CHAT_AUDIO.md` — **read this before touching `chatMessagePlayer.ts`, `MessageBubble.tsx`, or the chat Realtime handlers** |
