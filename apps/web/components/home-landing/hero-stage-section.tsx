import { ArrowRight, BadgeCheck, ChevronRight, Lock, Sparkles } from "lucide-react";
import { LinkButton } from "@/components/ui/link-button";

export function HomeHeroStageSection({ appName }: { appName: string }) {
	return (
		<section className="relative mx-auto grid w-full max-w-7xl gap-12 px-4 pb-20 pt-16 sm:px-6 sm:pb-24 sm:pt-24 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
			<div className="animate-in">
				<p className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/8 px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-accent">
					<Sparkles className="h-3.5 w-3.5" />
					{appName} Platform
				</p>
				<h1 className="mt-6 max-w-[18ch] text-[clamp(2.4rem,6vw,5.5rem)] font-semibold leading-[0.94] tracking-[-0.03em]">
					The control plane for serious Docker operations.
				</h1>
				<p className="mt-7 max-w-[54ch] text-[clamp(1rem,1.6vw,1.2rem)] leading-relaxed text-muted">
					Ship and operate Compose workloads with clarity. {appName} unifies deployment, runtime
					controls, observability, and governance into one operator-first experience.
				</p>
				<div className="mt-10 flex flex-wrap items-center gap-3">
					<LinkButton href="/sign-up" size="lg" className="rounded-xl px-6">
						<Lock className="h-4 w-4" />
						Start Free Workspace
					</LinkButton>
					<LinkButton href="/dashboard" variant="secondary" size="lg" className="rounded-xl px-6">
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
	);
}
