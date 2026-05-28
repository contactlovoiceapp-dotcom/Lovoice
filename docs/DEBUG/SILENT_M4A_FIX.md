<!--
  Investigation notes for the "Impossible de lire le vocal" iOS bug.
  Read together with docs/CHAT_AUDIO.md §9bis (the canonical documentation of
  the shipped mitigation). This file captures the WHY, the UNCERTAINTIES, and
  the FOLLOW-UP plan that a one-off doc section does not preserve well.

  Last update: 2026-05-28 — fix committed, awaiting Sentry validation.
-->

# Silent .m4a chat voice recordings — investigation log

## TL;DR

iOS device users (confirmed on iPhone 13 Mini / iOS 26.5, plus the user's
client's iPhone) intermittently produced voice messages that play back as
silence. The stored object in Supabase Storage is a valid 32 KB `.m4a`
file: a well-formed MP4 container with an empty `mdat` (no audio samples).

We shipped a mitigation based on a **plausible-but-unverified hypothesis**.
This file documents the diagnostic, the fix, what we still don't know, and
the explicit plan to clean up redundant defensive code once validated.

## 1. Symptoms

| Surface | Observation |
| --- | --- |
| MessageBubble | "Impossible de lire le vocal" toast after tapping play, sometimes after a brief loading spinner. |
| Supabase Storage | Object size = exactly **32 KB ± a few hundred bytes**, every time. |
| `quicktime` on the downloaded file | Plays, but emits no audible sound. Duration tag is whatever the encoder wrote (often near the recorded duration). |
| Sentry | `LOVOICE-1 "Chat voice recording suspiciously small"` — flagged client-side in `useChatVoiceRecorder.finalizeRecording` when `destSize < 35_000` AND `durationMs > 2_000`. |
| Sentry | `LOVOICE-2 "Voice playback: suspicious finish after retry"` — flagged in `chatMessagePlayer` when the host reports `didJustFinish` within ~400 ms of confirmed playback (i.e. the file "played" but had no real content). |
| Platform | iOS device only — never reproduced on iOS simulator or Android. |
| Reproducibility | Intermittent. Reinstalling the app no longer clears it (used to before commit `80b021d`). |

The Sentry signature is the **primary source of truth** for whether the
mitigation works. Watch both `LOVOICE-1` (new bad recordings) and
`LOVOICE-2` (playback of old bad recordings).

## 2. Working hypothesis (not yet proven)

> On iOS, an alive `AVAudioPlayer` instance — even when paused with no
> source — contests the `AVAudioSession` when `AVAudioRecorder` swaps the
> category to `.playAndRecord`. The AAC encoder receives zero samples and
> writes a valid M4A container with an empty `mdat`.

Why we believe it:

- The bug worsened **after commit `80b021d`** ("single-instance audio
  player") which introduced a permanently-mounted `useAudioPlayer` in
  `useChatMessagePlayerHost`. Before that, players were instantiated
  per-bubble and torn down when bubbles unmounted (which masked the
  contention by accident).
- Commit `0a608b4` tried to fix the same symptom by deactivating the
  audio subsystem (`setIsAudioActiveAsync(false)`) before swapping
  categories — partially mitigated but did not eliminate the issue
  according to user reports.
- The 32 KB size matches an MP4 with `ftyp` + `moov` + empty `mdat` for
  AAC at 32 kbps. A 5-second recording at 32 kbps mono should produce
  ≈20 KB; a 10-second one ≈40 KB. A 5+ second recording at 32 KB is
  diagnostically silent.
- Only the **most recently recorded** files have this problem. Older
  voice messages in the same conversation play correctly. Recordings on
  the iOS simulator (which uses a synthetic AVAudioSession) always
  succeed. → strongly suggests a recorder-side iOS-specific race
  involving session/player state, not a corrupt-at-rest storage issue.

What we have NOT verified:

- No Apple / expo-audio documentation we could find explicitly states
  this contention. `expo/expo#39030` is referenced in commit `0a608b4`
  for a related "audio reactivates between async calls" issue, but its
  description does not perfectly match our scenario.
- We have no native log capture from a failing device showing the
  encoder receiving zero samples.
- We have not bisected to confirm that `80b021d` introduced the bug
  (the user reported it existed before but at lower frequency; could
  pre-date `80b021d`).

Alternative hypotheses NOT ruled out:

1. Race between `prepareToRecordAsync()` and `record()` where the
   native `AVAudioRecorder` is not actually ready when `record()` runs.
2. iOS denying the microphone temporarily after a foreground transition
   from a push notification tap. The user explicitly mentioned
   experimenting with push notifications around the same time the bug
   worsened.
3. A bug in the current `expo-audio` (1.1.1) encoder buffer flush path
   that drops the first N frames if the session was just reconfigured.

## 3. Mitigation shipped (single commit)

Canonical doc: `docs/CHAT_AUDIO.md §9bis`. This section only covers what
the standalone doc does not: the **trade-offs and dead-ends**.

**Approach**: wrap `useChatMessagePlayerHost` in a conditional React
component (`ChatMessagePlayerHostMount`) controlled by an
`isHostSuspended` flag in the Zustand store. Before the recorder touches
the audio session, `useChatVoiceRecorder.start()` awaits
`suspendHostForRecording()` which sets the flag and waits for React to
commit the wrapper unmount via a double `requestAnimationFrame`.
expo-audio's cleanup releases the native player. The recorder then has
the session to itself.

Files touched:

- `src/features/chat/lib/chatMessagePlayer.ts` — new flag + 3 exported
  functions (`suspendHostForRecording`, `resumeHostAfterRecording`,
  `useIsHostSuspended`) + private `resetPlaybackState()` helper that
  replaces 3 call sites that used to fully reset the store
  (`setState(INITIAL_STORE_STATE)`).
- `src/features/chat/components/ChatMessagePlayerHostMount.tsx` — new,
  ~20 lines. Conditional wrapper.
- `src/components/main/ConversationScreen.tsx` — renders the wrapper
  instead of calling the host hook directly.
- `src/features/chat/hooks/useChatVoiceRecorder.ts` — wires
  suspend/resume on every entry/exit path.

Approaches considered and rejected:

| Approach | Reason rejected |
| --- | --- |
| Per-bubble `useAudioPlayer` (pre-`80b021d` behaviour) | Caused the Hermes crash we fixed in `80b021d` / `140663d`. |
| Imperatively call `player.remove()` while keeping the React hook alive | Fights expo-audio's lifecycle. Hook re-renders would access a released native handle. |
| Build our own native audio module | Disproportionate cost for an unproven hypothesis. |
| `setIsAudioActiveAsync(false)` alone (commit `0a608b4`) | Already in place, insufficient on its own per user reports. |
| `flushSync` instead of double rAF | Not exported by React Native. |
| Pass `isRecording` prop down from composer to ConversationScreen | Prop drilling + timing problems (recorder fires its state callback AFTER `record()` runs). |

## 4. Known warts

### 4.1 Double `requestAnimationFrame`

In `chatMessagePlayer.ts`, `waitForHostUnmount()` does:

```ts
await new Promise<void>((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
});
```

This is a pragmatic concession. Real synchronisation primitive would be
`flushSync` (not available in RN). The double-frame wait is confined to a
single private function behind a stable async API — a future cleanup that
replaces it does not break call sites.

Risk: on a device dropping below 30 fps during the recording-start
gesture, the host may not have unmounted by the time `recorder.record()`
runs. We have no telemetry on this; if `LOVOICE-1` persists at low
frequency post-fix, this is the first place to look.

### 4.2 Redundant `setIsAudioActiveAsync(false/true)` chain

`useChatVoiceRecorder.start()` now does both:

1. `await suspendHostForRecording()` (new — releases the host's native player)
2. `await setIsAudioActiveAsync(false)` (from commit `0a608b4` — deactivates the session)

If the hypothesis is correct, step 2 is redundant: there is no live
`AVAudioPlayer` to deactivate after step 1. We **deliberately kept step
2** to ship a less risky single change. See §5 for the cleanup plan.

## 5. Validation plan

Watch Sentry for **at least 3–5 days of real device usage** after the
fix ships:

- `LOVOICE-1 "Chat voice recording suspiciously small"` — should go to
  **zero** events from device users running the fixed build. The signal
  is emitted client-side in `useChatVoiceRecorder.finalizeRecording`.
- `LOVOICE-2 "Voice playback: suspicious finish after retry"` — should
  **decay** as old silent files in Storage get listened to and reported
  the last time. New bad files should stop being created.
- Watch the Storage bucket `messages/` for new objects with size in the
  29–33 KB range and `kind = voice` in the related `messages` row. Run
  the cleanup script described in `PENDING_WORK.md` to inventory them.

Success criteria:

- Zero new `LOVOICE-1` events for users on the fixed build.
- No new 32 KB `.m4a` objects in the `messages/` bucket.
- Manual repro on the user's iPhone 13 Mini (record 10+ voice messages
  in a row, including after playing existing ones) produces only
  playable files.

If validated → proceed to §6.

If `LOVOICE-1` reappears at any frequency → the hypothesis is wrong (or
incomplete). Pivot to the alternative hypotheses in §2 — start by adding
fine-grained Sentry breadcrumbs around every step of `start()` and every
state change of the native recorder. Do NOT pile another defensive layer
on top of the existing two.

## 6. Cleanup follow-up (queued, do AFTER §5 validates)

Single commit. Title and rationale spelled out so the next dev / LLM can
do it without re-deriving context.

Commit title:
```
refactor(chat): drop redundant audio-session deactivation now that the
host is released during recording
```

Changes:

1. In `src/features/chat/hooks/useChatVoiceRecorder.ts`:
   - Remove the `await setIsAudioActiveAsync(false)` call inside `start()`.
   - Remove the `await setIsAudioActiveAsync(true)` calls inside
     `finalizeRecording` (both success and error paths) and `cancel`.
   - Remove `setIsAudioActiveAsync` from the cleanup `useEffect`.
   - Remove the comment block explaining the deactivation rationale.
   - Optional: remove the unused `setIsAudioActiveAsync` import.
2. Update `docs/CHAT_AUDIO.md §4.4` recording flow diagram to drop the
   now-absent `setIsAudioActiveAsync` steps.
3. Update `docs/CHAT_AUDIO.md §9bis` to note that the
   belt-and-suspenders step was removed after Sentry validation
   (reference this fix doc).
4. Decide on `src/features/voices/hooks/useVoiceRecorder.ts` (profile
   voice recorder): it ALSO got the `setIsAudioActiveAsync` calls in
   `0a608b4` and we never touched it. If it has not produced any
   `LOVOICE-1`-equivalent for profile voices in the same window, drop
   them there too. If it has, treat it as a separate investigation —
   the profile recorder runs on a screen with no chat host, so a
   contention hypothesis identical to ours cannot apply.

After this cleanup the chat recorder path collapses to:

```
requestRecordingPermissionsAsync()
suspendHostForRecording()
configureAudioSessionForRecording()
recorder.prepareToRecordAsync()
recorder.record()
```

One mechanism, one rationale, one place to look when this breaks again.

## 7. If a maintainer thinks "this is overkill, let me simplify"

Read §4.2 first. Two layers of defence look redundant — that is correct,
on purpose, temporarily. Do not drop layer 1 (the suspension). Drop
layer 2 only after the Sentry validation in §5 has passed.

Do not delete `resetPlaybackState()` or replace its call sites with
`setState(INITIAL_STORE_STATE)` — see §9 invariant 1 in `CHAT_AUDIO.md`.

Do not delete `ChatMessagePlayerHostMount` and call
`useChatMessagePlayerHost()` directly from `ConversationScreen` —
suspension will silently stop working.

## 8. Related Sentry issues at the time of writing

- `LOVOICE-1` — Chat voice recording suspiciously small.
- `LOVOICE-2` — Voice playback: suspicious finish after retry.
- `LOVOICE-4` — Mentioned by the user during diagnosis; details not
  captured in this doc. Investigate from the Sentry UI if it correlates
  with this fix's deploy window.

## 9. Related commits

- `80b021d` feat(chat): single-instance audio player (introduced the
  permanently-mounted host that we now believe causes the contention).
- `140663d` fix(chat): stable bubble keys with clientId.
- `79f0e02` fix(audio,push): native bridge pressure reduction.
- `ab627f3` fix(chat): same theme — Hermes crash mitigations.
- `6acc2e1` fix(upload): reject empty/corrupt audio files before storage
  (server-side guard that complements this fix; will trigger if
  silent files ever slip through again).
- `0a608b4` fix(recorder): deactivate audio subsystem before recording
  (the partial fix we now keep as belt-and-suspenders pending §5).
- `<this commit>` fix(chat): release native AVAudioPlayer during
  recording to prevent silent M4A.
