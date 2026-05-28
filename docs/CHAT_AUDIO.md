<!--
  Reference for the chat voice playback architecture (`src/features/chat/`).
  Read this BEFORE touching `chatMessagePlayer.ts`, `MessageBubble.tsx`, or the
  Realtime invalidation pipeline in `app/(main)/messages/[id].tsx`.

  This subsystem was rewritten on 2026-05-27 after a `EXC_BAD_ACCESS` crash in
  Hermes (TestFlight 0.8.0). Whoever is reading this is likely debugging
  something else in the same area — the design choices here are not aesthetic,
  they are crash-mitigations. Be very careful before reverting any of them.
-->

# Chat audio — playback architecture

## 1. Why this exists

The original implementation instantiated **one `useAudioPlayer` per voice
message bubble** rendered in the conversation FlatList. With 30 voice messages
visible, 30 native `AVAudioPlayer` instances were alive, each polling status
every 100 ms over the TurboModule bridge. Combined with FlatList remounts
caused by an unstable `clientId` during the optimistic→confirmed message
transition, this produced a torrent of native↔JS traffic that ended up
corrupting the Hermes heap mid-conversation.

Crash signature (kept for future grep):

```
EXC_BAD_ACCESS (SIGSEGV) at 0x6b636162   # "back" — UAF on a freed object
HiddenClass::findProperty
Runtime::drainJobs()
JSMapIteratorImpl::nextElement
RCTTurboModule convertNSExceptionToJSError
```

The rewrite collapses this to **one native player per `ConversationScreen`**.
All bubbles read from a shared Zustand store; only the active bubble re-renders
on every status tick.

## 2. Component map

| File | Responsibility |
| --- | --- |
| `src/features/chat/lib/chatMessagePlayer.ts` | Singleton host player, store, bubble hook, public `pauseAllChatMessages`, host suspension API (`suspendHostForRecording` / `resumeHostAfterRecording`). **Do not duplicate state here in components.** |
| `src/features/chat/components/ChatMessagePlayerHostMount.tsx` | Conditional wrapper around the host hook. Unmounts the inner component (and therefore the native `AVAudioPlayer`) while `isHostSuspended` is true — see §9bis. |
| `src/components/main/ConversationScreen.tsx` | Renders `<ChatMessagePlayerHostMount />`. Never calls `useChatMessagePlayerHost()` directly. |
| `src/features/chat/components/MessageBubble.tsx` | Per-bubble UI. Calls `useChatMessagePlayer({ messageId: clientId, ... })` — note: `clientId`, not `id`. |
| `src/features/chat/components/ConversationComposer.tsx` | Calls `pauseAllChatMessages()` before `recorder.start()`. |
| `src/features/chat/api/messageMutations.ts` | Preserves `clientId` when replacing the optimistic message with the server row. Breaking this re-introduces FlatList remounts. |
| `app/(main)/messages/[id].tsx` | Realtime subscriptions + debouncers (`updateDebouncer`, `markReadDebouncer`). |
| `src/features/chat/hooks/useRealtimeInbox.ts` | Global inbox Realtime listener + `updateDebouncer`. |
| `src/features/chat/lib/throttle.ts` | `createThrottle` (typing pings) + `createDebouncer` (Realtime UPDATE bursts). |

## 3. State machine

```
┌─────────────────────────────────────────────────────────────────┐
│  useChatPlayerStore (Zustand, module-scope, singleton)          │
│  ─────────────────────────────────────────────────────────────  │
│  activeMessageId    : string | null   ← which bubble owns it    │
│  activeSource       : string | null   ← url or local file path  │
│  activeIsLocal      : boolean         ← optimistic message?     │
│  isPlaying          : boolean                                   │
│  positionMs         : number          ← mirrored from status    │
│  durationMs         : number          ← mirrored from status    │
│  isLoading          : boolean         ← url fetch / source swap │
│  error              : 'play_timeout' | 'play_failed' | null     │
└─────────────────────────────────────────────────────────────────┘

  Bubble snapshot selector:
    if (store.activeMessageId !== bubble.clientId) return INACTIVE_SNAPSHOT;
    else return active fields;

  INACTIVE_SNAPSHOT is a stable module reference → useShallow returns ===
  → inactive bubbles never re-render on store changes.
```

