ALTER TABLE "container_update_states"
	ADD COLUMN IF NOT EXISTS "major_target_image_ref" text;

ALTER TABLE "container_update_states"
	ADD COLUMN IF NOT EXISTS "major_target_tag" text;
