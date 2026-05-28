<!--
  Execution plan handover for a fresh LLM chat. The previous chat completed the
  audit and validated the plan with the user. This document is the compressed
  context + step-by-step plan to execute. Delete it once the refactor is merged.
-->

# Chat audio refactor — execution plan

## 0. How to use this document

You are picking up a refactor that has been planned but **not started**. The
previous chat ran the audit, validated the diagnosis with the product owner,
and wrote this plan.

Do this, in order:

1. Read this document **fully** before doing anything else.
2. Read `README.md` (skim — product + non-negotiable constraints).
3. Read `docs/ARCHITECTURE.md` §3 (RLS), §4 (audio pipeline). The rest is
   skim-only.
4. Read `docs/CHAT_AUDIO.md` from start to finish. It describes the **current**
   architecture, including the parts that did not work — you need that history
   to understand the invariants that survive the refactor (§5 identifier
   discipline, §6 realtime invalidation, §7 error surfaces) and to update the
   doc in commit 6 without losing the parts that still apply.
5. Execute commits 1 through 6 in strict order. Each commit is independently
   testable; `npm test` must stay green from one to the next.
6. Delete this file in commit 6 (it lives under `docs/DEBUG/`, which is a
   scratch area for handovers, not a permanent part of the docs tree).

---

## 1. Product context (one paragraph)

Lovoice is a voice-first dating app for FR/BE/CH (React Native / Expo SDK 54,
TypeScript strict). Users record a short voice introduction, discover others
through a vertical feed, and chat (text + voice messages). Voice is the core
medium — every recording / playback path must feel instant and reliable.
Backend is Supabase (Postgres + Auth + Storage + Realtime + Edge Functions),
EU region. Audio format is locked: AAC `.m4a` mono 32 kbps 22050 Hz, hard cap
90 s. Single developer, validation-cohort scale (5–10 k users).

---

## 2. The bug you are fixing

**Symptom (iPhone 13 Mini, iOS 26.5 — physical device only):**

- Voice messages recorded in the **chat** feature produce M4A files of exactly
  32.02 KB. Valid MP4 container, empty `mdat`, zero audio samples.
- Both sender and recipient see "Impossible de lire ce vocal" when they try to
  play these messages.
- Never reproduces on iOS simulator, never on Android (different recorder
  backend).
- **Profile recording** (`src/features/voices/hooks/useVoiceRecorder.ts`) uses
  the same expo-audio APIs and the same `VOICE_AUDIO_FORMAT`, and **always
  works**. That rules out the format, the mic permission, and a fundamental
  expo-audio breakage.

**Verified failure modes (from prior device testing):**

- After force-quit + relaunch, going to a broken conversation and recording
  three times in a row (without playing anything): 1st recording works, 2nd
  fails (32 KB silent), 3rd fails. Reproduced multiple times.
- After force-quit + relaunch, going to a broken conversation and playing one
  existing message then recording: 1st recording fails.
- The bug started in a single long conversation, then spread to a second
  conversation that had accumulated messages, then to all conversations after
  the patches that try to fix it were merged.

**The waveform on voice bubbles is NOT derived from audio.** It is a PRNG
seeded by `clientId` (`generateBarHeights` in `chatMessagePlayer.ts`). Seeing a
waveform tells you nothing about whether the file contains audio.

---

## 3. Diagnosis (locked-in)

Two compounding root causes. Both must be addressed for the refactor to work.
The product owner has validated this diagnosis.

### H1 — Recorder instance reuse on iOS produces silent files

`ConversationComposer` mounts `useChatVoiceRecorder` once per visit. The hook
creates `useAudioRecorder(VOICE_AUDIO_FORMAT)` once. Subsequent recordings
reuse the **same native AVAudioRecorder**: `stop()` →
`prepareToRecordAsync()` → `record()`.

This pattern is documented as broken on iOS in the expo-audio issue tracker:

- expo/expo#41656 — "First recording works, second recording is silent" when
  another media subsystem coexists. Closed as stale, never fixed.
- expo/expo#39646 — zero-byte recordings on Android caused by auto-prepare in
  `stop()`. Fixed for Android only, but the symptom pattern is the same on iOS
  in different conditions.
- expo/expo#36193 (expo-av) — "Only one Recording object can be prepared at a
  given time" required recreating the instance for each recording.

