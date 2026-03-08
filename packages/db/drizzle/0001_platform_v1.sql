CREATE TYPE "public"."deployment_operation" AS ENUM('deploy', 'destroy');
--> statement-breakpoint
CREATE TYPE "public"."deployment_status" AS ENUM('queued', 'running', 'succeeded', 'failed');
--> statement-breakpoint
CREATE TYPE "public"."environment_kind" AS ENUM('local', 'agent');
--> statement-breakpoint
CREATE TYPE "public"."environment_status" AS ENUM('provisioning', 'healthy', 'degraded', 'offline');
--> statement-breakpoint
CREATE TYPE "public"."stack_source_type" AS ENUM('manual', 'github');
--> statement-breakpoint
CREATE TYPE "public"."stack_status" AS ENUM('draft', 'queued', 'deploying', 'running', 'failed', 'stopped');
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"kind" "environment_kind" DEFAULT 'agent' NOT NULL,
	"status" "environment_status" DEFAULT 'provisioning' NOT NULL,
	"is_default_local" boolean DEFAULT false NOT NULL,
	"manager_url" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"environment_id" text NOT NULL,
	"hostname" text,
	"operating_system" text,
	"architecture" text,
	"docker_version" text,
	"status" "environment_status" DEFAULT 'provisioning' NOT NULL,
	"registration_token" text NOT NULL,
	"access_token" text,
	"last_seen_at" timestamp,
	"installed_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stacks" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"source_type" "stack_source_type" DEFAULT 'manual' NOT NULL,
	"status" "stack_status" DEFAULT 'draft' NOT NULL,
	"compose_yaml" text NOT NULL,
	"compose_file_name" text DEFAULT 'compose.yaml' NOT NULL,
	"env_file_content" text,
	"env_file_name" text DEFAULT '.env',
	"github_owner" text,
	"github_repository" text,
	"github_branch" text,
	"github_path" text,
	"last_deployed_at" timestamp,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" text PRIMARY KEY NOT NULL,
	"stack_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"initiated_by_user_id" text,
	"operation" "deployment_operation" DEFAULT 'deploy' NOT NULL,
	"version" text NOT NULL,
	"status" "deployment_status" DEFAULT 'queued' NOT NULL,
	"compose_snapshot" text NOT NULL,
	"env_snapshot" text,
	"log" text,
	"summary" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"claimed_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stacks" ADD CONSTRAINT "stacks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stacks" ADD CONSTRAINT "stacks_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stacks" ADD CONSTRAINT "stacks_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_stack_id_stacks_id_fk" FOREIGN KEY ("stack_id") REFERENCES "public"."stacks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_initiated_by_user_id_user_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "projects_slug_unique" ON "projects" USING btree ("slug");
--> statement-breakpoint
CREATE UNIQUE INDEX "environments_slug_unique" ON "environments" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "environments_status_idx" ON "environments" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX "agents_environment_id_unique" ON "agents" USING btree ("environment_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "agents_registration_token_unique" ON "agents" USING btree ("registration_token");
--> statement-breakpoint
CREATE UNIQUE INDEX "agents_access_token_unique" ON "agents" USING btree ("access_token");
--> statement-breakpoint
CREATE UNIQUE INDEX "stacks_slug_unique" ON "stacks" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "stacks_project_idx" ON "stacks" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "stacks_environment_idx" ON "stacks" USING btree ("environment_id");
--> statement-breakpoint
CREATE INDEX "deployments_stack_idx" ON "deployments" USING btree ("stack_id");
--> statement-breakpoint
CREATE INDEX "deployments_environment_idx" ON "deployments" USING btree ("environment_id");
--> statement-breakpoint
CREATE INDEX "deployments_status_idx" ON "deployments" USING btree ("status");
