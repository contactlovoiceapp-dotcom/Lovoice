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

- automatic voice transcription (AssemblyAI) — **scheduled for ~Q3 2026, Phase 10**,
- automatic moderation (Hive — see `docs/ARCHITECTURE.md` §4.3.b) — **scheduled for ~Q3 2026, Phase 10**,
- product analytics (PostHog) — optional, scheduled in V1.x if needed (Phase 10.bis).

Reactive moderation (block + report + manual takedown by the operator) is part of the MVP commitment and is the steady-state moderation strategy until Phase 10 ships. See `docs/ARCHITECTURE.md` §4.3.a.

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
5. Implement Edge Function `request_upload` and `commit_upload` per ARCHITECTURE §4.2. Sign client-side using the helper from `@supabase/storage-js`. **In V1 MVP, `commit_upload` inserts the row with `status = 'approved'` and does NOT enqueue a moderation job** (the auto-moderation pipeline is Phase 10, scheduled for ~Q3 2026). A `// TODO(phase-10)` marker is left at the future enqueue site so Phase 10 is a localized addition, not a refactor.
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
5. **`/users/[id]` page**: profile detail (display fields, current voice with player, last 10 messages of theirs, last 10 reports against them). Buttons: **Bannir** / **Lever le ban** (according to current state). The full account-deletion UI is intentionally deferred to Phase 9 because `delete_account_admin` currently performs a soft-delete only (sets `is_banned` + `deleted_at` + revokes the session — see `supabase/functions/delete_account_admin/index.ts`); exposing it as "Supprimer le compte" before the hard-purge ships would mislead the operator. Phase 9's user-initiated `delete_account` will replace the soft-delete body and the back-office will then surface the action.
6. **`/banned` page**: list of `profiles` where `is_banned = true`, with reason and an Unban button.
7. **`/audit` page**: paginated read-only view of `audit_log`, filterable by `actor_id`, `action`, `target_kind`. Last 90 days only.
8. **Provisioning script**: `scripts/seed-admin.sql` documented in the back-office README — a one-shot insert into `admin_users` (run by the developer the first time, then by the operator herself for any new admin).
9. **UX polish**: French copy throughout, accessible labels, mobile-responsive layout (the operator might consult on her phone occasionally).

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
5. **First-reply flow from Discover**: tapping "Répondre" opens an in-feed centered modal (`ReplyVoiceModal`) with tap-to-start / tap-to-stop recording, preview, and background send — the user stays on Discover. Once a thread exists with the profile, the feed CTA flips to "Ouvrir la conversation" (driven by `useFeedConversationMap`).
6. Conversation composer (in-thread): voice messages use `VoiceRecordingSession` (mounts fresh per recording, owns a single `useAudioRecorder`) driven by `ConversationComposer`'s internal state machine. Same upload pipeline (`kind='message'`). Text input is hidden until the conversation is in OPEN state.
7. Inline voice player per message (reuse the single-instance `chatMessagePlayer` — only one playing at a time, others auto-pause).
8. Read receipts: on screen open, `update messages set read_at = now() where conversation_id = $1 and sender_id != auth.uid() and read_at is null`. The `update_received_messages_read_at` RLS policy and `guard_message_update()` trigger (restricts non-sender updates to `read_at` only) ship in Phase 7 Block 1.
9. Typing indicator via Realtime Broadcast (throttled).
10. Recording indicator ("X est en train d'enregistrer un vocal…") via Broadcast.
11. Optimistic send + retry queue (in-memory only; drafts do not survive an app kill).

### Deliverables

- Two devices can text-chat in real time (< 500 ms perceived latency).
- Voice messages can be sent, received, and played within the same conversation.
- Read receipts appear live for the sender.

### Acceptance

- App reconnects after network loss and replays missed messages.
- Killing the app and reopening a conversation shows all history.
- Recording indicator disappears within 2s of stop.

---

## Phase 8 — Push notifications (Expo Push) 🟢

**Goal**: push notifications for likes and new messages, deep-linking to the relevant screen. There is no dedicated Notifications screen — likes appear in the Likes screen (received tab) and messages appear in the Messages screen.

### Scope (shipped)

