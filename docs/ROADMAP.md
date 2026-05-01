<!--
  Phased development plan for LOVoice V1.
  Each phase is sized to fit in a single LLM context window.
  Sub-agents (explore / shell / generalPurpose) are allowed and encouraged.
  At the end of each phase: propose a Conventional Commit message; do not run git commands.
-->

# LOVoice — Development Roadmap

Each phase below is **self-contained**: it has a clear scope, deliverables, acceptance criteria, and lists the only external services it depends on.

Before starting any phase, **re-read `README.md` and `docs/ARCHITECTURE.md`**.

Legend:

- 🟢 = can be done with mocked data, no external account needed
- 🟡 = needs Supabase project + keys
- 🔴 = needs additional third-party (Twilio / AssemblyAI / Hive / Sentry / PostHog / EAS)
- ⭐ = **committed in V1 MVP**
- ✳️ = **optional / post-MVP** (to do later in V1 if time allows, or in a subsequent version)

The V1 MVP commitment covers all features described in this roadmap **except**:

- automatic voice transcription (AssemblyAI),
- automatic moderation (Hive — see `docs/ARCHITECTURE.md` §4.3.b),
- product analytics (PostHog).

Reactive moderation (block + report + manual takedown by the operator) is part of the MVP commitment and replaces auto-moderation until the optional phase ships. See `docs/ARCHITECTURE.md` §4.3.a.

---

## Phase 0 — Foundation refactor & UX/UI finalization 🟢

**Goal**: clean the prototype, finish the visual UX with the client, and put the codebase in a state where every following phase can plug in cleanly.

### Scope

1. **Refactor `App.tsx`** (currently 512 lines, monolithic). Split into:
   - `app/_layout.tsx` (root) using **`expo-router`**,
   - `app/(auth)/` for splash + home + phone + record onboarding,
   - `app/(main)/` tab navigator: `discover`, `likes`, `messages`, `profile`.
2. **Remove dead/legacy code** still hinting at swipe/match (none should remain — verify and delete if found).
3. **Rename "vibe" → "voice" everywhere** (see README §3.bis). Affected files at the time of writing:
   - `src/components/onboarding/RecordVibeScreen.tsx` → `RecordVoiceScreen.tsx`
   - `src/components/onboarding/MyVibeScreen.tsx` → `MyVoiceScreen.tsx`
   - `src/components/main/LikesScreen.tsx`, `src/components/main/FiltersModal.tsx`, `src/components/ProfileCard.tsx`, `App.tsx`, `src/types.ts` (local symbols and FR strings).
   - All FR UI strings: "Ta Vibe" → "Ta voix", "Vibe enregistrée" → "Voix enregistrée", "Découvrir plus de vibes" → "Découvrir plus de voix", `tab 'my-vibes'` → `tab 'my-voice'`, etc.
4. **Restructure `src/` per target structure** in README §5: introduce `src/features/{feed,voices,chat,likes,auth,profile,push}` folders with empty `api/`, `hooks/`, `components/` subfolders.
5. **Strict TS**: enable `"strict": true` in `tsconfig.json`, fix any resulting errors.
6. **Install foundational deps**:
   - `expo-router`,
   - `@tanstack/react-query`,
   - `zustand`,
   - `expo-secure-store`,
   - `expo-haptics`.
7. **Replace `geminiService.ts`** mock with a typed in-memory `mockProfilesService.ts` (no API call, no key needed).
8. **Walk-through with client**: produce a Loom or screenshots of the full nav flow, get sign-off.

### Deliverables

- Working app with expo-router and the 4 main tabs (discover, likes, messages, profile).
- `tsconfig.json` strict.
- Folder structure matches README §5.

### Acceptance

- App builds on iOS and Android without warnings related to deprecated APIs.
- No `expo-av` references anywhere.
- Client signs off on the screens.

### Suggested commit

`refactor(app): migrate to expo-router and finalize prototype UX`

---

## Phase 1 — Backend bootstrap (Supabase + EAS + envs) 🟢

**Goal**: the cloud project exists, the mobile app is connected to it, and the deployment pipeline works.

