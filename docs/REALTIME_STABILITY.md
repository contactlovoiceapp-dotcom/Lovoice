<!--
  Reference for the tap-notification Hermes crash (EXC_BAD_ACCESS during GC) and the
  staged remediation plan. Read this BEFORE touching the chat Realtime pipeline
  (app/(main)/messages/[id].tsx, useRealtimeInbox.ts), the chat invalidation logic,
  or the conversation navigation helpers (messagesNavigation.ts).
  This document is the single source of truth for the Phase 9 stability work; it is
  designed so a fresh chat can pick up any step with the kickoff prompts in §8.
-->

# Realtime & navigation stability — the tap-notification Hermes crash

## 1. Status

| Field | Value |
| --- | --- |
| Symptom | App crashes (~1 in 3) when tapping a push notification, especially while inside a conversation exchanging messages. Foreground or background. |
| Crash type | `EXC_BAD_ACCESS (SIGSEGV)` / `KERN_INVALID_ADDRESS at 0x50`, inside Hermes young-gen GC. |
| Root mechanism | **Confirmed (two byte-identical crashlogs).** |
| Trigger (dev-reproduced) | **The notif-tap unmount/remount churn** throws on both the audio host (`pause` on a destroyed player) and the Realtime channel (`.on()` after `subscribe()`). See §4.1. |
| Current branch | `phase-9-hardening`, marketing version 0.9.2. |
| Progress | **Step 1a shipped** (`removeChannelsByName` teardown) — `after subscribe()` redbox gone, crash not reproducible in dev. Pending release validation + Steps 1b/2/3. See §5–§6. |
| Audio involvement | **None.** The crash predates the expo-audio patch. See §3. |

> **Do not write a fix until §4 (device test) has identified the throwing module.**
> A previous attempt (0.9.2/0.9.3) guessed the cause, shipped a navigation change,
> did not fix the crash, and regressed voice recording. Rolled back to 0.9.1.

---

## 2. Confirmed root cause

The fatal frame, identical in both crashlogs:

```
HadesGC::updateYoungGenSizeFactor()           ← crash @ 0x50, byte read Translation fault
HadesGC::youngGenCollection() / allocSlow()
JSObject::create()
jsi::Object::Object()
convertNSExceptionToJSError      (RCTTurboModule.mm:219)
performVoidMethodInvocation      (RCTTurboModule.mm:438)
_dispatch_workloop_worker_thread              ← a background dispatch thread, NOT the JS thread
```

Meanwhile the JS thread (a separate thread in both dumps) is inside `drainMicrotasks`.

**Mechanism:** a native TurboModule `void` method throws an Objective-C `NSException`
on a background dispatch queue. React Native's `convertNSExceptionToJSError` then
allocates JS objects (`jsi::Object`) **on that background thread**, while the JS
thread is concurrently allocating during `drainMicrotasks`. Two threads in the
single-threaded Hermes allocator at once → heap corruption → SIGSEGV during the
next young-gen collection.

This is a **React Native New Architecture threading bug** (off-JS-thread JS
allocation). We cannot patch RN core. But the crash needs **two ingredients that we
control**, and removing either one closes the window:

- **(a) JS-thread saturation** — a burst of microtasks/allocations (HTTP promise
  resolutions + React Query invalidations + re-renders) at the moment of the tap.
- **(b) a `void` TurboModule throwing an `NSException`** at that same moment.

Kill (a) → the JS thread is idle when (b) throws → no concurrent allocation → no
corruption. Kill (b) → nothing throws → nothing to convert. We aim for both.

---

## 3. Evidence trail

### 3.1 Two crashlogs, same stack, audio ruled out

| Build | Date | Main thread at crash | Fatal stack |
| --- | --- | --- | --- |
| **0.8.1 (32)** — before the expo-audio patch | 2026-05-27 | clean `UIApplication` runloop, **no audio frame** | `convertNSExceptionToJSError` → `performVoidMethodInvocation` → GC crash @ 0x50 |
| **0.9.1 (35)** — after the patch | 2026-05-29 | inside `AudioModule.deactivateSession` (coincidental) | **identical**, same `:219`/`:438` offsets, same `0x50` |

