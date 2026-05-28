<!--
  Action plan for chat bugs deferred while we focused on the silent-M4A
  root cause. Each section is a self-contained brief: a follow-up chat
  should be able to pick any section and ship the fix without reading
  the rest.

  Last update: 2026-05-28.
-->

# Pending chat work — to handle in a separate chat

Context: while investigating "Impossible de lire le vocal" we focused
exclusively on the recording root cause (see
[`SILENT_M4A_FIX.md`](./SILENT_M4A_FIX.md)). The user explicitly asked
to defer everything else to avoid polluting the diagnostic.

The items below are ordered by **impact × ease**, not by reporting order.
Pick one (or several batched logically), they are independent.

---

## 1. Defensive: reject silent .m4a server-side and client-side

**Why this matters even after the suspension fix lands**

The suspension is hypothesis-driven (see `SILENT_M4A_FIX.md §2`). If the
hypothesis is wrong or incomplete, we still upload silent files. A
server-side guard means a single regression in any future change cannot
produce unplayable messages in production. Cheap, isolated, defensive
in depth.

**Current state**

- `src/lib/audio.ts` defines `estimateBitrateOk(sizeBytes, durationMs)`
  that checks size is within ±15% of `4 * durationMs` (32 kbps mono).
- The docstring claims it is "Used as a pre-upload sanity check in
  commit_upload" — that is **false**, the function is dead code (only
  used in its own unit test). Fix the docstring or use the function.
- `supabase/functions/commit_upload/index.ts` enforces only
  `MIN_FILE_BYTES = 100` (line 19). A 32 KB silent file passes this
  check trivially.

**What to do**

1. **Server side** — `supabase/functions/commit_upload/index.ts`:
   - Add a `BITRATE_FLOOR_BPS = 16_000` constant (half of the 32 kbps
     target — generous tolerance for VBR encoder fluctuations on short
     recordings).
   - In both the voice (`isCommitVoiceUploadInput`) and message
     (`isCommitMessageUploadInput`) branches, after the existing
     `size < MIN_FILE_BYTES` check, also compute
     `effectiveBps = (size * 8 * 1000) / durationMs` and reject when
     `effectiveBps < BITRATE_FLOOR_BPS` AND `durationMs > 2_000`. The
     `durationMs > 2_000` guard avoids false positives on legitimate
     very-short messages (< 2 s) where header overhead dominates.
   - Return `{ error: 'audio_too_quiet', ... }` (new error code). The
     mobile client can map this to a user-friendly toast — match the
     phrasing the user already uses for upload failures (search COPY for
     existing upload-error labels).
   - Add a Deno test in
     `supabase/functions/commit_upload/__tests__/` (mirror the existing
     test layout) that posts a 32 KB / 10 s combo and asserts a 400
     with the new error code.

