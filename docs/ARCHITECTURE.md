<!--
  Technical architecture, data model, security model, and audio pipeline for LOVoice.
  Read this BEFORE writing any backend or audio-related code.
-->

# LOVoice — Technical Architecture

This document is the canonical reference for the system design.
Read it together with `README.md` (constraints) and `docs/ROADMAP.md` (current phase scope).

---

## 1. High-level diagram

```
┌─────────────────────────┐         ┌──────────────────────────────┐
│   Mobile app (Expo)     │         │      Supabase (EU)           │
│  ─────────────────────  │  HTTPS  │  ──────────────────────────  │
│  expo-router            ├────────▶│  Auth (phone OTP via Twilio) │
│  expo-audio (rec/play)  │         │  Postgres + PostGIS + RLS    │
│  React Query + Zustand  │◀── WS ──┤  Realtime (chat, presence)   │
│  expo-notifications     │         │  Storage (voices / messages)  │
└──────────┬──────────────┘         │  Edge Functions (Deno)       │
           │                        └──────────────┬───────────────┘
           │ direct upload (signed PUT)            │ webhooks / calls
           ▼                                       ▼
   ┌──────────────────┐               ┌─────────────────────────┐
   │ Storage buckets  │               │  AssemblyAI (transcribe)│
   │  - voices         │               │  Hive (audio + text mod)│
   │  - messages      │               │  Twilio Verify (SMS)    │
   └──────────────────┘               │  Expo Push Service      │
                                      │  Sentry / PostHog (EU)  │
                                      └─────────────────────────┘
```

---

## 2. Data model (Postgres)

All tables live in the default `public` schema unless noted. **All tables have RLS enabled.**

### 2.1 `profiles`
One row per user. `id` is `auth.users.id` (one-to-one).

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK FK → `auth.users(id)` on delete cascade | |
| `display_name` | `text` not null | |
| `birthdate` | `date` not null | age computed in queries |
| `gender` | `text` check in (`male`,`female`,`nonbinary`,`other`) | |
| `looking_for` | `text[]` | filter target genders |
| `city` | `text` | display only |
| `location` | `geography(Point, 4326)` | for distance filter |
| `country` | `text` check in (`FR`,`BE`,`CH`) | enforced at signup |
| `bio_emojis` | `text[]` | up to 3 |
| `created_at` | `timestamptz` default `now()` | |
| `last_seen_at` | `timestamptz` | |
| `push_token` | `text` | Expo push token |
| `is_banned` | `boolean` default false | |
| `deleted_at` | `timestamptz` | soft delete; hard purge via Edge Function |

### 2.2 `voices`
The voice introduction. A user can have multiple voices but only **one `is_active = true`** at a time.

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `profiles(id)` | |
| `prompt_id` | `uuid` FK → `prompts(id)` | nullable (free-form voice) |
| `storage_path` | `text` | `voices/{user_id}/{voice_id}.m4a` |
| `duration_ms` | `integer` check (≤ 300_000) | |
| `transcript` | `text` | filled async by AssemblyAI |
| `theme` | `text` | UI color theme |
| `status` | `text` default `'pending'` check in (`pending`,`approved`,`rejected`,`manual_review`) | |
| `moderation_reason` | `text` | filled by Hive |
| `is_active` | `boolean` default false | partial unique index per user |
| `created_at` | `timestamptz` default `now()` | |

### 2.3 `prompts`
Curated catalog of suggested topics ("Mon plus beau voyage…"). Read-only for clients.

### 2.4 `likes`
A user likes a voice. Unique on `(liker_id, voice_id)`.

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `liker_id` | `uuid` FK → `profiles(id)` | |
| `voice_id` | `uuid` FK → `voices(id)` | |
| `created_at` | `timestamptz` default `now()` | |

