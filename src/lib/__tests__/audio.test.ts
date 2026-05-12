/* Tests for audio constants and the estimateBitrateOk sanity check. */

import {
  VOICE_AUDIO_FORMAT,
  MAX_VOICE_DURATION_MS,
  MIN_VOICE_DURATION_MS,
  MAX_VOICE_FILE_SIZE_BYTES,
  METERING_INTERVAL_MS,
  estimateBitrateOk,
} from '../audio';

describe('VOICE_AUDIO_FORMAT', () => {
  it('uses the correct top-level format config', () => {
    expect(VOICE_AUDIO_FORMAT.extension).toBe('.m4a');
    expect(VOICE_AUDIO_FORMAT.sampleRate).toBe(22050);
    expect(VOICE_AUDIO_FORMAT.numberOfChannels).toBe(1);
    expect(VOICE_AUDIO_FORMAT.bitRate).toBe(32000);
    expect(VOICE_AUDIO_FORMAT.isMeteringEnabled).toBe(true);
  });

  it('uses the correct iOS config', () => {
    expect(VOICE_AUDIO_FORMAT.ios.audioQuality).toBe(64); // AudioQuality.MEDIUM
    expect(VOICE_AUDIO_FORMAT.ios.extension).toBe('.m4a');
  });

  it('uses the correct Android config', () => {
    expect(VOICE_AUDIO_FORMAT.android.outputFormat).toBe('mpeg4');
    expect(VOICE_AUDIO_FORMAT.android.audioEncoder).toBe('aac');
    expect(VOICE_AUDIO_FORMAT.android.extension).toBe('.m4a');
  });
});

describe('audio constants', () => {
  it('MAX_VOICE_DURATION_MS is 5 minutes in ms', () => {
    expect(MAX_VOICE_DURATION_MS).toBe(300_000);
  });

  it('MIN_VOICE_DURATION_MS is 10 seconds in ms', () => {
    expect(MIN_VOICE_DURATION_MS).toBe(10_000);
  });

  it('MAX_VOICE_FILE_SIZE_BYTES matches server limit', () => {
    expect(MAX_VOICE_FILE_SIZE_BYTES).toBe(6_000_000);
  });

  it('METERING_INTERVAL_MS is 50ms', () => {
    expect(METERING_INTERVAL_MS).toBe(50);
  });
});

describe('estimateBitrateOk', () => {
  // At 32kbps mono, expected = 4 bytes/ms.
  // For 60_000ms: expected = 240_000 bytes.

  it('returns true for an exact-match file size', () => {
    const durationMs = 60_000;
    const exactBytes = 4 * durationMs; // 240_000
    expect(estimateBitrateOk(exactBytes, durationMs)).toBe(true);
  });

  it('returns true at the lower bound (85% of expected)', () => {
    const durationMs = 60_000;
    const lowerBound = Math.ceil(4 * durationMs * 0.85);
    expect(estimateBitrateOk(lowerBound, durationMs)).toBe(true);
  });

  it('returns true at the upper bound (115% of expected)', () => {
    const durationMs = 60_000;
    const upperBound = Math.floor(4 * durationMs * 1.15);
    expect(estimateBitrateOk(upperBound, durationMs)).toBe(true);
  });

  it('returns false when the file is too small (< 85% of expected)', () => {
    const durationMs = 60_000;
    const tooSmall = Math.floor(4 * durationMs * 0.84);
    expect(estimateBitrateOk(tooSmall, durationMs)).toBe(false);
  });

  it('returns false when the file is too large (> 115% of expected)', () => {
    const durationMs = 60_000;
    const tooBig = Math.ceil(4 * durationMs * 1.16);
    expect(estimateBitrateOk(tooBig, durationMs)).toBe(false);
  });

  it('returns false for zero duration to prevent division-by-zero issues', () => {
    expect(estimateBitrateOk(1000, 0)).toBe(false);
  });

  it('handles a 5-minute recording within expected range', () => {
    const fiveMin = 300_000;
    const expected = 4 * fiveMin; // 1_200_000 bytes = 1.2 MB
    expect(estimateBitrateOk(expected, fiveMin)).toBe(true);
    // A 5-min recording well under the 6 MB server limit.
    expect(expected).toBeLessThan(MAX_VOICE_FILE_SIZE_BYTES);
  });
});
