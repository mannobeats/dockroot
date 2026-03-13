import {
	ArrowRight,
	BadgeCheck,
	Blocks,
	ChevronRight,
	Cloud,
	FileCode2,
	Gauge,
	GitBranch,
	Github,
	Lock,
	Radar,
	ShieldCheck,
	Sparkles,
	SquareTerminal,
	Workflow,
} from "lucide-react";
import { PublicLayout } from "@/components/public-layout";
import { LinkButton } from "@/components/ui/link-button";
import { publicEnv } from "@/lib/public-env";

const pillars = [
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

const capabilities = [
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

const checkpoints = [
	"Create a GitHub App from the Stacks flow (manifest-first)",
	"Install it on selected repositories and refresh installations",
	"Load compose/env from a branch, then create a tracked GitHub stack",
	"Auto-deploy on push with optional path filters and live deployment feed",
];

export default function Home() {
	return (
		<PublicLayout>
			<div className="landing-shell relative isolate overflow-hidden">
				<div className="landing-orb landing-orb--one" aria-hidden />
				<div className="landing-orb landing-orb--two" aria-hidden />
				<div className="landing-grid-overlay" aria-hidden />

				<section className="relative mx-auto grid w-full max-w-7xl gap-12 px-4 pb-20 pt-16 sm:px-6 sm:pb-24 sm:pt-24 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
					<div className="animate-in">
						<p className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/8 px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-accent">
							<Sparkles className="h-3.5 w-3.5" />
							{publicEnv.appName} Platform
						</p>
						<h1 className="mt-6 max-w-[18ch] text-[clamp(2.4rem,6vw,5.5rem)] font-semibold leading-[0.94] tracking-[-0.03em]">
							The control plane for serious Docker operations.
						</h1>
						<p className="mt-7 max-w-[54ch] text-[clamp(1rem,1.6vw,1.2rem)] leading-relaxed text-muted">
							Ship and operate Compose workloads with clarity. {publicEnv.appName} unifies
							deployment, runtime controls, observability, and governance into one operator-first
							experience.
						</p>
						<div className="mt-10 flex flex-wrap items-center gap-3">
							<LinkButton href="/sign-up" size="lg" className="rounded-xl px-6">
								<Lock className="h-4 w-4" />
								Start Free Workspace
							</LinkButton>
							<LinkButton
								href="/dashboard"
								variant="secondary"
								size="lg"
								className="rounded-xl px-6"
							>
								Open Dashboard
								<ArrowRight className="h-4 w-4" />
							</LinkButton>
							<LinkButton href="/sign-in" variant="ghost" size="lg" className="rounded-xl px-4">
								Sign In
								<ChevronRight className="h-4 w-4" />
							</LinkButton>
						</div>
						<div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px] font-medium text-muted">
							<span className="inline-flex items-center gap-2">
								<BadgeCheck className="h-3.5 w-3.5 text-accent" />
								Manifest-first GitHub onboarding
							</span>
							<span className="inline-flex items-center gap-2">
								<BadgeCheck className="h-3.5 w-3.5 text-accent" />
								Push deploy idempotency
							</span>
							<span className="inline-flex items-center gap-2">
								<BadgeCheck className="h-3.5 w-3.5 text-accent" />
								Live logs, shell, and telemetry
							</span>
						</div>
					</div>

					<div className="landing-stage animate-in rounded-2xl border border-default/14 bg-surface/85 p-4 shadow-[var(--shadow-lg)] backdrop-blur-sm sm:p-6">
						<div className="flex items-center justify-between border-b border-default/12 pb-4">
							<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
								Operational Feed
							</p>
							<span className="inline-flex items-center gap-1 rounded-full bg-success/14 px-2.5 py-1 text-[11px] font-semibold text-success">
								<span className="pulse-dot h-1.5 w-1.5 rounded-full bg-success" />
								Live
							</span>
						</div>
						<div className="mt-4 space-y-3">
							<div className="rounded-xl border border-default/12 bg-background/65 p-4">
								<div className="flex items-center justify-between text-[12px] text-muted">
									<p>GitHub push / checkout-api</p>
									<p>02m ago</p>
								</div>
								<p className="mt-2 text-[14px] font-medium">
									auto-deploy triggered (paths matched: compose.yaml, services/api/**)
								</p>
							</div>
							<div className="rounded-xl border border-default/12 bg-background/65 p-4">
								<div className="flex items-center justify-between text-[12px] text-muted">
									<p>Webhook guard / provider: platform-app</p>
									<p>11m ago</p>
								</div>
								<p className="mt-2 text-[14px] font-medium">duplicate delivery skipped safely</p>
							</div>
							<div className="rounded-xl border border-default/12 bg-background/65 p-4">
								<div className="flex items-center justify-between text-[12px] text-muted">
									<p>Runtime ops / payments-worker</p>
									<p>18m ago</p>
								</div>
								<p className="mt-2 text-[14px] font-medium">
									live log dock opened + shell session attached
								</p>
							</div>
						</div>
					</div>
				</section>

				<section className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-6 sm:px-6 lg:grid-cols-3">
					{pillars.map((item) => (
						<article
							key={item.title}
							className="landing-panel group rounded-2xl border border-default/12 bg-surface/80 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/30"
						>
							<item.icon className="h-5 w-5 text-accent" />
							<h2 className="mt-4 text-lg font-semibold tracking-tight">{item.title}</h2>
							<p className="mt-3 text-[14px] leading-relaxed text-muted">{item.copy}</p>
						</article>
					))}
				</section>

				<section className="mx-auto grid w-full max-w-7xl items-start gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.88fr_1.12fr]">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
							GitHub Delivery Loop
						</p>
						<h3 className="mt-3 max-w-[16ch] text-[clamp(1.7rem,4vw,3rem)] font-semibold leading-[1.02] tracking-[-0.02em]">
							From repository event to running stack in one control path.
						</h3>
						<ol className="mt-8 space-y-3">
							{checkpoints.map((point, index) => (
								<li key={point} className="flex items-start gap-3 text-[14px] leading-relaxed">
									<span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border border-default/18 text-[12px] font-semibold text-accent">
										{index + 1}
									</span>
									<span>{point}</span>
								</li>
							))}
						</ol>
						<div className="mt-8">
							<LinkButton
								href="/dashboard/stacks"
								variant="outline"
								size="lg"
								className="rounded-xl px-5"
							>
								Explore GitHub + Stacks
								<ArrowRight className="h-4 w-4" />
							</LinkButton>
						</div>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						{capabilities.map((item) => (
							<article
								key={item.name}
								className="landing-capability rounded-2xl border border-default/12 bg-surface/75 p-5"
							>
								<div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
									<item.icon className="h-4.5 w-4.5" />
								</div>
								<p className="mt-3 text-[15px] font-semibold">{item.name}</p>
								<p className="mt-2 text-[13px] leading-relaxed text-muted">{item.detail}</p>
							</article>
						))}
					</div>
				</section>

				<section className="mx-auto w-full max-w-7xl px-4 pb-24 sm:px-6">
					<div className="landing-cta relative overflow-hidden rounded-3xl border border-default/16 p-8 sm:p-10 lg:p-12">
						<div className="landing-cta__wash" aria-hidden />
						<div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
							<div>
								<p className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-accent">
									<Blocks className="h-3.5 w-3.5" />
									Built for Real Operations
								</p>
								<h4 className="mt-4 max-w-[18ch] text-[clamp(1.7rem,3.4vw,2.9rem)] font-semibold leading-[1.04] tracking-[-0.02em]">
									Ship from GitHub. Operate from Dockroot. Keep context the whole way.
								</h4>
								<p className="mt-4 max-w-[58ch] text-[15px] leading-relaxed text-muted">
									Use {publicEnv.appName} as the operational center of your platform and give every
									team a clean path from Compose definition to production runtime.
								</p>
							</div>
							<div className="flex flex-wrap gap-3">
								<LinkButton href="/sign-up" size="lg" className="rounded-xl px-6">
									Create Workspace
								</LinkButton>
								<LinkButton
									href="/dashboard/logs"
									variant="secondary"
									size="lg"
									className="rounded-xl px-6"
								>
									View Live Logs
								</LinkButton>
							</div>
						</div>
					</div>
				</section>
			</div>
		</PublicLayout>
	);
}
