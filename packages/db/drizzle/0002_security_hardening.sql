ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;
--> statement-breakpoint
WITH "first_user" AS (
	SELECT "id"
	FROM "user"
	ORDER BY "created_at" ASC
	LIMIT 1
)
UPDATE "user"
SET "role" = 'owner'
WHERE "id" IN (SELECT "id" FROM "first_user")
  AND NOT EXISTS (
		SELECT 1
		FROM "user"
		WHERE "role" = 'owner'
	);