Before commit `80b021d` stabilised the FlatList via stable `clientId` keys,
`ConversationComposer` accidentally remounted between optimistic→confirmed
transitions, which gave the recorder a fresh native instance per recording.
Once the FlatList was stabilised, the recorder started being reused — and the
silent-M4A bug surfaced.

### H2 — AVAudioSession category swap while AVAudioPlayer instances are alive

`configureAudioSessionForRecording()` swaps the iOS AVAudioSession category
from `playback` to `playAndRecord`. At the moment of the swap, several native
`AVAudioPlayer` instances may be alive:

- The chat host player (`useChatMessagePlayerHost` via `useAudioPlayer(null)`)
- The feed player (`src/lib/feedPlayer.ts` — alive in background as long as
  the Discover tab has been visited and not unmounted)
- The profile voice preview player (`src/features/voices/hooks/useVoicePlayer.ts`
  — alive in background after the Profile tab has been visited)

The previous chat tried to mitigate this with `suspendHostForRecording()` that
flips a Zustand flag, unmounts a wrapper, and waits two `requestAnimationFrame`
ticks. The waits are heuristics — there is no guarantee the native player is
released by the time the category swap happens, and the mechanism only covers
the chat host (not feed, not profile). The "play one message, then record" failure
mode is consistent with this incomplete mitigation.

### Why the previous three fix attempts failed

1. `0a608b4` — adding `setIsAudioActiveAsync(false)` before the swap addresses
   neither H1 nor H2. Pure session-state churn, doesn't release players.
2. `10ac86f` — `ChatMessagePlayerHostMount` + `isHostSuspended` partially
   addresses H2 for the chat host only, leaves feed + profile players alive,
   and does nothing for H1.
3. The discarded `setIsAudioActiveAsync(true)` attempt is irrelevant to both.

---

## 4. Stakes — read this every commit

The product owner has been burned by three rounds of stacked patches. The
explicit ask is for production-grade code from the first commit:

- **Stability.** The user must be able to record N voice messages in any
  conversation, in any order, with playback interleaved, and every recording
  must produce a playable file. This is not negotiable.
- **Robustness.** Explicit error handling on every async call. No silent
  swallowing of failures. Every error path either recovers or surfaces a clear
  message to the user and a Sentry event for the developer.
- **Clean code.** Respect the existing architecture, naming, folder structure.
  No new dependencies. No `any`. No `@ts-ignore`. No commented-out blocks.
  Each new file starts with a one-line English comment explaining its purpose.
- **No stacked patches.** If a piece of code is being replaced, delete it.
  Do not leave the old mechanism beside the new one.
- **Best practices.** Follow `docs/ARCHITECTURE.md` and `README.md` constraints.
  Use the gated polling helper (`useAudioRecorderStateGated`) that already
  exists — do not regress to ungated polling. Use `expo-audio`, never
  `expo-av`. Use the existing `chatMessagePlayer` patterns where they still
  apply.
- **Tests.** `npm test` must pass at the end of every commit. Add tests for
  new logic. Delete tests that cover removed behaviour.

---

## 5. The plan — six sequential commits

Each commit is self-contained and leaves the tree in a working state.

### Commit 1 — `chore(chat): revert failed silent-M4A patches`

Revert the two failed attempts to start from a clean baseline. **Keep** the
upload-pipeline preflight check from `6acc2e1` — that one is correct and
valuable independently of the recording bug.

Actions:

```
git revert 10ac86f --no-edit
git revert 0a608b4 --no-edit
```

After revert, verify:
- `src/features/chat/components/ChatMessagePlayerHostMount.tsx` no longer
  exists.
- `src/features/chat/lib/chatMessagePlayer.ts` no longer references
  `isHostSuspended`, `suspendHostForRecording`, `resumeHostAfterRecording`,
  or `resetPlaybackState`.
- `src/features/chat/hooks/useChatVoiceRecorder.ts` no longer calls the
  suspension API.
- `src/components/main/ConversationScreen.tsx` no longer renders
  `<ChatMessagePlayerHostMount />`. It must instead either render the host
  via a tiny inner component that calls `useChatMessagePlayerHost()`, or call
  the hook directly at the top of the screen.
- The tests `ChatMessagePlayerHostMount.test.tsx` and the suspension-related
  tests in `useChatVoiceRecorder.test.ts` are gone (they were added in the
  reverted commit).
