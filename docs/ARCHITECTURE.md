<!--
  Technical architecture, data model, security model, and audio pipeline for Lovoice.
  Read this BEFORE writing any backend or audio-related code.
-->

# Lovoice — Technical Architecture

This document is the canonical reference for the system design.
Read it together with `README.md` (constraints) and `docs/ROADMAP.md` (current phase scope).

---

## 1. High-level diagram

```
┌─────────────────────────┐         ┌──────────────────────────────┐
│   Mobile app (Expo)     │         │      Supabase (EU)           │
│  ─────────────────────  │  HTTPS  │  ──────────────────────────  │
│  expo-router            ├────────▶│  Auth (phone OTP via Twilio) │
│  expo-audio (rec/play)  │         │  + Auth (email magic link    │
│  React Query + Zustand  │◀── WS ──┤    for admins)               │
│  expo-notifications     │         │  Postgres + PostGIS + RLS    │
└──────────┬──────────────┘         │  Realtime (chat, presence)   │
           │                        │  Storage (voices / messages) │
           │                        │  Edge Functions (Deno)       │
           │                ┌──────▶└──────────────┬───────────────┘
           │                │HTTPS                 │ webhooks / calls
           │                │                      ▼
           │  ┌─────────────┴──────┐    ┌─────────────────────────────┐
           │  │  Admin back-office │    │  Twilio Verify (SMS)        │
           │  │  (Next.js, Vercel) │    │  Expo Push Service          │
           │  │  email magic link  │    │  Sentry                     │
           │  └────────────────────┘    │  ─────────── optional ───── │
           │ direct upload (signed PUT) │  AssemblyAI (transcribe)    │
           ▼                            │  Hive (audio + text mod)    │
   ┌──────────────────┐                 │  PostHog (EU, analytics)    │
   │ Storage buckets  │                 └─────────────────────────────┘
   │  - voices        │
   │  - messages      │
   └──────────────────┘
```

> **V1 MVP scope:** only the services above the dashed line are wired in V1. AssemblyAI and Hive (auto-moderation, Phase 9) are **scheduled for ~Q3 2026 (≈3 months post-MVP)**. PostHog (Phase 10.bis) remains optional. The schema, Edge Functions and storage layout are designed so that enabling them later is a drop-in change with no migration.

---

## 2. Data model (Postgres)

All tables live in the default `public` schema unless noted. **All tables have RLS enabled.**

### 2.1 `profiles`

One row per user. `id` is `auth.users.id` (one-to-one).

| column         | type                                                  | notes                                     |
| -------------- | ----------------------------------------------------- | ----------------------------------------- |
| `id`           | `uuid` PK FK → `auth.users(id)` on delete cascade     |                                           |
| `display_name` | `text` not null                                       |                                           |
| `birthdate`    | `date` not null                                       | age computed in queries                   |
| `gender`       | `text` check in (`male`,`female`,`nonbinary`,`other`) |                                           |
| `looking_for`  | `text[]`                                              | filter target genders                     |
| `city`         | `text`                                                | display only                              |
| `location`     | `geography(Point, 4326)`                              | for distance filter                       |
| `country`      | `text` check in (`FR`,`BE`,`CH`)                      | enforced at signup                        |
| `bio_emojis`   | `text[]`                                              | up to 3                                   |
| `created_at`   | `timestamptz` default `now()`                         |                                           |
| `last_seen_at` | `timestamptz`                                         |                                           |
| `push_token`   | `text`                                                | Expo push token                           |
| `is_banned`    | `boolean` default false                               |                                           |
| `deleted_at`   | `timestamptz`                                         | soft delete; hard purge via Edge Function |

Profile validation is enforced by a `BEFORE INSERT OR UPDATE` trigger. The mobile client should map SQLSTATE `23514` with these stable messages:

- `profile.display_name_length`
- `profile.birthdate_age_minimum`
- `profile.looking_for_required`
- `profile.looking_for_invalid`

### 2.2 `voices`

The voice introduction. A user can have multiple voices but only **one `is_active = true`** at a time.

