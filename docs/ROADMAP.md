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

- automatic voice transcription (AssemblyAI) — **scheduled for ~Q3 2026, Phase 9**,
- automatic moderation (Hive — see `docs/ARCHITECTURE.md` §4.3.b) — **scheduled for ~Q3 2026, Phase 9**,
- product analytics (PostHog) — optional, scheduled in V1.x if needed (Phase 10.bis).

Reactive moderation (block + report + manual takedown by the operator) is part of the MVP commitment and is the steady-state moderation strategy until Phase 9 ships. See `docs/ARCHITECTURE.md` §4.3.a.

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

## Phase 3 — Profile onboarding 🟢

**Goal**: after auth, the user creates their profile (name, birthdate, gender, looking-for, city with coordinates).

---

## Phase 4 — Voice recording + voice upload 🟢

**Goal**: user can record, re-record, listen back, and publish their voice.

### Scope

1. Install **`expo-audio`**. Configure `AVAudioSession` defaults in `src/lib/audio.ts`.
2. Build `useVoiceRecorder` hook: start, stop, pause, resume, metering at 50 ms, hard cap at 90_000 ms.
3. Build `useVoicePlayer` hook (single-instance variant for preview).
4. `app/(auth)/onboarding/record.tsx` (and a reachable `app/(main)/profile/record.tsx`): live waveform, timer, prompt picker (`prompts` table seeded), record / stop / replay / re-record.
5. Implement Edge Function `request_upload` and `commit_upload` per ARCHITECTURE §4.2. Sign client-side using the helper from `@supabase/storage-js`. **In V1 MVP, `commit_upload` inserts the row with `status = 'approved'` and does NOT enqueue a moderation job** (the auto-moderation pipeline is Phase 9, scheduled for ~Q3 2026). A `// TODO(phase-9)` marker is left at the future enqueue site so Phase 9 is a localized addition, not a refactor.
6. Client uploads via signed PUT directly to Storage.
7. After commit, set `voices.is_active = true` for the latest, `false` for previous.
8. Display the user's current voice on the profile screen with replay.

### Deliverables

- A user can record, listen, re-record, and publish a voice.
- Storage object exists at `voices/{user_id}/{voice_id}.m4a`.
- DB row `voices` created with `status = 'approved'` (V1 MVP) — and immediately visible in the feed.

### Acceptance

- Recording auto-stops at 1:30.
- Files are 32 kbps mono AAC, ~240 KB/min ±10%.
- Upload works on flaky network (manual test: airplane mode mid-upload → retry).

### Mobile smoke test (run on a real device before tagging)

Cover these once on iOS and once on Android. Backend curl walkthrough lives at
`supabase/functions/SMOKE_TEST.md` and stays separate.

1. **First voice** — fresh sign-up → onboarding → record screen → mic permission
   prompt accepted → record 12 s → live waveform animates → tap stop → preview
   plays back from documentDirectory cache → "Continuer" → upload spinner →
   profile-setup screen lands with the active voice already populated.
2. **Min duration** — start recording, tap stop at < 10 s; the CTA should stay
   "Encore N sec" and the mic stop should be a no-op until the threshold.
3. **Auto-stop** — let the recorder run; at 1:30 it must stop on its own and
   show the preview state. Timer must show `1:30 / 1:30` exactly.
4. **Permission denied** — deny mic permission once, observe the Settings icon
   on the mic button + the French permission-denied message in the hint card,
   tap to deep-link to system settings, grant, return → next mic tap records.
5. **Airplane mode mid-upload** — record 30 s, toggle airplane mode just
   before tapping "Continuer", confirm the CTA flips to "Réessayer" and the
   error status appears. Toggle airplane mode off, tap "Réessayer" → upload
   succeeds and onNext fires.
6. **Re-record from profile** — open profile tab, tap "Changer mon vocal",
   record a new voice, "Continuer" → returns to profile with the newer
   `created_at` displayed and the previous voice gone (`is_active` swap).
7. **Profile edits** — change title and mood on the profile voice card, tap
   "Sauvegarder ", reload the screen → values persist.
8. **Multi-device** — sign in on a second device with the same account; the
   active voice + title + theme must appear without any local "hasRecorded"
   priming (proves the gate is fully derived from `useActiveVoice`).
9. **Empty state** — sign up + skip recording on onboarding; profile must
   show the "Aucun vocal pour l'instant" empty state with the record CTA.
10. **Cleanup** — record + cancel via the X header (or system back gesture);
    re-open the app and confirm no orphan files remain in
    `documentDirectory/pending/` (use `xcrun simctl get_app_container` or
    `adb shell run-as` to inspect).

---

## Phase 5 — Discover feed (playback + autoplay + preload) 🟢

**Goal**: the TikTok-style feed loads real voices from Supabase and plays them with zero perceived latency.

