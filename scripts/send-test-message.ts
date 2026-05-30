// Dev-only script — sends a basic TEXT message into an EXISTING conversation.
// Unlike seed-test-conversation.ts it never creates, deletes, or resets a
// conversation: it only inserts message rows (useful to fire Realtime INSERTs
// while testing the inbox / conversation UI).
//
// Usage:
//   npx tsx scripts/send-test-message.ts +33786532098
//   npx tsx scripts/send-test-message.ts +33786532098 --sender +33099900002
//   npx tsx scripts/send-test-message.ts +33786532098 --sender +33099900002 --text "Coucou"
//   npx tsx scripts/send-test-message.ts +33786532098 --count 3
//   npx tsx scripts/send-test-message.ts --conv <conversationId> --sender +33099900001
//
// Prerequisites:
//   SUPABASE_SECRET_KEY in .env.local
//   A conversation must already exist between the two users (from the app or
//   seed-test-conversation.ts — run that script once only to bootstrap).
//
// Note: text is only allowed by enforce_message_rules() once the conversation
// is OPEN (first_reply_at set AND >= 24h old). The trigger is NOT bypassed by
// the service-role key, so this script back-dates first_reply_at when needed.

import { createClient } from "@supabase/supabase-js";
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
const customText = getFlag("text");
const count = Math.max(1, Number.parseInt(getFlag("count") ?? "1", 10) || 1);

// Spacing between sends so each INSERT is observable distinctly in the app/Metro.
const SEND_INTERVAL_MS = 600;

if (!recipientPhone && !convIdFlag) {
  console.error(
    "Usage: npx tsx scripts/send-test-message.ts +33XXXXXXXXX [--sender +33YYYYYYYYYY] [--text \"...\"] [--count N]\n" +
      "   or: npx tsx scripts/send-test-message.ts --conv <conversationId> [--sender +33YYYYYYYYYY] [--text \"...\"] [--count N]",
  );
  process.exit(1);
}

if (recipientPhone && !/^\+\d{7,15}$/.test(recipientPhone)) {
  console.error("Invalid recipient phone. Must be E.164, e.g. +33786532098");
  process.exit(1);
}

if (!/^\+\d{7,15}$/.test(senderPhone)) {
  console.error("Invalid --sender phone. Must be E.164, e.g. +33099900001");
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
        `Open one from the app, or seed once: npx tsx scripts/seed-test-conversation.ts ${recipientPhone} --sender ${senderPhone}`,
    );
  }
  return data as ConversationRow;
}

// Back-date first_reply_at so the conversation is OPEN and text is accepted by
// enforce_message_rules(). Returns true if it had to mutate the row.
async function ensureTextUnlocked(conv: ConversationRow): Promise<boolean> {
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  const isOpen =
    conv.first_reply_at !== null &&
    Date.now() - new Date(conv.first_reply_at).getTime() >= TWENTY_FOUR_HOURS_MS;
  if (isOpen) return false;

  const backdated = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const { error } = await admin
    .from("conversations")
    .update({ first_reply_at: backdated })
    .eq("id", conv.id);
  if (error) throw new Error(`failed to unlock text (first_reply_at): ${error.message}`);
  return true;
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
  if ((msgCount ?? 0) === 0) {
    throw new Error(
      `Conversation ${conv.id} has no messages yet — the first message must be a voice.\n` +
        `Seed it first: npx tsx scripts/seed-test-conversation.ts ${recipientPhone ?? "<phone>"}`,
    );
  }

  const unlocked = await ensureTextUnlocked(conv);

  const { data: senderProfile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", senderId)
    .single();

  console.log(`\nSending ${count} text message(s) to conversation ${conv.id}`);
  console.log(`  From: ${senderProfile?.display_name ?? "?"} (${senderPhone})`);
  if (unlocked) {
    console.log("  ↪ back-dated first_reply_at to unlock text (conversation is now OPEN)");
  }
  console.log("");

  for (let i = 0; i < count; i++) {
    const bodyText =
      customText ?? `Test ${new Date().toLocaleTimeString()}${count > 1 ? ` #${i + 1}` : ""}`;

    const { data: message, error: msgErr } = await admin
      .from("messages")
      .insert({
        conversation_id: conv.id,
        sender_id: senderId,
        kind: "text",
        body_text: bodyText,
        status: "approved",
      })
      .select("id")
      .single();
    if (msgErr || !message) {
      throw new Error(`message insert failed: ${msgErr?.message ?? "no row"}`);
    }

    console.log(`✓ Sent "${bodyText}"  (${message.id})`);

    if (i < count - 1) {
      await new Promise((r) => setTimeout(r, SEND_INTERVAL_MS));
    }
  }

  console.log("\nDone. Watch the conversation/inbox update via Realtime.\n");
}

run().catch((err: unknown) => {
  console.error("\nError:", err instanceof Error ? err.message : err);
  process.exit(1);
});
