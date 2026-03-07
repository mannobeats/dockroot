import { relations } from "drizzle-orm";
import { boolean, index, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const environmentKindEnum = pgEnum("environment_kind", ["local", "agent"]);
export const environmentStatusEnum = pgEnum("environment_status", [
	"provisioning",
	"healthy",
	"degraded",
	"offline",
]);
export const stackSourceTypeEnum = pgEnum("stack_source_type", ["manual", "github"]);
export const stackStatusEnum = pgEnum("stack_status", [
	"draft",
	"queued",
	"deploying",
	"running",
	"failed",
	"stopped",
]);
export const deploymentStatusEnum = pgEnum("deployment_status", [
	"queued",
	"running",
	"succeeded",
	"failed",
]);
export const deploymentOperationEnum = pgEnum("deployment_operation", ["deploy", "destroy"]);

export const projects = pgTable(
	"projects",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		description: text("description"),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
	},
	(table) => [uniqueIndex("projects_slug_unique").on(table.slug)],
);

export const environments = pgTable(
	"environments",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		description: text("description"),
		kind: environmentKindEnum("kind").notNull().default("agent"),
		status: environmentStatusEnum("status").notNull().default("provisioning"),
		isDefaultLocal: boolean("is_default_local").notNull().default(false),
		managerUrl: text("manager_url"),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("environments_slug_unique").on(table.slug),
		index("environments_status_idx").on(table.status),
	],
);

export const agents = pgTable(
	"agents",
	{
		id: text("id").primaryKey(),
		environmentId: text("environment_id")
			.notNull()
			.references(() => environments.id, { onDelete: "cascade" }),
		hostname: text("hostname"),
		operatingSystem: text("operating_system"),
		architecture: text("architecture"),
		dockerVersion: text("docker_version"),
		status: environmentStatusEnum("status").notNull().default("provisioning"),
		registrationToken: text("registration_token").notNull(),
		accessToken: text("access_token"),
		lastSeenAt: timestamp("last_seen_at"),
		installedAt: timestamp("installed_at"),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("agents_environment_id_unique").on(table.environmentId),
		uniqueIndex("agents_registration_token_unique").on(table.registrationToken),
		uniqueIndex("agents_access_token_unique").on(table.accessToken),
	],
);

export const stacks = pgTable(
	"stacks",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		environmentId: text("environment_id")
			.notNull()
			.references(() => environments.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		description: text("description"),
		sourceType: stackSourceTypeEnum("source_type").notNull().default("manual"),
		status: stackStatusEnum("status").notNull().default("draft"),
		composeYaml: text("compose_yaml").notNull(),
		composeFileName: text("compose_file_name").notNull().default("compose.yaml"),
		githubOwner: text("github_owner"),
		githubRepository: text("github_repository"),
		githubBranch: text("github_branch"),
		githubPath: text("github_path"),
		lastDeployedAt: timestamp("last_deployed_at"),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("stacks_slug_unique").on(table.slug),
		index("stacks_project_idx").on(table.projectId),
		index("stacks_environment_idx").on(table.environmentId),
	],
);

export const deployments = pgTable(
	"deployments",
	{
		id: text("id").primaryKey(),
		stackId: text("stack_id")
			.notNull()
			.references(() => stacks.id, { onDelete: "cascade" }),
		environmentId: text("environment_id")
			.notNull()
			.references(() => environments.id, { onDelete: "cascade" }),
		initiatedByUserId: text("initiated_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		operation: deploymentOperationEnum("operation").notNull().default("deploy"),
		version: text("version").notNull(),
		status: deploymentStatusEnum("status").notNull().default("queued"),
		composeSnapshot: text("compose_snapshot").notNull(),
		log: text("log"),
		summary: text("summary"),
		startedAt: timestamp("started_at"),
		finishedAt: timestamp("finished_at"),
		claimedAt: timestamp("claimed_at"),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
	},
	(table) => [
		index("deployments_stack_idx").on(table.stackId),
		index("deployments_environment_idx").on(table.environmentId),
		index("deployments_status_idx").on(table.status),
	],
);

export const projectRelations = relations(projects, ({ many, one }) => ({
	stacks: many(stacks),
	createdBy: one(user, {
		fields: [projects.createdByUserId],
		references: [user.id],
	}),
}));

export const environmentRelations = relations(environments, ({ many, one }) => ({
	agent: many(agents),
	stacks: many(stacks),
	deployments: many(deployments),
	createdBy: one(user, {
		fields: [environments.createdByUserId],
		references: [user.id],
	}),
}));

export const agentRelations = relations(agents, ({ one }) => ({
	environment: one(environments, {
		fields: [agents.environmentId],
		references: [environments.id],
	}),
}));

export const stackRelations = relations(stacks, ({ many, one }) => ({
	project: one(projects, {
		fields: [stacks.projectId],
		references: [projects.id],
	}),
	environment: one(environments, {
		fields: [stacks.environmentId],
		references: [environments.id],
	}),
	deployments: many(deployments),
	createdBy: one(user, {
		fields: [stacks.createdByUserId],
		references: [user.id],
	}),
}));

export const deploymentRelations = relations(deployments, ({ one }) => ({
	stack: one(stacks, {
		fields: [deployments.stackId],
		references: [stacks.id],
	}),
	environment: one(environments, {
		fields: [deployments.environmentId],
		references: [environments.id],
	}),
	initiatedBy: one(user, {
		fields: [deployments.initiatedByUserId],
		references: [user.id],
	}),
}));
