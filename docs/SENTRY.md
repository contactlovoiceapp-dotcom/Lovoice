<!--
  Operational guide for Sentry on Lovoice (mobile app + Supabase Edge Functions).
  For high-level observability goals, see ARCHITECTURE.md §10.
-->

# Sentry — mobile & Edge Functions

Lovoice uses **two separate configurations** for the same product: the React Native app and Supabase Edge Functions. They can share one Sentry project (same DSN) or use a dedicated server project.

| Surface | Env variable | Where it is set | Code entrypoint |
| --- | --- | --- | --- |
| **Mobile** | `EXPO_PUBLIC_SENTRY_DSN` | `.env.local` → `npm run sync-eas-env` → EAS | `src/lib/sentry.ts`, boot in `app/_layout.tsx` |
| **Edge Functions** | `SENTRY_DSN` | Supabase project secret | `supabase/functions/_shared/sentry.ts` |

If a DSN is missing, Sentry is a **no-op** (app and functions keep working).

---

## 1. Mobile app

### What is captured

- Unhandled JS errors and native crashes (`@sentry/react-native`).
- Explicit calls elsewhere in the app: `Sentry.captureException`, `Sentry.captureMessage`, `Sentry.addBreadcrumb` (recording, upload, playback — see `docs/CHAT_AUDIO.md`).

`Sentry.wrap(RootLayout)` in `app/_layout.tsx` adds navigation-related instrumentation when the client is initialised.

### Behaviour

- **Disabled in `__DEV__`** so local runs do not pollute the project.
- **No performance tracing** (`tracesSampleRate: 0`).
- **`sendDefaultPii: false`** — no automatic IP/email from the SDK.

### PII scrubbing (before events leave the device)

Configured in `src/lib/sentry.ts` via `beforeBreadcrumb` and `beforeSend`:

| Redacted | Kept for Phase 8 audio debug |
| --- | --- |
| Keys: `body_text`, `transcript`, `push_token`, `display_name`, `phone`, `email`, `free_text` | Breadcrumb data keys: `conversationId`, `messageId`, `objectPath`, `sourceUuid`, `objectUuid` |
| Emails and UUIDs in generic strings / URLs (incl. PostgREST `id=eq.<uuid>`) | Values under the audio-debug keys above (UUIDs in those fields are **not** stripped) |

`event.user` is stripped of `email`, `ip_address`, and `username` before send.

### Setup (developer)

1. Copy the DSN from Sentry → **Settings → Client Keys (DSN)**.
2. Add to `.env.local`:

   ```bash
   EXPO_PUBLIC_SENTRY_DSN=https://…@….ingest.de.sentry.io/…
   ```

3. `npm run sync-eas-env` so TestFlight/production builds receive the variable.

---

## 2. Edge Functions

### Wrapped functions

All user-facing handlers use `withSentry()` around `Deno.serve`:

`delete_account`, `delete_account_admin`, `request_upload`, `commit_upload`, `dispatch_push`, `ban_user`, `unban_user`, `moderate`, `dismiss_report`.

### What is sent to Sentry

| Sent | Not sent |
| --- | --- |
| **Uncaught exceptions** in the handler (`withSentry` → 500 JSON + `captureException`) | Expected **4xx** responses (`return json({ error: … }, 4xx)`) |
| Selected **handled 500s** via `captureEdgeException` (today: rate-limit RPC failure in `request_upload`) | Normal business skips in `dispatch_push` (no token, already pushed, etc.) |

Console `console.error` on internal failures without `captureEdgeException` still only appears in Supabase function logs, not Sentry.

### PII scrubbing

`scrubEdgeContext()` (`supabase/functions/_shared/scrubContext.ts`) runs on all extras:

- Sensitive keys → `[redacted]`: `email`, `display_name`, `push_token`, `phone`, `body_text`, `free_text`.
- UUIDs in other string values → `[uuid]`.

### Setup (operator)

1. Same DSN as mobile, or a separate Sentry project for “server”.
2. Link the Supabase CLI to the project, then:

   ```bash
   npx supabase secrets set SENTRY_DSN="https://…@….ingest.de.sentry.io/…"
   ```

3. Deploy functions (secret is picked up on deploy):

   ```bash
   supabase functions deploy delete_account delete_account_admin request_upload commit_upload dispatch_push ban_user unban_user moderate dismiss_report
   ```

Optional local serve with Sentry:

```bash
SENTRY_DSN="https://…" supabase functions serve request_upload
```

---

## 3. Tests

```bash
npm run test:edge    # includes scrubEdgeContext_test.ts
npm test             # includes src/lib/__tests__/sentryScrub.test.ts
```

Edge tests use `supabase/functions/deno.json` and devDependency `@sentry/deno` (types/bundle resolution only; scrub tests do not call the network).

---

## 4. Out of scope (Phase 9)

- PostHog / product analytics.
- Sentry on the admin back-office (`lovoice-admin`).
- Performance tracing or custom rewrite of every chat breadcrumb.
- Replacing all `console.error` paths with `captureEdgeException` (add case-by-case when a 500 should be visible in Sentry).

---

## 5. File map

| File | Role |
| --- | --- |
| `src/lib/sentry.ts` | Mobile init, scrub hooks, exports scrub helpers for tests |
| `src/lib/__tests__/sentryScrub.test.ts` | Mobile scrub unit tests |
| `supabase/functions/_shared/sentry.ts` | `withSentry`, `captureEdgeException`, init |
| `supabase/functions/_shared/scrubContext.ts` | Pure scrub helper (no SDK import) |
| `supabase/functions/_shared/__tests__/scrubEdgeContext_test.ts` | Edge scrub unit tests |
