DO $$ BEGIN
 CREATE TYPE "public"."container_update_result" AS ENUM('not_available', 'available', 'check_failed', 'update_queued', 'update_succeeded', 'update_failed', 'skipped');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."container_update_run_type" AS ENUM('check', 'update');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."container_update_run_status" AS ENUM('running', 'succeeded', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "container_update_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"environment_id" text NOT NULL,
	"container_name" text NOT NULL,
	"check_enabled" boolean DEFAULT true NOT NULL,
	"update_enabled" boolean DEFAULT false NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "container_update_states" (
	"id" text PRIMARY KEY NOT NULL,
	"environment_id" text NOT NULL,
	"container_name" text NOT NULL,
	"container_id" text,
	"image_ref" text,
	"running_image_id" text,
	"latest_image_id" text,
	"update_available" boolean DEFAULT false NOT NULL,
	"last_result" "container_update_result",
	"last_error" text,
	"checked_at" timestamp,
	"updated_at" timestamp,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"modified_at" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "container_update_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"environment_id" text NOT NULL,
	"auto_check_enabled" boolean DEFAULT false NOT NULL,
	"auto_update_enabled" boolean DEFAULT false NOT NULL,
	"check_interval_minutes" integer DEFAULT 60 NOT NULL,
	"update_interval_minutes" integer DEFAULT 240 NOT NULL,
	"pull_before_check" boolean DEFAULT true NOT NULL,
	"update_only_running" boolean DEFAULT true NOT NULL,
	"next_check_at" timestamp,
	"next_update_at" timestamp,
	"last_check_at" timestamp,
	"last_update_at" timestamp,
	"running_lease_until" timestamp,
	"running_worker_id" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "container_update_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"schedule_id" text,
	"environment_id" text NOT NULL,
	"run_type" "container_update_run_type" NOT NULL,
	"status" "container_update_run_status" DEFAULT 'running' NOT NULL,
	"total_containers" integer DEFAULT 0 NOT NULL,
	"checked_containers" integer DEFAULT 0 NOT NULL,
	"available_containers" integer DEFAULT 0 NOT NULL,
	"queued_stacks" integer DEFAULT 0 NOT NULL,
	"updated_containers" integer DEFAULT 0 NOT NULL,
	"skipped_containers" integer DEFAULT 0 NOT NULL,
	"failed_containers" integer DEFAULT 0 NOT NULL,
	"summary" text,
	"error" text,
	"started_at" timestamp NOT NULL,
	"finished_at" timestamp,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "container_update_policies" ADD CONSTRAINT "container_update_policies_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "container_update_policies" ADD CONSTRAINT "container_update_policies_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "container_update_states" ADD CONSTRAINT "container_update_states_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "container_update_states" ADD CONSTRAINT "container_update_states_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "container_update_schedules" ADD CONSTRAINT "container_update_schedules_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "container_update_schedules" ADD CONSTRAINT "container_update_schedules_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "container_update_runs" ADD CONSTRAINT "container_update_runs_schedule_id_container_update_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."container_update_schedules"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "container_update_runs" ADD CONSTRAINT "container_update_runs_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "container_update_runs" ADD CONSTRAINT "container_update_runs_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "container_update_policies_unique" ON "container_update_policies" USING btree ("environment_id","created_by_user_id","container_name");
CREATE INDEX IF NOT EXISTS "container_update_policies_environment_idx" ON "container_update_policies" USING btree ("environment_id");
CREATE INDEX IF NOT EXISTS "container_update_policies_user_idx" ON "container_update_policies" USING btree ("created_by_user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "container_update_states_unique" ON "container_update_states" USING btree ("environment_id","created_by_user_id","container_name");
CREATE INDEX IF NOT EXISTS "container_update_states_environment_idx" ON "container_update_states" USING btree ("environment_id");
CREATE INDEX IF NOT EXISTS "container_update_states_user_idx" ON "container_update_states" USING btree ("created_by_user_id");
CREATE INDEX IF NOT EXISTS "container_update_states_available_idx" ON "container_update_states" USING btree ("update_available");

CREATE UNIQUE INDEX IF NOT EXISTS "container_update_schedules_unique" ON "container_update_schedules" USING btree ("environment_id","created_by_user_id");
CREATE INDEX IF NOT EXISTS "container_update_schedules_environment_idx" ON "container_update_schedules" USING btree ("environment_id");
CREATE INDEX IF NOT EXISTS "container_update_schedules_user_idx" ON "container_update_schedules" USING btree ("created_by_user_id");
CREATE INDEX IF NOT EXISTS "container_update_schedules_next_check_idx" ON "container_update_schedules" USING btree ("next_check_at");
CREATE INDEX IF NOT EXISTS "container_update_schedules_next_update_idx" ON "container_update_schedules" USING btree ("next_update_at");

CREATE INDEX IF NOT EXISTS "container_update_runs_schedule_idx" ON "container_update_runs" USING btree ("schedule_id");
CREATE INDEX IF NOT EXISTS "container_update_runs_environment_idx" ON "container_update_runs" USING btree ("environment_id");
CREATE INDEX IF NOT EXISTS "container_update_runs_user_idx" ON "container_update_runs" USING btree ("created_by_user_id");
CREATE INDEX IF NOT EXISTS "container_update_runs_started_idx" ON "container_update_runs" USING btree ("started_at");
