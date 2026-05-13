-- Add secure random token to invitations
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "token" varchar(64);

-- Backfill existing rows with a random token (two UUIDs without dashes = 64 hex chars)
UPDATE "invitations"
SET "token" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE "token" IS NULL;

-- Enforce NOT NULL and UNIQUE
ALTER TABLE "invitations" ALTER COLUMN "token" SET NOT NULL;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_token_unique" UNIQUE ("token");