| column              | type                                                                                   | notes                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | `uuid` PK                                                                              |                                                                                                                                              |
| `user_id`           | `uuid` FK → `profiles(id)`                                                             |                                                                                                                                              |
| `prompt_id`         | `uuid` FK → `prompts(id)`                                                              | nullable (free-form voice)                                                                                                                   |
| `storage_path`      | `text`                                                                                 | `voices/{user_id}/{voice_id}.m4a`                                                                                                            |
| `duration_ms`       | `integer` check (≤ 90_000)                                                             |                                                                                                                                              |
| `title`             | `text`                                                                                 | nullable; user-editable catchphrase shown on the voice card                                                                                  |
| `transcript`        | `text`                                                                                 | nullable; filled by AssemblyAI when Phase 9 ships (~Q3 2026)                                                                                  |
| `theme`             | `text`                                                                                 | UI color theme (`sunset`, `chill`, `electric`, `midnight`)                                                                                   |
| `status`            | `text` default `'approved'` check in (`pending`,`approved`,`rejected`,`manual_review`) | V1 MVP defaults to `'approved'` (reactive moderation). The `pending` and `manual_review` values are kept in the enum so Phase 9 (~Q3 2026) only flips the default and wires the queue — see §4.3.b. |
| `moderation_reason` | `text`                                                                                 | filled by Hive                                                                                                                               |
| `is_active`         | `boolean` default false                                                                | partial unique index per user                                                                                                                |
| `created_at`        | `timestamptz` default `now()`                                                          |                                                                                                                                              |

### 2.3 `prompts`

Curated catalog of suggested topics ("Mon plus beau voyage…"). Read-only for clients.

### 2.4 `likes`

A user likes a voice. Unique on `(liker_id, voice_id)`.

| column       | type                          | notes |
| ------------ | ----------------------------- | ----- |
| `id`         | `uuid` PK                     |       |
| `liker_id`   | `uuid` FK → `profiles(id)`    |       |
| `voice_id`   | `uuid` FK → `voices(id)`      |       |
| `created_at` | `timestamptz` default `now()` |       |

### 2.5 `conversations`

Created via the `start_conversation(p_other_user_id)` RPC before the first message is sent.

| column            | type                          | notes                                                                              |
| ----------------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| `id`              | `uuid` PK                     |                                                                                    |
| `user_a`          | `uuid`                        | always `least(user_a, user_b)` to enforce uniqueness                               |
| `user_b`          | `uuid`                        |                                                                                    |
| `initiator_id`    | `uuid` NOT NULL FK → `profiles` | denormalised sender of the very first message; set at conversation creation        |
| `first_reply_at`  | `timestamptz` NULL            | set by trigger when the non-initiator sends their first message; drives 24h lock   |
| `last_message_at` | `timestamptz`                 |                                                                                    |
| `created_at`      | `timestamptz` default `now()` |                                                                                    |

Unique on `(user_a, user_b)`.

### 2.6 `messages`

| column              | type                             | notes                                                                               |
| ------------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| `id`                | `uuid` PK                        |                                                                                     |
| `conversation_id`   | `uuid` FK                        |                                                                                     |
| `sender_id`         | `uuid` FK → `profiles(id)`       |                                                                                     |
| `kind`              | `text` check in (`text`,`voice`) |                                                                                     |
| `body_text`         | `text`                           | nullable; required if kind=text                                                     |
| `voice_path`        | `text`                           | nullable; required if kind=voice                                                    |
| `voice_duration_ms` | `integer`                        |                                                                                     |
| `status`            | `text` default `'approved'`      | same enum as `voices`; default flips to `'pending'` once auto-moderation is enabled |
| `created_at`        | `timestamptz` default `now()`    |                                                                                     |
| `read_at`           | `timestamptz`                    |                                                                                     |

### 2.7 `notifications`

| column       | type                                        | notes                           |
| ------------ | ------------------------------------------- | ------------------------------- |
| `id`         | `uuid` PK                                   |                                 |
| `user_id`    | `uuid` FK → `profiles(id)`                  | recipient                       |
| `kind`       | `text` check in (`like`,`message`,`system`) |                                 |
| `actor_id`   | `uuid` FK → `profiles(id)`                  | nullable for system             |
| `payload`    | `jsonb`                                     | e.g. `{ voice_id, message_id }` |
| `read_at`    | `timestamptz`                               |                                 |
| `created_at` | `timestamptz` default `now()`               |                                 |

### 2.8 `blocks` and `reports`

Standard pair: `blocks(blocker_id, blocked_id)`, `reports(reporter_id, target_user_id, target_voice_id, target_message_id, reason, free_text, status, resolved_by, resolved_at, created_at)`.

`reports.status` is `'pending' | 'dismissed' | 'actioned'` and is set by the back-office. `resolved_by` references `admin_users.id`.

### 2.9 `feed_seen`

Tracks voices the user already saw, to avoid showing them again.

| column     | type                  | notes |
| ---------- | --------------------- | ----- |
| `user_id`  | `uuid`                |       |
| `voice_id` | `uuid`                |       |
| `seen_at`  | `timestamptz`         |       |
| PK         | `(user_id, voice_id)` |       |

### 2.10 `admin_users`

The single source of truth for back-office access. A row in this table is what makes a Supabase `auth.users` account "an admin"; nothing else does. Mobile-app users (phone OTP) and admin-app users (email magic link) live in the same `auth.users` table and are distinguished only by the presence of an `admin_users` row.

