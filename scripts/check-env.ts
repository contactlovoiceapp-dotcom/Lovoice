// Verifies that every variable listed in .env.example is available locally.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envFilePath = resolve(process.cwd(), ".env.local");
const envExamplePath = resolve(process.cwd(), ".env.example");

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {};
  }

  const envFile = readFileSync(path, "utf8");
  const values: Record<string, string> = {};

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

const localEnv = readEnvFile(envFilePath);

for (const [key, value] of Object.entries(localEnv)) {
  process.env[key] ??= value;
}

const requiredEnvVars = Object.keys(readEnvFile(envExamplePath));

if (requiredEnvVars.length === 0) {
  console.error("No required environment variables found in .env.example.");
  process.exitCode = 1;
} else {
  const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);

  if (missingEnvVars.length > 0) {
    console.error(
      `Missing required environment variable(s): ${missingEnvVars.join(", ")}.`,
    );
    console.error(
      "Create or update .env.local with every variable listed in .env.example.",
    );
    process.exitCode = 1;
  } else {
    console.log("Required environment variables are present.");
  }
}