2. **Client side** — `src/features/chat/hooks/useChatVoiceRecorder.ts`:
   - In `finalizeRecording`, after computing `destSize` and
     `finalDuration`, call `estimateBitrateOk(destSize, finalDuration)`.
     If it returns `false` AND `finalDuration > 2_000`, do NOT return
     the result — instead set `setError('too_quiet')`, delete the local
     file via `new File(destFile.uri).delete()`, set `state = 'error'`,
     and emit `Sentry.captureMessage('Chat voice recording rejected as
     silent', { level: 'warning', extra: { destSize, finalDuration } })`.
   - Make sure the existing `LOVOICE-1` warning (the "suspiciously
     small" check) is removed once this stricter pre-upload check is
     in place. Otherwise we double-emit.
   - Add a unit test in
     `src/features/chat/hooks/__tests__/useChatVoiceRecorder.test.ts`
     that mocks `mockFile.size` to 32_000 and `mockRecorderState.
     durationMillis` to 10_000, calls `stopAndSend`, and asserts the
     hook stays in `'error'` with `error === 'too_quiet'`.

3. **Same fix for the profile-voice recorder**:
   - `src/features/voices/hooks/useVoiceRecorder.ts` — apply the same
     `estimateBitrateOk` check in its `finalize` (or equivalent)
     before the upload mutation runs.

4. **Update `estimateBitrateOk`'s docstring** in `src/lib/audio.ts` to
   match what it actually does after this change.

5. **Update `docs/CHAT_AUDIO.md` and `docs/ARCHITECTURE.md` §4.2** to
   document the new server-side error code and the client-side
   pre-upload validation.

**Commit message suggestion**

```
fix(audio): reject silent recordings client-side and server-side

Adds a bitrate floor check (16 kbps minimum for >2 s recordings) in
both useChatVoiceRecorder.finalizeRecording and the commit_upload Edge
Function. Defends against any future regression that would re-introduce
the iOS silent-M4A bug we mitigated in [previous commit ref]. Wires up
the existing but unused estimateBitrateOk helper.
```

---

## 2. Bug B: tab bar overlays the conversation composer

**Symptom**

When entering a conversation, the bottom tab bar (`BottomNav`) sometimes
remains visible on top of the message composer. The user cannot see or
tap the text input or the mic button.

**Diagnosis** (from the original conversation, not yet verified by
running the failing build)

`app/(main)/_layout.tsx` renders the tab bar via:

```ts
function MainTabBar(props: BottomTabBarProps) {
  const segments = useSegments();
  if (shouldHideMainTabBar(segments)) {
    return null;
  }
  return <BottomNav {...props} />;
}
```

`useSegments()` reads from a React context that lags the nested stack
state machine. When deep-linking into a conversation (from a push notif
or after a cold start with a saved route), the segments can momentarily
return `['(main)', 'messages']` instead of `['(main)', 'messages',
'<uuid>']`, so `shouldHideMainTabBar` returns `false` and the tab bar
renders.

**What to do**

1. Read the nested stack state via `props.state` (`BottomTabBarProps`)
   instead of `useSegments()`. The active tab's nested stack is at
   `props.state.routes[props.state.index].state`. If it has more than
   one route in its stack history (i.e. the user is past the tab's
   root), hide the tab bar — even when the segments hook has not yet
   updated.
2. Keep `shouldHideMainTabBar` as a pure function but feed it the new
   info. Either:
   - Pass the nested stack info as a structured argument, or
   - Compute "is the active tab on a sub-route?" inline in `MainTabBar`
     and OR it with the existing segments check.
3. Update `src/navigation/__tests__/shouldHideMainTabBar.test.ts` to
   cover the new input shape AND keep the existing string-segments
   coverage so we do not regress the simple cases.

**Files**

- `app/(main)/_layout.tsx`
- `src/navigation/shouldHideMainTabBar.ts`
- `src/navigation/__tests__/shouldHideMainTabBar.test.ts`

**Risks / things to verify on device**

- Confirm the fix on the deep-link-from-push scenario (the worst case)
  AND on the regular tab-tap-then-open-conversation scenario.
- Make sure the tab bar reappears immediately when going back to
  `messages/index` (no lingering hidden state).
- Test on both iOS and Android.

---

## 3. Bug C: pressing "back" from a conversation lands on Discover

**Symptom**

In a conversation, tapping the close button (`X` in the header) takes
the user to the Discover tab instead of the Messages inbox.

**Diagnosis**

`app/(main)/messages/[id].tsx`:

```ts
const handleClose = useCallback(() => {
  router.back();
}, []);
```

`router.back()` follows the global navigation history. When the user
deep-linked from a push notification while on the Discover tab, the
history is `[discover, messages/<id>]` and `router.back()` returns to
Discover, not to `messages/index`. The `unstable_settings = {
initialRouteName: 'index' }` in `app/(main)/messages/_layout.tsx` does
NOT cover this case — it only ensures the messages stack itself has
`index` as its root, it does not affect cross-tab back behaviour.

**What to do**

Replace `router.back()` with a navigation that always lands on the
messages inbox AND switches to the messages tab:

```ts
const handleClose = useCallback(() => {
  router.replace('/(main)/messages');
}, []);
```

Or, if you want to preserve the iOS "swipe to go back" gesture history
when the user opened the conversation from inside the messages tab:

```ts
const handleClose = useCallback(() => {
  // If we can pop within the current stack AND the previous route is
  // messages/index, plain back() is fine. Otherwise force the messages
  // tab + inbox.
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/(main)/messages');
  }
}, []);
```

`router.canGoBack()` is too permissive (it returns true if there is ANY
history, including cross-tab), so the conditional version above does
not actually fix the bug on its own. **Default to the unconditional
`router.replace`** — the small regression for "user opened from inbox
and now goes back to inbox" is purely visual (still lands on inbox,
just without a back-swipe animation) and matches what users expect.

**Files**

- `app/(main)/messages/[id].tsx` (`handleClose`)

**Tests**

This route does not have a dedicated test file. Either:
- Skip a unit test (the change is one line behind a UI handler), or
- Add a smoke test that mocks `router.replace` and asserts it is called
  with `'/(main)/messages'` when the close handler fires.

---

