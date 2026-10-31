-- The desktop's signature over its RSA encryption key travels with the pairing
-- so the phone can verify the key it is about to seal commands to. Format
-- "<base64 signature>.<context>", at most 512 characters, checked by the worker.
-- Pairings created before this migration (or by an old desktop) keep NULL.
ALTER TABLE connected_pairing ADD COLUMN desktop_key_proof TEXT;
