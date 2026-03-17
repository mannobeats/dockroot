-- Volume backup / restore support
CREATE TYPE "public"."volume_backup_status" AS ENUM('in_progress', 'completed', 'failed');

CREATE TABLE IF NOT EXISTS "volume_backups" (
	"id" text PRIMARY KEY NOT NULL,
	"environment_id" text NOT NULL REFERENCES "environments"("id") ON DELETE CASCADE,
	"volume_name" text NOT NULL,
	"file_name" text NOT NULL,
	"size_bytes" integer,
	"status" "volume_backup_status" DEFAULT 'in_progress' NOT NULL,
	"error" text,
	"created_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"created_at" timestamp NOT NULL,
	"completed_at" timestamp
);

CREATE INDEX IF NOT EXISTS "volume_backups_environment_idx" ON "volume_backups" USING btree ("environment_id");
CREATE INDEX IF NOT EXISTS "volume_backups_volume_name_idx" ON "volume_backups" USING btree ("volume_name");
CREATE INDEX IF NOT EXISTS "volume_backups_user_idx" ON "volume_backups" USING btree ("created_by_user_id");
