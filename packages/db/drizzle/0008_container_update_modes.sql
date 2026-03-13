DO $$ BEGIN
 ALTER TYPE "public"."container_update_result" ADD VALUE IF NOT EXISTS 'major_available';
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."container_update_check_mode" AS ENUM('same_tag', 'include_major');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "container_update_schedules"
	ADD COLUMN IF NOT EXISTS "check_mode" "container_update_check_mode" DEFAULT 'same_tag' NOT NULL;

ALTER TABLE "container_update_states"
	ADD COLUMN IF NOT EXISTS "major_update_available" boolean DEFAULT false NOT NULL;
