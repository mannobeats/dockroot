CREATE TABLE IF NOT EXISTS "github_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"github_app_id" text NOT NULL,
	"app_slug" text NOT NULL,
	"app_client_id" text,
	"app_client_secret_encrypted" text,
	"app_private_key_encrypted" text NOT NULL,
	"webhook_secret_encrypted" text NOT NULL,
	"webhook_path" text DEFAULT '/api/github/webhook' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
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
		WHERE conname = 'github_providers_created_by_user_id_user_id_fk'
	) THEN
		ALTER TABLE "github_providers"
		ADD CONSTRAINT "github_providers_created_by_user_id_user_id_fk"
		FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id")
		ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "github_providers_github_app_id_unique"
	ON "github_providers" USING btree ("github_app_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "github_providers_app_slug_unique"
	ON "github_providers" USING btree ("app_slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_providers_active_idx"
	ON "github_providers" USING btree ("is_active");
--> statement-breakpoint

ALTER TABLE "github_installations" ADD COLUMN IF NOT EXISTS "provider_id" text;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'github_installations_provider_id_github_providers_id_fk'
	) THEN
		ALTER TABLE "github_installations"
		ADD CONSTRAINT "github_installations_provider_id_github_providers_id_fk"
		FOREIGN KEY ("provider_id") REFERENCES "public"."github_providers"("id")
		ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "stacks" ADD COLUMN IF NOT EXISTS "auto_deploy_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "stacks" ADD COLUMN IF NOT EXISTS "auto_deploy_paths" text;
--> statement-breakpoint
ALTER TABLE "stacks" ADD COLUMN IF NOT EXISTS "last_auto_deployed_commit_sha" text;
--> statement-breakpoint

ALTER TABLE "deployments" ADD COLUMN IF NOT EXISTS "webhook_delivery_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "deployments_webhook_delivery_id_unique"
	ON "deployments" USING btree ("webhook_delivery_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "github_webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text,
	"delivery_id" text NOT NULL,
	"event" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'github_webhook_deliveries_provider_id_github_providers_id_fk'
	) THEN
		ALTER TABLE "github_webhook_deliveries"
		ADD CONSTRAINT "github_webhook_deliveries_provider_id_github_providers_id_fk"
		FOREIGN KEY ("provider_id") REFERENCES "public"."github_providers"("id")
		ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "github_webhook_deliveries_delivery_id_unique"
	ON "github_webhook_deliveries" USING btree ("delivery_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_webhook_deliveries_created_at_idx"
	ON "github_webhook_deliveries" USING btree ("created_at");
