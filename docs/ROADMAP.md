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

---

## Phase 0 — Foundation refactor & UX/UI finalization 🟢

**Goal**: clean the prototype, finish the visual UX with the client, and put the codebase in a state where every following phase can plug in cleanly.

### Scope
1. **Refactor `App.tsx`** (currently 512 lines, monolithic). Split into:
   - `app/_layout.tsx` (root) using **`expo-router`**,
   - `app/(auth)/` for splash + home + phone + record onboarding,
   - `app/(main)/` tab navigator: `discover`, `notifications`, `messages`, `profile`.
2. **Remove dead/legacy code** still hinting at swipe/match (none should remain — verify and delete if found).
3. **Rename "vibe" → "voice" everywhere** (see README §3.bis). Affected files at the time of writing:
   - `src/components/onboarding/RecordVibeScreen.tsx` → `RecordVoiceScreen.tsx`
   - `src/components/onboarding/MyVibeScreen.tsx` → `MyVoiceScreen.tsx`
   - `src/components/main/LikesScreen.tsx`, `src/components/main/FiltersModal.tsx`, `src/components/ProfileCard.tsx`, `App.tsx`, `src/types.ts` (local symbols and FR strings).
   - All FR UI strings: "Ta Vibe" → "Ta voix", "Vibe enregistrée" → "Voix enregistrée", "Découvrir plus de vibes" → "Découvrir plus de voix", `tab 'my-vibes'` → `tab 'my-voice'`, etc.
4. **Add the `Notifications` screen** (placeholder list with mocked items: like / new message / system).
5. **Restructure `src/` per target structure** in README §5: introduce `src/features/{feed,voices,chat,notifications,auth,profile}` folders with empty `api/`, `hooks/`, `components/` subfolders.
6. **Strict TS**: enable `"strict": true` in `tsconfig.json`, fix any resulting errors.
7. **Install foundational deps**:
   - `expo-router`,
   - `@tanstack/react-query`,
   - `zustand`,
   - `expo-secure-store`,
   - `expo-haptics`.
8. **Replace `geminiService.ts`** mock with a typed in-memory `mockProfilesService.ts` (no API call, no key needed).
9. **Walk-through with client**: produce a Loom or screenshots of the full nav flow including the new Notifications screen, get sign-off.

### Deliverables
- Working app with expo-router and the 4 main tabs.
- Notifications screen visible (mocked).
- `tsconfig.json` strict.
- Folder structure matches README §5.

### Acceptance
- App builds on iOS and Android without warnings related to deprecated APIs.
- No `expo-av` references anywhere.
- Client signs off on the screens.

### Suggested commit
`refactor(app): migrate to expo-router and finalize prototype UX`

---

## Phase 1 — Backend bootstrap (Supabase + EAS + envs) 🟡

**Goal**: the cloud project exists, the mobile app is connected to it, and the deployment pipeline works.

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

### Suggested commit
`feat(infra): bootstrap supabase project, schema, rls and EAS pipeline`

---

## Phase 2 — Phone authentication (FR/BE/CH only) 🔴 (Twilio)

**Goal**: a user can sign in or sign up with their phone number, restricted to FR/BE/CH.

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

### Suggested commit
`feat(auth): phone OTP authentication restricted to FR/BE/CH`

---

## Phase 3 — Profile onboarding 🟡

**Goal**: after auth, the user creates their profile (name, birthdate, gender, looking-for, city, optional location).

### Scope
1. Multi-step wizard under `app/(auth)/onboarding/`: `name`, `birthdate` (must be ≥ 18), `gender`, `looking-for`, `city` (text), `location` (optional, `expo-location`).
2. On finish, `upsert` into `profiles` (insert if not exists).
3. Validation server-side via a `before insert` trigger on `profiles`: age ≥ 18, country in (FR,BE,CH), name length 2–30.
4. Edit profile screen reachable from `(main)/profile`.
5. CGU + Privacy Policy acceptance (checkbox + links).

### Deliverables
- Profile creation wizard fully working.
- A profile row is created with all required fields.
- Edit profile updates the row.

### Acceptance
- Trying to set birthdate < 18 is blocked client and server side.
- Required fields cannot be skipped.

### Suggested commit
`feat(profile): onboarding wizard with age and country gating`

---

## Phase 4 — Voice recording + voice upload 🟡

**Goal**: user can record, re-record, listen back, and publish their voice.

