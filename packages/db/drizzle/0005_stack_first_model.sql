DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'stacks_project_id_projects_id_fk'
	) THEN
		ALTER TABLE "stacks" DROP CONSTRAINT "stacks_project_id_projects_id_fk";
	END IF;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "stacks_project_idx";
--> statement-breakpoint
ALTER TABLE "stacks" DROP COLUMN IF EXISTS "project_id";
--> statement-breakpoint
DROP INDEX IF EXISTS "projects_slug_unique";
--> statement-breakpoint
DROP TABLE IF EXISTS "projects";