| column         | type                                              | notes              |
| -------------- | ------------------------------------------------- | ------------------ |
| `id`           | `uuid` PK FK → `auth.users(id)` on delete cascade |                    |
| `email`        | `text` not null unique                            |                    |
| `display_name` | `text` not null                                   | shown in audit log |
| `created_at`   | `timestamptz` default `now()`                     |                    |
| `last_seen_at` | `timestamptz`                                     |                    |

RLS on this table: only service role can read it (the list of admins is sensitive). The `is_admin()` helper below is `security definer` so the back-office can probe its own status without reading the table directly.

### 2.11 `audit_log`

Every back-office action and every account-deletion writes a row here. Used for compliance and debugging.

| column        | type                          | notes                                                                                         |
| ------------- | ----------------------------- | --------------------------------------------------------------------------------------------- |
| `id`          | `uuid` PK                     |                                                                                               |
| `actor_id`    | `uuid`                        | references `admin_users(id)` for admin actions, `profiles(id)` for user self-service deletion |
| `action`      | `text`                        | e.g. `voice.reject`, `user.ban`, `account.delete`                                             |
| `target_kind` | `text`                        | `voice`, `message`, `profile`, `report`                                                       |
| `target_id`   | `uuid`                        |                                                                                               |
| `reason`      | `text`                        | nullable                                                                                      |
| `created_at`  | `timestamptz` default `now()` |                                                                                               |

---

## 3. RLS policies (essential ones)

```sql
-- profiles: anyone authenticated can read non-deleted, non-banned profiles
create policy "read_profiles" on profiles
  for select to authenticated
  using (deleted_at is null and is_banned = false);

create policy "update_own_profile" on profiles
  for update to authenticated
  using (id = auth.uid());

-- voices: read approved voices from non-blocked users
create policy "read_voices_public" on voices
  for select to authenticated
  using (
    status = 'approved'
    and not exists (
      select 1 from blocks
      where (blocker_id = auth.uid() and blocked_id = voices.user_id)
         or (blocker_id = voices.user_id and blocked_id = auth.uid())
    )
  );

create policy "write_own_voices" on voices
  for insert to authenticated
  with check (user_id = auth.uid());

-- messages: only participants can read/write
create policy "read_own_conv_messages" on messages
  for select to authenticated
  using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

create policy "send_own_messages" on messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

-- likes: insert only by self, read of who liked you = via aggregated function only
-- notifications: read only your own

-- admin helper, used by every back-office policy and Edge Function
create or replace function is_admin() returns boolean
  language sql stable security definer
  set search_path = public
  as $$ select exists (select 1 from admin_users where id = auth.uid()) $$;

-- admin overrides: admins read everything, including pending/rejected
create policy "admins_read_all_voices" on voices
  for select to authenticated using (is_admin());

create policy "admins_read_all_messages" on messages
  for select to authenticated using (is_admin());

create policy "admins_read_reports" on reports
  for select to authenticated using (is_admin());

create policy "admins_read_profiles" on profiles
  for select to authenticated using (is_admin());

-- writes from the back-office never use direct table updates;
-- they all go through Edge Functions (moderate, ban_user, dismiss_report)
-- that re-check is_admin() server-side.
```

Storage policies follow the same logic: `voices` bucket allows reading any approved file, `messages` bucket allows reading only files belonging to a conversation the user is part of (path convention `messages/{conversation_id}/{message_id}.m4a` checked in policy). An additional policy grants admins read access to both buckets:

```sql
create policy "admins_read_audio" on storage.objects
  for select to authenticated
  using (is_admin() and bucket_id in ('voices', 'messages'));
```

---

## 4. Audio pipeline

### 4.1 Recording (client)

1. Request mic permission. If denied, show explanation screen with deep link to settings.
2. Configure `AVAudioSession`: category `playAndRecord`, mode `default`, options `[mixWithOthers, allowBluetooth]`. Activate before recording, deactivate after.
3. Use `expo-audio` `useAudioRecorder` with preset:
   ```ts
   {
     extension: '.m4a',
     android: { extension: '.m4a', outputFormat: 'mpeg4', audioEncoder: 'aac', sampleRate: 22050, numberOfChannels: 1, bitRate: 32000 },
     ios:     { extension: '.m4a', outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM, sampleRate: 22050, numberOfChannels: 1, bitRate: 32000 },
   }
   ```
4. Sample metering at 50 ms for the live waveform.
5. Hard cap at **90_000 ms**: auto-stop and disable record button.
6. Save to `FileSystem.documentDirectory + 'pending/{uuid}.m4a'`.
7. Allow re-record before commit. The temp file is deleted after successful upload or on reset/cancel.

