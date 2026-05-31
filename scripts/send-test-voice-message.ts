// Dev-only script — sends a voice message into an EXISTING conversation.
// Unlike seed-test-conversation.ts it never creates, deletes, or resets a
// conversation: it only inserts message rows (push + Realtime fire normally).
//
// Usage:
//   npx tsx scripts/send-test-voice-message.ts +33786532098 --sender +33679764618
//   npx tsx scripts/send-test-voice-message.ts +33786532098 --sender +33679764618 --count 3
//   npx tsx scripts/send-test-voice-message.ts --conv <conversationId> --sender +33679764618
//   npx tsx scripts/send-test-voice-message.ts +33786532098 --sender +33679764618 --duration-ms 8000
//
// Prerequisites:
//   SUPABASE_SECRET_KEY in .env.local
//   A conversation must already exist (from the app or seed-test-conversation.ts
//   run once to bootstrap). Respects enforce_message_rules() — no lifecycle hacks.

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

function getFlag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

const recipientPhone = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : undefined;
const convIdFlag = getFlag("conv");
const senderPhone = getFlag("sender") ?? "+33099900001";
const count = Math.max(1, Number.parseInt(getFlag("count") ?? "1", 10) || 1);
const durationMs = Math.max(1000, Number.parseInt(getFlag("duration-ms") ?? "6000", 10) || 6000);

const SEND_INTERVAL_MS = 600;

if (!recipientPhone && !convIdFlag) {
  console.error(
    "Usage: npx tsx scripts/send-test-voice-message.ts +33XXXXXXXXX [--sender +33YYYYYYYYYY] [--count N] [--duration-ms MS]\n" +
      "   or: npx tsx scripts/send-test-voice-message.ts --conv <conversationId> [--sender +33YYYYYYYYYY] [--count N]",
  );
  process.exit(1);
}

if (recipientPhone && !/^\+\d{7,15}$/.test(recipientPhone)) {
  console.error("Invalid recipient phone. Must be E.164, e.g. +33786532098");
  process.exit(1);
}

if (!/^\+\d{7,15}$/.test(senderPhone)) {
  console.error("Invalid --sender phone. Must be E.164, e.g. +33679764618");
  process.exit(1);
}

const admin = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function normalizedPhone(phone: string): string {
  return phone.replace(/^\+/, "");
}

async function findUserByPhone(phone: string): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  const target = normalizedPhone(phone);
  const user = data.users.find((u) => u.phone === target);
  if (!user) throw new Error(`No auth user found for ${phone}`);
  return user.id;
}

interface ConversationRow {
  id: string;
  user_a: string;
  user_b: string;
  initiator_id: string;
  first_reply_at: string | null;
}

async function resolveConversation(senderId: string): Promise<ConversationRow> {
  if (convIdFlag) {
    const { data, error } = await admin
      .from("conversations")
      .select("id, user_a, user_b, initiator_id, first_reply_at")
      .eq("id", convIdFlag)
      .maybeSingle();
    if (error) throw new Error(`conversation lookup failed: ${error.message}`);
    if (!data) throw new Error(`No conversation found for id ${convIdFlag}`);
    return data as ConversationRow;
  }

  const recipientId = await findUserByPhone(recipientPhone as string);
  const userA = senderId < recipientId ? senderId : recipientId;
  const userB = senderId < recipientId ? recipientId : senderId;

  const { data, error } = await admin
    .from("conversations")
    .select("id, user_a, user_b, initiator_id, first_reply_at")
    .eq("user_a", userA)
    .eq("user_b", userB)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`conversation lookup failed: ${error.message}`);
  if (!data) {
    throw new Error(
      `No conversation between ${senderPhone} and ${recipientPhone}.\n` +
        `Bootstrap once: npx tsx scripts/seed-test-conversation.ts ${recipientPhone} --sender ${senderPhone}`,
    );
  }
  return data as ConversationRow;
}