### Scope
1. Install **`expo-audio`**. Configure `AVAudioSession` defaults in `src/lib/audio.ts`.
2. Build `useVoiceRecorder` hook: start, stop, pause, resume, metering at 50 ms, hard cap at 300_000 ms.
3. Build `useVoicePlayer` hook (single-instance variant for preview).
4. `app/(auth)/onboarding/record.tsx` (and a reachable `app/(main)/profile/record.tsx`): live waveform, timer, prompt picker (`prompts` table seeded), record / stop / replay / re-record.
5. Implement Edge Function `request_upload` and `commit_upload` per ARCHITECTURE §4.2. Sign client-side using the helper from `@supabase/storage-js`.
6. Client uploads via signed PUT directly to Storage.
7. After commit, set `voices.is_active = true` for the latest, `false` for previous.
8. Display the user's current voice on the profile screen with replay.

### Deliverables
- A user can record, listen, re-record, and publish a voice.
- Storage object exists at `voices/{user_id}/{voice_id}.m4a`.
- DB row `voices` created with `status = 'pending'`.

### Acceptance
- Recording auto-stops at 5:00.
- Files are 32 kbps mono AAC, ~240 KB/min ±10%.
- Upload works on flaky network (manual test: airplane mode mid-upload → retry).

### Suggested commit
`feat(voices): recording, signed upload pipeline, profile voice management`

---

## Phase 5 — Discover feed (playback + autoplay + preload) 🟡

**Goal**: the TikTok-style feed loads real voices from Supabase and plays them with zero perceived latency.

### Scope
1. Replace mocked `INITIAL_PROFILES` with a paginated query to `get_feed()` (security-definer SQL function from ARCHITECTURE §8).
2. React Query `useInfiniteQuery` with cursor on `created_at`.
3. Build the **3-instance ring buffer player** in `src/lib/feedPlayer.ts`. Preload `current+1` and `current+2` on `prepareAsync` using signed URLs.
4. Update `ProfileCard` to consume the ring (no own `Audio.Sound`).
5. Track played-% and emit a `voice_played` PostHog event when ≥ 50% listened.
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

## Phase 6 — Likes, blocks, reports 🟡

**Goal**: users can like a voice, block a user, report a voice or a user. Notifications are created.

### Scope
1. Implement `like(voice_id)` / `unlike(voice_id)` mutations.
2. Heart button in `ProfileCard` with optimistic update.
3. SQL trigger on `likes` insert → insert into `notifications` with `kind='like'`.
4. Block flow from a long-press on the card or from a profile detail sheet. Confirmation modal.
5. Report flow: list of reasons (harassment, hate, inappropriate, spam, other) + free text.
6. Filtering: feed query already excludes blocked users (already in §8). Verify likes/messages are blocked too.
7. PostHog events for like/block/report.

### Deliverables
- Like adds a notification for the recipient.
- Block hides both directions (you don't see them, they don't see you).
- Report writes a row + sends an internal alert (Supabase Edge Function logs to a dedicated channel — Slack webhook in V1.1, plain DB row in V1).

### Acceptance
- Liking a voice twice does not create two notifications (unique index `(liker_id, voice_id)`).
- A blocked user cannot send you a new message.

### Suggested commit
`feat(social): likes, blocks, and reports with notification triggers`

---

## Phase 7 — Messaging (text + voice, Realtime) 🟡

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

## Phase 8 — Notifications screen + push 🔴 (Expo Push)

**Goal**: in-app notifications page + push notifications for likes and new messages.

### Scope
1. `app/(main)/notifications.tsx`: list `notifications` for the user, grouped by day, with avatars and deep links. Mark-as-read on view.
2. Realtime subscription to insert new notifications live (badge on tab).
3. Edge Function `dispatch_push(notification_id)` triggered after `notifications` insert (DB trigger calls `pg_net` to invoke it). Sends to Expo Push API using the recipient's `push_token`.
4. Debounce rule: max 1 push per (actor → recipient → kind) per hour for likes. Messages always push (unless recipient currently online — checked via Realtime presence).
5. On app launch, register for push and store/refresh `profiles.push_token`.
6. Tap a push → deep link to the right screen via expo-router.

### Deliverables
- Push received on real device for a like and a message.
- Notifications page reflects all events with correct deep links.

