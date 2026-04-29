<!-- Documents the manual EAS secret commands needed for Supabase public config. -->

# EAS Secrets

Run these commands manually before launching EAS builds:

```bash
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://oqpilxfcapyopzivcval.supabase.co" --scope project
eas secret:create --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value "<publishable-key>" --scope project
```

Do not create or store `service_role`, `sb_secret_...`, or database password values in EAS secrets for the mobile app.