The 0.8.1 dump has **zero** audio involvement yet the exact same fatal stack. The
`AudioModule.deactivateSession` frame in 0.9.1 is **coincidental context** (the audio
session happened to be deactivating), not the cause. The patch is not implicated.

Local crashlog files (not committed):
`~/Downloads/testflight_feedback 2/crashlog.crash` (0.8.1),
`~/Downloads/testflight_feedback (5)/crashlog.crash` (0.9.1).

### 3.2 Ingredient (a) is already proven by the Sentry breadcrumbs

On a single conversation open (Sentry event 2026-05-29 ~08:51:43–08:51:50), the same
queries fire redundantly in a ~100 ms window:

- `conversations?...id=eq.<id>` (conversation details) → **~4×**
- `conversations?...last_message_at...limit=50` (inbox) → **~4–5×**
- `messages?...conversation_id=eq.<id>...limit=30` → **~2×**
- unread-count query → **~3×**

Each `useConversationDetails` refetch is **3 sequential round-trips** (conversation
select + messages `count` HEAD + active-voice select — see
`src/features/chat/api/conversationQueries.ts`). Each `useConversations` (inbox)
refetch is **3 round-trips**. Every response resolves a promise → microtask +
React Query re-render. **This redundant fan-out is the fuel for (a).**

A JS error is also visible just before the crash:
`cannot add 'postgres_changes' callbacks ... after subscribe()` (from the conversation
Realtime effect re-running without cleanup during
`recursivelyTraverseReconnectPassiveEffects`). It is a JS error (not the native
NSException) but confirms the re-subscribe churn adds to the load.

---

## 4. The device test — run this BEFORE coding any fix

Goal: identify the exact `void` TurboModule + method that throws the `NSException`
(ingredient b). This is the only way to be 100% sure, not 90%.

1. Build a debug dev build on a **physical iOS device** (the crash is timing-dependent
   and does not reproduce on the simulator):
   ```bash
   npx expo run:ios --device
   ```
2. In Xcode → **Breakpoint navigator** → **+** → **Symbolic Breakpoint…**, set Symbol:
   ```
   facebook::react::TurboModuleConvertUtils::convertNSExceptionToJSError
   ```
   (Optionally add a second symbolic breakpoint on `objc_exception_throw` as a wider net.)
3. Reproduce the scenario: open a conversation, exchange messages, tap notifications
   in quick succession (keep a few unread notifications in reserve to tap).
4. When the breakpoint hits, in the Xcode console:
   - `bt` → read the frames **below** `performVoidMethodInvocation`: they name the
     module and the selector.
   - Inspect the `NSException` argument (its `reason` / `name`) to learn **why** it
     throws.
5. Record the module, method, and reason in §6 of this doc.

### 4.1 Dev reproduction result (2026-05-29) — supersedes the breakpoint test

Running the debug build on a physical device and reproducing the crash (tap the 2nd
notification) gave a **better, 100%-reproducible signal** than the breakpoints. Note:
the symbolic breakpoints on `objc_exception_throw` / `convertNSExceptionToJSError`
**did not fire**, because the throws are **Expo Swift exceptions**, not Objective-C
`NSException`s — they go through ExpoModulesCore, not RN's ObjC conversion path. The
breakpoint test is therefore not the right tool here; the dev console + redbox are.

Two concrete defects are reproduced, both caused by the notif-tap unmount/remount of
the conversation screen:

1. **Audio host churn (flood, caught but noisy):**
   ```
   FunctionCallException: Calling the 'pause' function has failed (SyncFunctionDefinition.swift:137)
   → NativeSharedObjectNotFoundException: Unable to find the native shared object ... (DynamicSharedObjectType.swift:58)
   ```
   `pause()` is called on audio players whose native shared object was already
   destroyed when the host (`useChatMessagePlayerHost` in `ConversationScreen`)
   unmounted. Caught by `safeNativeCall` (logged as warnings, app continues) but
   indicates heavy churn — this is the fuel for ingredient (b) in release.