1. **Migration `20260527000000_phase8_push_dispatch.sql`** — enables `pg_net`, adds the diagnostic column `notifications.pushed_at`, and creates the AFTER INSERT trigger `dispatch_push_notification_trg` on `notifications` that calls the `dispatch_push` Edge Function via `net.http_post`. Trigger errors are downgraded to `RAISE WARNING` so the originating INSERT never blocks. The runtime URL and service key are read from `app.settings.*` set by the operator post-deploy — no secrets are committed.
2. **Edge Function `dispatch_push`** — Deno function that receives `{ notification_id }`, loads the row + recipient's `profiles.push_token` (and the actor's `display_name` and the message body when relevant), builds the Expo Push payload, POSTs to `https://exp.host/--/api/v2/push/send` (10 s timeout, optional `EXPO_ACCESS_TOKEN`), nulls `profiles.push_token` on `DeviceNotRegistered`, and stamps `notifications.pushed_at = now()` on success. Pure helpers (`buildExpoPushMessage`, `parseExpoPushResponse`) are exported and covered by Deno tests (`npm run test:edge`).
3. **Client push registration** — `npx expo install expo-notifications`, plugin wired in `app.config.ts` (icon, brand color `#e724ab`, `defaultChannel: 'default'`). Helpers in `src/lib/push.ts` (`setupNotificationHandler`, `registerForPushNotificationsAsync`) and a hook `usePushRegistration` mounted in `app/(main)/_layout.tsx` that writes the Expo Push Token into `profiles.push_token` only when it changes. Permission is requested once; `canAskAgain === false` blocks re-prompts.
4. **Foreground handler** — `setupNotificationHandler()` runs at module load in `app/_layout.tsx` so banners surface while the app is foreground (`shouldShowBanner`, `shouldShowList`, `shouldPlaySound`, `shouldSetBadge` — SDK 54 field names).
5. **Deep-link tap routing** — `usePushDeepLink` (mounted in `app/(main)/_layout.tsx`) replays the cold-start tap via `getLastNotificationResponseAsync()` and listens to live taps via `addNotificationResponseReceivedListener`. Routes are allowlisted against `/likes` or `/messages/<uuid>` before `router.push`. Deduplication via `data.notification_id` (fallback `request.identifier`) prevents double-navigation between the cold-start replay and the live listener.
6. **OS app icon badge** — `useAppIconBadge` mirrors `useUnseenLikesCount + useUnreadMessagesCount` onto `Notifications.setBadgeCountAsync(...)`. The in-app red dot on the BottomNav is unchanged.

### Deliberately deferred (post-V1)

- **Per-actor / per-kind debounce** (e.g. max 1 like push per hour per pair). The `notifications.pushed_at` column is the anchor for this query when it ships.
- **Presence skip** (do not push if the recipient is currently online). Requires a heartbeat or a server-readable presence source — not implemented.
- **Push for `kind = 'system'`** notifications (moderation rejections). `dispatch_push` skips them today; surfacing them to the user is a later UX decision.

### Deliverables — shipped

- Push received on a physical iOS device for a like and for a message.
- Tap routes to `/likes` (like) or `/messages/<conversation_id>` (message), background and killed states alike.
- OS app icon badge stays in sync with the in-app counters.
- 56 Jest suites / 419 tests green; 12 Deno tests on the pure helpers of `dispatch_push`.

### Acceptance criteria

- iOS push works in background AND when the app is killed.
- Android push works on a Pixel with Play Services.
- Disabling push in OS settings is handled gracefully (the helpers return `null`, the hooks no-op, the app does not crash).
- Tapping a push twice (e.g. lock screen + notification center) navigates only once.

### Operator runbook

1. Deploy the Edge Function: `npx supabase functions deploy dispatch_push`.
2. Apply the migration: `npx supabase db push`.
3. Set the runtime settings (replace placeholders), from psql or Supabase Studio SQL editor:

   ```sql
   -- Supabase Cloud: use Vault, not ALTER ROLE (custom GUCs are denied):
   SELECT vault.create_secret(
     'https://<project-ref>.supabase.co/functions/v1/dispatch_push',
     'dispatch_push_url'
   );
   SELECT vault.create_secret('<service_role_key>', 'dispatch_push_service_key');
   ```
