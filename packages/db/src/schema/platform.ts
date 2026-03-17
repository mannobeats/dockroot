import { relations } from "drizzle-orm";
import {
	bigint,
	boolean,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
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
export const runtimeActionStatusEnum = pgEnum("runtime_action_status", [
	"info",
	"success",
	"warning",
	"error",
]);
export const containerUpdateResultEnum = pgEnum("container_update_result", [
	"not_available",
	"available",
	"major_available",
	"check_failed",
	"update_queued",
	"update_succeeded",
	"update_failed",
	"skipped",
]);
export const containerUpdateRunTypeEnum = pgEnum("container_update_run_type", ["check", "update"]);
export const containerUpdateRunStatusEnum = pgEnum("container_update_run_status", [
	"running",
	"succeeded",
	"failed",
]);
export const containerUpdateCheckModeEnum = pgEnum("container_update_check_mode", [
	"same_tag",
	"include_major",
]);

export const volumeBackupStatusEnum = pgEnum("volume_backup_status", [
	"in_progress",
	"completed",
	"failed",
]);

export const githubProviders = pgTable(
	"github_providers",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		githubAppId: text("github_app_id").notNull(),
		appSlug: text("app_slug").notNull(),
		appClientId: text("app_client_id"),
		appClientSecretEncrypted: text("app_client_secret_encrypted"),
		appPrivateKeyEncrypted: text("app_private_key_encrypted").notNull(),
		webhookSecretEncrypted: text("webhook_secret_encrypted").notNull(),
		webhookPath: text("webhook_path").notNull().default("/api/github/webhook"),
		isActive: boolean("is_active").notNull().default(true),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("github_providers_github_app_id_unique").on(table.githubAppId),
		uniqueIndex("github_providers_app_slug_unique").on(table.appSlug),
		index("github_providers_active_idx").on(table.isActive),
	],
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

export const githubInstallations = pgTable(
	"github_installations",
	{
		id: text("id").primaryKey(),
		providerId: text("provider_id").references(() => githubProviders.id, {
			onDelete: "set null",
		}),
		githubInstallationId: text("github_installation_id").notNull(),
		accountLogin: text("account_login").notNull(),
		accountType: text("account_type"),
		appSlug: text("app_slug"),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("github_installations_github_installation_id_unique").on(
			table.githubInstallationId,
		),
		index("github_installations_user_idx").on(table.createdByUserId),
	],
);

export const stacks = pgTable(
	"stacks",
	{
		id: text("id").primaryKey(),
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
		envFileContent: text("env_file_content"),
		envFileName: text("env_file_name").default(".env"),
		githubInstallationId: text("github_installation_id").references(() => githubInstallations.id, {
			onDelete: "set null",
		}),
		githubRepositoryId: text("github_repository_id"),
		githubOwner: text("github_owner"),
		githubRepository: text("github_repository"),
		githubBranch: text("github_branch"),
		githubPath: text("github_path"),
		githubEnvPath: text("github_env_path"),
		autoDeployEnabled: boolean("auto_deploy_enabled").notNull().default(true),
		autoDeployPaths: text("auto_deploy_paths"),
		lastAutoDeployedCommitSha: text("last_auto_deployed_commit_sha"),
		lastDeployedAt: timestamp("last_deployed_at"),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("stacks_slug_unique").on(table.slug),
		index("stacks_environment_idx").on(table.environmentId),
	],
);

export const deployments = pgTable(
	"deployments",
	{
		id: text("id").primaryKey(),
		stackId: text("stack_id").references(() => stacks.id, { onDelete: "set null" }),
		environmentId: text("environment_id").references(() => environments.id, {
			onDelete: "set null",
		}),
		stackName: text("stack_name"),
		environmentName: text("environment_name"),
		initiatedByUserId: text("initiated_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		operation: deploymentOperationEnum("operation").notNull().default("deploy"),
		version: text("version").notNull(),
		status: deploymentStatusEnum("status").notNull().default("queued"),
		composeSnapshot: text("compose_snapshot").notNull(),
		envSnapshot: text("env_snapshot"),
		sourceCommitSha: text("source_commit_sha"),
		webhookDeliveryId: text("webhook_delivery_id"),
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
		uniqueIndex("deployments_webhook_delivery_id_unique").on(table.webhookDeliveryId),
	],
);

export const githubWebhookDeliveries = pgTable(
	"github_webhook_deliveries",
	{
		id: text("id").primaryKey(),
		providerId: text("provider_id").references(() => githubProviders.id, {
			onDelete: "set null",
		}),
		deliveryId: text("delivery_id").notNull(),
		event: text("event").notNull(),
		createdAt: timestamp("created_at").notNull(),
		processedAt: timestamp("processed_at"),
	},
	(table) => [
		uniqueIndex("github_webhook_deliveries_delivery_id_unique").on(table.deliveryId),
		index("github_webhook_deliveries_created_at_idx").on(table.createdAt),
	],
);

export const runtimeActionEvents = pgTable(
	"runtime_action_events",
	{
		id: text("id").primaryKey(),
		environmentId: text("environment_id").references(() => environments.id, {
			onDelete: "set null",
		}),
		actorUserId: text("actor_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		actorRole: text("actor_role"),
		source: text("source").notNull().default("socket"),
		actionType: text("action_type").notNull(),
		status: runtimeActionStatusEnum("status").notNull().default("info"),
		containerId: text("container_id"),
		sessionId: text("session_id"),
		details: text("details"),
		occurredAt: timestamp("occurred_at").notNull(),
		createdAt: timestamp("created_at").notNull(),
	},
	(table) => [
		index("runtime_action_events_environment_idx").on(table.environmentId),
		index("runtime_action_events_actor_idx").on(table.actorUserId),
		index("runtime_action_events_occurred_idx").on(table.occurredAt),
		index("runtime_action_events_action_type_idx").on(table.actionType),
	],
);

export const containerUpdatePolicies = pgTable(
	"container_update_policies",
	{
		id: text("id").primaryKey(),
		environmentId: text("environment_id")
			.notNull()
			.references(() => environments.id, { onDelete: "cascade" }),
		containerName: text("container_name").notNull(),
		checkEnabled: boolean("check_enabled").notNull().default(true),
		updateEnabled: boolean("update_enabled").notNull().default(false),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("container_update_policies_unique").on(
			table.environmentId,
			table.createdByUserId,
			table.containerName,
		),
		index("container_update_policies_environment_idx").on(table.environmentId),
		index("container_update_policies_user_idx").on(table.createdByUserId),
	],
);

export const containerUpdateStates = pgTable(
	"container_update_states",
	{
		id: text("id").primaryKey(),
		environmentId: text("environment_id")
			.notNull()
			.references(() => environments.id, { onDelete: "cascade" }),
		containerName: text("container_name").notNull(),
		containerId: text("container_id"),
		imageRef: text("image_ref"),
		runningImageId: text("running_image_id"),
		latestImageId: text("latest_image_id"),
		majorTargetImageRef: text("major_target_image_ref"),
		majorTargetTag: text("major_target_tag"),
		updateAvailable: boolean("update_available").notNull().default(false),
		majorUpdateAvailable: boolean("major_update_available").notNull().default(false),
		lastResult: containerUpdateResultEnum("last_result"),
		lastError: text("last_error"),
		checkedAt: timestamp("checked_at"),
		updatedAt: timestamp("updated_at"),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull(),
		modifiedAt: timestamp("modified_at").notNull(),
	},
	(table) => [
		uniqueIndex("container_update_states_unique").on(
			table.environmentId,
			table.createdByUserId,
			table.containerName,
		),
		index("container_update_states_environment_idx").on(table.environmentId),
		index("container_update_states_user_idx").on(table.createdByUserId),
		index("container_update_states_available_idx").on(table.updateAvailable),
	],
);

export const containerUpdateSchedules = pgTable(
	"container_update_schedules",
	{
		id: text("id").primaryKey(),
		environmentId: text("environment_id")
			.notNull()
			.references(() => environments.id, { onDelete: "cascade" }),
		autoCheckEnabled: boolean("auto_check_enabled").notNull().default(false),
		autoUpdateEnabled: boolean("auto_update_enabled").notNull().default(false),
		checkMode: containerUpdateCheckModeEnum("check_mode").notNull().default("same_tag"),
		checkIntervalMinutes: integer("check_interval_minutes").notNull().default(60),
		updateIntervalMinutes: integer("update_interval_minutes").notNull().default(240),
		pullBeforeCheck: boolean("pull_before_check").notNull().default(true),
		updateOnlyRunning: boolean("update_only_running").notNull().default(true),
		nextCheckAt: timestamp("next_check_at"),
		nextUpdateAt: timestamp("next_update_at"),
		lastCheckAt: timestamp("last_check_at"),
		lastUpdateAt: timestamp("last_update_at"),
		runningLeaseUntil: timestamp("running_lease_until"),
		runningWorkerId: text("running_worker_id"),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("container_update_schedules_unique").on(table.environmentId, table.createdByUserId),
		index("container_update_schedules_environment_idx").on(table.environmentId),
		index("container_update_schedules_user_idx").on(table.createdByUserId),
		index("container_update_schedules_next_check_idx").on(table.nextCheckAt),
		index("container_update_schedules_next_update_idx").on(table.nextUpdateAt),
	],
);

export const containerUpdateRuns = pgTable(
	"container_update_runs",
	{
		id: text("id").primaryKey(),
		scheduleId: text("schedule_id").references(() => containerUpdateSchedules.id, {
			onDelete: "set null",
		}),
		environmentId: text("environment_id")
			.notNull()
			.references(() => environments.id, { onDelete: "cascade" }),
		runType: containerUpdateRunTypeEnum("run_type").notNull(),
		status: containerUpdateRunStatusEnum("status").notNull().default("running"),
		totalContainers: integer("total_containers").notNull().default(0),
		checkedContainers: integer("checked_containers").notNull().default(0),
		availableContainers: integer("available_containers").notNull().default(0),
		queuedStacks: integer("queued_stacks").notNull().default(0),
		updatedContainers: integer("updated_containers").notNull().default(0),
		skippedContainers: integer("skipped_containers").notNull().default(0),
		failedContainers: integer("failed_containers").notNull().default(0),
		summary: text("summary"),
		error: text("error"),
		startedAt: timestamp("started_at").notNull(),
		finishedAt: timestamp("finished_at"),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
	},
	(table) => [
		index("container_update_runs_schedule_idx").on(table.scheduleId),
		index("container_update_runs_environment_idx").on(table.environmentId),
		index("container_update_runs_user_idx").on(table.createdByUserId),
		index("container_update_runs_started_idx").on(table.startedAt),
	],
);

export const volumeBackups = pgTable(
	"volume_backups",
	{
		id: text("id").primaryKey(),
		environmentId: text("environment_id")
			.notNull()
			.references(() => environments.id, { onDelete: "cascade" }),
		volumeName: text("volume_name").notNull(),
		fileName: text("file_name").notNull(),
		sizeBytes: integer("size_bytes"),
		status: volumeBackupStatusEnum("status").notNull().default("in_progress"),
		error: text("error"),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull(),
		completedAt: timestamp("completed_at"),
	},
	(table) => [
		index("volume_backups_environment_idx").on(table.environmentId),
		index("volume_backups_volume_name_idx").on(table.volumeName),
		index("volume_backups_user_idx").on(table.createdByUserId),
	],
);

export const environmentMetricSamples = pgTable(
	"environment_metric_samples",
	{
		id: text("id").primaryKey(),
		environmentId: text("environment_id")
			.notNull()
			.references(() => environments.id, { onDelete: "cascade" }),
		source: text("source").notNull().default("native"),
		hostname: text("hostname"),
		cpuPercentTenths: integer("cpu_percent_tenths"),
		memoryPercentTenths: integer("memory_percent_tenths"),
		memoryUsedBytes: bigint("memory_used_bytes", { mode: "number" }),
		memoryTotalBytes: bigint("memory_total_bytes", { mode: "number" }),
		containerCount: integer("container_count").notNull().default(0),
		runningContainerCount: integer("running_container_count").notNull().default(0),
		imageCount: integer("image_count").notNull().default(0),
		volumeCount: integer("volume_count").notNull().default(0),
		networkCount: integer("network_count").notNull().default(0),
		sampledAt: timestamp("sampled_at").notNull(),
		createdAt: timestamp("created_at").notNull(),
	},
	(table) => [
		index("environment_metric_samples_environment_idx").on(table.environmentId),
		index("environment_metric_samples_sampled_idx").on(table.sampledAt),
	],
);

export const containerMetricSamples = pgTable(
	"container_metric_samples",
	{
		id: text("id").primaryKey(),
		environmentId: text("environment_id")
			.notNull()
			.references(() => environments.id, { onDelete: "cascade" }),
		containerId: text("container_id").notNull(),
		containerName: text("container_name").notNull(),
		image: text("image"),
		state: text("state"),
		cpuPercentTenths: integer("cpu_percent_tenths"),
		memoryUsageBytes: bigint("memory_usage_bytes", { mode: "number" }),
		memoryLimitBytes: bigint("memory_limit_bytes", { mode: "number" }),
		memoryPercentTenths: integer("memory_percent_tenths"),
		rxBytesTotal: bigint("rx_bytes_total", { mode: "number" }),
		txBytesTotal: bigint("tx_bytes_total", { mode: "number" }),
		sampledAt: timestamp("sampled_at").notNull(),
		createdAt: timestamp("created_at").notNull(),
	},
	(table) => [
		index("container_metric_samples_environment_idx").on(table.environmentId),
		index("container_metric_samples_container_idx").on(table.environmentId, table.containerId),
		index("container_metric_samples_container_name_idx").on(
			table.environmentId,
			table.containerName,
		),
		index("container_metric_samples_sampled_idx").on(table.sampledAt),
	],
);

export const environmentRelations = relations(environments, ({ many, one }) => ({
	agent: many(agents),
	stacks: many(stacks),
	deployments: many(deployments),
	runtimeActions: many(runtimeActionEvents),
	metricSamples: many(environmentMetricSamples),
	containerMetricSamples: many(containerMetricSamples),
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

export const githubInstallationRelations = relations(githubInstallations, ({ many, one }) => ({
	stacks: many(stacks),
	provider: one(githubProviders, {
		fields: [githubInstallations.providerId],
		references: [githubProviders.id],
	}),
	createdBy: one(user, {
		fields: [githubInstallations.createdByUserId],
		references: [user.id],
	}),
}));

export const githubProviderRelations = relations(githubProviders, ({ many, one }) => ({
	installations: many(githubInstallations),
	webhookDeliveries: many(githubWebhookDeliveries),
	createdBy: one(user, {
		fields: [githubProviders.createdByUserId],
		references: [user.id],
	}),
}));

export const stackRelations = relations(stacks, ({ many, one }) => ({
	environment: one(environments, {
		fields: [stacks.environmentId],
		references: [environments.id],
	}),
	githubInstallation: one(githubInstallations, {
		fields: [stacks.githubInstallationId],
		references: [githubInstallations.id],
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

export const githubWebhookDeliveryRelations = relations(githubWebhookDeliveries, ({ one }) => ({
	provider: one(githubProviders, {
		fields: [githubWebhookDeliveries.providerId],
		references: [githubProviders.id],
	}),
}));

export const runtimeActionEventRelations = relations(runtimeActionEvents, ({ one }) => ({
	environment: one(environments, {
		fields: [runtimeActionEvents.environmentId],
		references: [environments.id],
	}),
	actor: one(user, {
		fields: [runtimeActionEvents.actorUserId],
		references: [user.id],
	}),
}));

export const containerUpdatePolicyRelations = relations(containerUpdatePolicies, ({ one }) => ({
	environment: one(environments, {
		fields: [containerUpdatePolicies.environmentId],
		references: [environments.id],
	}),
	createdBy: one(user, {
		fields: [containerUpdatePolicies.createdByUserId],
		references: [user.id],
	}),
}));

export const containerUpdateStateRelations = relations(containerUpdateStates, ({ one }) => ({
	environment: one(environments, {
		fields: [containerUpdateStates.environmentId],
		references: [environments.id],
	}),
	createdBy: one(user, {
		fields: [containerUpdateStates.createdByUserId],
		references: [user.id],
	}),
}));

export const containerUpdateScheduleRelations = relations(
	containerUpdateSchedules,
	({ many, one }) => ({
		environment: one(environments, {
			fields: [containerUpdateSchedules.environmentId],
			references: [environments.id],
		}),
		createdBy: one(user, {
			fields: [containerUpdateSchedules.createdByUserId],
			references: [user.id],
		}),
		runs: many(containerUpdateRuns),
	}),
);

export const containerUpdateRunRelations = relations(containerUpdateRuns, ({ one }) => ({
	schedule: one(containerUpdateSchedules, {
		fields: [containerUpdateRuns.scheduleId],
		references: [containerUpdateSchedules.id],
	}),
	environment: one(environments, {
		fields: [containerUpdateRuns.environmentId],
		references: [environments.id],
	}),
	createdBy: one(user, {
		fields: [containerUpdateRuns.createdByUserId],
		references: [user.id],
	}),
}));

export const volumeBackupRelations = relations(volumeBackups, ({ one }) => ({
	environment: one(environments, {
		fields: [volumeBackups.environmentId],
		references: [environments.id],
	}),
	createdBy: one(user, {
		fields: [volumeBackups.createdByUserId],
		references: [user.id],
	}),
}));

export const environmentMetricSampleRelations = relations(environmentMetricSamples, ({ one }) => ({
	environment: one(environments, {
		fields: [environmentMetricSamples.environmentId],
		references: [environments.id],
	}),
}));

export const containerMetricSampleRelations = relations(containerMetricSamples, ({ one }) => ({
	environment: one(environments, {
		fields: [containerMetricSamples.environmentId],
		references: [environments.id],
	}),
}));
