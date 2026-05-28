<!--
  Reference for the chat voice playback and recording architecture
  (`src/features/chat/`). Read this BEFORE touching `chatMessagePlayer.ts`,
  `VoiceRecordingSession.tsx`, `MessageBubble.tsx`, `ConversationComposer.tsx`,
  or the Realtime invalidation pipeline in `app/(main)/messages/[id].tsx`.

  Rewritten on 2026-05-28 after the silent-M4A refactor that replaced the
  per-feature audio session swap with a single boot-time configuration and
  the reusable recorder with a session-scoped VoiceRecordingSession component.
-->

# Chat audio — playback & recording architecture

## 1. Why this exists

The original implementation instantiated **one `useAudioPlayer` per voice
message bubble** rendered in the conversation FlatList. With ~30 voice messages
visible, 30 native `AVAudioPlayer` instances polled status every 100 ms over
the TurboModule bridge. Combined with FlatList remounts caused by an unstable
`clientId` during the optimistic→confirmed message transition, this produced a
torrent of native↔JS traffic that corrupted the Hermes heap mid-conversation
(TestFlight 0.8.0, `EXC_BAD_ACCESS` in `HiddenClass::findProperty`).

The rewrite collapses playback to **one native player per
`ConversationScreen`** and recording to **one ephemeral recorder per
recording session**.

## 2. Component map

| File | Responsibility |
| --- | --- |
| `src/features/chat/lib/chatMessagePlayer.ts` | Singleton host player, Zustand store, per-bubble hook, public `pauseAllChatMessages`. **Do not duplicate state here in components.** |
| `src/components/main/ConversationScreen.tsx` | Mounts the host once via `useChatMessagePlayerHost()`. Owns the only `useAudioPlayer` of the chat feature. |
| `src/features/chat/components/MessageBubble.tsx` | Per-bubble UI. Calls `useChatMessagePlayer({ messageId: clientId, ... })` — note: `clientId`, not `id`. |
| `src/features/chat/components/VoiceRecordingSession.tsx` | Session-scoped recorder. Mounts fresh for each recording, owns the `useAudioRecorder`, handles permission / prepare / record / stop / file-move. Unmounts on send, cancel, hard-cap, or parent unmount. |
| `src/features/chat/components/ConversationComposer.tsx` | Manages the recording state machine (`idle` / `recording` / `finalizing` / `cancelling`). Conditionally renders `VoiceRecordingSession` only during an active session. |
| `src/features/chat/api/messageMutations.ts` | Upload pipeline + optimistic mutation. Preserves `clientId` when replacing the optimistic message with the server row. |
| `app/(main)/messages/[id].tsx` | Realtime subscriptions + debouncers (`updateDebouncer`, `markReadDebouncer`). |
| `src/features/chat/hooks/useRealtimeInbox.ts` | Global inbox Realtime listener + `updateDebouncer`. |
| `src/features/chat/lib/throttle.ts` | `createThrottle` (typing pings) + `createDebouncer` (Realtime UPDATE bursts). |

## 3. State machine — player store

```
┌───────────────────────────────────────────────────────────────┐
│  useChatPlayerStore (Zustand, module-scope, singleton)         │
│  ───────────────────────────────────────────────────────────  │
│  activeMessageId    : string | null   ← which bubble owns it  │
│  activeSource       : string | null   ← url or local file path│
│  activeIsLocal      : boolean         ← optimistic message?   │
│  isPlaying          : boolean                                 │
│  positionMs         : number          ← mirrored from status  │
│  durationMs         : number          ← mirrored from status  │
│  isLoading          : boolean         ← url fetch / source swp│
│  error              : 'play_timeout' | 'play_failed' | null   │
└───────────────────────────────────────────────────────────────┘

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

### 4.2 Nested conversations (push-notification deep-link)

User is in conversation A. Push notification for B arrives. They tap it.
`router.push('/messages/B')` stacks B on top of A — **both
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
   [A, B]                  active=msg-B1, isPlaying=true (on player_B)
       ├─ user taps back, screen B unmounts
       │
       │  Host B's cleanup useEffect runs:
       │    1. player_B.pause()
       │    2. splice player_B out of stack
       │    3. reset store, clear timeouts
       │
   [A]                     active=null
                            player_A is paused. User can resume by tapping play.
```

Two guards make this safe:

1. **Status mirror and `didJustFinish` effects check `getActiveHost() === player`**.
   The dormant host A still polls its own status, but its effects refuse to
   write into the shared store unless it is the active top.
2. **Mounting on top resets the store**. The incoming host starts from
   `INITIAL_STORE_STATE` so there is no stale `activeMessageId` from A
   leaking into B's bubble selectors.

### 4.3 Recording session lifecycle

```
user taps mic in composer
    ├─ ConversationComposer sets recordingState='recording'
    ├─ VoiceRecordingSession mounts (fresh useAudioRecorder)
    │   ├─ pauseAllChatMessages()
    │   ├─ pauseFeedPlayer()
    │   ├─ pauseProfileVoicePlayer()
    │   ├─ requestRecordingPermissionsAsync()
    │   ├─ recorder.prepareToRecordAsync()
    │   ├─ recorder.record()
    │   └─ onReady callback → composer shows waveform
    │
user releases mic (or hard cap reached)
    ├─ ConversationComposer sets mode='finalizing'
    ├─ VoiceRecordingSession:
    │   ├─ recorder.stop()
    │   ├─ move file to documentDirectory/pending/<uuid>.m4a
    │   ├─ onFinalized({ uri, durationMs })
    │   └─ unmounts
    ├─ mutation.mutate({uri, durationMs}) → optimistic insert + upload
    │
optimistic message renders with clientId = uuid
    └─ MessageBubble plays from the local file URI (no signed URL needed)
       — isLocalFile = true in startPlayback args
```

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

The "skip on own INSERT" branch prevents the FlatList from remounting our
just-sent voice bubble.

### Why every debouncer matters

- `updateDebouncer` (messages): N consecutive read-receipt UPDATEs collapse
  to 1 refetch.
- `updateDebouncer` (inbox): same, at the global level.
- `markReadDebouncer`: N incoming INSERTs in a burst collapse to 1 SQL
  UPDATE that marks them all read at once.

## 7. Error surfaces & retry policy

### Playback errors

| Condition | What the user sees | How the store reflects it |
| --- | --- | --- |
| Signed URL fetch fails | Red `AlertCircle` on the bubble + tap-to-retry | `{ activeMessageId stays, isLoading: false, error: 'play_failed' }` |
| `player.replace()` throws | Same | Same |
| Native player never starts within 8 s | Same with `error: 'play_timeout'` | `activeMessageId stays`, full position/duration reset |
| `didJustFinish` < 400 ms after confirmed playback | First occurrence: silent retry with cache-busted URL. Second: red icon with `error: 'play_failed'` | `retried = true` after the first |
| Natural end of track | UI returns to idle | Store fully reset to `INITIAL_STORE_STATE` |

### Recording errors

| Error code | Trigger | Handling |
| --- | --- | --- |
| `permission_denied` | Microphone permission not granted | Composer shows alert, session unmounts |
| `prepare_failed` | `recorder.prepareToRecordAsync()` throws | `Sentry.captureException`, composer shows error, session unmounts |
| `record_failed` | `recorder.record()` throws | Same |
| `stop_failed` | `recorder.stop()` throws or file move fails | Same |
| `no_uri` | `recorder.uri` is `null` after stop | Breadcrumb logged, composer shows error |

All recording errors are instrumented with Sentry breadcrumbs (category
`recording`) so failures are diagnosable from production without device access.

## 8. Memory & scale bounds

| What | Bound | Why |
| --- | --- | --- |
| `hostPlayerStack` | Max ~2-3 entries in practice (nested conv case) | Only push-notification deep-links nest screens |
| `useChatPlayerStore` | 8 fixed fields, ~80 bytes | Zustand singleton |
| `signedUrlCache` | LRU cap `SIGNED_URL_CACHE_MAX_ENTRIES = 200` | ~60 KB ceiling regardless of session length |
| Bubble subscriptions | 1 per visible voice bubble (FlatList virtualization) | Inactive bubbles return the stable `INACTIVE_SNAPSHOT` reference → `useShallow` skips re-render |
| Native chat players alive | 1 (or 2 in the nested case for a brief moment) | One per mounted `ConversationScreen` |
| Native recorders alive | 0 when idle, 1 during a recording session | `VoiceRecordingSession` mounts/unmounts per session; no persistent recorder |

## 9. Known invariants — break at your peril

1. **One `useChatMessagePlayerHost()` per `ConversationScreen`**, mounted at
   the top of the screen (not inside FlatList rendering, not inside a
   bubble, not conditionally).