### Scope (shipped)

1. Migration `20260518090000_get_feed_function.sql` introduces the `security definer` `get_feed(p_distance_m, p_limit, p_cursor_created_at)` SQL function (ARCHITECTURE §8) and a companion `reset_feed_seen()` RPC. The function reads the caller's `gender`, `looking_for` and `location` from `profiles` via `auth.uid()`, so the client only passes session-level filters.
2. React Query `useInfiniteQuery` (`src/features/feed/api/feedQueries.ts`) drives pagination with a cursor on `created_at`. Page size capped at 50 server-side.
3. **Single-instance feed player** (`src/lib/feedPlayer.ts`) — one `useAudioPlayer` whose source is swapped via `player.replace(signedUrl)` on every active-card change. Signed URLs for the next two upcoming voices are prefetched in the background so the swap is near-instant; the module-scoped URL cache also serves re-surfacing voices after `reset_feed_seen`. URLs refresh 10 minutes before their 1 h TTL expires. The play button is hard-gated by `snapshot.isLoading` to prevent calling `play()` during a source swap.
4. `ProfileCard` consumes a `{ snapshot, controls }` pair driven by the feed player; the `setInterval` simulation is gone. `hasListened` is derived from `positionMs >= durationMs - 500`.
5. **Seen tracking** debounced batcher (`src/features/feed/hooks/useFeedSeenBatcher.ts`): the screen enqueues a `voice_id` once playback crosses 50 %. Flushes at 5 candidates, every 30 s, on screen blur (`useFocusEffect`), and on unmount.
6. **Autoplay** uses `useFeedPlayer.onCurrentEnded` (which edge-detects `status.didJustFinish` on the single player) to scroll-to-next when the autoplay toggle is on. The next card loads automatically via the source-loading effect, but playback does NOT start automatically yet — that is the next planned improvement.
7. **Empty-state** offers two CTAs: "Modifier mes filtres" (opens the filters modal) and "Recommencer mon feed" (confirmation modal → `reset_feed_seen` RPC). No automatic cooldown — the re-show is opt-in (ARCHITECTURE §8 "Empty-state recovery").
8. **Filters modal** rewritten: age range (18–80) + max distance km (5–1000 with "Sans limite" switch). Apply / Reset buttons. Filters live in `useFeedState` (Zustand), session-only (no SecureStore persistence in V1). Age is filtered client-side post-query per ARCHITECTURE §8. **No `looking_for` filter** — orientation is a stable profile attribute, not a session preference.
9. **Pull-to-refresh** on the FlatList re-fetches the first page (re-shuffle).
10. **Pagination prefetch** when the active card is within 5 of the last fetched item — no manual "Load more" button.

### Deliverables — shipped

- Real feed scrolling with live audio from Storage (`useFeedItems`).
- Autoplay mode chains voices using `expo-audio`'s `didJustFinish` event.
- `feed_seen` populated via debounced batches; `reset_feed_seen` RPC available for the empty-state CTA.
- 35 Jest suites / 259 tests green; no `any`, no `@ts-ignore`.

### Acceptance criteria

- First playback of any voice starts < 500 ms after tap on a 4G connection (relies on the next/next+1 preload).
- Scrolling 20 cards never throws an unhandled promise rejection (try/catch around every `replace()` and `play()`/`pause()` call).
- Filters change updates the feed within 1 query (the React Query key includes the filters object).

### Mobile smoke test (run on a real device before tagging)

Cover these once on iOS and once on Android. Backend isn't touched — the SQL migration must already be applied (`npx supabase db push`).