### 2.5 `conversations`
Created lazily on the first reply (text or voice) to a voice.

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_a` | `uuid` | always `least(user_a, user_b)` to enforce uniqueness |
| `user_b` | `uuid` | |
| `last_message_at` | `timestamptz` | |
| `created_at` | `timestamptz` default `now()` | |

Unique on `(user_a, user_b)`.

### 2.6 `messages`

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `conversation_id` | `uuid` FK | |
| `sender_id` | `uuid` FK → `profiles(id)` | |
| `kind` | `text` check in (`text`,`voice`) | |
| `body_text` | `text` | nullable; required if kind=text |
| `voice_path` | `text` | nullable; required if kind=voice |
| `voice_duration_ms` | `integer` | |
| `status` | `text` default `'pending'` | same enum as voices |
| `created_at` | `timestamptz` default `now()` | |
| `read_at` | `timestamptz` | |

### 2.7 `notifications`

| column | type | notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `profiles(id)` | recipient |
| `kind` | `text` check in (`like`,`message`,`system`) | |
| `actor_id` | `uuid` FK → `profiles(id)` | nullable for system |
| `payload` | `jsonb` | e.g. `{ voice_id, message_id }` |
| `read_at` | `timestamptz` | |
| `created_at` | `timestamptz` default `now()` | |

### 2.8 `blocks` and `reports`
Standard pair: `blocks(blocker_id, blocked_id)`, `reports(reporter_id, target_user_id, target_voice_id, reason, created_at)`.

### 2.9 `feed_seen`
Tracks voices the user already saw, to avoid showing them again.

| column | type | notes |
|---|---|---|
| `user_id` | `uuid` | |
| `voice_id` | `uuid` | |
| `seen_at` | `timestamptz` | |
| PK | `(user_id, voice_id)` | |

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
```

Storage policies follow the same logic: `voices` bucket allows reading any approved file, `messages` bucket allows reading only files belonging to a conversation the user is part of (path convention `messages/{conversation_id}/{message_id}.m4a` checked in policy).

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
5. Hard cap at **300_000 ms**: auto-stop and disable record button.
6. Save to `FileSystem.documentDirectory + 'pending/{uuid}.m4a'`.
7. Allow re-record before commit. The temp file is deleted after successful upload or after 24h.

### 4.2 Upload (client → Storage)

1. Client calls Edge Function `request_upload({ kind: 'voice' | 'message', conversation_id?, duration_ms })`. Function returns:
   ```json
   {
     "object_path": "voices/{user_id}/{uuid}.m4a",
     "signed_url": "https://...supabase.co/storage/v1/object/upload/sign/...",
     "token": "..."
   }
   ```
   Function rejects if `duration_ms > 300_000` or user is banned.
2. Client `PUT` the file directly to `signed_url` with `Content-Type: audio/mp4`.
3. On success, client calls Edge Function `commit_upload({ kind, object_path, duration_ms, prompt_id?, conversation_id?, body_text? })` which:
   - HEAD-checks the object exists and `Content-Length ≤ 6_000_000`,
   - inserts the `voices` or `messages` row with `status = 'pending'`,
   - enqueues a moderation job (insert into `moderation_jobs` table → cron-triggered Edge Function picks it up).

### 4.3 Moderation (server, async)

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

1. Client fetches a voice row → calls `getSignedUrl(object_path, expiresIn=3600)`.
2. Holds **3 audio player instances** in a ring buffer for the feed: `current`, `next`, `next+1`. Preload `next` and `next+1` on `prepareAsync`.
3. On feed scroll, rotate the ring (cheap), play the new `current`.
4. Audio session for playback: `playAndRecord` with `playsInSilentModeIOS = true`, `staysActiveInBackground = true`.
5. Handle interruptions (incoming call): pause and resume on interruption end.
6. For voice messages in chat, use a single shared player (one playing at a time).

---

## 5. Realtime messaging

