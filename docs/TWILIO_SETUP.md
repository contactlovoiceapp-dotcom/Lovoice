<!-- Documents the manual Twilio Verify and Supabase Phone Auth setup for Phase 2. -->

# Twilio Verify Setup

Phase 2 uses Supabase Auth phone OTP backed by Twilio Verify. These steps are manual because the Twilio credentials must never be committed to the repository.

## Prerequisites

- A Twilio account with billing enabled.
- A Twilio Verify Service dedicated to Lovoice.
- Access to the Lovoice Supabase project in the Frankfurt region.
- One real French, Belgian, or Swiss phone number for the first device test.

## Twilio

1. Open the Twilio Console.
2. Create or select a Verify Service for Lovoice.
3. Copy these values and keep them in a password manager:
   - Account SID
   - Auth Token
   - Verify Service SID
4. In the Verify Service settings, keep SMS enabled.
5. Configure the service name shown in SMS messages as `Lovoice`.

## Supabase Auth

1. Open the Supabase Dashboard for the Lovoice project.
2. Go to `Authentication` -> `Providers` -> `Phone`.
3. Enable the Phone provider.
4. Select Twilio Verify as the SMS provider.
5. Enter the Twilio Account SID, Auth Token, and Verify Service SID from the password manager.
6. Save the provider settings.

Supabase Auth stores these provider credentials outside the mobile app and outside this repository. Do not add Twilio credentials to EAS secrets, `.env` files, or `app.config.ts`.

## Country Gating

The mobile app only offers France, Belgium, and Switzerland in the phone UI. The helper in `src/features/auth/helpers/country.ts` also rejects unsupported E.164 prefixes before calling Supabase Auth:

- `+33` -> `FR`
- `+32` -> `BE`
- `+41` -> `CH`

The database enforces the same country allowlist on `profiles.country`. The Phase 2 migration adds an explicit trigger error on top of the existing table check constraint.

## Manual Test Plan

1. Start the app on a real device.
2. Request an OTP for a valid French number.
3. Confirm that the SMS arrives and that a valid 6-digit code signs the user in.
4. Repeat the request flow with one Belgian or Swiss test number if available.
5. Try a non-supported country prefix such as `+1`; the app must block it before sending an OTP.
6. Sign out, restart the app, and confirm the previous session behavior matches the expected auth state.

## Troubleshooting

- If SMS does not arrive, check the Twilio Verify logs first.
- If Supabase returns a provider error, re-check the Account SID, Auth Token, and Verify Service SID in the Phone provider settings.
- If a supported number is rejected by the app, verify that it is formatted as E.164 and starts with `+33`, `+32`, or `+41`.
- If profile creation fails after OTP, check RLS policies and confirm the authenticated user inserts only a row where `profiles.id = auth.uid()`.