1. **Cold-start feed** — fresh session → land on Discover → first voice loads and the play button is responsive within 1 s. Tap to play; audio comes out of the speaker even with the silent switch on (proves `playsInSilentMode: true`).
2. **Smooth swipe + preload** — swipe up; the next card snaps into place and tapping play is instant (< 250 ms from tap to first sample). Swipe up again; same. Confirms the next/next+1 ring is preloaded.
3. **Autoplay chain** — toggle the autoplay switch in the header. Tap play on the first voice. When it finishes, the feed must scroll to the next card on its own and start playing automatically. Repeat for 3 voices in a row to confirm `didJustFinish` fires once per playthrough.
4. **Back-scroll** — after listening to two voices, swipe down to the previous one. It should reload from the start (acceptable trade-off — the slot was reused for the next preload).
5. **Filters apply** — open the filters modal. Set age 25–35 and distance 50 km. Tap "Appliquer". The feed re-queries and the new filter pill is reflected in the header. Confirm the visible voices respect the age range (ages displayed on cards must all be in 25–35).
6. **Filters reset** — re-open the filters modal, tap "Réinitialiser". The age range should snap back to 18–80, the distance to "Illimité", and the feed should re-query.
7. **Distance unlimited toggle** — open the modal, flip the "Sans limite de distance" switch ON; the slider hides and the pill reads "Illimité". Apply → feed re-queries. Re-open, flip OFF; the slider reappears at the previously chosen value.
8. **50 % seen** — play a voice past 50 % then swipe away to the next card before it ends. Wait 30 s on the next card, then look at `feed_seen` in Supabase Studio: a row for the partially-listened voice must be present.
9. **Batch flush on blur** — play 2 voices past 50 %, then navigate to the Likes tab before the 30 s timer elapses. Check `feed_seen`: both rows must be present (the `useFocusEffect` flush fired).
10. **End of feed** — exhaust the available voices (or seed Supabase with a small set). The empty state with "Sparkles" + "Modifier mes filtres" + "Recommencer mon feed" must render. Tap "Recommencer mon feed", confirm the modal, hit "Tout recommencer" → `feed_seen` must be cleared and the feed must re-populate.
11. **Pull-to-refresh** — scroll to the top of the feed, pull down. The spinner appears and the feed re-shuffles within 1 query (`ORDER BY created_at DESC, random()` gives a fresh order even with the same data).
12. **Network loss mid-listen** — start playing a voice on Wi-Fi, toggle airplane mode mid-playback. Audio should keep playing until the buffer drains; tapping play on a not-yet-preloaded card after the network is back must succeed (signed URL refresh).
13. **Locked playback** — sign in with an account that has not recorded a voice yet. Tap play on any card → the locked modal appears with the "Enregistre ta voix" CTA. Tap it → routes to `/(auth)/onboarding/record`.
14. **Background audio** — start playing a voice, lock the device. Audio must continue (proves `shouldPlayInBackground: true`).

---

## Phase 6 — Likes, blocks, reports (+ moderation backend) 🟢

**Goal**: users can like a voice, block a user, report a voice or a user. Like events appear in the recipient's Likes screen (received tab). The server-side moderation primitives that the back-office (Phase 6.bis) will consume are in place.

### Scope

1. Implement `like(voice_id)` / `unlike(voice_id)` mutations.
2. Heart button in `ProfileCard` with optimistic update.
3. SQL trigger on `likes` insert → insert into `notifications` with `kind='like'` (feeds push delivery in Phase 8 and the "received" tab of the Likes screen).
4. Block flow from the 3 dots button to the right of the username (we should propose here signal user AND block user). Confirmation modal.
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

## Phase 6.bis — Admin back-office (companion Next.js web app) 🟢

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
5. **`/users/[id]` page**: profile detail (display fields, current voice with player, last 10 messages of theirs, last 10 reports against them). Buttons: **Bannir** / **Lever le ban** (according to current state). The full account-deletion UI is intentionally deferred to Phase 10 because `delete_account_admin` currently performs a soft-delete only (sets `is_banned` + `deleted_at` + revokes the session — see `supabase/functions/delete_account_admin/index.ts`); exposing it as "Supprimer le compte" before the hard-purge ships would mislead the operator. Phase 10's user-initiated `delete_account` will replace the soft-delete body and the back-office will then surface the action.
6. **`/banned` page**: list of `profiles` where `is_banned = true`, with reason and an Unban button.
7. **`/audit` page**: paginated read-only view of `audit_log`, filterable by `actor_id`, `action`, `target_kind`. Last 90 days only.
8. **Provisioning script**: `scripts/seed-admin.sql` documented in the back-office README — a one-shot insert into `admin_users` (run by the developer the first time, then by the operator herself for any new admin).
9. **UX polish**: French copy throughout, accessible labels, mobile-responsive layout (the operator might consult on her phone occasionally).
10. **Smoke test plan** (manual, documented in the back-office README): login flow, take down a test report, ban a test user, unban, check `audit_log`.

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

## Phase 7 — Messaging (text + voice, Realtime) 🟢

**Goal**: full chat with text and voice messages, real-time updates, read receipts.

### Scope

1. **Conversation creation** via the `start_conversation(p_other_user_id)` SECURITY DEFINER RPC. Idempotent: returns the existing row if the pair already has a conversation. Rejects banned/deleted users and blocked pairs. The `conversations` table gains two new columns shipped in Phase 7 Block 1:
   - `initiator_id uuid NOT NULL` — denormalised sender of the very first message.
   - `first_reply_at timestamptz NULL` — set automatically by trigger when the non-initiator sends their first message; drives the 24h voice-only lock.