### Module-scope transient bookkeeping (not in the store)

| Name | Purpose | Reset when |
| --- | --- | --- |
| `hostPlayerStack: AudioPlayer[]` | LIFO of mounted hosts. Top = active host. | Pushed on host mount, popped on host unmount. |
| `loadToken` | Monotonic counter to discard stale URL resolutions when the user spams play. | Never reset (just incremented). |
| `loadedUrl` | Last URL passed to `replace()`. Skip a redundant `replace()` if unchanged. | Reset on switch bubble, retry, host mount/unmount. |
| `playConfirmedAt` | Timestamp of the first tick where `status.playing === true && isLoading`. Used to classify a `didJustFinish` as suspicious. | Reset on switch bubble, host mount/unmount. |
| `retried` | Did we already retry the current bubble with a cache-busted URL? | Reset on switch bubble, host mount/unmount. |
| `sessionConfigured` | Have we called `configureAudioSessionForPlayback()` yet? Idempotent helper, cached. | Module lifetime (only reset in tests). |
| `playTimeoutId` | 8 s deadline. If `isLoading` is still true when it fires, surface `play_timeout`. | Cleared whenever playback confirms, errors, or a new attempt starts. |
| `signedUrlCache: Map<path, entry>` | LRU of signed URLs (max 200 entries, ~60 KB). Entries valid for `SIGNED_URL_LIFETIME_MS` (50 min). | Per-entry invalidation on retry; oldest evicted past the cap; cleared in tests only. |

## 4. Lifecycle scenarios

### 4.1 Single conversation, multiple voices

```
Inbox  ─tap Sophie─▶  ConversationScreen mounts
                       │
                       ├─ useChatMessagePlayerHost() runs
                       ├─ useAudioPlayer(null) creates native player_S
                       ├─ hostPlayerStack.push(player_S)
                       └─ store reset to INITIAL_STORE_STATE
       ─play voice A─▶ startPlayback({clientId:A, ...})
                       ├─ ensureSignedUrl(pathA) → cache miss → fetch
                       ├─ player_S.replace(urlA); player_S.play()
                       └─ status tick → store.isPlaying=true, isLoading=false
       ─play voice B─▶ startPlayback({clientId:B, ...})
                       ├─ isSwitchingBubble=true → reset retried/loadedUrl
                       ├─ store: activeMessageId=B, isPlaying=false, isLoading=true
                       ├─ A's bubble selector → INACTIVE_SNAPSHOT (no re-render storm)
                       ├─ ensureSignedUrl(pathB)
                       ├─ player_S.replace(urlB); player_S.play()
                       └─ status tick → store.isPlaying=true (for B)
       ─tap back─────▶ ConversationScreen unmounts
                       ├─ host cleanup: pause(), pop stack, reset store
                       └─ expo-audio releases native player_S
```

**Invariant**: 1 native `AVAudioPlayer` for the chat feature at any moment.
Source is swapped via `replace()`; the player itself is never recycled
within a single screen lifetime.

### 4.2 Back-and-forth: Sophie → back → Micheline → back → Emilie

Each conversation visit gets a brand-new native player. Players are created
and destroyed sequentially, never concurrently.

```
t=0 Inbox                                          native chat players alive: 0
t=1 push Sophie → ConvScreen mount → player_S      1
t=2 play voice 1 → player_S.replace + play         1   (same player)
t=3 play voice 2 → player_S.replace + play         1   (same player, source swap)
t=4 back        → ConvScreen unmount → destroyed   0
t=5 push Mich.  → ConvScreen mount → player_M      1   (fresh native instance)
t=6 play voice  → player_M.replace + play          1
t=7 back        → player_M destroyed               0
t=8 push Emilie → player_E                         1
```

`signedUrlCache` persists across navigations: returning to Sophie 5 min later
and replaying voice 1 skips the `createSignedUrl` round-trip.

### 4.3 Nested conversations (push notification deep-link)

User is in conversation A. Push notification for B arrives. They tap it.
`router.push('/messages/B')` stacks the B screen on top of A — **both
ConversationScreens are mounted simultaneously**.

