-- Rename users.role → users.platform_role (clarity vs team_members.role)
-- Also rename value 'owner' → 'admin' for platform admins
ALTER TABLE "users" RENAME COLUMN "role" TO "platform_role";
UPDATE "users" SET "platform_role" = 'admin' WHERE "platform_role" = 'owner';