2. **`MessageBubble` passes `clientId` (not `id`) as the `messageId` arg**
   to `useChatMessagePlayer`.
3. **`replaceMessage` in `messageMutations.ts` preserves `clientId`** when
   substituting an optimistic row for its confirmed server row.
4. **No new `useAudioPlayer` call inside `MessageBubble`** or any per-row
   chat component. The host owns the only one.
5. **All Realtime UPDATE handlers in chat must debounce.** INSERTs may be
   immediate; UPDATEs must not.
6. **The status mirror and `didJustFinish` effects in
   `useChatMessagePlayerHost` must early-return when
   `getActiveHost() !== player`.** Otherwise dormant nested hosts will
   write into the shared store.
7. **`safeNativeCall(() => host.something())`** for any native call that
   could race with expo-audio's internal recycling.
8. **Recorder polling must be gated.** Use `useAudioRecorderStateGated`
   (in `src/lib/audio.ts`) with `enabled` driven by recording state, not
   the raw `useAudioRecorderState` from expo-audio.
9. **The AVAudioSession is configured once at app boot** to `playAndRecord`
   in `app/_layout.tsx`. **Never swap it at runtime.** Adding a per-feature
   `setAudioModeAsync` call regresses to the silent-M4A bug (swapping the
   category while `AVAudioPlayer` instances are alive starves the AAC
   encoder on the recorder).
10. **The recorder lives inside `VoiceRecordingSession`**, which mounts only
    for the duration of one recording. **Do not mount the recorder hook at
    any higher scope.** Reusing the same `AVAudioRecorder` instance across
    multiple recordings produces silent files on iOS
    (expo/expo#41656, #36193).

## 10. Things this architecture deliberately does NOT do

- **No `useAudioPlayer` inside the bubble.** Reverting to per-bubble players
  re-introduces the crash.
- **No `id`-based React keys for messages.** Always `clientId`.
- **No undebounced Realtime UPDATE handlers** anywhere in the chat path.
- **No multi-track playback in chat.** The product is one voice at a time;
  the architecture enforces this by design (single store, single host).
- **No session category swap.** The `AVAudioSession` stays at `playAndRecord`
  for the entire app lifetime. No per-feature `setAudioModeAsync`.
- **No reuse of a single recorder instance** across multiple recordings.
  Each tap-to-record mounts a fresh `VoiceRecordingSession`.

## 11. Test map

| File | Covers |
| --- | --- |
| `src/features/chat/lib/__tests__/chatMessagePlayer.test.ts` | `generateBarHeights`, single-instance contract, switching bubbles, local file source, `pauseAllChatMessages`, nested-host scenario |
| `src/features/chat/components/__tests__/VoiceRecordingSession.test.tsx` | Permission flow, prepare/record lifecycle, cancel, finalize, `no_uri` error path |
| `src/features/chat/api/__tests__/messageMutations.test.ts` | `clientId` preservation on optimistic→confirmed |
| `src/features/chat/lib/__tests__/throttle.test.ts` | `createThrottle` + `createDebouncer` |
| `src/lib/__tests__/feedPlayer.test.tsx` | Sibling single-instance player (independent feature) — reference for a similar pattern |

## 12. If you are debugging a chat audio bug…

Walk through this checklist in order:

1. Verify `MessageBubble` still uses `clientId` for `messageId`.
2. Verify `messageMutations.replaceMessage` still preserves `clientId`.
3. Verify `useChatMessagePlayerHost()` is called exactly once per
   `ConversationScreen` mount.
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
8. If recordings are silent on iOS: check that `app/_layout.tsx` still calls
   `configureAudioSession()` once at module load with `allowsRecording: true`.
   Check that no other file calls `setAudioModeAsync`. Check that
   `VoiceRecordingSession` is the only consumer of `useAudioRecorder` and
   that the component unmounts between recordings (no instance reuse).
9. If the iOS `EXC_BAD_ACCESS` / Hermes race crash reappears after a
   notification tap: check that `usePushDeepLink` still wraps `router.push`
   in `InteractionManager.runAfterInteractions`, that the recorders still
   use `useAudioRecorderStateGated`, and that `useAppIconBadge` still
   debounces. Then enable Sentry and read the breadcrumb trail for the
   `recording.*` and `upload.*` categories to identify the failing step.