### 4.2 Upload (client → Storage)

1. Client calls Edge Function `request_upload({ kind: 'voice' | 'message', conversation_id?, duration_ms })`. Function returns:
   ```json
   {
     "object_path": "voices/{user_id}/{uuid}.m4a",
     "signed_url": "https://...supabase.co/storage/v1/object/upload/sign/...",
     "token": "..."
   }
   ```
   Function rejects if `duration_ms > 90_000` or user is banned.
2. Client `PUT` the file directly to `signed_url` with `Content-Type: audio/mp4`.
3. On success, client calls Edge Function `commit_upload({ kind, object_path, duration_ms, prompt_id?, conversation_id?, body_text? })` which:
   - HEAD-checks the object exists and `Content-Length ≤ 2_000_000`,
   - inserts the `voices` or `messages` row.
   - **V1 MVP:** the row is inserted with `status = 'approved'` (default) and is immediately visible. No moderation job is enqueued.
   - **With auto-moderation enabled (post-MVP):** the row is inserted with `status = 'pending'` and a row is added to `moderation_jobs`, which the cron-triggered Edge Function picks up (see §4.3).

### 4.3 Moderation

#### 4.3.a V1 MVP — reactive moderation via the back-office

In V1 MVP we do **not** run any automatic moderation. Content goes live the moment `commit_upload` returns. Safety relies on the social loop, fully driven by the operator from the **admin back-office** (Phase 6.bis, see §13):

1. Any user can **report** a voice or a voice message via the report flow (Phase 6). A row is inserted in `reports` with `status = 'pending'`.
2. The operator opens the back-office `/reports` page. She sees the report, listens to the audio inline, and clicks one of:
   - **Ignorer** → calls Edge Function `dismiss_report(report_id, reason?)` → sets `reports.status = 'dismissed'`.
   - **Retirer le contenu** → calls Edge Function `moderate(target_kind, target_id, decision='reject', reason)` → sets the target's `status = 'rejected'`, writes `moderation_reason`, inserts a `kind='system'` notification for the author, sets `reports.status = 'actioned'`.
   - **Bannir l'utilisateur** → calls Edge Function `ban_user(user_id, reason)` → sets `profiles.is_banned = true` and revokes the user's Supabase session.
3. Every action writes a row to `audit_log` (server-side, inside the Edge Function — never trusted from the client).
4. The author of a rejected voice receives the system notification with the reason. Appeals are handled by email in V1 (no in-app appeal UI).
5. Rejected rows are kept in DB for 30 days for audit, then hard-deleted with their storage object (cron job).

This trade-off is explicit: at the validation cohort scale (5–10 k users) the operator can absorb the manual moderation load, and shipping the MVP without paid moderation vendors keeps the V1 scope tight. The schema and Edge Functions are already shaped for the auto-pipeline so enabling it later is additive — the back-office gains a new "À valider" tab that consumes the `manual_review` queue (see §4.3.b and §13).

#### 4.3.b Optional / post-MVP — async auto-moderation

This is the target design. It is **not** part of the V1 MVP commitment.

When enabled, `commit_upload` switches the default row status to `'pending'` and enqueues a `moderation_jobs` row. Then:

1. Cron job (Supabase scheduled function, every 30s) picks up `moderation_jobs` rows in `pending` state.
2. Calls **AssemblyAI** to transcribe (FR). Stores transcript on the row.
3. Calls **Hive Audio** moderation on the file URL (signed). Calls **OpenAI Moderation** on the transcript text (free fallback).
4. Decision matrix:
   - Hive `flagged` AND severity ≥ medium → `status = 'rejected'`, store reason.
   - Hive `flagged` low severity → `status = 'manual_review'`.
   - Otherwise → `status = 'approved'`.
5. On approval, dispatch notifications (push + insert in `notifications` table).
6. Rejected voices/messages are kept in DB for 30 days for appeal, then hard-deleted with their storage object.

### 4.4 Playback (client)

1. Client fetches a voice row → calls `getSignedUrl(object_path, expiresIn=3600)`. Signed URLs are cached at the module level in `src/lib/feedPlayer.ts` and refreshed 10 minutes before their 1 h TTL expires. Signed URLs for the next two upcoming voices are prefetched in the background so the source swap is near-instant on swipe.
2. The feed uses a **single `useAudioPlayer` instance** (`src/lib/feedPlayer.ts`). Its source is swapped via `player.replace(signedUrl)` each time the active card changes. A load token guards against out-of-order URL resolutions when the user swipes faster than the network — only the latest token's resolution is applied. The play button is hard-gated on `snapshot.isLoading` (true while the URL is being fetched or the source is being swapped) to prevent calling `play()` on an unready player. Note: `snapshot.isLoading` does **not** include `status.isBuffering` from expo-audio — including it would cause a deadlock where the button stays disabled after `replace()` because expo-audio only clears `isBuffering` once `play()` is called.
3. Audio session for playback: `playsInSilentMode: true`, `shouldPlayInBackground: true` (see `configureAudioSessionForPlayback` in `src/lib/audio.ts`).
4. Handle interruptions (incoming call): pause and resume on interruption end.
5. For voice messages in chat, use a single shared player (one playing at a time).

