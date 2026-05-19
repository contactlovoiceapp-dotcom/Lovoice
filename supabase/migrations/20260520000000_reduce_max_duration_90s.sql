-- Reduce max voice/message duration from 5 min (300 000 ms) to 1 min 30 s (90 000 ms).
-- This tightens the CHECK constraints on voices.duration_ms and messages.voice_duration_ms.

-- voices.duration_ms: drop the existing constraint and recreate with the new limit.
ALTER TABLE public.voices
  DROP CONSTRAINT IF EXISTS voices_duration_ms_check;

ALTER TABLE public.voices
  ADD CONSTRAINT voices_duration_ms_check
  CHECK (duration_ms > 0 AND duration_ms <= 90000);

-- messages.voice_duration_ms: drop and recreate.
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_voice_duration_ms_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_voice_duration_ms_check
  CHECK (voice_duration_ms IS NULL OR (voice_duration_ms > 0 AND voice_duration_ms <= 90000));