async function findAudioSource(
  senderId: string,
  conversationId: string,
): Promise<{ path: string; bucket: "messages" | "voices" }> {
  const { data: convVoice, error: convErr } = await admin
    .from("messages")
    .select("voice_path")
    .eq("conversation_id", conversationId)
    .eq("kind", "voice")
    .not("voice_path", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (convErr) throw new Error(`conversation voice lookup failed: ${convErr.message}`);
  if (convVoice?.voice_path) {
    return { path: convVoice.voice_path, bucket: "messages" };
  }

  const { data: senderVoice, error: senderErr } = await admin
    .from("voices")
    .select("storage_path")
    .eq("user_id", senderId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (senderErr) throw new Error(`voice lookup failed: ${senderErr.message}`);
  if (senderVoice?.storage_path) {
    return { path: senderVoice.storage_path, bucket: "voices" };
  }

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
  return { path: fallback.storage_path, bucket: "voices" };
}

function describeLifecycle(conv: ConversationRow, senderId: string, msgCount: number): string {
  if (msgCount === 0) return "empty";
  if (conv.first_reply_at === null) {
    return senderId === conv.initiator_id ? "awaiting_reply (initiator blocked)" : "awaiting_reply";
  }
  const voiceOnlyUntil = new Date(conv.first_reply_at).getTime() + 24 * 60 * 60 * 1000;
  if (Date.now() < voiceOnlyUntil) return "voice_only";
  return "open";
}

function assertCanSendVoice(conv: ConversationRow, senderId: string, msgCount: number): void {
  if (msgCount === 0) {
    throw new Error(
      `Conversation ${conv.id} has no messages yet — the first message must be sent from the app ` +
        `or via seed-test-conversation.ts (once).`,
    );
  }

  if (conv.first_reply_at === null && senderId === conv.initiator_id) {
    throw new Error(
      "Conversation is awaiting the other participant's first voice reply.\n" +
        "Use --sender with their phone, not yours.",
    );
  }
}

async function uploadVoiceClone(
  conversationId: string,
  source: { path: string; bucket: "messages" | "voices" },
): Promise<string> {
  const voicePath = `${conversationId}/${randomUUID()}.m4a`;

  const { data: blob, error: downloadErr } = await admin.storage
    .from(source.bucket)
    .download(source.path);
  if (downloadErr || !blob) {
    throw new Error(
      `audio download failed (${source.bucket}/${source.path}): ${downloadErr?.message ?? "empty blob"}`,
    );
  }

  const { error: uploadErr } = await admin.storage.from("messages").upload(voicePath, blob, {
    contentType: "audio/mp4",
    upsert: true,
  });
  if (uploadErr) throw new Error(`audio upload failed: ${uploadErr.message}`);

  return voicePath;
}

async function run(): Promise<void> {
  const senderId = await findUserByPhone(senderPhone);
  const conv = await resolveConversation(senderId);

  if (senderId !== conv.user_a && senderId !== conv.user_b) {
    throw new Error(`Sender ${senderPhone} is not a participant of conversation ${conv.id}`);
  }

  const { count: msgCount, error: countErr } = await admin
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conv.id);
  if (countErr) throw new Error(`message count failed: ${countErr.message}`);

  assertCanSendVoice(conv, senderId, msgCount ?? 0);

  const { data: senderProfile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", senderId)
    .single();

  const lifecycle = describeLifecycle(conv, senderId, msgCount ?? 0);
  const audioSource = await findAudioSource(senderId, conv.id);

  console.log(`\nSending ${count} voice message(s) to conversation ${conv.id}`);
  console.log(`  From:       ${senderProfile?.display_name ?? "?"} (${senderPhone})`);
  console.log(`  Lifecycle:  ${lifecycle}`);
  console.log(`  Duration:   ${durationMs} ms`);
  console.log("");

  for (let i = 0; i < count; i++) {
    const voicePath = await uploadVoiceClone(conv.id, audioSource);

    const { data: message, error: msgErr } = await admin
      .from("messages")
      .insert({
        conversation_id: conv.id,
        sender_id: senderId,
        kind: "voice",
        voice_path: voicePath,
        voice_duration_ms: durationMs,
        status: "approved",
      })
      .select("id")
      .single();
    if (msgErr || !message) {
      throw new Error(`message insert failed: ${msgErr?.message ?? "no row"}`);
    }

    console.log(`✓ Sent voice  messages/${voicePath}  (${message.id})`);

    if (i < count - 1) {
      await new Promise((r) => setTimeout(r, SEND_INTERVAL_MS));
    }
  }

  console.log("\nDone. Push + Realtime should fire on each insert.\n");
}

run().catch((err: unknown) => {
  console.error("\nError:", err instanceof Error ? err.message : err);
  process.exit(1);
});