2. **Four-state conversation lifecycle** enforced server-side by the `enforce_message_rules()` BEFORE INSERT trigger:
   - **EMPTY** (0 messages): only the initiator can send; must be `kind='voice'`.
   - **AWAITING_REPLY** (≥ 1 message, `first_reply_at IS NULL`): only the recipient can send; must be `kind='voice'`.
   - **VOICE_ONLY** (`first_reply_at` set, < 24 h elapsed): either user can send; must be `kind='voice'`.
   - **OPEN** (`first_reply_at` set, ≥ 24 h elapsed): either user can send `kind='voice'` or `kind='text'`.
   The trigger raises `SQLSTATE 23514` with stable `messages.*` codes the client maps (see `docs/ARCHITECTURE.md` §5.0).
3. `MessagesScreen` (inbox): list conversations with last message preview + unread badge. Realtime subscription on `messages` (RLS-filtered) for live inbox updates.
4. `ConversationScreen` (`app/(main)/messages/[id].tsx`): paginated message list (cursor on `created_at` desc), Realtime subscription on `messages` filtered by conversation.
5. Composer: text input + record button. Voice messages reuse `useVoiceRecorder` (max 1 min 30 s) and the same upload pipeline (`kind='message'`). Text input is hidden until the conversation is in OPEN state.
6. Inline voice player per message (reuse `useVoicePlayer` single-instance — only one playing at a time, others auto-pause).
7. Read receipts: on screen open, `update messages set read_at = now() where conversation_id = $1 and sender_id != auth.uid() and read_at is null`. The `update_received_messages_read_at` RLS policy and `guard_message_update()` trigger (restricts non-sender updates to `read_at` only) ship in Phase 7 Block 1.
8. Typing indicator via Realtime Broadcast (throttled 1/s).
9. Recording indicator ("X est en train d'enregistrer un vocal…") via Broadcast.
10. Optimistic send + retry queue (in-memory only; drafts do not survive an app kill).

### Deliverables

- Two devices can text-chat in real time (< 500 ms perceived latency).
- Voice messages can be sent, received, and played within the same conversation.
- Read receipts appear live for the sender.

### Acceptance

- App reconnects after network loss and replays missed messages.
- Killing the app and reopening a conversation shows all history.
- Recording indicator disappears within 2s of stop.

---

## Phase 7 acceptance — manual smoke tests

1. **Discover → reply flow**: tap "Répondre" on a profile → conversation screen opens in `empty` state → hold-record-release the mic → preview plays correctly → tap "Envoyer" → message appears, conversation moves to `awaiting_reply`. Log out, log in as the recipient, see the conversation in the inbox with the "Vocal envoyé" badge, open it, see "À ton tour — réponds avec un vocal" composer hint, hold-record-release → preview, send → conversation now in `voice_only` state. Both users can send voice messages freely. After 24 h (or by manually setting `first_reply_at` to 25 h ago via SQL), the text input becomes available.
2. **Realtime messages**: with two devices/sessions open on the same conversation, sending a message on side A appears within 1 s on side B. Read receipt (✓✓ Lu) shown on side A after side B opens the conversation.
3. **Typing/recording indicators**: side A starts typing in the composer → side B sees "X écrit…" as the header subtitle. Side A holds the mic button → side B sees "X enregistre un vocal…". Both indicators clear within 5–10 s after activity stops on side A.
4. **Hold-to-record cancel**: hold the mic button, slide up past the cancel threshold, release — message is discarded (no upload, no DB row, composer returns to idle). Haptic error feedback fires.
5. **Audio focus**: while a voice bubble is playing, tapping another bubble pauses the first and starts the second. Starting a hold-to-record gesture pauses any currently playing bubble.
6. **Lifecycle guard**: insert a text message into an `empty` conversation directly via SQL — the `enforce_message_rules()` Postgres trigger rejects it with the expected SQLSTATE 23514 and error code `messages.first_message_must_be_voice`.

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

## Phase 9 — Auto-moderation pipeline (transcription + safety) (AssemblyAI + Hive) — scheduled ~Q3 2026

**Status**: **NOT in the V1 MVP commitment, but scheduled for ~Q3 2026 (≈3 months post-MVP).** Until this phase ships, content safety is handled by reactive moderation (Phase 6 + `docs/ARCHITECTURE.md` §4.3.a). The schema, Edge Functions and storage layout shipped in Phases 1–8 are designed so this phase is a localized addition, not a refactor.

**Goal**: every uploaded voice and voice message is automatically transcribed and moderated before being visible.

### Pre-requisites

- Client has AssemblyAI and Hive accounts with EU DPA signed.
- `ASSEMBLYAI_KEY`, `HIVE_KEY`, `OPENAI_API_KEY` are set as Edge Function secrets.

### Scope

1. Flip `voices.status` and `messages.status` defaults from `'approved'` back to `'pending'` (one migration).
2. Wire the `// TODO(phase-9)` marker in `commit_upload` to enqueue a moderation job (introduce the `AUTO_MODERATION_ENABLED` Edge Function secret at the same time, default `true` for this phase).
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