```
   hostPlayerStack         store
   [A]                     active=msg-A2, isPlaying=true
       ├─ push notif tap, router.push('/messages/B')
       │
       │  Host B's mount useEffect runs:
       │    1. pause hostPlayerStack[top] (player_A)
       │    2. hostPlayerStack.push(player_B)
       │    3. reset store
       │
   [A, B]                  active=null
       ├─ user plays a voice in B
       │
   [A, B]                  active=msg-B1, isPlaying=true (on player_B)
       ├─ user taps back, screen B unmounts
       │
       │  Host B's cleanup useEffect runs:
       │    1. player_B.pause()
       │    2. splice player_B out of stack
       │    3. reset store, clear timeouts
       │
   [A]                     active=null
                            player_A is paused (was paused on B's mount).
                            User can resume by tapping play on a bubble in A.
```

Two guards make this safe:

1. **Status mirror and `didJustFinish` effects check `getActiveHost() === player`**.
   The dormant host A still polls its own status (`useAudioPlayer` keeps
   running while mounted), but its effects refuse to write into the shared
   store unless it is the active top. Without this, A's idle ticks would
   clobber B's active state.
2. **Mounting on top resets the store**. The incoming host starts from
   `INITIAL_STORE_STATE` so there is no stale `activeMessageId` from A
   leaking into B's bubble selectors.

### 4.4 Recording

```
user taps mic in composer
    ├─ pauseAllChatMessages()                ← UX: pause any active bubble
    ├─ suspendHostForRecording()             ← unmount host wrapper, await React commit
    │     ├─ store.isHostSuspended = true
    │     └─ ChatMessagePlayerHostMount → returns null → useAudioPlayer cleanup
    │         → native AVAudioPlayer released
    ├─ setIsAudioActiveAsync(false)          ← belt-and-suspenders, see expo/expo#39030
    ├─ configureAudioSessionForRecording()   ← session category swap
    ├─ recorder.prepareToRecordAsync(); recorder.record()
    │
user releases mic
    ├─ recorder.stop()
    ├─ move file to documentDirectory/pending/<uuid>.m4a
    ├─ setIsAudioActiveAsync(true)
    ├─ configureAudioSessionForPlayback()    ← swap back
    ├─ resumeHostAfterRecording()            ← store.isHostSuspended = false
    │     └─ ChatMessagePlayerHostMount remounts → new AVAudioPlayer
    ├─ mutation.mutate({uri, durationMs})    ← optimistic insert + upload
    │
optimistic message renders with `clientId = uuid`
    └─ MessageBubble plays from the local file URI (no signed URL needed)
       — `isLocalFile = true` in startPlayback args
```

Suspension must complete (the wrapper component must unmount) BEFORE the
recorder touches `AVAudioSession`. `suspendHostForRecording()` awaits a
double `requestAnimationFrame` to guarantee React has committed the
conditional render and expo-audio's cleanup effect has fired.

When the server confirms, `replaceMessage` in `messageMutations.ts` swaps
`id` to the server UUID **but keeps `clientId` unchanged**. The bubble
neither remounts nor changes its player identity.

## 5. Identifier discipline

There are **two distinct IDs** on a `ChatMessage`. Mixing them up was a
direct cause of the original crash.

| ID | Value | Stable across optimistic → confirmed? | Used for |
| --- | --- | --- | --- |
| `message.id` | Server UUID, or `optimistic-<uuid>` while pending | **NO** — changes on server confirmation | Anything server-side: API calls, foreign keys, dedup with Realtime payloads |
| `message.clientId` | Always the client-generated UUID (the file basename for voice) | **YES** — stable forever | `FlatList.keyExtractor`, `useChatMessagePlayer({ messageId })`, `generateBarHeights` seed |

**Rule**: any value that affects React identity (keys, hook arguments that
drive subscriptions, refs) must use `clientId`. Values sent to the server
or correlated with Realtime payloads use `id`.

## 6. Realtime invalidation pipeline

Two channels are always at play:

| Channel | Where | Events | Handling |
| --- | --- | --- | --- |
| `global-inbox:<userId>` | Mounted in `app/(main)/_layout.tsx` via `useRealtimeInbox` | INSERT, UPDATE on `messages` (RLS-filtered to the user) | INSERT → immediate inbox invalidate. UPDATE → debounced 500 ms inbox invalidate. |
| `conv:<conversationId>` | Mounted by `app/(main)/messages/[id].tsx` for the active conversation only | INSERT, UPDATE on the conversation's messages + `typing` / `recording` broadcasts | INSERT → conditional invalidate (see below). UPDATE → debounced 500 ms messages invalidate. |

