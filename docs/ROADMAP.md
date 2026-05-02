<!--
  Phased development plan for Lovoice V1.
  Each phase is sized to fit in a single LLM context window.
  Sub-agents (explore / shell / generalPurpose) are allowed and encouraged.
  At the end of each phase: propose a Conventional Commit message; do not run git commands.
-->

# Lovoice — Development Roadmap

Each phase below is **self-contained**: it has a clear scope, deliverables, acceptance criteria, and lists the only external services it depends on.

Before starting any phase, **re-read `README.md` and `docs/ARCHITECTURE.md`**.

The V1 MVP commitment covers all features described in this roadmap **except**:

- automatic voice transcription (AssemblyAI),
- automatic moderation (Hive — see `docs/ARCHITECTURE.md` §4.3.b),
- product analytics (PostHog).

Reactive moderation (block + report + manual takedown by the operator) is part of the MVP commitment and replaces auto-moderation until the optional phase ships. See `docs/ARCHITECTURE.md` §4.3.a.

---

## Phase 0 — Foundation refactor & UX/UI finalization 🟢

**Goal**: clean the prototype, finish the visual UX with the client, and put the codebase in a state where every following phase can plug in cleanly.

---

## Phase 1 — Backend bootstrap (Supabase + EAS + envs) 🟢

**Goal**: the cloud project exists, the mobile app is connected to it, and the deployment pipeline works.

---

## Phase 2 — Phone authentication (FR/BE/CH only) 🟢

**Goal**: a user can sign in or sign up with their phone number, restricted to FR/BE/CH.

---

## Phase 3 — Profile onboarding 🟡

**Goal**: after auth, the user creates their profile (name, birthdate, gender, looking-for, city with coordinates).

---

## Phase 4 — Voice recording + voice upload

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

---

## Phase 5 — Discover feed (playback + autoplay + preload)

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

---

## Phase 6 — Likes, blocks, reports (+ moderation backend)

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

---

## Phase 6.bis — Admin back-office (companion Next.js web app)

**Goal**: the operator (non-technical) can triage reports, take down content, and ban users from a clean web interface — no SQL, no Supabase Studio.

This phase produces a **separate Next.js repository** (suggested name `lovoice-admin`) that consumes the same Supabase project as the mobile app. See `docs/ARCHITECTURE.md` §13 for the full design.

### Pre-requisites

- Phase 6 merged (admin Edge Functions and RLS policies live).
- A Vercel account (free) connected to the new `lovoice-admin` repo, EU region (`fra1`).

### Scope

1. **Bootstrap the repo**:
   - `npx create-next-app@latest lovoice-admin --typescript --tailwind --app --eslint`,
   - configure TypeScript strict mode (same level as the mobile app),
   - install: `@supabase/supabase-js`, `@supabase/ssr`, `@tanstack/react-query`, `lucide-react`, `date-fns`. Nothing else.
   - copy `src/types/database.ts` from the mobile repo into `src/types/database.ts`. Document in the README that the file must be regenerated together whenever a Supabase migration ships.
2. **Supabase client** in `src/lib/supabase.ts` using `@supabase/ssr` for cookie-based session handling.
3. **Auth**:
   - `/login`
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
- Operator can log in and complete the full moderation loop point-and-click.
- Every action she performs leaves a trace in `audit_log`.
- Zero SQL written by the operator.

### Acceptance

- Login by account NOT in `admin_users` is rejected with a clear error and the user is signed out.
- Calling any of the five admin Edge Functions from the browser DevTools console with a stolen non-admin JWT returns 401.
- The service-role key does not appear in any built bundle (verified by grep on the `.next` build output).
- Lighthouse score on `/reports` ≥ 90 (perf and a11y).

### Suggested commit (in the `lovoice-admin` repo)

`feat(admin): initial back-office for reports, bans and audit log`

---

## Phase 7 — Messaging (text + voice, Realtime)

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

---

## Phase 8 — Push notifications (Expo Push)

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

---

## Phase 9 — Auto-moderation pipeline (transcription + safety) (AssemblyAI + Hive) optional / post-MVP

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
8. On rejection: hide content, notify author with reason, allow appeal (a button creates a `manual_review` request).
9. **Back-office extension** (in the `lovoice-admin` repo): add a new `/manual-review` route that lists items with `status = 'manual_review'` and reuses the same row component and the same `moderate()` action as `/reports`. Add a transcript column on both routes (reads `voices.transcript` / `messages.transcript`). No new Edge Function needed.

### Deliverables

- A clean voice goes from `pending` to `approved` within 60s of upload.
- A voice with explicit content goes to `rejected` and is invisible in the feed.
- Author sees the rejection in their notifications with a reason.

### Acceptance

- No voice with `status != 'approved'` ever appears in `get_feed()`.
- Moderation throughput keeps up with upload throughput at the projected volume (no growing backlog in `moderation_jobs`).

---

## Phase 10 — RGPD, security hardening, observability (Sentry)

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

---

## Phase 10.bis — Product analytics (PostHog) optional / post-MVP

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

---

## Phase 11 — Production build + store submission (EAS + App Store + Play Store)

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

---
