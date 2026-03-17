-- Preserve deployment history when stacks or environments are deleted.
-- Adds denormalized name columns so deployment records remain meaningful
-- after the referenced stack/environment no longer exists.

-- Add denormalized name columns
ALTER TABLE "deployments" ADD COLUMN "stack_name" text;
ALTER TABLE "deployments" ADD COLUMN "environment_name" text;

-- Backfill existing rows from the related tables
UPDATE "deployments" d
SET "stack_name" = s."name"
FROM "stacks" s
WHERE d."stack_id" = s."id" AND d."stack_name" IS NULL;

UPDATE "deployments" d
SET "environment_name" = e."name"
FROM "environments" e
WHERE d."environment_id" = e."id" AND d."environment_name" IS NULL;

-- Change stack_id from CASCADE to SET NULL
ALTER TABLE "deployments" ALTER COLUMN "stack_id" DROP NOT NULL;
ALTER TABLE "deployments" DROP CONSTRAINT "deployments_stack_id_stacks_id_fk";
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_stack_id_stacks_id_fk"
  FOREIGN KEY ("stack_id") REFERENCES "stacks"("id") ON DELETE SET NULL;

-- Change environment_id from CASCADE to SET NULL
ALTER TABLE "deployments" ALTER COLUMN "environment_id" DROP NOT NULL;
ALTER TABLE "deployments" DROP CONSTRAINT "deployments_environment_id_environments_id_fk";
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_environment_id_environments_id_fk"
  FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE SET NULL;
