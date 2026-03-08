CREATE TABLE "instance_bootstrap" (
	"key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
WITH "promoted" AS (
	UPDATE "user"
	SET "role" = 'owner'
	WHERE "id" = (
		SELECT "id"
		FROM "user"
		ORDER BY "created_at" ASC
		LIMIT 1
	)
	  AND NOT EXISTS (
		SELECT 1
		FROM "user"
		WHERE "role" = 'owner'
	)
	RETURNING "id"
)
INSERT INTO "instance_bootstrap" ("key")
SELECT 'owner-bootstrap'
WHERE EXISTS (
	SELECT 1
	FROM "user"
	WHERE "role" = 'owner'
)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE UNIQUE INDEX "user_single_owner_idx" ON "user" USING btree ("role") WHERE "role" = 'owner';
