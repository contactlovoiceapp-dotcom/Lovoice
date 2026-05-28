<!--
  Index of in-flight debugging notes and pending work tracked outside the main
  ROADMAP / ARCHITECTURE docs. Each file is self-contained: read it before
  touching the related code path.
-->

# `docs/DEBUG/` — in-flight investigations & pending work

These are working notes meant to outlive the agent chat they were written in.
Each file in this folder targets a specific issue or workflow that is either
(a) currently under validation, (b) queued for a follow-up commit, or (c) a
recurring dev procedure worth memorising.

| File | Topic | Status |
| --- | --- | --- |
| [`SILENT_M4A_FIX.md`](./SILENT_M4A_FIX.md) | iOS silent .m4a voice recordings — root-cause hypothesis, current mitigation, validation plan, cleanup follow-up | Mitigation shipped, awaiting Sentry validation |
| [`PENDING_WORK.md`](./PENDING_WORK.md) | Other chat bugs deferred to a separate chat: nav bar overlay, back-to-Discover, audit-broken-voice-messages script, defensive bitrate validation, Sentry logging fix | Backlog |
| [`PHYSICAL_DEVICE_DEV.md`](./PHYSICAL_DEVICE_DEV.md) | How to iterate on a physical iPhone with Expo without going through TestFlight every time | Reference |

When a debug file is fully resolved, move its findings into
`docs/CHAT_AUDIO.md` / `docs/ARCHITECTURE.md` (or delete it if no
durable knowledge remains), and drop its row from this index.