---

## 5. Realtime messaging

### 5.0 Conversation lifecycle

A conversation between initiator A and recipient B passes through four states:

| State | Conditions | Allowed messages |
|---|---|---|
| **EMPTY** | 0 messages in the conversation | Only A can send. Must be `kind='voice'`. |
| **AWAITING_REPLY** | ≥ 1 message; `first_reply_at IS NULL` | Only B can send. Must be `kind='voice'`. |
| **VOICE_ONLY** | `first_reply_at IS NOT NULL` AND `now() - first_reply_at < 24h` | Either user can send. Must be `kind='voice'`. |
| **OPEN** | `first_reply_at IS NOT NULL` AND `now() - first_reply_at ≥ 24h` | Either user can send. `kind='voice'` or `kind='text'`. |

State transitions are enforced **server-side** by the `enforce_message_rules()` BEFORE INSERT trigger on `messages`. The trigger raises `SQLSTATE 23514` with these frozen message codes the client must map:

- `messages.conversation_not_found`
- `messages.not_a_participant`
- `messages.blocked`
- `messages.not_initiator`
- `messages.first_message_must_be_voice`
- `messages.awaiting_reply`
- `messages.reply_must_be_voice`
- `messages.text_locked_24h`
- `messages.update_forbidden`

The `first_reply_at` timestamp is written automatically by the `update_conversation_on_message()` AFTER INSERT trigger the moment the non-initiator sends their first message. It is never set by the client.

### 5.1 Subscriptions

- For each open conversation: subscribe to Postgres Changes
  ```ts
  supabase
    .channel(`conv:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      handler,
    )
    .on("broadcast", { event: "typing" }, handler)
    .on("broadcast", { event: "recording" }, handler)
    .subscribe();
  ```
- For the inbox list: subscribe to `INSERT` on `messages` (RLS-filtered) — replaces the earlier `notifications` plan, since the inbox needs message previews anyway. Both `messages` and `conversations` tables are added to the `supabase_realtime` publication in the Phase 7 migration.

### 5.2 Optimistic UI

- On send: insert the message in the local React Query cache with `status: 'sending'`. On server confirmation, replace.
- Failed sends are kept locally and retried on reconnect (manual retry button after 3 failures).
- Retry queue is in-memory only in V1; drafts do not survive an app kill.

### 5.3 Read receipts

- When the user opens a conversation, mark all unread messages from the other user as read in a single `update`. Update is broadcast via Postgres Changes (the sender sees `read_at` populate).

---

## 6. Push notifications

V1 MVP — committed (Phase 8):

- On login, the mobile client requests notification permission, fetches the **Expo Push Token** via `getExpoPushTokenAsync({ projectId })` (the EAS project id from `app.config.ts`), and stores it on `profiles.push_token` via a single `update`.
- The token is refreshed only when it changes (idempotent write). On a denied permission or a simulator, the helper returns `null` and the app keeps working.
- The setup is fan-out via the database itself:
  1. The Phase 6 trigger `notify_on_like()` and the Phase 7 trigger `notify_on_message()` insert one row into `notifications` for every relevant event.
  2. The Phase 8 trigger `dispatch_push_notification()` fires AFTER INSERT on `notifications` and calls the `dispatch_push` Edge Function asynchronously through `pg_net.http_post`. The trigger is downgraded to a `RAISE WARNING` on any failure so the originating INSERT is never blocked.
  3. The Edge Function `dispatch_push` (Deno) loads the recipient's `profiles.push_token`, builds the Expo Push payload, POSTs to `https://exp.host/--/api/v2/push/send` with an optional `EXPO_ACCESS_TOKEN`, and stamps `notifications.pushed_at = now()` on success. On `DeviceNotRegistered` it nulls out `profiles.push_token` so the next login re-registers the device.
- **V1 fan-out rules — deliberately simple**:
  - **Every** `kind = 'like'` insert is pushed. No debounce.
  - **Every** `kind = 'message'` insert is pushed. No presence skip — even if the recipient is currently in the conversation, the OS notifies them and the in-app Realtime keeps the inbox up to date independently.
  - `kind = 'system'` notifications (e.g. moderation rejections) are inserted in `notifications` but `dispatch_push` skips them in V1. Surfacing them to the user is deferred to a later phase.