4. (Optional but recommended) `npx supabase secrets set EXPO_ACCESS_TOKEN=<token>`.
5. Rebuild and install a dev build that includes the new `expo-notifications` plugin: `npx expo run:ios` (and Android equivalent).

---

## Phase 9 — RGPD, security hardening, observability (Sentry)

**Goal**: app is store-ready and compliant, and the remaining Hermes crash on foreground resume is eliminated.

### Scope (V1 MVP — committed)

1. Edge Function `delete_account` per ARCHITECTURE §9. Reachable from a Profile → Danger Zone screen.
2. Data export (RGPD right to portability): Edge Function `export_my_data` returns a JSON of all the user's data + signed URLs to their audio files (1h TTL).
3. CGU + Privacy Policy hosted (Notion / Webflow) and linked from the app.
4. **Sentry** wired (mobile + Edge Functions) with PII scrubbing.
5. Rate limiting on Edge Functions: per-user buckets in Postgres (`rate_limits` table) for `request_upload`, `commit_upload`, `like`, `report`. Reasonable limits (e.g. 30 uploads/day, 100 likes/hour).
6. Audit table `audit_log(actor_id, action, target, created_at)` for security-sensitive actions (block, report, delete, moderate).
7. **Foreground-resume Realtime defer** — fix the `EXC_BAD_ACCESS` / Hermes heap corruption crash documented in `docs/CHAT_AUDIO.md` §13 (TestFlight 0.8.2, Sentry `44ef6ab8`). When the app returns from a long background period, Supabase Realtime channels reconnect and fire queued postgres_changes callbacks all at once; combined with iOS keyboard/navigation animations settling, this creates enough concurrent native↔JS bridge traffic to corrupt the Hermes GC. **Implementation**: in `app/(main)/messages/[id].tsx` (conversation Realtime effect) and `src/features/chat/hooks/useRealtimeInbox.ts` (global inbox listener), listen to `AppState` changes and wrap `queryClient.invalidateQueries` calls in `InteractionManager.runAfterInteractions` during a transient "resuming" window (~500 ms after background→active transition). Same pattern already used by `usePushDeepLink` for notification taps. Normal foreground operation keeps the current immediate/debounced behaviour unchanged. See `docs/CHAT_AUDIO.md` §13 for the full crash analysis, timeline, and verification steps.

### Deliverables

- Account deletion fully purges user data.
- Data export downloads a complete archive.
- Sentry receives a test crash from mobile and from an Edge Function.
- The foreground-resume Hermes crash (`GCScope::_newChunkAndPHV`) no longer reproduces on a physical device after >5 min in background.

### Acceptance

- Test that after `delete_account`, no row referencing the user remains except anonymized message tombstones.
- App passes Apple's 5.1.1(v) account-deletion requirement.
- Open a conversation, send a message, put the app in background for >5 min, return: app does not crash. Sentry shows no new `EXC_BAD_ACCESS` events with the `GCScope::_newChunkAndPHV` signature on the new build.

---

## Phase 10 — Auto-moderation pipeline (transcription + safety) (AssemblyAI + Hive) — scheduled ~Q3 2026

**Status**: **NOT in the V1 MVP commitment, but scheduled for ~Q3 2026 (≈3 months post-MVP).** Until this phase ships, content safety is handled by reactive moderation (Phase 6 + `docs/ARCHITECTURE.md` §4.3.a). The schema, Edge Functions and storage layout shipped in Phases 1–9 are designed so this phase is a localized addition, not a refactor.

**Goal**: every uploaded voice and voice message is automatically transcribed and moderated before being visible.

### Pre-requisites

- Client has AssemblyAI and Hive accounts with EU DPA signed.
- `ASSEMBLYAI_KEY`, `HIVE_KEY`, `OPENAI_API_KEY` are set as Edge Function secrets.

### Scope

1. Flip `voices.status` and `messages.status` defaults from `'approved'` back to `'pending'` (one migration).
2. Wire the `// TODO(phase-10)` marker in `commit_upload` to enqueue a moderation job (introduce the `AUTO_MODERATION_ENABLED` Edge Function secret at the same time, default `true` for this phase).
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

### Deliverables

- Build available in TestFlight.
- Build available in Internal Testing on Play.
- Crash-free rate > 99% on the first internal-testing release.

---
