import { publicEnv } from "@/lib/public-env";
import { HomeCtaSection } from "./cta-section";
import { HomeDeliverySection } from "./delivery-section";
import { HomeHeroStageSection } from "./hero-stage-section";
import { HomePillarsSection } from "./pillars-section";

export function HomeLanding() {
	return (
		<div className="landing-shell relative isolate overflow-hidden">
			<div className="landing-orb landing-orb--one" aria-hidden />
			<div className="landing-orb landing-orb--two" aria-hidden />
			<div className="landing-grid-overlay" aria-hidden />
			<HomeHeroStageSection appName={publicEnv.appName} />
			<HomePillarsSection />
			<HomeDeliverySection />
			<HomeCtaSection appName={publicEnv.appName} />
		</div>
	);
}