- **Payload shape** (the client only reads `data.deep_link` and `data.notification_id`):
  - `kind = 'like'`   → title `"Nouveau like 💜"`, body `"<actor> a liké ta voix"`, `data.deep_link = '/likes'`.
  - `kind = 'message'` → title `<actor>`, body either `"Message vocal"` or the first 60 chars of the text + `…`, `data.deep_link = '/messages/<conversation_id>'`.
- Tapping a push runs `usePushDeepLink` (cold-start replay via `getLastNotificationResponseAsync` + live tap via `addNotificationResponseReceivedListener`). The `deep_link` is allowlisted against `^/likes$|^/messages/<uuid>$` before `router.push` — defence against a payload tampering attempt.
- The OS app icon badge is kept in sync by `useAppIconBadge`, which mirrors the in-app counters (`useUnseenLikesCount + useUnreadMessagesCount`) onto `Notifications.setBadgeCountAsync(...)`. The in-app red dot on the BottomNav (Likes / Messages tabs) is unchanged.

**Runtime configuration (set by the operator post-deploy, never committed):**

```sql
ALTER DATABASE postgres SET "app.settings.dispatch_push_url"
  = 'https://<project-ref>.supabase.co/functions/v1/dispatch_push';
ALTER DATABASE postgres SET "app.settings.dispatch_push_service_key"
  = '<service_role_key>';
```

Plus `npx supabase secrets set EXPO_ACCESS_TOKEN=<token>` (optional, recommended in production).

**Post-V1 evolutions** (out of scope for the MVP, doc tracked here for context):
- Per-actor / per-kind **debounce** (e.g. max 1 like push per hour per pair). The `notifications.pushed_at` column is the anchor for this future query.
- **Presence skip** (do not push if the recipient is currently online). Requires either a heartbeat on `profiles.last_seen_at` or a server-readable presence source — not implemented in V1.
- Push for `kind = 'system'` notifications (moderation rejections), once the in-app surfacing is designed.

---

## 7. Geo and country gating

- At signup, derive country from the verified phone number's country code (`+33` → FR, `+32` → BE, `+41` → CH). Reject anything else.
- During profile onboarding, the user types their city or village, taps a search button, and selects one of the returned geocoded results. The app stores the selected display city in `profiles.city` and the returned coordinates in `profiles.location` (PostGIS point). V1 does not request device GPS permission, does not use `expo-location`, and does not implement live autocomplete.
- V1 uses the public Nominatim endpoint for explicit city searches only, with a minimum query length and no request on every keystroke. This keeps the first version free of geocoding API keys while respecting Nominatim's usage policy.
- Distance filter uses `ST_DWithin(profiles.location, $1::geography, $2)` in the feed query.

---

## 8. Feed query

The feed applies **bidirectional preference matching**: a candidate appears only if (a) their gender matches what the current user is looking for, AND (b) the current user's gender matches what the candidate is looking for. This prevents showing profiles to people they would never want to meet.

The query is wrapped in a `security definer` function `get_feed(p_distance_m int, p_limit int, p_cursor_created_at timestamptz)` callable from the client. The function reads the caller's `gender`, `looking_for` and `location` from `profiles` itself (via `auth.uid()`), so the mobile client only passes session-level filters: max distance, page size, and a `created_at` cursor for pagination.

```sql
-- Returns up to N voices the current user hasn't seen, isn't blocked from,
-- matching gender preferences in both directions and within p_distance_m.
-- ordered by recency + light shuffle.
--
-- Caller's gender / looking_for / location are read from `profiles` inside the function.
-- Caller passes only:
--   p_distance_m         int          — max distance in metres, NULL = unlimited
--   p_limit              int          — page size (capped server-side at 50)
--   p_cursor_created_at  timestamptz  — pagination cursor, NULL = first page
select v.id            as voice_id,
       v.storage_path,
       v.duration_ms,
       v.theme,
       v.title,
       pr.body         as prompt_body,
       v.created_at,
       v.user_id,
       p.display_name,
       p.birthdate,
       p.city,
       p.bio_emojis
from voices v
join profiles p on p.id = v.user_id
left join prompts pr on pr.id = v.prompt_id
where v.status = 'approved'
  and v.is_active = true
  and p.deleted_at is null
  and p.is_banned = false
  and p.id <> auth.uid()
  and not exists (select 1 from feed_seen fs where fs.user_id = auth.uid() and fs.voice_id = v.id)
  and not exists (select 1 from blocks b where (b.blocker_id = auth.uid() and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = auth.uid()))
  and p.gender = any(<caller_looking_for>)
  and <caller_gender> = any(p.looking_for)
  and (p_distance_m is null or <caller_location> is null or p.location is null
       or ST_DWithin(p.location, <caller_location>, p_distance_m))
  and (p_cursor_created_at is null or v.created_at < p_cursor_created_at)
order by v.created_at desc, random()
limit p_limit;
```