## 4. Bug A3: audit + delete existing silent-M4A messages from Storage

**Why**

Even after the suspension fix prevents new silent files, old ones are
still in `messages/` bucket and the `messages` table. Users see them as
"Impossible de lire le vocal" until they are removed. The remaining
`LOVOICE-2 "Voice playback: suspicious finish after retry"` Sentry
events will keep firing on these.

**What to do**

Create `scripts/audit-broken-voice-messages.ts` (project convention:
`tsx` scripts in `scripts/`, run via `npx tsx scripts/<file>.ts`).
Follow the same structure as `scripts/seed-test-conversation.ts` for
Supabase admin client setup (look at how it reads service-role keys
from env).

The script must:

1. Query `messages` for rows where `kind = 'voice'` AND
   `voice_duration_ms > 2_000` (or whatever the actual column is —
   check `supabase/functions/_shared/types.ts` for the row schema).
2. For each row, call `storage.from('messages').list(path)` (or
   `getPublicUrl`-then-HEAD) to learn the object size. Skip rows whose
   object has already been deleted.
3. Compute `effectiveBps = (size * 8 * 1000) / voice_duration_ms`.
   Flag rows with `effectiveBps < 16_000` AND `size > 0`.
4. Print a table: `message_id | conversation_id | size | duration |
   effective_bps | created_at`.
5. Behind a `--delete` flag, also:
   - Mark the row as soft-deleted (set `deleted_at = now()` or update
     `kind` to a new sentinel — check what the schema supports and what
     the UI tolerates).
   - Delete the storage object via `storage.from('messages').remove([path])`.
6. Behind a `--notify` flag, additionally insert a `notifications`
   row to inform the recipient that the file was unplayable and they
   can ask the sender to re-record. **OUT OF SCOPE for the first
   iteration** — only do this if the product team asks.

**Safety**

- Run without `--delete` first, share the list with the user, get
  explicit go-ahead before the destructive run.
- Add a hard cap: refuse to delete more than 200 rows per invocation.
- Log every deletion to `stdout` so we can grep an audit trail.

**Files**

- `scripts/audit-broken-voice-messages.ts` (new)
- Update `README.md` § operational scripts list if it documents
  `scripts/`. (Check first — last I looked it did not.)

---

## 5. Bonus: `playConfirmedAt` is sometimes logged as 0 in `LOVOICE-2`

**Symptom**

The Sentry event for `Voice playback: suspicious finish after retry`
sometimes contains `extra.playConfirmedAt: 0` and
`extra.timeSinceConfirmed: 0`, even when the file did briefly play.
This makes the event hard to diagnose because we cannot tell whether
the retry actually got an audible playback or not.

**Cause** (in `src/features/chat/lib/chatMessagePlayer.ts`)

The `didJustFinish` effect resets `playConfirmedAt = 0` BEFORE the
Sentry capture in the non-retry branch. The `captureMessage` then reads
the already-zeroed module variable instead of the value at the time of
the suspicious finish.

**What to do**

Snapshot `playConfirmedAt` and `timeSinceConfirmed` into local
variables BEFORE the resets, and pass those locals into
`Sentry.captureMessage(..., { extra })`. Trivial change, isolated to
the `didJustFinish` `useEffect` in `useChatMessagePlayerHost`.

**Files**

- `src/features/chat/lib/chatMessagePlayer.ts` (the `didJustFinish`
  `useEffect`, around the `Sentry.captureMessage('Voice playback:
  suspicious finish after retry', ...)` call).

Add a tiny unit test if practical (simulate two `didJustFinish` cycles
on the host and assert the captured extras carry the pre-reset values),
but it is not strictly necessary — the change is local and reads
naturally.

---

## 6. Suggested order for the follow-up chat

Recommended order if the next chat takes all of these on:

1. **§5** (Sentry logging fix) — 10 minutes, makes diagnosis of
   anything else easier.
2. **§1** (defensive bitrate validation) — 1–2 h, biggest safety net
   for production. Do this AFTER `SILENT_M4A_FIX.md §5` Sentry
   validation has begun (so you can compare emission rates before/after).
3. **§2** (tab bar overlay) — 1 h. Visible UX regression.
4. **§3** (back navigation) — 15 minutes. One-line fix once §2 is
   understood (they touch related navigation code).
5. **§4** (audit script) — 1 h to write, then human-in-the-loop runs
   the cleanup. Only meaningful after §1 lands so we are not cleaning
   up files that get re-created.

If short on time: §5 + §1 are non-negotiable; the rest can wait.