### INSERT handler nuances

```
INSERT received in conv:<id>
   ├─ if sender_id === currentUserId:        ← our own confirmed message
   │     skip messages invalidate            ← optimistic row is already correct
   │                                            (clientId stable, no remount)
   │     invalidate conversation + inbox
   │
   └─ else:                                  ← incoming from the other user
         invalidate messages                 ← show the new bubble immediately
         markReadDebouncer.schedule()        ← debounced 400 ms
         invalidate conversation + inbox
```

The "skip on own INSERT" branch is what prevents the FlatList from
remounting our just-sent voice bubble (which would release and recreate
its row in the singleton player's state machine).

### Why every debouncer matters

- `updateDebouncer` (messages): N consecutive read-receipt UPDATEs collapse
  to 1 refetch.
- `updateDebouncer` (inbox): same, at the global level.
- `markReadDebouncer`: N incoming INSERTs in a burst collapse to 1 SQL
  UPDATE that marks them all read at once. The SQL is idempotent, but
  each redundant call cost an HTTP round-trip **plus** triggered an
  UPDATE Realtime event that re-entered the pipeline — the very kind
  of self-amplifying loop that we are trying to kill.

React Query also deduplicates concurrent refetches of the same query, so
even if both the per-conv channel and the global inbox channel fire
`invalidate(inbox)` simultaneously, only one network fetch hits.

## 7. Error surfaces & retry policy

| Condition | What the user sees | How the store reflects it |
| --- | --- | --- |
| Signed URL fetch fails | Red `AlertCircle` on the bubble + tap-to-retry | `{ activeMessageId stays, isLoading: false, error: 'play_failed' }` |
| `player.replace()` throws | Same | Same |
| Native player never starts within 8 s | Same with `error: 'play_timeout'` | `activeMessageId stays`, full position/duration reset |
| `didJustFinish` < 400 ms after confirmed playback | First occurrence: silent retry with cache-busted URL. Second occurrence: red icon with `error: 'play_failed'` | `retried = true` after the first; reset on switch bubble |
| Natural end of track | UI returns to idle | Store fully reset to `INITIAL_STORE_STATE` |

The "suspicious finish < 400 ms" branch defends against expired signed
URLs that return HTTP 200 with an empty/short body — expo-audio plays
"nothing" successfully then immediately reports completion.

## 8. Memory & scale bounds

| What | Bound | Why |
| --- | --- | --- |
| `hostPlayerStack` | Max ~2-3 entries in practice (nested conv case) | Only push-notification deep-links nest screens |
| `useChatPlayerStore` | 8 fixed fields, ~80 bytes | Zustand singleton |
| `signedUrlCache` | LRU cap `SIGNED_URL_CACHE_MAX_ENTRIES = 200` | ~60 KB ceiling regardless of session length |
| Bubble subscriptions | 1 per visible voice bubble (FlatList virtualization) | Inactive bubbles return the stable `INACTIVE_SNAPSHOT` reference → `useShallow` skips re-render |
| Native chat players alive | 1 (or 2 in the nested case for a brief moment) | One per mounted `ConversationScreen` |

## 9. Known invariants — break at your peril

1. **One `<ChatMessagePlayerHostMount />` per `ConversationScreen`**, rendered
   at the top of the screen (not inside FlatList rendering, not inside a
   bubble). Never call `useChatMessagePlayerHost()` directly from screen
   components — go through the wrapper so suspension works (see §9bis).
2. **`MessageBubble` passes `clientId` (not `id`) as the `messageId` arg**
   to `useChatMessagePlayer`.
3. **`replaceMessage` in `messageMutations.ts` preserves `clientId`** when
   substituting an optimistic row for its confirmed server row.
4. **No new `useAudioPlayer` call inside `MessageBubble`** or any per-row
   chat component. The host owns the only one.
5. **All Realtime UPDATE handlers in chat must debounce.** INSERTs may be
   immediate; UPDATEs must not. New event types should consider whether
   they are bursty.
6. **The status mirror and `didJustFinish` effects in `useChatMessagePlayerHost`
   must early-return when `getActiveHost() !== player`.** Otherwise dormant
   nested hosts will write into the shared store.
7. **`safeNativeCall(() => host.something())`** for any native call that
   could race with expo-audio's internal recycling. expo-audio throws
   `NativeSharedObjectNotFoundException` on transient race windows; these
   are recoverable and must be swallowed.
8. **Recorder polling must be gated.** Use `useAudioRecorderStateGated`
   (in `src/lib/audio.ts`) with `enabled` driven by recording state, not
   the raw `useAudioRecorderState` from expo-audio. The latter polls at
   the fixed interval forever and the interval arg cannot be changed
   after mount — it would burn ~20 Hz of TurboModule traffic per mounted
   conversation, even when nobody is recording.
9. **Recorder cleanup must guard the `configureAudioSessionForPlayback`
   call.** Only call it on unmount if recording was actually started at
   least once during the hook's lifetime (`recordingSessionTouchedRef`).
   Otherwise every navigation between conversations fires a redundant
   `setAudioModeAsync` which races with iOS audio reactivation.

## 9bis. Recording: keep the host out of the way (silent-M4A mitigation)

On iOS, an alive `AVAudioPlayer` instance — even an idle one with no source —
contests the `AVAudioSession` with `AVAudioRecorder` when the recorder swaps
the session category to `.playAndRecord`. Symptom: the AAC encoder receives
zero samples, writes a valid M4A container of ~32 KB filled with silence,
and the resulting voice message is forever unplayable. The bug reproduces
intermittently on iOS device (iPhone 13 Mini / iOS 26.5 in our case) and
never on the simulator (mocked session) nor on Android (MediaRecorder).

Sentry signature: `LOVOICE-1 "Chat voice recording suspiciously small"`
(triggered by `useChatVoiceRecorder.finalizeRecording` when `destSize <
35_000` AND `durationMs > 2_000`).

Mitigation: the host's `useAudioPlayer` lives inside
`ChatMessagePlayerHostMount`, a conditional wrapper. Before the recorder
configures the audio session it calls `suspendHostForRecording()` which:

1. Pauses any active playback (UX: the user's previous voice stops).
2. Sets `store.isHostSuspended = true`, which makes the wrapper return
   `null` and React unmounts the inner component.
3. Awaits a double `requestAnimationFrame` so React commits the unmount and
   expo-audio's cleanup releases the native `AVAudioPlayer` synchronously.

The recorder then swaps the session and `recorder.record()` runs with no
competing player. After the recording finalises (or is cancelled, or the
hook unmounts mid-recording for any reason), `resumeHostAfterRecording()`
clears the flag and the wrapper remounts the host with a fresh native
player — the previous playback state is gone, which is fine because
listening was paused by step 1 anyway.

Critical invariants:

- The host's normal mount/unmount cleanup must **NEVER** clear
  `isHostSuspended`. Use `resetPlaybackState()` instead of
  `useChatPlayerStore.setState(INITIAL_STORE_STATE)` everywhere except in
  `__resetChatPlayerStoreForTests`.
- `resumeHostAfterRecording()` must be called on **every** recorder exit
  path including the unmount cleanup, otherwise the next
  `ConversationScreen` mount stays without a host (no voice can play).

## 9ter. Native bridge pressure budget at notif-tap time

The chat audio crash family (`convertNSExceptionToJSError` × Hermes
runtime race documented in §1 of the original rewrite) reproduces most
reliably when:

- the user has exchanged several messages (heap growth → longer GC pauses
  → wider race window),
- a push notification arrives, and
- the user taps it from foreground or background.

The tap triggers a synchronous burst of native module work in the same
JS tick as iOS is reactivating AVAudioSession, replaying queued Realtime
events, and animating the foreground transition. Any TurboModule that
throws an NSException during this window can corrupt the Hermes runtime
through the cross-thread error conversion path.

Mitigations in the codebase:

- `usePushDeepLink` defers `router.push` through
  `InteractionManager.runAfterInteractions`, letting iOS settle the
  foreground transition before React starts mounting the conversation
  screen and its native audio resources.
- `useAppIconBadge` debounces `setBadgeCountAsync` over a 300 ms window
  so a burst of message exchanges collapses into a single native call
  instead of 3–5 in flight at once.
- `useChatVoiceRecorder` / `useVoiceRecorder` use the gated polling hook
  (see invariant 8) so idle conversations stop hammering the bridge.
- The chat `useChatVoiceRecorder` / `useVoiceRecorder` cleanups only call
  `configureAudioSessionForPlayback` if recording was actually engaged
  (see invariant 9).

Do not add new synchronous native calls in the notification-tap or
conversation-mount paths without considering this budget.

## 10. Test map

| File | Covers |
| --- | --- |
| `src/features/chat/lib/__tests__/chatMessagePlayer.test.ts` | `generateBarHeights`, single-instance contract, switching bubbles, local file source, `pauseAllChatMessages`, nested-host scenario, host suspension flag preservation across host mount/unmount |
| `src/features/chat/components/__tests__/ChatMessagePlayerHostMount.test.tsx` | Conditional mounting contract — host alive when not suspended, returns null while suspended, remounts after resume |
| `src/features/chat/hooks/__tests__/useChatVoiceRecorder.test.ts` | State machine + suspend-on-start, resume-on-cancel, resume-on-unmount |
| `src/features/chat/api/__tests__/messageMutations.test.ts` | `clientId` preservation on optimistic→confirmed |
| `src/features/chat/lib/__tests__/throttle.test.ts` | `createThrottle` + `createDebouncer` |
| `src/lib/__tests__/feedPlayer.test.tsx` | Sibling single-instance player (independent feature) — reference for a similar pattern |

## 11. Things this architecture deliberately does NOT do

- **No `useAudioPlayer` inside the bubble**. Reverting to per-bubble players
  re-introduces the crash.
- **No `id`-based React keys for messages**. Always `clientId`.
- **No undebounced Realtime UPDATE handlers** anywhere in the chat path.
- **No multi-track playback in chat**. The product is one voice at a time;
  the architecture enforces this by design (single store, single host).
- **No global pause-on-route-change** outside the host's own cleanup. The
  host's unmount handles it; do not add app-level audio managers.

## 12. If you are debugging a chat audio bug…

Walk through this checklist in order:

1. Verify `MessageBubble` still uses `clientId` for `messageId`.
2. Verify `messageMutations.replaceMessage` still preserves `clientId`.
3. Verify `<ChatMessagePlayerHostMount />` is rendered exactly once per
   `ConversationScreen` and that nothing else calls
   `useChatMessagePlayerHost()` directly.
4. Add a `console.log` of `hostPlayerStack.length` in the host's mount/unmount
   useEffect to confirm you do not have orphan hosts.
5. If the bubble shows no error after a failed playback: check that the
   error branch keeps `activeMessageId` set (regression of the
   `INITIAL_STORE_STATE` reset bug).
6. If Realtime updates feel sluggish: check the debouncers. 500 ms is the
   compromise — do not lower it to "real-time" without thinking about
   the bridge pressure that motivated the original rewrite.
7. If memory grows over a long session: log `signedUrlCache.size`; it must
   never exceed `SIGNED_URL_CACHE_MAX_ENTRIES`.
8. If the iOS `EXC_BAD_ACCESS` / Hermes race crash reappears after a
   notification tap: check that `usePushDeepLink` still wraps `router.push`
   in `InteractionManager.runAfterInteractions`, that the recorders still
   use `useAudioRecorderStateGated`, and that `useAppIconBadge` still
   debounces. Then enable Sentry (`EXPO_PUBLIC_SENTRY_DSN`) and read the
   JS stack of the next event to identify the actual throwing
   TurboModule (the iOS crashlog stacks do not preserve that information).
9. If `LOVOICE-1 "Chat voice recording suspiciously small"` reappears:
   verify (a) `useChatVoiceRecorder.start()` still `await`s
   `suspendHostForRecording()` BEFORE `setIsAudioActiveAsync(false)`, (b)
   `ConversationScreen` renders `<ChatMessagePlayerHostMount />` (not the
   raw host hook), and (c) the host's normal lifecycle still uses
   `resetPlaybackState()` rather than resetting the whole store, so the
   suspension flag survives the unmount-then-remount cycle.