### Acceptance
- iOS push works in background AND when app is killed.
- Android push works on a Pixel with Play Services.
- Disabling push in OS settings is handled gracefully.

### Suggested commit
`feat(notifications): in-app notifications page and push delivery`

---

## Phase 9 — Moderation pipeline (transcription + safety) 🔴 (AssemblyAI + Hive)

**Goal**: every uploaded voice and voice message is automatically transcribed and moderated before being visible.

### Scope
1. Create `moderation_jobs` table + Edge Function `process_moderation_jobs` scheduled every 30s (Supabase scheduled cron).
2. AssemblyAI integration: submit, poll, store transcript on the parent row.
3. Hive Audio + Hive Text integrations.
4. OpenAI Moderation as cheap secondary check on transcript.
5. Decision logic per ARCHITECTURE §4.3.
6. On approval: dispatch notifications (replay the like notification logic for the author? No — only on rejection notify the author).
7. On rejection: hide content, notify author with reason, allow appeal (a button creates a `manual_review` request).
8. Manual-review queue endpoint (admin-only, behind a service role) — basic for V1.

### Deliverables
- A clean voice goes from `pending` to `approved` within 60s of upload.
- A voice with explicit content goes to `rejected` and is invisible in the feed.
- Author sees the rejection in their notifications with a reason.

### Acceptance
- No voice with `status != 'approved'` ever appears in `get_feed()`.
- Moderation cost stays under 50 $/month at the projected volume (logged via PostHog event).

### Suggested commit
`feat(moderation): async transcription and safety pipeline for voices and messages`

---

## Phase 10 — RGPD, security hardening, observability 🔴 (Sentry + PostHog)

**Goal**: app is store-ready and compliant.

### Scope
1. Edge Function `delete_account` per ARCHITECTURE §9. Reachable from a Profile → Danger Zone screen.
2. Data export (RGPD right to portability): Edge Function `export_my_data` returns a JSON of all the user's data + signed URLs to their audio files (1h TTL).
3. CGU + Privacy Policy hosted (Notion / Webflow) and linked from the app.
4. **Sentry** wired (mobile + Edge Functions) with PII scrubbing.
5. **PostHog (EU)** wired with the events listed in ARCHITECTURE §10.
6. Rate limiting on Edge Functions: per-user buckets in Postgres (`rate_limits` table) for `request_upload`, `commit_upload`, `like`, `report`. Reasonable limits (e.g. 30 uploads/day, 100 likes/hour).
7. Audit table `audit_log(actor_id, action, target, created_at)` for security-sensitive actions (block, report, delete).

### Deliverables
- Account deletion fully purges user data.
- Data export downloads a complete archive.
- Sentry receives a test crash; PostHog receives test events.

### Acceptance
- Test that after `delete_account`, no row referencing the user remains except anonymized message tombstones.
- App passes Apple's 5.1.1(v) account-deletion requirement.

### Suggested commit
`feat(compliance): account deletion, data export, observability and rate limiting`

---

## Phase 11 — Production build + store submission 🔴 (EAS + App Store + Play Store)

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

| Phase | Estimate |
|---|---|
| 0 — Foundation refactor | 2 days |
| 1 — Backend bootstrap | 1.5 days |
| 2 — Phone auth | 1 day |
| 3 — Profile onboarding | 1.5 days |
| 4 — Voice recording + upload | 3 days |
| 5 — Discover feed playback | 3 days |
| 6 — Likes / blocks / reports | 1.5 days |
| 7 — Messaging realtime | 4 days |
| 8 — Notifications + push | 1.5 days |
| 9 — Moderation pipeline | 2 days |
| 10 — RGPD + observability | 2 days |
| 11 — Store submission | 2 days |
| **Total** | **≈ 25 working days** |

---

## How to start a phase (LLM operating procedure)

1. Read `README.md` and `docs/ARCHITECTURE.md` end-to-end.
2. Open this file at the current phase. **Do not read other phases.**
3. Confirm with the user that the previous phase is signed off.
4. List the new external accounts/keys needed (cross-check with `docs/CLIENT_SETUP.md`).
5. Use sub-agents (`explore`, `shell`) for repetitive tasks (codebase mapping, command runs).
6. Implement scope strictly; flag any out-of-scope idea as "deferred to phase X".
7. End with: a) test plan executed, b) suggested Conventional Commit message, c) updated note in `docs/ROADMAP.md` if scope drifted.
