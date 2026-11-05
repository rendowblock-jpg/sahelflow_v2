-- Phone token lifetime and rotation (W4SEC-05). Nothing here is applied by the code: the owner applies it, BEFORE the worker that reads it.
-- token_issued_at          when the current token was issued (milliseconds since the epoch)
-- prev_token_hash          SHA-256 of the token the last swap replaced; still accepted until prev_token_valid_until
-- prev_token_valid_until   end of that grace window (milliseconds since the epoch)
-- Additive and nullable, so the worker that is running today keeps working on the migrated database (it names its columns).
ALTER TABLE connected_device ADD COLUMN token_issued_at INTEGER;
ALTER TABLE connected_device ADD COLUMN prev_token_hash TEXT;
ALTER TABLE connected_device ADD COLUMN prev_token_valid_until INTEGER;
-- Every phone paired before this migration gets a full fresh lifetime counted from the day it runs, so the migration can not lock one out.
-- (A row added later by the old worker keeps NULL; the new worker stamps it at its first use.)
UPDATE connected_device SET token_issued_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE token_issued_at IS NULL;