2. **Realtime re-subscribe (fatal in dev → redbox → white screen):**
   ```
   Render Error: cannot add 'postgres_changes' callbacks for realtime:conv:<id> after `subscribe()`.   [id].tsx:147
   ```
   Supabase caches channels by topic: `supabase.channel('conv:<id>')` returns the
   **same already-subscribed channel** when the effect re-runs without cleanup
   (`recursivelyTraverseReconnectPassiveEffects`), so `.on()` throws. In dev this
   crashes the React tree (white screen after dismiss); in release the same churn
   feeds the native off-thread race → hard kill.

**Conclusion:** the root is the conversation-screen mount/unmount churn on notif tap,
which tears down + rebuilds **both** the audio host and the Realtime channel. We do
not need the throwing-module identity anymore — we have a reproducible dev signal to
fix against and verify (redbox gone, console flood gone).

---

## 5. Remediation plan (staged, lowest risk first)

### Step 0 — Identify the throwing module (§4). Blocking.

### Step 1 — Cut the redundant fan-out (kills ingredient (a)). Low risk, no audio.

- **[DONE — Step 1a, 0.9.2] Channel teardown by topic.** `removeChannelsByName` in
  `src/features/chat/lib/realtimeChannels.ts`, applied in `[id].tsx` (`conv:<id>`) and
  `useRealtimeInbox.ts` (`global-inbox:<userId>`) before `subscribe()`. Removed the
  `after subscribe()` redbox / white screen. Awaiting release validation in Sentry.

- **[DONE — Step 1b] Cut the redundant React Query fan-out.** The `conv:<id>` INSERT
  fan-out policy now lives in the pure helper
  `src/features/chat/lib/conversationInvalidations.ts` (`handleConversationInsert`),
  applied in `[id].tsx`:
  - **Removed the double inbox invalidation** — the conversation channel no longer
    invalidates `chatQueryKeys.inbox`; the global channel (`useRealtimeInbox`) owns it.
  - **Stopped invalidating `conversation(id)` on our own INSERT** — own messages are a
    no-op in the handler; the send mutation's `onSettled` already refreshes it.
  - **Collapsed the `conversation(id)` invalidation sources** to the minimum,
    non-overlapping set: incoming INSERT (this handler), the two send mutations'
    `onSettled` (own sends), and `handleCountdownExpired` (client timer).

  Not needed: a dedicated debounce / `staleTime` bump for the conversation-details
  refetch. With the de-dup above, a normal incoming message triggers exactly one
  `conversation(id)` invalidation, so there is no burst left to collapse — adding a
  debouncer would be over-engineering.

Validation: re-run the §7 checklist; in Sentry, the per-open query count should drop
from ~4× to 1×.

### Step 2 — Centralize the conversation Realtime channel (Option B). Medium risk.

Decouple the `conv:<id>` channel lifecycle from `[id].tsx` mount/unmount. A
session-scoped service owns at most one conversation channel and switches via
`setActiveConversationId(id)`. Removes the re-subscribe churn on every navigation and
makes the handlers unit-testable. See `docs/ARCHITECTURE.md` §5 and the original
Option B write-up. Do **not** bundle the navigation `replace`/stack-reset changes that
caused the recording regression — only the safe "no-op if already on this conv" guard.

### Step 3 — Fix ingredient (b) per the §4 finding. Risk depends on the module.

- If it is our misuse of a native API → fix the call site.
- If it is a module bug → `patch-package` it (precedent: `patches/expo-audio+1.1.1.patch`).
- If purely RN-internal → rely on Steps 1–2; optionally pin RN/Expo versions or check
  upstream for an off-thread `convertNSExceptionToJSError` fix.

---

## 6. Findings log

- **2026-05-29 — device repro (§4.1):** breakpoints did not fire (Expo Swift
  exceptions, not ObjC `NSException`). Reproduced two defects on the 2nd notif tap:
  (1) flood of `NativeSharedObjectNotFoundException` on audio `pause` (host churn,
  caught by `safeNativeCall`); (2) redbox `cannot add 'postgres_changes' ... after
  subscribe()` at `[id].tsx:147` → white screen. Root = notif-tap unmount/remount of
  the conversation screen tearing down + rebuilding both the audio host and the
  `conv:<id>` channel. The Supabase channel cache (by topic) is why `.on()` lands on
  an already-subscribed channel.
