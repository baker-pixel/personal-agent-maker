-- Groq is the product-default TTS voice; browser speechSynthesis is only a
-- runtime fallback. The old column default ('browser') silently put users on
-- the flaky browser engine if their prefs row was created outside onboarding.
ALTER TABLE user_preferences ALTER COLUMN tts_provider SET DEFAULT 'groq';
UPDATE user_preferences SET tts_provider = 'groq' WHERE tts_provider IS DISTINCT FROM 'groq';
