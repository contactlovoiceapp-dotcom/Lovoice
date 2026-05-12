# Edge Function Smoke Test Plan

End-to-end curl walkthrough for `request_upload` and `commit_upload`.  
All commands assume a locally running Supabase stack (`npx supabase start`).

---

## 0. Obtain a JWT for a test user

Follow the instructions in **README.md §7** ("Resetting a dev account") to provision a test user.  
Then sign in via the Supabase Auth REST API to get a session:

```bash
JWT=$(curl -sS -X POST \
  "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phone": "+33XXXXXXXXX", "password": "your-otp-or-password"}' \
  | jq -r '.access_token')

echo "JWT: $JWT"
```

> For phone OTP flows, use the magic-link or admin-createUser approach documented in the Supabase CLI docs.  
> Alternatively, use the Supabase Dashboard → Authentication → Users → "Send Magic Link" for a test email user.

---

## 1. Request a signed upload URL (`request_upload`)

```bash
curl -sS -X POST \
  "http://127.0.0.1:54321/functions/v1/request_upload" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"kind": "voice", "durationMs": 45000}' \
  | jq .
```

### Expected response (200)

```json
{
  "objectPath": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy.m4a",
  "signedUrl": "https://xxxx.supabase.co/storage/v1/object/upload/sign/voices/...",
  "token": "..."
}
```

Save the values for the next steps:

```bash
OBJECT_PATH="<objectPath from response>"
SIGNED_URL="<signedUrl from response>"
```

---

## 2. PUT the audio file directly to Storage

The client sends the file directly — the Edge Function never proxies audio bytes.

```bash
curl -sS -X PUT "$SIGNED_URL" \
  -H "Content-Type: audio/mp4" \
  --data-binary @/path/to/test-audio.m4a \
  -w "\nHTTP %{http_code}\n"
```

### Expected response

HTTP 200 with an empty or minimal JSON body from Supabase Storage.

---

## 3. Commit the upload (`commit_upload`)

```bash
curl -sS -X POST \
  "http://127.0.0.1:54321/functions/v1/commit_upload" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{
    \"kind\": \"voice\",
    \"objectPath\": \"$OBJECT_PATH\",
    \"durationMs\": 45000,
    \"title\": \"Ma première voix\",
    \"theme\": \"sunset\"
  }" \
  | jq .
```

### Expected response (200)

```json
{
  "voice": {
    "id": "...",
    "user_id": "...",
    "storage_path": "...",
    "duration_ms": 45000,
    "title": "Ma première voix",
    "theme": "sunset",
    "status": "approved",
    "is_active": true,
    "created_at": "..."
  }
}
```

---

## 4. Error cases

### 4.1 Banned user

Manually set `is_banned = true` in the `profiles` table for the test user, then call `request_upload`:

```bash
curl -sS -X POST \
  "http://127.0.0.1:54321/functions/v1/request_upload" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"kind": "voice", "durationMs": 45000}' \
  | jq .
```

**Expected:** HTTP 403 `{ "error": "banned" }`

### 4.2 Duration out of range

```bash
curl -sS -X POST \
  "http://127.0.0.1:54321/functions/v1/request_upload" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"kind": "voice", "durationMs": 999999}' \
  | jq .
```

**Expected:** HTTP 400 `{ "error": "duration_invalid" }`

### 4.3 Wrong owner on commit

Obtain a second test user JWT (`JWT2`), request an upload URL, then try to commit it using `JWT`:

```bash
curl -sS -X POST \
  "http://127.0.0.1:54321/functions/v1/commit_upload" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{
    \"kind\": \"voice\",
    \"objectPath\": \"$OTHER_USER_OBJECT_PATH\",
    \"durationMs\": 45000
  }" \
  | jq .
```

**Expected:** HTTP 403 `{ "error": "path_ownership_denied" }`

### 4.4 Object not uploaded (missing storage object)

Commit with a valid path format but for a file that was never PUT:

```bash
curl -sS -X POST \
  "http://127.0.0.1:54321/functions/v1/commit_upload" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{
    \"kind\": \"voice\",
    \"objectPath\": \"$(echo $JWT | jq -R 'split(".")[1] | @base64d | fromjson | .sub' -r)/00000000-0000-0000-0000-000000000000.m4a\",
    \"durationMs\": 45000
  }" \
  | jq .
```

**Expected:** HTTP 400 `{ "error": "object_not_found" }`

### 4.5 Oversized file

PUT a file larger than 6 MB, then call `commit_upload` with that path.

**Expected:** HTTP 400 `{ "error": "file_too_large" }`

### 4.6 Missing or invalid JWT

```bash
curl -sS -X POST \
  "http://127.0.0.1:54321/functions/v1/request_upload" \
  -H "Content-Type: application/json" \
  -d '{"kind": "voice", "durationMs": 10000}' \
  | jq .
```

**Expected:** HTTP 401 `{ "error": "unauthorized" }`

### 4.7 Invalid theme

```bash
curl -sS -X POST \
  "http://127.0.0.1:54321/functions/v1/commit_upload" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{
    \"kind\": \"voice\",
    \"objectPath\": \"$OBJECT_PATH\",
    \"durationMs\": 45000,
    \"theme\": \"neon\"
  }" \
  | jq .
```

**Expected:** HTTP 400 `{ "error": "theme_invalid" }`

---

## 5. Run Edge Functions locally

```bash
npx supabase functions serve request_upload --env-file supabase/.env.local
npx supabase functions serve commit_upload --env-file supabase/.env.local
```

Create `supabase/.env.local` (never commit) with:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<from supabase status>
```
