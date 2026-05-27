// Syncs local public Expo environment variables to EAS Build environments.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const environments = ["production", "preview", "development"] as const;
const envFilePath = resolve(process.cwd(), ".env.local");
const envExamplePath = resolve(process.cwd(), ".env.example");

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}`);
  }

  const values: Record<string, string> = {};
  const envFile = readFileSync(path, "utf8");

  for (const rawLine of envFile.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    values[key] = value;
  }

  return values;
}

const requiredKeys = Object.keys(readEnvFile(envExamplePath));
const localEnv = readEnvFile(envFilePath);
const missingLocalValues = requiredKeys.filter((key) => !localEnv[key]);

if (missingLocalValues.length > 0) {
  console.error(
    `Missing local value(s) in .env.local: ${missingLocalValues.join(", ")}.`,
  );
  process.exit(1);
}

// Also push any optional EXPO_PUBLIC_* keys present in .env.local but not declared
// in .env.example (e.g. EXPO_PUBLIC_SENTRY_DSN). Keeps the .env.example contract
// minimal for new contributors while letting opt-in services flow to EAS Builds.
const optionalKeys = Object.keys(localEnv).filter(
  (key) =>
    key.startsWith("EXPO_PUBLIC_") &&
    !requiredKeys.includes(key) &&
    localEnv[key].length > 0,
);
const keysToSync = [...requiredKeys, ...optionalKeys];

for (const key of keysToSync) {
  const args = [
    "eas",
    "env:create",
    "--scope",
    "project",
    "--name",
    key,
    "--value",
    localEnv[key],
    "--visibility",
    key.includes("KEY") || key.includes("TOKEN") || key.includes("SECRET")
      ? "sensitive"
      : "plaintext",
    "--type",
    "string",
    "--force",
    "--non-interactive",
    ...environments.flatMap((environment) => ["--environment", environment]),
  ];

  const result = spawnSync("npx", args, {
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
