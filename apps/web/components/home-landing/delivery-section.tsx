import { ArrowRight } from "lucide-react";
import { LinkButton } from "@/components/ui/link-button";
import { capabilities, checkpoints } from "./constants";

export function HomeDeliverySection() {
	return (
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
	);
}