**Status:** Done  
**Completed:** 2026-04-29  
**Ref:** `phase-1-backend-bootstrap`

### Scope

1. Create **Supabase project in `eu-central-1`** (Frankfurt).
2. Initialize local Supabase: `supabase init`, commit the `supabase/` folder.
3. Create migration `0001_init.sql` with: extensions (`postgis`, `pgcrypto`), all tables from `ARCHITECTURE.md` §2, indexes, FKs.
4. Create migration `0002_rls.sql` with all RLS policies from §3 + storage bucket policies.
5. Create the two storage buckets `voices` and `messages` via SQL (`storage.buckets`).
6. Generate TS types: `supabase gen types typescript --linked > src/types/database.ts`. Commit.
7. Create `src/lib/supabase.ts` (client init with `expo-secure-store` for auth persistence + `react-native-url-polyfill`).
8. Wrap the app in `QueryClientProvider`.
9. Create `app.config.ts` reading env vars (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
10. Set up **EAS**: `eas.json` with `development`, `preview`, `production` profiles. Push secrets via `eas secret:create`.
11. Add a `scripts/check-env.ts` that fails the build if required env vars are missing.

### Deliverables

- Supabase project live, schema applied, RLS on every table.
- Mobile app boots and successfully calls `supabase.from('prompts').select()` (returns empty).
- EAS dev build runs on device.

### Acceptance

- `supabase db push` is idempotent.
- `npx supabase test db` (basic) passes.
- App reads env vars from EAS in a build, from `.env.local` in dev.

### Phase log

- Completed in Bloc A-F: local Supabase init/link, public env setup, initial schema, RLS policies, storage buckets, generated TypeScript types, typed Supabase client, `app.config.ts`, React Query provider, env check script, and EAS profiles.
- Validation performed:
  - Remote `supabase db push` applies cleanly and is idempotent.
  - Local Supabase starts after CLI/cache cleanup and applies migrations + seed.
  - RLS is enabled on all 12 public tables.
  - Storage buckets `voices` and `messages` exist.
  - Mobile app boots and runs the temporary `[Supabase smoke test]` against `prompts` without error.
  - `npm run check-env`, `npx tsc --noEmit`, and `eas build:configure --platform all` pass.
- Follow-ups:
  - Push EAS project secrets manually using `docs/EAS_SECRETS.md` before the first remote EAS build.
  - Remove the temporary `[Supabase smoke test]` in Phase 2 before adding auth-aware redirects.
  - Run the first EAS development build on a real device when device-only auth/build validation starts.

### Suggested commit

`feat(infra): bootstrap supabase project, schema, rls and EAS pipeline`

---

## Phase 2 — Phone authentication (FR/BE/CH only) 🟢

**Goal**: a user can sign in or sign up with their phone number, restricted to FR/BE/CH.

### Cleanup before scope

- Remove the temporary `[Supabase smoke test]` `useEffect` in `app/_layout.tsx` (added in Phase 1 Bloc E to validate the connection). The auth-aware redirect introduced by this phase replaces it.

### Scope

1. In Supabase Auth, enable **Phone provider with Twilio Verify**. Store Twilio Account SID + Auth Token + Verify Service SID in Supabase secrets.
2. Build `app/(auth)/phone.tsx`: country picker locked to FR/BE/CH (E.164 input), call `supabase.auth.signInWithOtp({ phone })`.
3. Build `app/(auth)/otp.tsx`: 6-digit code input, call `supabase.auth.verifyOtp`.
4. Country gating: derive country from the verified phone E.164 prefix. Trigger after first successful OTP creates a row in `profiles` with `country` set; reject any other prefix client-side AND with a DB trigger on `profiles` insert.
5. `useAuth()` hook + `AuthProvider` exposing `{ session, profile, signOut, isLoading }`.
6. Auth-aware redirect at the root layout: unauthenticated → `(auth)`, authenticated without profile → onboarding, authenticated with profile → `(main)`.
7. Persist session via `expo-secure-store` (custom `auth.storage`).

### Deliverables

- End-to-end phone signup works on a real device for one French number.
- Belgian and Swiss numbers are accepted; any other country is blocked with a clear message.
- Session persists across app restarts.

### Acceptance

- A user with a `+1` number cannot sign up.
- Logout clears the session and redirects to `(auth)/home`.
- Unit test on the country detection helper.

### Phase log

- Implemented in Bloc A-E:
  - Removed the temporary Supabase smoke test from `app/_layout.tsx`.
  - Added FR/BE/CH phone helpers and unit tests.
  - Added a Phase 2 migration for explicit `profiles.country` gating and `insert_own_profile` RLS.
  - Documented Twilio Verify + Supabase Phone provider setup in `docs/TWILIO_SETUP.md`.
  - Added `AuthProvider`, `useAuth`, auth-aware redirects, real phone OTP request, 6-digit OTP verification, resend, and a profile logout flow.
- Manual setup completed:
  - Supabase migration applied.
  - Twilio Verify configured in Supabase Phone Auth.
  - French phone number OTP flow smoke-tested on device.
- Scope note:
  - The roadmap originally said Phase 2 creates a `profiles` row immediately after OTP with `country`. The current schema requires `display_name`, `birthdate`, `gender`, and `city`, so Phase 2 keeps the valid state "authenticated without profile"; full profile creation, including persisted `country`, remains Phase 3.
- Validation performed:
  - `npx tsc --noEmit`
  - `npm test -- --runInBand`

### Suggested commit

`feat(auth): phone OTP authentication restricted to FR/BE/CH`

---

## Phase 3 — Profile onboarding 🟡 ⭐

**Goal**: after auth, the user creates their profile (name, birthdate, gender, looking-for, city with coordinates).

### Scope

1. Multi-step wizard under `app/(auth)/onboarding/`: `name`, `birthdate` (must be ≥ 18), `gender`, `looking-for`, `city` (city/village search that stores both display name and coordinates).
2. On finish, `upsert` into `profiles` (insert if not exists).
3. Validation server-side via a `before insert` trigger on `profiles`: age ≥ 18, country in (FR,BE,CH), name length 2–30.
4. Edit profile screen reachable from `(main)/profile`.
5. CGU + Privacy Policy acceptance (checkbox + links).
6. No device geolocation in V1: do not install `expo-location`. City lookup uses an explicit Nominatim search action, not live autocomplete, so no geocoding API key is needed in this version.

### Deliverables

- Profile creation wizard fully working.
- A profile row is created with all required fields.
- `profiles.location` is populated from the selected city/village coordinates.
- Edit profile updates the row.

### Acceptance

- Trying to set birthdate < 18 is blocked client and server side.
- Required fields cannot be skipped.

### Phase log

- Completed in Bloc A-G:
  - Removed the mocked `profile-setup` route and redirected recording completion to the real onboarding wizard.
  - Added profile field validators and tests for display name, age, gender, and looking-for values.
  - Added server-side profile validation trigger with stable `23514` messages.
  - Added `useUpsertProfile()` with React Query invalidation, country derivation from the verified phone number, and PostGIS point formatting.
  - Built the `app/(auth)/onboarding/` wizard with ephemeral Zustand state, terms acceptance, required field validation, explicit Nominatim city search, and final Supabase profile upsert.
  - Replaced the main profile tab with an editable profile form that reuses the same validation and upsert path.
  - Kept V1 location aligned with product decisions: no device GPS, no `expo-location`, no live autocomplete, and no country filtering from selected city.
- Validation performed:
  - `npx tsc --noEmit`
  - `npm test -- --runInBand`
  - Lints checked on edited Phase 3 files.

### Suggested commit

`feat(profile): onboarding wizard with age and country gating`

---

## Phase 4 — Voice recording + voice upload 🟡 ⭐

**Goal**: user can record, re-record, listen back, and publish their voice.

### Scope

1. Install **`expo-audio`**. Configure `AVAudioSession` defaults in `src/lib/audio.ts`.
2. Build `useVoiceRecorder` hook: start, stop, pause, resume, metering at 50 ms, hard cap at 300_000 ms.
3. Build `useVoicePlayer` hook (single-instance variant for preview).
4. `app/(auth)/onboarding/record.tsx` (and a reachable `app/(main)/profile/record.tsx`): live waveform, timer, prompt picker (`prompts` table seeded), record / stop / replay / re-record.
5. Implement Edge Function `request_upload` and `commit_upload` per ARCHITECTURE §4.2. Sign client-side using the helper from `@supabase/storage-js`. **In V1 MVP, `commit_upload` inserts the row with `status = 'approved'` and does NOT enqueue a moderation job** (the auto-moderation pipeline is the optional Phase 9). The code path that would enqueue the job is gated by an env flag (`AUTO_MODERATION_ENABLED`) so Phase 9 is a flip, not a refactor.
6. Client uploads via signed PUT directly to Storage.
7. After commit, set `voices.is_active = true` for the latest, `false` for previous.
8. Display the user's current voice on the profile screen with replay.

### Deliverables

- A user can record, listen, re-record, and publish a voice.
- Storage object exists at `voices/{user_id}/{voice_id}.m4a`.
- DB row `voices` created with `status = 'approved'` (V1 MVP) — and immediately visible in the feed.

### Acceptance

- Recording auto-stops at 5:00.
- Files are 32 kbps mono AAC, ~240 KB/min ±10%.
- Upload works on flaky network (manual test: airplane mode mid-upload → retry).

### Suggested commit

`feat(voices): recording, signed upload pipeline, profile voice management`

---

## Phase 5 — Discover feed (playback + autoplay + preload) 🟡 ⭐

**Goal**: the TikTok-style feed loads real voices from Supabase and plays them with zero perceived latency.

### Scope

1. Replace mocked `INITIAL_PROFILES` with a paginated query to `get_feed()` (security-definer SQL function from ARCHITECTURE §8).
2. React Query `useInfiniteQuery` with cursor on `created_at`.
3. Build the **3-instance ring buffer player** in `src/lib/feedPlayer.ts`. Preload `current+1` and `current+2` on `prepareAsync` using signed URLs.
4. Update `ProfileCard` to consume the ring (no own `Audio.Sound`).
5. Track played-% locally (used to gate `feed_seen` insertion). Emitting a `voice_played` PostHog event when ≥ 50% listened is **optional** — only wire it if Phase 10's PostHog block is shipped.
6. On scroll, insert into `feed_seen` (debounced batch every 5 voices).
7. Empty-feed state: re-suggest filter widening.
8. Filters modal: gender, age range, max distance km. Persisted in Zustand + reflected in query params.

### Deliverables

- Real feed scrolling with live audio from Storage.
- Autoplay mode chains voices with no audible gap.
- `feed_seen` populated.

### Acceptance

- First playback of any voice starts < 500 ms after tap on a 4G connection.
- Scrolling 20 cards never throws an unhandled promise rejection.
- Filters change updates the feed within 1 query.

### Suggested commit

`feat(feed): live discover feed with preloaded ring playback`

---

## Phase 6 — Likes, blocks, reports (+ moderation backend) 🟡 ⭐

**Goal**: users can like a voice, block a user, report a voice or a user. Like events appear in the recipient's Likes screen (received tab). The server-side moderation primitives that the back-office (Phase 6.bis) will consume are in place.

### Scope

1. Implement `like(voice_id)` / `unlike(voice_id)` mutations.
2. Heart button in `ProfileCard` with optimistic update.
3. SQL trigger on `likes` insert → insert into `notifications` with `kind='like'` (feeds push delivery in Phase 8 and the "received" tab of the Likes screen).
4. Block flow from a long-press on the card or from a profile detail sheet. Confirmation modal.
5. Report flow: list of reasons (harassment, hate, inappropriate, spam, other) + free text. Inserts a `reports` row with `status = 'pending'`.
6. Filtering: feed query already excludes blocked users (already in §8). Verify likes/messages are blocked too.
7. **Moderation backend primitives** (consumed by Phase 6.bis — no UI in the mobile app):
   - Migration: `admin_users` and `audit_log` tables (see ARCHITECTURE.md §2.10 / §2.11), `is_admin()` helper, admin RLS policies on `voices` / `messages` / `reports` / `profiles` / Storage (see ARCHITECTURE.md §3).
   - Edge Functions, all gated by `is_admin()` server-side and writing to `audit_log`:
     - `dismiss_report({ report_id, reason? })`,
     - `moderate({ target_kind, target_id, reason })` — sets `status = 'rejected'`, stores `moderation_reason`, inserts a `kind='system'` notification for the author, marks related reports as `actioned`. Idempotent.
     - `ban_user({ user_id, reason })`,
     - `unban_user({ user_id })`,
     - `delete_account_admin({ user_id, reason })`.
8. PostHog events for like/block/report — **optional**, only wire if PostHog is enabled (Phase 10.bis).

### Deliverables

- Like appears in the recipient's Likes screen (received tab) and creates a `notifications` row for push delivery.
- Block hides both directions (you don't see them, they don't see you).
- Report writes a row + sends an internal alert (plain DB row in V1; Slack webhook is post-MVP).
- All five admin Edge Functions deployed and unit-tested (Deno test runner against local Supabase). Calling them without an admin JWT returns 401.

### Acceptance

- Liking a voice twice does not create two notifications (unique index `(liker_id, voice_id)`).
- A blocked user cannot send you a new message.
- Calling `moderate()` from a non-admin JWT is rejected with 401 and no row is touched.
- Every successful admin Edge Function call appends one row to `audit_log`.

### Suggested commit

`feat(social): likes, blocks, reports and moderation backend primitives`

---

## Phase 6.bis — Admin back-office (companion Next.js web app) 🟢 ⭐

**Goal**: the operator (non-technical) can triage reports, take down content, and ban users from a clean web interface — no SQL, no Supabase Studio.

This phase produces a **separate Next.js repository** (suggested name `lovoice-admin`) that consumes the same Supabase project as the mobile app. See `docs/ARCHITECTURE.md` §13 for the full design.

### Pre-requisites

- Phase 6 merged (admin Edge Functions and RLS policies live).
- A Vercel account (free) connected to the new `lovoice-admin` repo, EU region (`fra1`).
- At least one admin email seeded in `admin_users` (the operator's email).

### Scope

1. **Bootstrap the repo**:
   - `npx create-next-app@latest lovoice-admin --typescript --tailwind --app --eslint`,
   - configure TypeScript strict mode (same level as the mobile app),
   - install: `@supabase/supabase-js`, `@supabase/ssr`, `@tanstack/react-query`, `lucide-react`, `date-fns`. Nothing else.
   - copy `src/types/database.ts` from the mobile repo into `src/types/database.ts`. Document in the README that the file must be regenerated together whenever a Supabase migration ships.
2. **Supabase client** in `src/lib/supabase.ts` using `@supabase/ssr` for cookie-based session handling. Public anon key only — service role key is **never** added to env.
3. **Auth**:
   - `/login` page: email input → `signInWithOtp({ email, options: { emailRedirectTo: '<URL>/reports' } })`.
   - `app/(admin)/layout.tsx`: server component that reads the session, calls `is_admin()`, and redirects to `/login` with an error if false.
4. **`/reports` page** (default route after login):
   - Server-side fetch of `pending_reports` view (a SQL view created in this phase that joins `reports` with `voices` / `messages` / `profiles`). Pagination 25/page.
   - Each row: avatars, reason, free text, an `<audio controls>` on a freshly-created signed URL (1h TTL), three buttons.
   - Buttons call the corresponding Edge Function (`dismiss_report`, `moderate`, `ban_user`). Confirmation modal on `moderate` and `ban_user`.
   - Toast on success/error. React Query invalidation on the reports list after each action.
   - Auto-refresh every 30s.
5. **`/users/[id]` page**: profile detail (display fields, current voice with player, last 10 messages of theirs, last 10 reports against them). Buttons: **Bannir** / **Lever le ban** (according to current state) / **Supprimer le compte**.
6. **`/banned` page**: list of `profiles` where `is_banned = true`, with reason and an Unban button.
7. **`/audit` page**: paginated read-only view of `audit_log`, filterable by `actor_id`, `action`, `target_kind`. Last 90 days only.
8. **Provisioning script**: `scripts/seed-admin.sql` documented in the back-office README — a one-shot insert into `admin_users` (run by the developer the first time, then by the operator herself for any new admin).
9. **UX polish**: French copy throughout, dark mode toggle, accessible labels, mobile-responsive layout (the operator might consult on her phone occasionally).
10. **Smoke test plan** (manual, documented in the back-office README): login flow, take down a test report, ban a test user, unban, delete a test account, check `audit_log`.

### Deliverables

- `lovoice-admin` repo deployed on Vercel at a stable URL (`admin.lovoice.app` or similar).
- Operator can log in with her email and complete the full moderation loop point-and-click.
- Every action she performs leaves a trace in `audit_log`.
- Zero SQL written by the operator.

### Acceptance

- Login by an email NOT in `admin_users` is rejected with a clear error and the user is signed out.
- Calling any of the five admin Edge Functions from the browser DevTools console with a stolen non-admin JWT returns 401.
- The service-role key does not appear in any built bundle (verified by grep on the `.next` build output).
- Lighthouse score on `/reports` ≥ 90 (perf and a11y).

### Suggested commit (in the `lovoice-admin` repo)

`feat(admin): initial back-office for reports, bans and audit log`

---

## Phase 7 — Messaging (text + voice, Realtime) 🟡 ⭐

**Goal**: full chat with text and voice messages, real-time updates, read receipts.

### Scope

1. Conversation creation: when a user sends a first message in response to a voice, lazily create the `conversations` row (sorted user_a/user_b).
2. `MessagesScreen` (inbox): list conversations with last message preview + unread badge. Realtime subscription on `notifications` for unread updates.
3. `ConversationScreen` (`app/(main)/messages/[id].tsx`): paginated message list (cursor on `created_at` desc), Realtime subscription on `messages` filtered by conversation.
4. Composer: text input + record button. Voice messages reuse `useVoiceRecorder` (max 5 min) and the same upload pipeline (`kind='message'`).
5. Inline voice player per message (reuse `useVoicePlayer` single-instance — only one playing at a time, others auto-pause).
6. Read receipts: on screen open, `update messages set read_at = now() where conversation_id = $1 and sender_id != auth.uid() and read_at is null`.
7. Typing indicator via Realtime Broadcast (throttled 1/s).
8. Recording indicator ("X est en train d'enregistrer un vocal…") via Broadcast.
9. Optimistic send + retry queue.

### Deliverables

- Two devices can text-chat in real time (< 500 ms perceived latency).
- Voice messages can be sent, received, and played within the same conversation.
- Read receipts appear live for the sender.

### Acceptance

- App reconnects after network loss and replays missed messages.
- Killing the app and reopening a conversation shows all history.
- Recording indicator disappears within 2s of stop.

### Suggested commit

`feat(chat): realtime messaging with text and voice messages`

---

## Phase 8 — Push notifications 🔴 (Expo Push) ⭐

**Goal**: push notifications for likes and new messages, deep-linking to the relevant screen. There is no dedicated Notifications screen — likes appear in the Likes screen (received tab) and messages appear in the Messages screen.

### Scope

1. Edge Function `dispatch_push(notification_id)` triggered after `notifications` insert (DB trigger calls `pg_net` to invoke it). Sends to Expo Push API using the recipient's `push_token`.
2. Debounce rule: max 1 push per (actor → recipient → kind) per hour for likes. Messages always push (unless recipient currently online — checked via Realtime presence).
3. On app launch, register for push and store/refresh `profiles.push_token`.
4. Tap a push → deep link to the right screen via expo-router (`likes` for a like push, `messages/[id]` for a message push).
5. Unread badge on the Likes tab (count of unseen received likes) and Messages tab (count of unread conversations). Realtime subscription to update badges live.

### Deliverables

- Push received on real device for a like and a message.
- Tapping a like push opens the Likes screen. Tapping a message push opens the conversation.
- Unread badges update in real time.

### Acceptance

- iOS push works in background AND when app is killed.
- Android push works on a Pixel with Play Services.
- Disabling push in OS settings is handled gracefully.

### Suggested commit

`feat(push): push delivery with deep links to likes and messages`

---

## Phase 9 — Auto-moderation pipeline (transcription + safety) 🔴 (AssemblyAI + Hive) ✳️ optional / post-MVP

**Status**: **NOT in the V1 MVP commitment.** Ship only if MVP time allows, otherwise schedule for V1.x. Until this phase ships, content safety is handled by reactive moderation (Phase 6 + `docs/ARCHITECTURE.md` §4.3.a).

**Goal**: every uploaded voice and voice message is automatically transcribed and moderated before being visible.

### Pre-requisites

- Client has AssemblyAI and Hive accounts with EU DPA signed.
- `ASSEMBLYAI_KEY`, `HIVE_KEY`, `OPENAI_API_KEY` are set as Edge Function secrets.

### Scope

1. Flip `voices.status` and `messages.status` defaults from `'approved'` back to `'pending'` (one migration).
2. Toggle the env flag `AUTO_MODERATION_ENABLED = true` so `commit_upload` enqueues moderation jobs (the code path was prepared in Phase 4).
3. Create `moderation_jobs` table + Edge Function `process_moderation_jobs` scheduled every 30s (Supabase scheduled cron).
4. AssemblyAI integration: submit, poll, store transcript on the parent row.
5. Hive Audio + Hive Text integrations.
6. OpenAI Moderation as cheap secondary check on transcript.
7. Decision logic per ARCHITECTURE §4.3.b.
8. On rejection: hide content, notify author with reason, allow appeal (a button creates a `manual_review` request — replaces the email-based appeal of the MVP).
9. **Back-office extension** (in the `lovoice-admin` repo): add a new `/manual-review` route that lists items with `status = 'manual_review'` and reuses the same row component and the same `moderate()` action as `/reports`. Add a transcript column on both routes (reads `voices.transcript` / `messages.transcript`). No new Edge Function needed.

### Deliverables

- A clean voice goes from `pending` to `approved` within 60s of upload.
- A voice with explicit content goes to `rejected` and is invisible in the feed.
- Author sees the rejection in their notifications with a reason.

### Acceptance

- No voice with `status != 'approved'` ever appears in `get_feed()`.
- Moderation throughput keeps up with upload throughput at the projected volume (no growing backlog in `moderation_jobs`).

### Suggested commit

`feat(moderation): async transcription and safety pipeline for voices and messages`

---

## Phase 10 — RGPD, security hardening, observability 🔴 (Sentry) ⭐

**Goal**: app is store-ready and compliant.

### Scope (V1 MVP — committed)

1. Edge Function `delete_account` per ARCHITECTURE §9. Reachable from a Profile → Danger Zone screen.
2. Data export (RGPD right to portability): Edge Function `export_my_data` returns a JSON of all the user's data + signed URLs to their audio files (1h TTL).
3. CGU + Privacy Policy hosted (Notion / Webflow) and linked from the app.
4. **Sentry** wired (mobile + Edge Functions) with PII scrubbing.
5. Rate limiting on Edge Functions: per-user buckets in Postgres (`rate_limits` table) for `request_upload`, `commit_upload`, `like`, `report`. Reasonable limits (e.g. 30 uploads/day, 100 likes/hour).
6. Audit table `audit_log(actor_id, action, target, created_at)` for security-sensitive actions (block, report, delete, moderate).

### Deliverables

- Account deletion fully purges user data.
- Data export downloads a complete archive.
- Sentry receives a test crash from mobile and from an Edge Function.

### Acceptance

- Test that after `delete_account`, no row referencing the user remains except anonymized message tombstones.
- App passes Apple's 5.1.1(v) account-deletion requirement.

### Suggested commit

`feat(compliance): account deletion, data export, sentry and rate limiting`

---

## Phase 10.bis — Product analytics 🔴 (PostHog) ✳️ optional / post-MVP

**Status**: **NOT in the V1 MVP commitment.** Ship in V1 if time allows, otherwise schedule later.

### Pre-requisites

- Client has a PostHog Cloud EU account with DPA signed.
- `POSTHOG_KEY` set in EAS env.

### Scope

1. Install `posthog-react-native` and initialize in `src/lib/analytics.ts` with EU host.
2. Wire the events listed in ARCHITECTURE §10: `voice_recorded`, `voice_played` (with `pct_listened`), `voice_liked`, `message_sent` (with `kind`), `conversation_opened`, `signup_completed`, `block`, `report`. **No content fields, only counts and IDs.**
3. PII scrubbing pass: ensure no phone, transcript or message body ever ends up in a property.
4. Identify users with their `profiles.id` (never the phone).
5. Validate end-to-end: events show up in PostHog within 1 minute on a real device.
6. **Back-office extension** (in the `lovoice-admin` repo): add a `/stats` route that embeds the operator's chosen PostHog insights as iframes (PostHog supports public iframe sharing per insight). Read-only, no new Edge Function.

### Suggested commit

`feat(analytics): posthog integration with PII-safe event tracking`

---

## Phase 11 — Production build + store submission 🔴 (EAS + App Store + Play Store) ⭐

**Goal**: app is in TestFlight and Google Play Internal Testing.

### Scope

1. App icons, splash, adaptive icons (1024 + Android adaptive).
2. App Store Connect: app record, screenshots (FR), description, age rating (17+), privacy nutrition labels.
3. Google Play Console: app record, screenshots, content rating, data safety form.
4. Build production with EAS Build, submit via `eas submit`.
5. Internal testing groups invited.
6. Smoke test plan executed on iOS + Android.

### Deliverables

- Build available in TestFlight.
- Build available in Internal Testing on Play.
- Crash-free rate > 99% on the smoke run.

### Suggested commit

`chore(release): v1.0.0 production build for TestFlight and Play Internal`

---

## Estimated effort (single dev + LLM)

| Phase                                                | Scope       | Estimate               |
| ---------------------------------------------------- | ----------- | ---------------------- |
| 0 — Foundation refactor                              | ⭐ MVP      | 2 days                 |
| 1 — Backend bootstrap                                | ⭐ MVP      | 1.5 days               |
| 2 — Phone auth                                       | ⭐ MVP      | 1 day                  |
| 3 — Profile onboarding                               | ⭐ MVP      | 1.5 days               |
| 4 — Voice recording + upload                         | ⭐ MVP      | 3 days                 |
| 5 — Discover feed playback                           | ⭐ MVP      | 3 days                 |
| 6 — Likes / blocks / reports + moderation backend    | ⭐ MVP      | 2 days                 |
| 6.bis — Admin back-office (Next.js)                  | ⭐ MVP      | 2 days                 |
| 7 — Messaging realtime                               | ⭐ MVP      | 4 days                 |
| 8 — Push notifications                               | ⭐ MVP      | 1 day                  |
| 10 — RGPD + Sentry + rate limiting                   | ⭐ MVP      | 2 days                 |
| 11 — Store submission                                | ⭐ MVP      | 2 days                 |
| **MVP subtotal (committed)**                         |             | **≈ 25 working days**  |
| 9 — Auto-moderation pipeline (+ back-office tab)     | ✳️ optional | 2.5 days               |
| 10.bis — PostHog analytics (+ back-office stats tab) | ✳️ optional | 1 day                  |
| **Optional subtotal**                                |             | **≈ 3.5 working days** |

---

## How to start a phase (LLM operating procedure)

1. Read `README.md` and `docs/ARCHITECTURE.md` end-to-end.
2. Open this file at the current phase. **Do not read other phases.**
3. Confirm with the user that the previous phase is signed off.
4. List the new external accounts/keys needed (cross-check with `docs/CLIENT_SETUP.md`).
5. Use sub-agents (`explore`, `shell`) for repetitive tasks (codebase mapping, command runs).
6. Implement scope strictly; flag any out-of-scope idea as "deferred to phase X".
7. End with: a) test plan executed, b) suggested Conventional Commit message, c) updated note in `docs/ROADMAP.md` if scope drifted.