- **2026-05-29 — Step 1a shipped (`removeChannelsByName` teardown):** added
  `src/features/chat/lib/realtimeChannels.ts` + test; applied in `[id].tsx`
  (`conv:<id>`) and `useRealtimeInbox.ts` (`global-inbox:<userId>`). 449/449 tests pass.
  Device re-test (debug build, reload only): **`after subscribe()` redbox gone, white
  screen gone, crash no longer reproducible** on repeated notif taps. The re-subscribe
  churn (`[RealtimeConv] conv:X subscribed` per tap) is still visible but now non-fatal
  — target for Step 2. No more `pause`/`NativeSharedObjectNotFoundException` flood in
  that run either.
- **2026-05-29 — Step 1b shipped (cut the redundant React Query fan-out):** the
  `conv:<id>` INSERT handler no longer invalidates `chatQueryKeys.inbox` (the global
  inbox channel owns it) and no longer invalidates `chatQueryKeys.conversation(id)` on
  our **own** message (the sending mutation's `onSettled` already does). The fan-out
  policy was extracted into the pure, unit-tested helper
  `src/features/chat/lib/conversationInvalidations.ts` (`handleConversationInsert`):
  own message → no-op; incoming → messages + conversation(id) + debounced mark-read,
  never inbox. Remaining `conversation(id)` sources are now minimal and non-overlapping:
  incoming INSERT (this handler), the two send mutations' `onSettled` (own sends), and
  `handleCountdownExpired` (client timer). Expected effect: per-conversation-open query
  count drops from ~4x toward ~1x. 452/452 tests pass. _Sentry breadcrumb confirmation
  of the 4x→1x drop still pending on the next build._
- **Release validation (TestFlight + Sentry):** _TBD — must confirm no
  `convertNSExceptionToJSError` / `HadesGC` crash over several days (the prod fault is a
  race; dev no-repro is necessary but not sufficient)._

---

## 7. Validation checklist (the bar for "fixed")

- [ ] Tap a notification ×10 in 15 min while inside a conversation: no crash, no red screen.
- [ ] Sentry shows no `convertNSExceptionToJSError` / `GCScope` / `HadesGC` crash on the new build.
- [ ] Sentry shows no `after subscribe()` error on conversation open.
- [ ] Per-conversation-open query count is ~1× each (not 4×) in the breadcrumbs.
- [ ] **No regression:** record a voice message, then immediately play it back — it plays
      (guards against the silent-M4A regression that Option A reintroduced). Test on a
      physical device.
- [ ] 30-min session, 2 accounts, voice + text + crossing notifications: crash-free in Sentry.

---

## 8. Kickoff prompts for fresh chats

Paste the relevant block at the start of a new chat (context budget permitting).

### NEXT CHAT — Step 1b (fan-out) + Step 2 (Option B). Paste this.
```
Lovoice (React Native / Expo SDK 54, TS strict, Supabase). Branch: phase-9-hardening.

Context: we are hardening a tap-notification crash (EXC_BAD_ACCESS during Hermes GC,
off-JS-thread convertNSExceptionToJSError racing drainMicrotasks). Read FIRST, in full:
docs/REALTIME_STABILITY.md (the single source of truth — read §2, §3, §4.1, §5, §6),
then docs/CHAT_AUDIO.md §6 and §13, and docs/ARCHITECTURE.md §5.

Already shipped (do NOT redo): Step 1a — removeChannelsByName teardown in
src/features/chat/lib/realtimeChannels.ts, applied in app/(main)/messages/[id].tsx and
src/features/chat/hooks/useRealtimeInbox.ts. It killed the `after subscribe()` redbox.

Your task = Step 1b THEN Step 2, in two separate commits:

  Step 1b (do first — low risk, no audio, no navigation): cut the redundant React Query
  fan-out per §5 Step 1b — remove the double inbox invalidation (conv:<id> handler must
  not invalidate chatQueryKeys.inbox; let the global channel own it), stop invalidating
  conversation(id) on our OWN insert, and collapse the conversation(id) invalidation
  sources. Goal: per-conversation-open query count drops from ~4x to ~1x.

  Step 2 (Option B): move the conv:<id> Realtime channel lifecycle OUT of
  app/(main)/messages/[id].tsx into a session-scoped service with
  setActiveConversationId(id) so navigation no longer re-subscribes on every notif tap
  (the repeated "[RealtimeConv] conv:X subscribed" churn). Keep the INSERT/UPDATE
  handlers, the typing/recording broadcasts, the debouncers, and useResumeGuard.

Hard constraints:
- Do NOT touch chatMessagePlayer.ts or VoiceRecordingSession.tsx (audio invariants are
  frozen — see CHAT_AUDIO.md §9). The audio-host-persistence work is a SEPARATE later step.
- Do NOT reintroduce navigation changes (router.replace / stack reset / dismissAll):
  that combination regressed voice recording before. Only the safe "no-op if already on
  this conversation" guard is allowed if needed.
- Add/adjust unit tests (mock the Supabase client). Run `npm test` — all must pass.
- TS strict, no `any`. Each new file starts with a one-line purpose comment.
- After each step, propose a Conventional Commits message and update the §6 findings log.
- Regression gate before declaring done: on a physical device, record a voice message
  then immediately play it back — it must play (guards the silent-M4A regression).
```

### Later — Step 3 (throwing module) and audio-host persistence
```
Lovoice (Expo SDK 54, TS strict, Supabase). Branch: phase-9-hardening.
Read docs/REALTIME_STABILITY.md (esp. §4.1, §5 Step 3, §6) and docs/CHAT_AUDIO.md §9.
Two candidate tasks once Steps 1b/2 are validated in Sentry:
1. Make the chat audio host (useChatMessagePlayerHost) session-scoped/persistent so
   navigation stops tearing it down (kills the NativeSharedObjectNotFoundException /
   pause flood). MUST keep CHAT_AUDIO.md invariants #1, #4, #6, #9, #10 and pass the
   record->play device regression test.
2. If Sentry still shows convertNSExceptionToJSError after Steps 1b/2, identify and fix
   the throwing void TurboModule per §5 Step 3.
Run npm test. Propose a Conventional Commits message per change.
```

### Step 3 — fix the throwing module
```
Lovoice (Expo SDK 54, TS strict, Supabase). Branch: phase-9-hardening.
Read docs/REALTIME_STABILITY.md, especially §4 and the §6 findings log (the throwing
module is recorded there).
Task = Step 3: fix ingredient (b) — the void TurboModule that throws the NSException
identified in §6 — per §5 Step 3 (fix our call site, patch-package the module, or
document why it is RN-internal). Run npm test. Propose a Conventional Commits message.
```

---

## 9. References

| File | Role |
| --- | --- |
| `app/(main)/messages/[id].tsx` | `conv:<id>` Realtime effect, INSERT/UPDATE handlers, double inbox invalidation |
| `src/features/chat/hooks/useRealtimeInbox.ts` | Global inbox channel |
| `src/features/chat/hooks/useResumeGuard.ts` | Defers INSERT invalidations on foreground resume (fixed the resume variant, not the tap-notif variant) |
| `src/features/chat/api/conversationQueries.ts` | `useConversationDetails` (3 round-trips/refetch), `useConversations` (inbox), `chatQueryKeys` |
| `src/features/chat/api/messageMutations.ts` | `onSettled` inbox + conversation(id) invalidations |
| `src/navigation/messagesNavigation.ts` | `openConversation` (navigate inbox + push) |
| `src/features/push/hooks/usePushDeepLink.ts` | tap → `openConversation`, InteractionManager defer |
| `docs/CHAT_AUDIO.md` §13 | Original (resume-variant) crash analysis |
| `docs/ARCHITECTURE.md` §5 | Realtime messaging design |