### 5.1 Subscriptions
- For each open conversation: subscribe to Postgres Changes
  ```ts
  supabase.channel(`conv:${conversationId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, handler)
    .on('broadcast', { event: 'typing' }, handler)
    .on('broadcast', { event: 'recording' }, handler)
    .subscribe();
  ```
- For the inbox list: subscribe to `INSERT` on `notifications` filtered by `user_id`.

### 5.2 Optimistic UI
- On send: insert the message in the local React Query cache with `status: 'sending'`. On server confirmation, replace.
- Failed sends are kept locally and retried on reconnect (manual retry button after 3 failures).

### 5.3 Read receipts
- When the user opens a conversation, mark all unread messages from the other user as read in a single `update`. Update is broadcast via Postgres Changes (the sender sees `read_at` populate).

---

## 6. Push notifications

- On login, fetch Expo push token, store on `profiles.push_token`.
- An Edge Function `dispatch_notification` is called from triggers/jobs:
  - new like (debounced: max 1 push per liker per recipient per hour),
  - new message (silent if recipient is online, i.e. has an open Realtime channel — check via Presence),
  - moderation rejection (only to the author).
- Payload includes `data.deep_link` so tapping opens the right screen.

---

## 7. Geo and country gating

- At signup, derive country from the verified phone number's country code (`+33` → FR, `+32` → BE, `+41` → CH). Reject anything else.
- Optional location capture (precise lat/lng) is asked separately in onboarding, with explanation. Stored in `profiles.location` (PostGIS point).
- Distance filter uses `ST_DWithin(profiles.location, $1::geography, $2)` in the feed query.

---

## 8. Feed query

```sql
-- Returns up to N voices the current user hasn't seen, isn't blocked from,
-- matching gender preference and within max_distance_km, ordered by recency + light shuffle.
select v.*, p.display_name, p.birthdate, p.city, p.bio_emojis
from voices v
join profiles p on p.id = v.user_id
where v.status = 'approved'
  and v.is_active = true
  and p.deleted_at is null
  and p.is_banned = false
  and p.id != auth.uid()
  and not exists (select 1 from feed_seen fs where fs.user_id = auth.uid() and fs.voice_id = v.id)
  and not exists (select 1 from blocks b where (b.blocker_id = auth.uid() and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = auth.uid()))
  and p.gender = any($1::text[])  -- looking_for of current user
  and ST_DWithin(p.location, $2::geography, $3)
order by v.created_at desc, random()
limit 20;
```

Wrapped in a `security definer` function `get_feed(max_distance_km int)` callable from the client.

---

## 9. Account deletion (RGPD)

Edge Function `delete_account` (called by authenticated user):
1. Soft-delete profile (`deleted_at = now()`).
2. Hard-delete: voices rows + storage objects, messages rows + storage objects (only the user's own; counterpart's messages stay but `sender_id` is anonymized to a tombstone uuid).
3. Hard-delete likes, notifications, push token, blocks, reports authored by the user.
4. Delete from `auth.users` (cascades to `profiles`).
5. Log the deletion in an audit table (no PII, just timestamp + reason).

---

## 10. Observability

- **Sentry RN**: capture unhandled errors, audio recording failures, upload failures. Scrub `phone`, `body_text`, `transcript` from breadcrumbs.
- **Sentry server**: each Edge Function wrapped in a try/catch that captures with context.
- **PostHog (EU)**: track events `voice_recorded`, `voice_played` (with %_listened), `voice_liked`, `message_sent` (kind), `conversation_opened`, `signup_completed`. **No content, only counts.**

---

## 11. Migration & secrets management

- **Migrations**: every schema change is a versioned SQL file in `supabase/migrations/`. Apply via `supabase db push` (CI) or `supabase migration up` (local).
- **Secrets**:
  - Mobile public keys (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `POSTHOG_KEY`, `SENTRY_DSN`) → `app.config.ts` + EAS env vars.
  - Server secrets (`TWILIO_*`, `ASSEMBLYAI_KEY`, `HIVE_KEY`, `EXPO_ACCESS_TOKEN`) → Supabase Edge Function secrets (`supabase secrets set`).
  - **No secret ever committed.** `.env*` files in `.gitignore`.

---

## 12. Testing strategy (lightweight for V1)

- **Unit**: pure helpers (audio duration formatting, distance calc) with `jest`.
- **Integration**: Edge Functions tested with Deno's test runner against local Supabase.
- **E2E**: skipped in V1. Manual test plan documented per phase.
- **Device matrix**: iPhone 12+ (iOS 16+), Pixel 6+ (Android 12+). Test silent-mode playback on every audio change.