- `npm test` passes.

If the revert leaves the conversation screen without a host (because the
reverted code moved the `useChatMessagePlayerHost()` call out of
`ConversationScreen` and into the wrapper), make the smallest possible patch
to render the host directly in the screen. That patch is part of this commit.

### Commit 2 — `refactor(audio): single AVAudioSession category configured at boot`

Stop swapping the iOS AVAudioSession category at every record/playback
transition. Configure it once at app boot to `playAndRecord` with the options
that satisfy both recording and playback simultaneously.

`src/lib/audio.ts`:

- Replace `configureAudioSessionForRecording` and
  `configureAudioSessionForPlayback` with a single `configureAudioSession()`
  function exported once. Implementation:

  ```ts
  export async function configureAudioSession(): Promise<void> {
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: false,
    });
  }
  ```

  `playAndRecord` is the underlying iOS category triggered by
  `allowsRecording: true`. `shouldRouteThroughEarpiece: false` keeps the
  output on the speaker (or current external route) for playback — this is
  how WhatsApp / Telegram run their voice-message UX.

- Keep `useAudioRecorderStateGated` exactly as it is. It's correct, tests
  rely on it, and it is documented in `docs/CHAT_AUDIO.md` invariants 8 and
  9 (which are preserved).

`app/_layout.tsx`:

- Call `configureAudioSession()` once at module load (alongside the existing
  `setupNotificationHandler()` call). Wrap in try/catch + Sentry.

Remove every per-feature call to the old `configureAudioSessionForRecording` /
`configureAudioSessionForPlayback`:

- `src/features/chat/hooks/useChatVoiceRecorder.ts` — drop the swap on start
  and on finalize / cancel / unmount cleanup.
- `src/features/voices/hooks/useVoiceRecorder.ts` — same.
- `src/features/chat/lib/chatMessagePlayer.ts` — drop the `sessionConfigured`
  guard and its `configureAudioSessionForPlayback()` call.
- `src/lib/feedPlayer.ts` — same.
- `src/features/voices/hooks/useVoicePlayer.ts` — same.

Also drop the `setIsAudioActiveAsync(false)` / `setIsAudioActiveAsync(true)`
ceremony everywhere it appears. With the session permanently in
`playAndRecord` there is nothing to deactivate.

Drop the `recordingSessionTouchedRef` in both recorder hooks — its only
purpose was to gate the redundant session swap on unmount.

`npm test`: update tests that asserted on the old function names.

### Commit 3 — `refactor(chat): fresh recorder per session via VoiceRecordingSession component`

The biggest commit. Stops reusing the recorder.

Create `src/features/chat/components/VoiceRecordingSession.tsx`. Contract:

- Mounted **only** while a recording session is active (start tap → save /
  cancel / hard-cap auto-stop / parent unmount).
- Owns a single `useAudioRecorder(VOICE_AUDIO_FORMAT)`. Because the
  component mounts fresh per session, expo-audio creates a brand-new native
  AVAudioRecorder. On unmount, the native object is released.
- Exposes a small imperative-via-callbacks API to its parent
  (`ConversationComposer`):
  - `onReady()` — fired after `prepareToRecordAsync()` resolves and
    `record()` returns; parent flips its UI to the "recording" state.
  - `onTick(durationMs, meteringDb[])` — fired at the gated polling rate
    while recording; parent updates timer / waveform.
  - `onFinalized({ uri, durationMs })` — fired after stop + file move when
    the user taps "send".
  - `onCancelled()` — fired after stop + file delete when the user taps
    cancel.
  - `onError(code)` — fired on any thrown error during start, stop, or
    finalize. The component then unmounts itself by signaling its parent.
- Receives a `mode: 'idle' | 'finalizing' | 'cancelling'` prop or equivalent
  imperative ref so the parent can trigger stop+send or stop+cancel.

A clean pattern: parent owns the boolean `isSessionActive` and the imperative
ref. The session component reads the mode and acts accordingly via a
`useEffect`.

Inside the component:

- Mount-time `useEffect`:
  1. `pauseAllChatMessages()` — synchronous; pauses any active bubble.
  2. `pauseFeedPlayer()` and `pauseProfileVoicePlayer()` — new exported
     helpers from `src/lib/feedPlayer.ts` and
     `src/features/voices/hooks/useVoicePlayer.ts` respectively. They each
     just call `safeNativeCall(() => player.pause())` on their module-scope
     player ref. **No unmount, no source swap.** The session category is
     permanent, so paused players are inert.
  3. Sentry breadcrumb `recording.session_mounted`.
  4. `requestRecordingPermissionsAsync()` → if denied, `onError('permission_denied')`.
  5. `recorder.prepareToRecordAsync()` → on throw, `Sentry.captureException`
     with extra `{ step: 'prepare' }`, `onError('prepare_failed')`.
  6. `recorder.record()` → on throw, same pattern with `step: 'record'`.
  7. `onReady()`.
- Polling: use `useAudioRecorderStateGated(recorder, true, METERING_INTERVAL_MS)`.
  Forward `durationMillis` and `metering` to `onTick`.
- Hard cap effect: when `durationMillis >= MAX_VOICE_DURATION_MS`, trigger
  the finalize flow (same as parent setting mode to `'finalizing'`).
- Finalize effect (`mode === 'finalizing'`):
  1. `recorder.stop()` (await, try/catch → Sentry).
  2. Read `recorder.uri`. If null, `onError('no_uri')`.
  3. Sentry breadcrumb `recording.stopped` with srcSize.
  4. Move `srcFile` to `Paths.document/pending/<uuid>.m4a` as today.
  5. Sentry breadcrumb `recording.finalized` with `{ srcSize, destSize, durationMs }`.
  6. If `destSize < 35_000 && durationMs > 2_000` → `Sentry.captureMessage`
     with `level: 'warning'`, code `'recording.suspicious_size'`. (Keep the
     existing alert; it's still useful as a tripwire.)
  7. `onFinalized({ uri, durationMs })`.
- Cancel effect (`mode === 'cancelling'`):
  1. `recorder.stop()` (await, try/catch → swallowed).
  2. Best-effort delete the temp file from `recorder.uri`.
  3. `onCancelled()`.
- Unmount cleanup: if recording is still active, `recorder.stop().catch(...)`.
  The native recorder will be released by expo-audio. No session swap (single
  session, see commit 2).

`src/features/chat/components/ConversationComposer.tsx`:

- Replace the call to `useChatVoiceRecorder` with local state +
  conditional render of `<VoiceRecordingSession />`.
- States: `'idle' | 'starting' | 'recording' | 'finalizing' | 'cancelling'`.
  Transitions are explicit. Once the session reports `onFinalized`, call
  `onSendVoice(uri, durationMs)` and reset to `'idle'`. On `onCancelled`,
  reset to `'idle'`. On `onError`, reset to `'idle'` and surface the error
  banner.
- The "too short" guard (`MIN_VOICE_MESSAGE_DURATION_MS`) lives in the
  composer: after `onFinalized`, if `durationMs < MIN`, delete the file and
  show the "too short" hint; do not call `onSendVoice`.

Delete `src/features/chat/hooks/useChatVoiceRecorder.ts` and its test
file. The session component fully replaces it.

`src/lib/feedPlayer.ts`:

- Add `export function pauseFeedPlayer(): void` that calls `safeNativeCall`
  on the module-scoped player ref. If you do not currently keep a
  module-scoped ref to the feed player, add one (set on the host hook
  mount, cleared on unmount), modeled on `hostPlayerStack` in
  `chatMessagePlayer.ts`. Keep it simple — a single ref, not a stack.

`src/features/voices/hooks/useVoicePlayer.ts`:

- The voice preview player is hook-scoped, not module-scoped. Either (a)
  expose a `pauseProfileVoicePlayer()` module export by hoisting the player
  to a module ref (mirroring feedPlayer), or (b) move the pause to the
  effect that listens for `isRecordingSessionActive` from a shared Zustand
  store. Option (a) is the cleanest minimal change and matches the
  `feedPlayer` pattern.

Add focused tests:

- `VoiceRecordingSession.test.tsx`: mount fires permission + prepare +
  record; unmount releases recorder; finalize → onFinalized; cancel →
  onCancelled; permission denial → onError.
- `ConversationComposer.test.tsx`: existing tests probably still pass; if
  the composer state machine changed shape, update them.

### Commit 4 — `refactor(chat): simplify chatMessagePlayer after suspension removal`

After commits 1–3 the suspension machinery is already gone, but
`chatMessagePlayer.ts` still has residual complexity that the previous chat
added defensively:

- The split between `resetPlaybackState()` and the full `INITIAL_STORE_STATE`
  reset existed solely to preserve `isHostSuspended` across host
  mount/unmount cycles. With no suspension flag, collapse them: every reset
  is a full reset to `INITIAL_STORE_STATE`.
- Remove `useIsHostSuspended`, `suspendHostForRecording`,
  `resumeHostAfterRecording` if they still exist after the revert.
- Keep everything else:
  - The `hostPlayerStack` LIFO (needed for nested conv via push deep-link).
  - The Zustand store with selective subscriptions and `INACTIVE_SNAPSHOT`
    stability.
  - The signed-URL LRU cache (`SIGNED_URL_CACHE_MAX_ENTRIES = 200`).
  - The `loadToken` / `loadedUrl` / `playConfirmedAt` / `retried` bookkeeping.
  - The 8-second play timeout.
  - The suspicious-finish retry (< 400 ms after `playConfirmedAt`).
  - `generateBarHeights`.
  - `pauseAllChatMessages()`.
- `safeNativeCall` stays.

Update `chatMessagePlayer.test.ts` to drop the suspension-related cases that
were added in commit `10ac86f` and that may have been re-added during
the revert (verify against the current state of the file).

### Commit 5 — `feat(obs): instrument chat voice recording lifecycle with Sentry breadcrumbs`

This commit is purely additive — no functional change.

In `VoiceRecordingSession.tsx`, wrap each step with a Sentry breadcrumb.
Standard shape:

```ts
Sentry.addBreadcrumb({
  category: 'recording',
  message: 'recording.<step>',
  level: 'info',
  data: { ...contextFields },
});
```

Steps to instrument (in order):

| step                          | data                                           |
| ----------------------------- | ---------------------------------------------- |
| `recording.session_mounted`   | `{ conversationId }`                            |
| `recording.players_paused`    | `{}`                                            |
| `recording.permission_granted`| `{}`                                            |
| `recording.prepare_done`      | `{}`                                            |
| `recording.record_started`    | `{}`                                            |
| `recording.hard_cap_reached`  | `{ durationMs }`                                |
| `recording.stop_called`       | `{ requestedBy: 'send' \| 'cancel' \| 'cap' }`  |
| `recording.uri_resolved`      | `{ srcSize }`                                   |
| `recording.file_moved`        | `{ srcSize, destSize, durationMs }`             |
| `recording.suspicious_size`   | `{ srcSize, destSize, durationMs }` (warning)   |
| `recording.finalized`         | `{ durationMs, destSize }`                      |
| `recording.cancelled`         | `{ requestedBy }`                               |
| `recording.session_unmounted` | `{ active: boolean }`                           |

Every catch: `Sentry.captureException(err, { extra: { step, ...context } })`.
Never swallow without a Sentry call (best-effort cleanup paths can
`addBreadcrumb` with `level: 'warning'` instead of capturing).

Also extend `messageMutations.ts` (`useSendVoiceMessage`) with breadcrumbs:

| step                       | data                                     |
| -------------------------- | ---------------------------------------- |
| `upload.request_signed_ok` | `{ objectPath }`                          |
| `upload.put_ok`            | `{ attempt, status }`                     |
| `upload.commit_ok`         | `{ messageId }`                           |
| `upload.failed`            | `{ stage: 'request' \| 'put' \| 'commit', code }` (warning) |

In `chatMessagePlayer.ts`, the existing breadcrumbs for playback are good.
Make sure they remain after commits 1–4.

Verify that Sentry receives the breadcrumb trail on a deliberate failure (e.g.
denying mic permission in iOS settings, or unplugging the network mid-upload).

### Commit 6 — `docs(chat): rewrite CHAT_AUDIO.md for the new architecture`

Rewrite `docs/CHAT_AUDIO.md` to describe the new architecture. The current
doc was written for the suspension-based mechanism that is being removed; if
left as-is, it would mislead the next debugger.

Sections the new doc must cover:

1. **Why this exists** — one-paragraph history of the original crash that
   motivated the single-instance host. Keep it short.
2. **Component map** — `chatMessagePlayer.ts` (single host),
   `VoiceRecordingSession.tsx` (session-scoped recorder),
   `ConversationComposer.tsx`, `ConversationScreen.tsx`, `MessageBubble.tsx`,
   `messageMutations.ts`, `useRealtimeInbox.ts`, `throttle.ts`.
3. **State machine** of the player store (no `isHostSuspended` anymore).
4. **Lifecycle scenarios**: single conversation, nested conversations
   (push deep-link), recording session lifecycle.
5. **Identifier discipline** (`id` vs `clientId`) — unchanged, copy from the
   current doc.
6. **Realtime invalidation pipeline** — unchanged, copy from the current
   doc.
7. **Error surfaces & retry policy** — unchanged for playback; add the
   recording error codes from `VoiceRecordingSession`.
8. **Memory & scale bounds** — update the "native chat players alive"
   row; recorders are now ephemeral.
9. **Known invariants — break at your peril**:
   - One `useChatMessagePlayerHost()` per `ConversationScreen` (rendered
     directly, no wrapper).
   - `MessageBubble` passes `clientId` (not `id`) as `messageId`.
   - `messageMutations.replaceMessage` preserves `clientId`.
   - No `useAudioPlayer` inside `MessageBubble`.
   - All Realtime UPDATE handlers must debounce.
   - Status mirror and `didJustFinish` effects in
     `useChatMessagePlayerHost` early-return when `getActiveHost() !== player`.
   - `safeNativeCall` wraps any native call that could race expo-audio's
     recycling.
   - Recorder polling stays gated (`useAudioRecorderStateGated`).
   - The AVAudioSession is configured **once at app boot** to
     `playAndRecord`. **Never swap it at runtime.** Adding a per-feature
     `setAudioModeAsync` call regresses to the silent-M4A bug.
   - The recorder lives inside `VoiceRecordingSession`, which mounts only
     for the duration of one recording. **Do not mount the recorder hook
     at any higher scope.** Reusing the instance across recordings
     produces silent files on iOS.
10. **Things this architecture deliberately does NOT do**:
    - No `useAudioPlayer` in bubbles.
    - No `id`-based React keys.
    - No undebounced Realtime UPDATE.
    - No multi-track playback in chat.
    - No session category swap.
    - No reuse of a single recorder instance across multiple recordings.
11. **Debugging checklist** — rewrite for the new architecture.

Delete `docs/DEBUG/SILENT_M4A_HANDOVER.md` if it still exists (it was already
removed from the working tree at the start of the previous chat session, but
double-check).

**Delete this file** (`docs/DEBUG/CHAT_AUDIO_REFACTOR_PLAN.md`).

Also delete the four other files under `docs/DEBUG/` that are in the
`deleted` state in `git status` at the start of this work (they were drafts
from previous attempts that the product owner already decided to remove):

- `docs/DEBUG/PENDING_WORK.md`
- `docs/DEBUG/PHYSICAL_DEVICE_DEV.md`
- `docs/DEBUG/README.md`
- `docs/DEBUG/SILENT_M4A_FIX.md`

The `docs/DEBUG/` directory should be empty (and removed) at the end of this
commit.

---

## 6. File inventory

### Delete

- `src/features/chat/components/ChatMessagePlayerHostMount.tsx` (commit 1, via revert)
- `src/features/chat/components/__tests__/ChatMessagePlayerHostMount.test.tsx` (commit 1, via revert)
- `src/features/chat/hooks/useChatVoiceRecorder.ts` (commit 3)
- `src/features/chat/hooks/__tests__/useChatVoiceRecorder.test.ts` (commit 3)
- `docs/DEBUG/CHAT_AUDIO_REFACTOR_PLAN.md` (commit 6)
- The other `docs/DEBUG/*.md` files staged as deleted (commit 6)

### Create

- `src/features/chat/components/VoiceRecordingSession.tsx` (commit 3)
- `src/features/chat/components/__tests__/VoiceRecordingSession.test.tsx` (commit 3)

### Modify

- `src/lib/audio.ts` (commit 2)
- `app/_layout.tsx` (commit 2)
- `src/features/voices/hooks/useVoiceRecorder.ts` (commit 2)
- `src/features/chat/lib/chatMessagePlayer.ts` (commits 1, 4)
- `src/features/chat/lib/__tests__/chatMessagePlayer.test.ts` (commits 1, 4)
- `src/lib/feedPlayer.ts` (commits 2, 3)
- `src/features/voices/hooks/useVoicePlayer.ts` (commits 2, 3)
- `src/components/main/ConversationScreen.tsx` (commit 1)
- `src/features/chat/components/ConversationComposer.tsx` (commit 3)
- `src/features/chat/components/__tests__/ConversationComposer.test.tsx` (commit 3 if needed)
- `src/features/chat/api/messageMutations.ts` (commit 5)
- `docs/CHAT_AUDIO.md` (commit 6, full rewrite)

---

## 7. Invariants you must NOT break

Cross-checked against `docs/CHAT_AUDIO.md` §9. The ones that survive the
refactor unchanged:

1. **`MessageBubble` passes `clientId` (not `id`) as the `messageId` arg** to
   `useChatMessagePlayer`. Breaking this re-introduces the original
   `EXC_BAD_ACCESS` crash via FlatList remounts.
2. **`replaceMessage` in `messageMutations.ts` preserves `clientId`** when
   substituting an optimistic row for its confirmed server row. Same
   rationale.
3. **No new `useAudioPlayer` call inside `MessageBubble`** or any per-row
   chat component. The host owns the only one.
4. **All Realtime UPDATE handlers in chat must debounce.** INSERTs may be
   immediate; UPDATEs must not.
5. **The status mirror and `didJustFinish` effects in
   `useChatMessagePlayerHost` must early-return when `getActiveHost() !== player`.**
6. **`safeNativeCall(() => host.something())`** for any native call that
   could race with expo-audio's internal recycling.
7. **Recorder polling must be gated** via `useAudioRecorderStateGated`.
8. **One `useChatMessagePlayerHost()` per `ConversationScreen`**, rendered
   directly at the top of the screen (no wrapper component, no per-bubble
   call).

New invariants introduced by this refactor:

9. **`VoiceRecordingSession` is the only place `useAudioRecorder` is mounted
   for chat.** It mounts only while a recording is in progress.
10. **The AVAudioSession is configured once at app boot** to
    `playAndRecord`. No runtime swap, ever.

---

## 8. Anti-patterns — do NOT repeat these

1. **Do not propose a fix without runtime data.** Three previous fixes were
   based on hypotheses that turned out to be wrong. The diagnosis in §3 is
   based on documented expo-audio behaviour + the observed F4/F5 device
   tests — but if your implementation does not resolve the symptom on
   device, stop and instrument before patching further.
2. **Do not stack defensive layers.** Each failed attempt added a `try`, a
   ref, a flag. If your first implementation feels like it needs three
   layers of guards to maybe work, the design is wrong.
3. **Do not assume the waveform means audio exists.** It is PRNG-generated.
4. **Do not swap the AVAudioSession category at runtime.** The single-session
   choice in commit 2 is load-bearing.
5. **Do not reuse a single `useAudioRecorder` instance across multiple
   recordings on iOS.** Even if the JS code looks correct, the native side
   produces silent files. Always mount a fresh recorder per session.
6. **Do not split the recorder lifecycle across multiple components.** The
   `VoiceRecordingSession` owns everything from `prepare` to `unmount`.
7. **Do not skip `Sentry.captureException` in a catch.** Even cleanup
   paths get a breadcrumb.
8. **Do not introduce a new dependency** to "solve" this. The refactor uses
   only what's already in `package.json`.

---

## 9. Acceptance criteria

The refactor is done when **all** of the following are true.

Automated:

- [ ] `npm test` passes after each commit and at the end.
- [ ] No new `any`, no new `@ts-ignore`.
- [ ] No `console.log` left outside `__DEV__` guards.
- [ ] `npx tsc --noEmit` passes.
- [ ] `git status` shows no leftover deleted/untracked files except your
      intentional changes.

Manual (on a physical iPhone, dev build):

- [ ] Force-quit the app, relaunch.
- [ ] Open an existing conversation (one of the broken ones). Record
      5 voice messages in a row without playing any. All 5 play back.
- [ ] In the same conversation, play one received message. Then record
      a new voice. It plays back.
- [ ] Navigate back to inbox, open another conversation, record 3
      more. All 3 play back.
- [ ] Send a long voice (close to the 90 s cap). Auto-stop fires;
      file plays back.
- [ ] Sentry events show the breadcrumb trail
      `recording.session_mounted` → ... → `recording.finalized` →
      `upload.put_ok` → `upload.commit_ok` for a successful send.

If any of these fail on device, the refactor is incomplete. Do not declare
it done.

---

## 10. Git state at the start of this work

Branch: `phase-8-notifications` (ahead of `origin/phase-8-notifications` by
12 local commits; do not push without the product owner's instruction).

Last commit:

```
ba0dfc0 docs(debug): add DEBUG folder with silent-M4A investigation, pending work, and device dev procedure
```

Working tree at the start of this chat:

```
D docs/DEBUG/PENDING_WORK.md
D docs/DEBUG/PHYSICAL_DEVICE_DEV.md
D docs/DEBUG/README.md
D docs/DEBUG/SILENT_M4A_FIX.md
```

(All four are pending deletions that the previous chat noted; commit 6
finalises them.)

Plus this file (`docs/DEBUG/CHAT_AUDIO_REFACTOR_PLAN.md`), untracked.

---

## 11. Commit message templates

Use Conventional Commits. Bodies should explain the **why**, briefly. No
mention of "previous chat" or "agent" — this is the project's commit
convention.

```
chore(chat): revert failed silent-M4A patches

Reverts 10ac86f (host suspension during recording) and 0a608b4
(setIsAudioActiveAsync before session swap). Both attempts addressed the
silent-M4A symptom incorrectly and added complexity without fixing the
device-reproducible failure modes. Restores a clean baseline before
re-architecting the recording session lifecycle.

Keeps 6acc2e1 (upload preflight) — that one is correct and independent.
```

```
refactor(audio): single AVAudioSession category configured at boot

Configures the iOS AVAudioSession once to playAndRecord with
playsInSilentMode + speaker routing, replacing the per-feature swap
between playback and recording categories. Swapping the category at
runtime while AVAudioPlayer instances were alive (chat host, feed,
profile preview) starved the AAC encoder on the recorder and produced
~32 KB silent .m4a files on iOS device.

playAndRecord supports both recording and playback simultaneously and
matches the model used by other voice-messaging apps. No background
audio regression (the audio UIBackgroundMode is not declared anyway).
```

```
refactor(chat): fresh recorder per session via VoiceRecordingSession

Introduces VoiceRecordingSession, a component that mounts only while a
voice recording is in progress and owns the single useAudioRecorder for
that session. Each tap-to-record creates a brand-new native
AVAudioRecorder; unmount releases it. Replaces useChatVoiceRecorder,
which mounted the recorder once per conversation and reused the same
native instance across recordings — a pattern documented as producing
silent files on iOS (expo/expo#41656, #36193).

Also pauses the feed and profile preview players before recording so
they do not contend with the recorder for the input.
```

```
refactor(chat): simplify chatMessagePlayer after suspension removal

Collapses resetPlaybackState and INITIAL_STORE_STATE, removes the
isHostSuspended flag and its API surface. The host-suspension mechanism
was the failed attempt to fix the silent-M4A bug; the fresh-recorder
session pattern (introduced in the previous commit) makes it
unnecessary.
```

```
feat(obs): instrument chat voice recording lifecycle with Sentry breadcrumbs

Adds structured breadcrumbs across the recording session and the voice
upload pipeline so future regressions are diagnosable from production
without device access. Every async step gets a breadcrumb; every catch
calls captureException with the step name and the relevant context.
```

```
docs(chat): rewrite CHAT_AUDIO.md for the new recording architecture

Documents the single AVAudioSession boot config, the VoiceRecordingSession
component contract, and the updated invariants. Removes the
suspension-based design notes that no longer apply. Cleans up the
docs/DEBUG/ scratch folder.
```

---

## 12. If you get stuck

If a commit's manual acceptance test fails on device:

1. Open Sentry. The breadcrumb trail tells you exactly which step in the
   recording lifecycle is failing (or producing the suspicious size).
2. Do not propose another defensive layer on top of the architecture.
   Either the diagnosis was incomplete (revisit §3 with the new evidence)
   or the implementation has a subtle bug (review the commit against this
   plan).
3. The product owner is available for device reproduction. Ask before
   guessing — that is what burned the previous three attempts.

If `npm test` fails after a commit:

1. The failure is the commit's bug, not a flake. Fix it before moving on.
2. Do not weaken assertions to make tests green. The tests are the
   safety net.

Good luck. Keep it clean.