`prompt_body` is joined in so the card can display the catchphrase without a second query per voice. Distance tolerates NULL on either side: a profile that somehow ended up without a `location` (defensive — the onboarding requires it) is still surfaced.

### Ordering rationale

`ORDER BY v.created_at DESC, random()` gives a feed that surfaces new voices first while adding shuffle within the same recency bucket. No engagement-based ranking in V1 — that complexity is unnecessary at the validation cohort scale and would be revisited post-Phase 9 if retention data justifies it.

### Filters modal (Phase 5)

The client-side filters modal lets the user adjust:

| Filter | Passed to `get_feed` as |
|---|---|
| Max distance | `p_distance_m` |
| Age range | Post-query client-side filter on `p.birthdate` (avoids index complexity in V1) |

Age is filtered client-side in V1 because adding it server-side would require a functional index on a computed column (`extract(year from age(birthdate))`); the 20-row page size makes client-side filtering negligible.

The `looking_for` filter is **not** in the modal: orientation is a stable profile attribute, not a session preference. It lives in `profiles.looking_for` and is editable only from the profile screen; `get_feed` reads it directly via `auth.uid()`.

### Empty-state recovery

When the user has consumed every voice that matches their filters, the feed empty-state offers an explicit CTA "Recommencer mon feed" that calls the companion RPC `reset_feed_seen()` (a `security definer` function that deletes all `feed_seen` rows for `auth.uid()`). No automatic cooldown — the re-show is opt-in.


## 9. Account deletion (RGPD)

Edge Function `delete_account` (called by authenticated user):

1. Soft-delete profile (`deleted_at = now()`).
2. Hard-delete: voices rows + storage objects, messages rows + storage objects (only the user's own; counterpart's messages stay but `sender_id` is anonymized to a tombstone uuid).
3. Hard-delete likes, notifications, push token, blocks, reports authored by the user.
4. Delete from `auth.users` (cascades to `profiles`).
5. Log the deletion in an audit table (no PII, just timestamp + reason).

---

## 10. Observability

V1 MVP — committed:

- **Sentry RN**: capture unhandled errors, audio recording failures, upload failures. Scrub `phone`, `body_text`, `transcript` from breadcrumbs.
- **Sentry server**: each Edge Function wrapped in a try/catch that captures with context.

Optional / post-MVP:

- **PostHog (EU)**: track events `voice_recorded`, `voice_played` (with %\_listened), `voice_liked`, `message_sent` (kind), `conversation_opened`, `signup_completed`. **No content, only counts.** Until PostHog is wired, product insight comes from Sentry plus ad-hoc Supabase SQL queries on `voices`, `likes`, `messages`, `notifications`.

---

## 11. Migration & secrets management

