import type { LucideIcon } from "lucide-react";
import {
	Blocks,
	Cloud,
	FileCode2,
	Gauge,
	GitBranch,
	Github,
	Radar,
	ShieldCheck,
	SquareTerminal,
	Workflow,
} from "lucide-react";

export const pillars: Array<{ title: string; copy: string; icon: LucideIcon }> = [
	{
		title: "Compose-Native Orchestration",
		copy: "From stack specs to runtime deltas, every workflow is built around Docker Compose instead of forcing a Kubernetes-shaped abstraction.",
		icon: Workflow,
	},
	{
		title: "Tenant-Safe Runtime Controls",
		copy: "Guardrails, role-aware actions, and scoped operations let teams move quickly without crossing boundaries.",
		icon: ShieldCheck,
	},
	{
		title: "Observability in Context",
		copy: "Logs, health, metrics, and deployment history surface beside your stack lifecycle so operators can act without context switching.",
		icon: Radar,
	},
];

export const capabilities: Array<{ name: string; detail: string; icon: LucideIcon }> = [
	{
		name: "GitHub Push Deploys",
		detail: "Trigger deploys from push events with delivery-id dedupe and tracked commit metadata.",
		icon: Github,
	},
	{
		name: "Path-Aware Automation",
		detail:
			"Enable auto-deploy and scope it with path filters so only relevant changes roll forward.",
		icon: GitBranch,
	},
	{
		name: "Repository Source Preview",
		detail: "Load compose/env files from repo and edit before stack creation in the same flow.",
		icon: FileCode2,
	},
	{
		name: "Live Ops Workspace",
		detail:
			"Operate with live logs, browser shell access, and stack-level runtime control surfaces.",
		icon: SquareTerminal,
	},
	{
		name: "Infra Primitives",
		detail: "Manage images, networks, and volumes from one tenant-aware control plane.",
		icon: Cloud,
	},
	{
		name: "Telemetry + Health",
		detail: "Use monitoring views and activity feeds to diagnose impact quickly.",
		icon: Gauge,
	},
];

export const checkpoints = [
	"Create a GitHub App from the Stacks flow (manifest-first)",
	"Install it on selected repositories and refresh installations",
	"Load compose/env from a branch, then create a tracked GitHub stack",
	"Auto-deploy on push with optional path filters and live deployment feed",
];

export const ctaIcon = Blocks;
