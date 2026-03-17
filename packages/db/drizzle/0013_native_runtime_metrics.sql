create table "environment_metric_samples" (
	"id" text primary key not null,
	"environment_id" text not null references "environments"("id") on delete cascade,
	"source" text not null default 'native',
	"hostname" text,
	"cpu_percent_tenths" integer,
	"memory_percent_tenths" integer,
	"memory_used_bytes" bigint,
	"memory_total_bytes" bigint,
	"container_count" integer not null default 0,
	"running_container_count" integer not null default 0,
	"image_count" integer not null default 0,
	"volume_count" integer not null default 0,
	"network_count" integer not null default 0,
	"sampled_at" timestamp not null,
	"created_at" timestamp not null
);

create index "environment_metric_samples_environment_idx"
	on "environment_metric_samples" ("environment_id");
create index "environment_metric_samples_sampled_idx"
	on "environment_metric_samples" ("sampled_at");

create table "container_metric_samples" (
	"id" text primary key not null,
	"environment_id" text not null references "environments"("id") on delete cascade,
	"container_id" text not null,
	"container_name" text not null,
	"image" text,
	"state" text,
	"cpu_percent_tenths" integer,
	"memory_usage_bytes" bigint,
	"memory_limit_bytes" bigint,
	"memory_percent_tenths" integer,
	"rx_bytes_total" bigint,
	"tx_bytes_total" bigint,
	"sampled_at" timestamp not null,
	"created_at" timestamp not null
);

create index "container_metric_samples_environment_idx"
	on "container_metric_samples" ("environment_id");
create index "container_metric_samples_container_idx"
	on "container_metric_samples" ("environment_id", "container_id");
create index "container_metric_samples_container_name_idx"
	on "container_metric_samples" ("environment_id", "container_name");
create index "container_metric_samples_sampled_idx"
	on "container_metric_samples" ("sampled_at");
