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
		title: "Docker Ready",
		description: "Production Dockerfile and docker-compose with PostgreSQL out of the box.",
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
				<section className="relative overflow-hidden pb-20 pt-24 sm:pb-28 sm:pt-32">
					<div className="absolute inset-0 -z-10 overflow-hidden">
						<div className="absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-accent/8 blur-3xl" />
					</div>
					<div className="mx-auto max-w-7xl px-4 sm:px-6">
						<div className="mx-auto max-w-2xl text-center">
							<div className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3.5 py-1 text-[13px] font-medium text-accent">
								<Rocket className="h-3.5 w-3.5" />
								Production-Ready Template
							</div>
							<h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
								Build Self-Hosted{" "}
								<span className="bg-linear-to-r from-accent to-secondary bg-clip-text text-transparent">
									Apps Faster
								</span>
							</h1>
							<p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-muted">
								A beautifully crafted Next.js template for IT professionals and homelab enthusiasts.
								Authentication, database, Docker — all wired up and ready to go.
							</p>
							<div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
								<Link
									href="/sign-up"
									className="inline-flex items-center rounded-lg bg-accent px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-accent/90"
								>
									<Lock className="mr-1.5 h-3.5 w-3.5" />
									Get Started
								</Link>
								<Link
									href="/dashboard"
									className="inline-flex items-center rounded-lg border border-default/50 px-5 py-2.5 text-[14px] font-medium transition-colors hover:bg-default/30"
								>
									View Dashboard
									<ArrowRight className="ml-1.5 h-3.5 w-3.5" />
								</Link>
							</div>
						</div>
					</div>
				</section>

				{/* Features */}
				<section className="border-t border-default/30 py-20 sm:py-24">
					<div className="mx-auto max-w-7xl px-4 sm:px-6">
						<div className="mx-auto mb-12 max-w-lg text-center">
							<h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Everything You Need</h2>
							<p className="mt-3 text-[15px] text-muted">
								A complete foundation for building self-hosted applications with modern tools.
							</p>
						</div>
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{features.map((feature) => (
								<div
									key={feature.title}
									className="group rounded-xl border border-default/40 bg-surface p-5 transition-all hover:border-accent/30 hover:shadow-sm"
								>
									<div className="mb-3 flex items-center gap-3">
										<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
											<feature.icon className="h-4.5 w-4.5 text-accent" />
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
				<section className="border-t border-default/30 py-20 sm:py-24">
					<div className="mx-auto max-w-7xl px-4 sm:px-6">
						<div className="mx-auto max-w-lg text-center">
							<h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Ready to Build?</h2>
							<p className="mt-3 text-[15px] text-muted">
								Clone this template, spin up Docker, and start building your next self-hosted
								application in minutes.
							</p>
							<div className="mt-8 overflow-hidden rounded-xl border border-default/40 bg-surface">
								<pre className="overflow-x-auto p-5 text-left text-[13px] leading-relaxed">
									<code className="text-foreground/80">
										{`git clone <your-repo>
cd lab-starter
pnpm install
docker compose up -d
pnpm run db:push
pnpm dev`}
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
