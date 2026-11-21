-- A native guest's public user id is never a web-cookie credential. Preserve the
-- boundary after refresh revocation and eventual native-session retention cleanup.
ALTER TABLE "users" ADD COLUMN "nativeGuest" BOOLEAN NOT NULL DEFAULT false;
