import { pillars } from "./constants";

export function HomePillarsSection() {
	return (
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
	);
}
