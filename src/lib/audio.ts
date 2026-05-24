// Central audio configuration: format constants, AVAudioSession helpers, and upload sanity checks.

import { setAudioModeAsync, IOSOutputFormat, AudioQuality } from 'expo-audio';
import type { RecordingOptions } from 'expo-audio';

// AAC mono 32kbps 22050Hz — matches §3 "Audio format" and ARCHITECTURE §4.1 preset.
export const VOICE_AUDIO_FORMAT: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 32000,
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    extension: '.m4a',
    outputFormat: IOSOutputFormat.MPEG4AAC,
    // MEDIUM quality is sufficient for voice at 32kbps; MAX would waste CPU for no audible gain.
    audioQuality: AudioQuality.MEDIUM,
  },
  web: {
    mimeType: 'audio/mp4',
    bitsPerSecond: 32000,
  },
};

export const MAX_VOICE_DURATION_MS = 90_000;
export const MIN_VOICE_DURATION_MS = 10_000;
// Relaxed minimum for in-conversation voice messages — a quick "ouais" is fine.
export const MIN_VOICE_MESSAGE_DURATION_MS = 1_000;
// Server rejects anything over 2 MB (ARCHITECTURE §4.2 commit_upload validation).
// 90s at 32kbps mono ≈ 360 KB; 2 MB gives ample margin for codec overhead.
export const MAX_VOICE_FILE_SIZE_BYTES = 2_000_000;
// 50ms balances waveform UI smoothness against CPU wake-up frequency on mobile.
export const METERING_INTERVAL_MS = 50;

/**
 * Configures the AVAudioSession for recording.
 * Category playAndRecord with mixWithOthers lets us record while background audio keeps playing
 * (e.g. the user has music running) and routes correctly through Bluetooth headsets.
 */
export async function configureAudioSessionForRecording(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    interruptionMode: 'mixWithOthers',
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
  });
}

/**
 * Configures the AVAudioSession for playback only.
 * playsInSilentMode and shouldPlayInBackground satisfy README constraint #8 and ARCHITECTURE §4.4.
 */
export async function configureAudioSessionForPlayback(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    interruptionMode: 'mixWithOthers',
    shouldPlayInBackground: true,
    shouldRouteThroughEarpiece: false,
  });
}

/**
 * Returns true if the file size is within ±15% of what 32kbps mono would produce
 * for the given duration. Used as a pre-upload sanity check in commit_upload.
 * Expected: 4 bytes/ms (32_000 bits/s ÷ 8 = 4_000 bytes/s = 4 bytes/ms).
 */
export function estimateBitrateOk(sizeBytes: number, durationMs: number): boolean {
  if (durationMs <= 0) return false;
  const expectedBytes = 4 * durationMs;
  return sizeBytes >= expectedBytes * 0.85 && sizeBytes <= expectedBytes * 1.15;
}
