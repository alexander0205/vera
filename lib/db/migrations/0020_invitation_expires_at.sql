-- Add 24h expiry to invitations
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "expires_at" timestamp;
UPDATE "invitations" SET "expires_at" = "invited_at" + interval '24 hours' WHERE "expires_at" IS NULL;
ALTER TABLE "invitations" ALTER COLUMN "expires_at" SET NOT NULL;
