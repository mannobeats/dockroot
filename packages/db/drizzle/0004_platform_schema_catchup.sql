CREATE TABLE IF NOT EXISTS "github_installations" (
	"id" text PRIMARY KEY NOT NULL,
	"github_installation_id" text NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text,
	"app_slug" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'github_installations_created_by_user_id_user_id_fk'
	) THEN
		ALTER TABLE "github_installations"
		ADD CONSTRAINT "github_installations_created_by_user_id_user_id_fk"
		FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id")
		ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "github_installations_github_installation_id_unique"
	ON "github_installations" USING btree ("github_installation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_installations_user_idx"
	ON "github_installations" USING btree ("created_by_user_id");
--> statement-breakpoint
ALTER TABLE "stacks" ADD COLUMN IF NOT EXISTS "github_installation_id" text;
--> statement-breakpoint
ALTER TABLE "stacks" ADD COLUMN IF NOT EXISTS "github_repository_id" text;
--> statement-breakpoint
ALTER TABLE "stacks" ADD COLUMN IF NOT EXISTS "github_env_path" text;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'stacks_github_installation_id_github_installations_id_fk'
	) THEN
		ALTER TABLE "stacks"
		ADD CONSTRAINT "stacks_github_installation_id_github_installations_id_fk"
		FOREIGN KEY ("github_installation_id") REFERENCES "public"."github_installations"("id")
		ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN IF NOT EXISTS "source_commit_sha" text;
