// Dev-only script — seeds a conversation where someone sent a voice and awaits your reply.
// Useful for testing the recipient reply flow in Messages without a second device.
//
// Usage:
//   npx tsx scripts/seed-test-conversation.ts +33786532098
//   npx tsx scripts/seed-test-conversation.ts +33786532098 --sender +33099900001
//
// Prerequisites:
//   SUPABASE_SECRET_KEY in .env.local
//   Run `npx tsx scripts/seed-test-feed.ts` first if the default sender (Camille) does not exist.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const sep = line.indexOf("=");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    process.env[key] ??= value;
  }
}

loadEnvLocal();

const supabaseUrl = process.env["EXPO_PUBLIC_SUPABASE_URL"];
const secretKey = process.env["SUPABASE_SECRET_KEY"];

if (!supabaseUrl || !secretKey) {
  console.error("Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

const recipientPhone = process.argv[2];
const senderFlagIndex = process.argv.indexOf("--sender");
const senderPhone = senderFlagIndex !== -1 ? process.argv[senderFlagIndex + 1] : "+33099900001";

if (!recipientPhone || !/^\+\d{7,15}$/.test(recipientPhone)) {
  console.error("Usage: npx tsx scripts/seed-test-conversation.ts +33XXXXXXXXX [--sender +33YYYYYYYYYY]");
  process.exit(1);
}

if (!senderPhone || !/^\+\d{7,15}$/.test(senderPhone)) {
  console.error("Invalid --sender phone. Must be E.164, e.g. +33099900001");
  process.exit(1);
}

const admin = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function normalizedPhone(phone: string): string {
  return phone.replace(/^\+/, "");
}

async function findUserByPhone(phone: string): Promise<{ id: string; phone: string | undefined }> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  const target = normalizedPhone(phone);
  const user = data.users.find((u) => u.phone === target);
  if (!user) throw new Error(`No auth user found for ${phone}`);
  return { id: user.id, phone: user.phone };
}

async function findAudioSourcePath(senderId: string): Promise<string> {
  const { data: senderVoice, error: senderErr } = await admin
    .from("voices")
    .select("storage_path")
    .eq("user_id", senderId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (senderErr) throw new Error(`voice lookup failed: ${senderErr.message}`);
  if (senderVoice?.storage_path) return senderVoice.storage_path;

  const { data: fallback, error: fallbackErr } = await admin
    .from("voices")
    .select("storage_path")
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();
  if (fallbackErr) throw new Error(`fallback voice lookup failed: ${fallbackErr.message}`);
  if (!fallback?.storage_path) {
    throw new Error("No voice file in storage to clone. Record a voice from the app first.");
  }
  return fallback.storage_path;
}

async function run(): Promise<void> {
  console.log(`\nSeeding awaiting-reply conversation for ${recipientPhone}...\n`);

  const recipient = await findUserByPhone(recipientPhone);
  const sender = await findUserByPhone(senderPhone);

  const { data: recipientProfile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", recipient.id)
    .single();
  const { data: senderProfile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", sender.id)
    .single();

  console.log(`Recipient: ${recipientProfile?.display_name ?? "?"} (${recipientPhone})`);
  console.log(`Sender:    ${senderProfile?.display_name ?? "?"} (${senderPhone})\n`);

  const userA = sender.id < recipient.id ? sender.id : recipient.id;
  const userB = sender.id < recipient.id ? recipient.id : sender.id;

  const { data: existing, error: existingErr } = await admin
    .from("conversations")
    .select("id")
    .eq("user_a", userA)
    .eq("user_b", userB)
    .maybeSingle();
  if (existingErr) throw new Error(`conversation lookup failed: ${existingErr.message}`);

  if (existing) {
    const { error: deleteMsgsErr } = await admin.from("messages").delete().eq("conversation_id", existing.id);
    if (deleteMsgsErr) throw new Error(`message cleanup failed: ${deleteMsgsErr.message}`);

    const { error: deleteConvErr } = await admin.from("conversations").delete().eq("id", existing.id);
    if (deleteConvErr) throw new Error(`conversation cleanup failed: ${deleteConvErr.message}`);

    console.log(`↺ Removed existing conversation ${existing.id}`);
  }

  const { data: conversation, error: convErr } = await admin
    .from("conversations")
    .insert({
      user_a: userA,
      user_b: userB,
      initiator_id: sender.id,
      last_message_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (convErr || !conversation) {
    throw new Error(`conversation insert failed: ${convErr?.message ?? "no row"}`);
  }

  const fileUuid = randomUUID();
  const voicePath = `${conversation.id}/${fileUuid}.m4a`;
  const sourcePath = await findAudioSourcePath(sender.id);

  const { data: blob, error: downloadErr } = await admin.storage.from("voices").download(sourcePath);
  if (downloadErr || !blob) {
    throw new Error(`audio download failed: ${downloadErr?.message ?? "empty blob"}`);
  }

  const { error: uploadErr } = await admin.storage.from("messages").upload(voicePath, blob, {
    contentType: "audio/mp4",
    upsert: true,
  });
  if (uploadErr) throw new Error(`audio upload failed: ${uploadErr.message}`);

  const { data: message, error: msgErr } = await admin
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      sender_id: sender.id,
      kind: "voice",
      voice_path: voicePath,
      voice_duration_ms: 12_000,
      status: "approved",
    })
    .select()
    .single();
  if (msgErr || !message) {
    throw new Error(`message insert failed: ${msgErr?.message ?? "no row"}`);
  }

  console.log("✓ Conversation created");
  console.log(`  ID:        ${conversation.id}`);
  console.log(`  State:     awaiting_reply (first_reply_at is null)`);
  console.log(`  Message:   ${message.id}`);
  console.log(`  Audio:     messages/${voicePath}`);
  console.log("\nOpen the Messages tab — you should see the sender and be able to reply with a vocal.\n");
}

run().catch((err: unknown) => {
  console.error("\nError:", err instanceof Error ? err.message : err);
  process.exit(1);
});
