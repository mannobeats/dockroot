DO $$ BEGIN
 CREATE TYPE "runtime_action_status" AS ENUM ('info', 'success', 'warning', 'error');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "runtime_action_events" (
  "id" text PRIMARY KEY NOT NULL,
  "environment_id" text,
  "actor_user_id" text,
  "actor_role" text,
  "source" text DEFAULT 'socket' NOT NULL,
  "action_type" text NOT NULL,
  "status" "runtime_action_status" DEFAULT 'info' NOT NULL,
  "container_id" text,
  "session_id" text,
  "details" text,
  "occurred_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "runtime_action_events" ADD CONSTRAINT "runtime_action_events_environment_id_environments_id_fk"
 FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "runtime_action_events" ADD CONSTRAINT "runtime_action_events_actor_user_id_user_id_fk"
 FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "runtime_action_events_environment_idx" ON "runtime_action_events" USING btree ("environment_id");
CREATE INDEX IF NOT EXISTS "runtime_action_events_actor_idx" ON "runtime_action_events" USING btree ("actor_user_id");
CREATE INDEX IF NOT EXISTS "runtime_action_events_occurred_idx" ON "runtime_action_events" USING btree ("occurred_at");
CREATE INDEX IF NOT EXISTS "runtime_action_events_action_type_idx" ON "runtime_action_events" USING btree ("action_type");
