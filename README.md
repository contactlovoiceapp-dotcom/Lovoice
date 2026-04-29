<!--
  Read this file FIRST at the beginning of every new development phase.
  It is the canonical onboarding for any LLM (or human) joining the project.
  Sources of truth: this README + docs/ARCHITECTURE.md + docs/ROADMAP.md.
-->

# LOVoice — Mobile App (React Native / Expo)

> **LLM, read this entire file before doing anything else.**
> Then read `docs/ARCHITECTURE.md` and the relevant phase in `docs/ROADMAP.md`.
> Never deviate from the architecture or constraints below without explicit user approval.

The product ships in **two deliverables**:
1. **The mobile app** (this repo) — what end users install on iOS/Android.
2. **A small admin back-office web app** (separate Next.js repo, see Phase 6.bis in `docs/ROADMAP.md`) — a CRUD interface used exclusively by the operator (the client) to triage reports and moderate content. The client is **non-technical**: she must never have to write SQL or open Supabase Studio. All moderation actions happen in this web app, point-and-click only.

---

## 1. Product summary

LOVoice is a **voice-first dating app** for French-speaking Europe (FR / BE / CH).
Each user records a short **voice** (max 5 minutes) that introduces them.
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
- **NativeWind 4** (Tailwind classes) for styling.
- **`expo-router`** for navigation (to be introduced in Phase 0 — currently `App.tsx` is a manual switch, must be migrated).
- **`expo-audio`** for recording and playback (NOT `expo-av`, which is deprecated since SDK 54).
- **`expo-secure-store`** for tokens.
- **`expo-notifications`** for push.
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

### Backend — optional / post-MVP
These features are **not** part of the V1 commitment. They will be added either later in V1 if time allows, or in a subsequent version. The vendors below are the recommended implementations when the work is scheduled — they were selected against our EU residency and frugality constraints.

- **AssemblyAI** — automatic voice transcription (FR). Used to fill `voices.transcript` and `messages` transcripts.
- **Hive Moderation** — automatic audio + text moderation pipeline (see `docs/ARCHITECTURE.md` §4.3).
- **PostHog (EU)** — product analytics for retention and funnel analysis.

In V1 MVP, content safety relies on **reactive moderation** (block + report + manual takedown by the operator) and product insight relies on Sentry + raw Supabase queries. See constraint #4 below.

### Audio format
- **AAC in `.m4a` container, mono, 32 kbps, 22050 Hz.** Always.
- 5 min hard cap, enforced client-side AND server-side (Edge Function rejects > 6 MB or > 300_000 ms).

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

**The word "vibe" is forbidden.** It was used in the prototype and must be removed everywhere it still appears (`App.tsx`, `RecordVibeScreen.tsx`, `MyVibeScreen.tsx`, `ProfileCard.tsx`, `FiltersModal.tsx`, `LikesScreen.tsx`, `src/types.ts`). This rename is part of Phase 0.

If you ever need to refer to the user's voice introduction, the only acceptable terms are:
- French UI: **"ta voix"**, **"sa voix"**, **"ma voix"**, **"voix enregistrée"**, **"enregistrer ta voix"**
- Code: `voice`, `voiceId`, `voicePath`, `userVoice`, `activeVoice`

---

## 4. Non-negotiable constraints

These rules apply to **every line of code** written for this project.

1. **Privacy first.** RLS is enabled on every table from day 1. No table is ever readable without RLS policies. A user can only read their own data and what is explicitly shared with them.
2. **No client-side trust.** Anything security-relevant (limits, ownership, moderation status) is enforced on the server (RLS + Edge Functions). The client is treated as hostile.
3. **No proxy upload.** Audio files go **directly client → Supabase Storage** via signed upload URLs. The backend never streams audio bytes.
4. **Reactive moderation in V1 MVP, via a dedicated back-office.** New voices and voice messages are visible immediately after upload (`status = 'approved'` by default). Safety relies on the block + report flow plus manual takedown by the operator from the admin back-office (a rejected row sets `status = 'rejected'` and the content disappears from the feed and chats). **The operator is non-technical: every moderation action must be reachable point-and-click in the back-office. No SQL, no Supabase Studio access for moderation.** The async pre-moderation pipeline (default `pending` until cleared by AssemblyAI + Hive) remains the **target design** and is documented in `docs/ARCHITECTURE.md` §4.3 — it is scheduled as an optional phase in `docs/ROADMAP.md` and must ship before scaling beyond the validation cohort. The `status` column and its enum (`pending`, `approved`, `rejected`, `manual_review`) are kept in the schema from day 1 so the auto-moderation pipeline can be plugged in without a migration; the back-office gains a `manual_review` tab at that point.
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
│   ├── ROADMAP.md             ← phased dev plan (read the relevant phase)
│   └── CLIENT_SETUP.md        ← accounts/keys checklist for the client
├── app/                       ← expo-router routes (introduced in Phase 0)
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
└── eas.json                   ← EAS Build profiles (introduced in Phase 1)
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

The current `App.tsx` and `src/components/onboarding/*` are **prototype code with mocked data**. They will be progressively refactored or deleted as phases progress. Treat them as visual reference, not as architecture.

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
npm start              # Expo dev server
npm run ios            # iOS simulator
npm run android        # Android emulator
npm test               # Run test suite (Jest + React Testing Library)
npm run test:watch     # Watch mode for development
npx supabase start     # local Supabase stack (after Phase 1 setup)
npx supabase db push   # apply migrations
npx supabase functions serve <name>  # run Edge Function locally
```

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
| What does the client need to provide? | `docs/CLIENT_SETUP.md` |
