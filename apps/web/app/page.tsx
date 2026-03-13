import {
	ArrowRight,
	Container,
	Database,
	Lock,
	Palette,
	Rocket,
	Server,
	Shield,
	Terminal,
} from "lucide-react";
import Link from "next/link";
import { PublicLayout } from "@/components/public-layout";

const features = [
	{
		icon: Server,
		title: "Next.js 16",
		description: "Latest App Router with React 19, Server Components, and Turbopack.",
	},
	{
		icon: Palette,
		title: "HeroUI v3",
		description: "Beautiful, accessible components built on React Aria with Tailwind CSS v4.",
	},
	{
		icon: Database,
		title: "Drizzle + PostgreSQL",
		description: "Type-safe ORM with migrations, zero-overhead SQL, and full Postgres power.",
	},
	{
		icon: Shield,
		title: "Better Auth",
		description: "Email/password authentication with sessions, ready to extend with OAuth.",
	},
	{
		icon: Container,
		title: "Clean Deployment Modes",
		description:
			"Host-run development and full Docker deployment use one consistent, documented flow.",
	},
	{
		icon: Terminal,
		title: "Biome + pnpm",
		description:
			"Fast linting, formatting, and package management with a standard Node.js toolchain.",
	},
];

export default function Home() {
	return (
		<PublicLayout>
			<div className="flex flex-col">
				{/* Hero */}
				<section className="relative overflow-hidden pb-24 pt-28 sm:pb-32 sm:pt-36">
					<div className="absolute inset-0 -z-10 overflow-hidden">
						<div className="absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-accent/4 blur-3xl" />
					</div>
					<div className="mx-auto max-w-7xl px-4 sm:px-6">
						<div className="mx-auto max-w-2xl text-center">
							<div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/15 bg-accent/5 px-4 py-1.5 text-[13px] font-medium text-accent shadow-[var(--shadow-xs)]">
								<Rocket className="h-3.5 w-3.5" />
								Compose-Native Control Plane
							</div>
							<h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
								Run Docker <span className="text-accent">Operations Smarter</span>
							</h1>
							<p className="mx-auto mt-6 max-w-lg text-[15px] leading-relaxed text-muted">
								Dockroot gives teams a unified control plane for Docker Compose deployments, runtime
								operations, monitoring, and tenant-aware infrastructure management.
							</p>
							<div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
								<Link
									href="/sign-up"
									className="inline-flex items-center rounded-xl bg-accent px-6 py-3 text-[14px] font-medium text-white shadow-[var(--shadow-md)] transition-all duration-200 hover:opacity-90 hover:shadow-[var(--shadow-lg)] active:scale-[0.97]"
								>
									<Lock className="mr-2 h-3.5 w-3.5" />
									Get Started
								</Link>
								<Link
									href="/dashboard"
									className="inline-flex items-center rounded-xl border border-default/15 bg-surface px-6 py-3 text-[14px] font-medium shadow-[var(--shadow-xs)] transition-all duration-200 hover:border-default/30 hover:shadow-[var(--shadow-sm)] active:scale-[0.97]"
								>
									View Dashboard
									<ArrowRight className="ml-2 h-3.5 w-3.5" />
								</Link>
							</div>
						</div>
					</div>
				</section>

				{/* Features */}
				<section className="border-t border-default/8 py-24 sm:py-28">
					<div className="mx-auto max-w-7xl px-4 sm:px-6">
						<div className="mx-auto mb-14 max-w-lg text-center">
							<h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Everything You Need</h2>
							<p className="mt-3 text-[15px] text-muted">
								The operational building blocks to deploy, observe, and manage containerized
								workloads from one place.
							</p>
						</div>
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{features.map((feature) => (
								<div
									key={feature.title}
									className="group rounded-xl border border-default/10 bg-surface p-5 shadow-[var(--shadow-xs)] transition-all duration-200 hover:border-accent/20 hover:shadow-[var(--shadow-md)]"
								>
									<div className="mb-4 flex items-center gap-3">
										<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/8 transition-colors group-hover:bg-accent/12">
											<feature.icon className="h-5 w-5 text-accent" />
										</div>
										<h3 className="text-[15px] font-semibold">{feature.title}</h3>
									</div>
									<p className="text-[13px] leading-relaxed text-muted">{feature.description}</p>
								</div>
							))}
						</div>
					</div>
				</section>

				{/* CTA */}
				<section className="border-t border-default/8 py-24 sm:py-28">
					<div className="mx-auto max-w-7xl px-4 sm:px-6">
						<div className="mx-auto max-w-lg text-center">
							<h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Ready to Deploy?</h2>
							<p className="mt-3 text-[15px] text-muted">
								Bring Dockroot up locally, configure your instance, and start managing deployments
								from the control plane.
							</p>
							<div className="mt-10 overflow-hidden rounded-xl border border-default/10 bg-console shadow-[var(--shadow-md)]">
								<pre className="overflow-x-auto p-4 text-left text-[13px] leading-relaxed">
									<code className="text-console-foreground">
										{`git clone <your-repo>
cd dockroot
cp .env.local.example .env.local
make dev-full`}
									</code>
								</pre>
							</div>
						</div>
					</div>
				</section>
			</div>
		</PublicLayout>
	);
}