- **Migrations**: every schema change is a versioned SQL file in `supabase/migrations/`. Apply via `supabase db push` (CI) or `supabase migration up` (local).
- **Secrets**:
  - Mobile public keys, V1 MVP: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SENTRY_DSN` → `app.config.ts` + EAS env vars.
  - Mobile public keys, optional / post-MVP: `POSTHOG_KEY` (added when PostHog is enabled).
  - Admin back-office public keys, V1 MVP: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Vercel env vars. **The service role key is never exposed to the back-office front-end.**
  - Server secrets, V1 MVP: `TWILIO_*`, `EXPO_ACCESS_TOKEN` → Supabase Edge Function secrets (`supabase secrets set`).
  - Server secrets, optional / post-MVP: `ASSEMBLYAI_KEY`, `HIVE_KEY`, `OPENAI_API_KEY` (added when the auto-moderation pipeline is enabled).
  - **No secret ever committed.** `.env*` files in `.gitignore`.

---

## 12. Testing strategy (lightweight for V1)

- **Unit**: pure helpers (audio duration formatting, distance calc) with `jest`.
- **Integration**: Edge Functions tested with Deno's test runner against local Supabase.
- **E2E**: skipped in V1. Manual test plan documented per phase.
- **Device matrix**: iPhone 12+ (iOS 16+), Pixel 6+ (Android 12+). Test silent-mode playback on every audio change.
- **Back-office**: smoke-tested manually after each deploy (login, view a report, take down, ban, unban). No automated tests in V1.

---

## 13. Admin back-office (companion Next.js web app)

The back-office is a separate Next.js project that gives the operator a point-and-click interface to moderate content. It is the **only** moderation surface — no SQL, no Supabase Studio access for the operator.

### 13.1 Stack and hosting

- **Next.js 14** App Router, TypeScript strict, Tailwind CSS.
- **`@supabase/supabase-js`** The Supabase JS client uses the admin's session JWT, and the row-level security policies grant elevated read access via `is_admin()` (see §3).
- **Hosted on Vercel**, EU region (`fra1`), free tier.
- **Repo**: separate from the mobile repo (suggested name `lovoice-admin`). The generated Supabase types (`database.ts`) are copied from the mobile repo and regenerated together whenever a migration ships.
- **Deps cap**: same frugality rule as the mobile app. Allowed in V1: `next`, `react`, `tailwindcss`, `@supabase/supabase-js`, `@supabase/ssr`, `lucide-react` (icons), `date-fns`. Anything else needs justification.

### 13.2 Authentication

- A middleware (`app/(admin)/layout.tsx`) calls `is_admin()` once on mount; if false, the user is signed out and redirected to `/login` with an error toast. This is a UX guard only — every Edge Function still re-checks `is_admin()` server-side.
- Admins are provisioned by hand via a one-shot SQL migration `seed_admin_users.sql` (kept out of git — applied via `supabase db push` from the operator's machine, or by the developer on her behalf).

### 13.3 Pages (V1 MVP scope)

| Route         | Purpose                                                                                                                                                                                                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/login`      |
| `/reports`    | Paginated table of `reports` where `status = 'pending'`, joined with the target voice/message and the reporter+author profiles. Each row shows: avatars, reason, free text, an inline `<audio>` player on a freshly-fetched signed URL, and the three action buttons (Ignorer / Retirer / Bannir). Confirmation modal on Retirer and Bannir. Auto-refresh every 30s via React Query. |
| `/users/[id]` | Profile detail: display fields, current voice (with player), recent activity (last 10 messages, last 10 reports filed against them). Buttons: **Bannir** / **Lever le ban**. "Supprimer le compte" is deferred to Phase 10 (current `delete_account_admin` is a soft-delete only; exposing it before the hard-purge ships would mislead the operator).                                                                                                                  |
| `/banned`     | List of currently banned users, with the reason and an **Unban** button.                                                                                                                                                                                                                                                                                                             |
| `/audit`      | Read-only paginated view of `audit_log` for the last 90 days, filterable by `actor_id`, `action`, `target_kind`.                                                                                                                                                                                                                                                                     |

### 13.4 Edge Functions consumed

The back-office never writes to tables directly. Every action goes through an Edge Function (Supabase Functions, Deno) that:

1. Verifies the caller's JWT,
2. Re-checks `is_admin()`,
3. Performs the change,
4. Writes a row to `audit_log`,
5. Returns a structured JSON result.

Functions used by the V1 back-office:

| Function               | Body                                                       | Purpose                                                                                                        |
| ---------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `dismiss_report`       | `{ report_id, reason? }`                                   | Mark report as `dismissed`.                                                                                    |
| `moderate`             | `{ target_kind: 'voice' \| 'message', target_id, reason }` | Set target `status = 'rejected'`, store reason, notify author, mark related reports as `actioned`. Idempotent. |
| `ban_user`             | `{ user_id, reason }`                                      | Set `is_banned = true`, revoke session via `auth.admin.signOut`.                                               |
| `unban_user`           | `{ user_id }`                                              | Set `is_banned = false`.                                                                                       |
| `delete_account_admin` | `{ user_id, reason }`                                      | Same purge logic as the user-initiated `delete_account` (§9), but invoked by an admin.                         |

### 13.5 Audio playback in the back-office

Audio files live in private buckets (`voices`, `messages`). The back-office obtains a signed URL on demand via `supabase.storage.from('voices').createSignedUrl(path, 3600)`. The new `admins_read_audio` storage policy (§3) authorizes this read because the admin's JWT carries an `auth.uid()` that resolves to a row in `admin_users`. The browser's native `<audio controls>` element is sufficient — no custom player needed.

### 13.6 Evolution path with the optional phases

The back-office is designed so each optional phase **adds** capabilities, never replaces existing ones:

- **When AssemblyAI ships (Phase 9)**: the report row in `/reports` gains a transcript column (`voices.transcript` / `messages.transcript`). No structural change.
- **When Hive ships (Phase 9)**: a new tab `/manual-review` lists items with `status = 'manual_review'`. It reuses the same row component as `/reports`. The decision actions are the same three Edge Functions. The only new thing is the source query.
- **When PostHog ships (Phase 10.bis)**: a new tab `/stats` embeds PostHog dashboards in iframes (PostHog supports iframe sharing of insights). No back-end change.

This is why Option A (custom Next.js) was chosen over Retool or an in-app admin: every future feature lands as **a new route** in the same codebase, with shared components and shared types.
