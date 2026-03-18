import { ArrowRight } from "lucide-react";
import { LinkButton } from "@/components/ui/link-button";
import { ctaIcon as Blocks } from "./constants";

export function HomeCtaSection({ appName }: { appName: string }) {
	return (
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
							Use {appName} as the operational center of your platform and give every team a clean
							path from Compose definition to production runtime.
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
							<ArrowRight className="h-4 w-4" />
						</LinkButton>
					</div>
				</div>
			</div>
		</section>
	);
}
