import { Layers3 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Panel } from "@/components/ui/panel";
import { publicEnv } from "@/lib/public-env";
import { getServerSession } from "@/lib/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
	const session = await getServerSession();

	if (session) {
		redirect("/dashboard");
	}

	return (
		<div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
			{/* Subtle gradient background orb */}
			<div className="absolute inset-0 -z-10 overflow-hidden">
				<div className="absolute left-1/2 top-1/4 h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/5 blur-3xl" />
			</div>
			<Link href="/" className="mb-8 flex items-center gap-2.5">
				<div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white shadow-[var(--shadow-sm)]">
					<Layers3 className="h-4 w-4" />
				</div>
				<span className="text-[17px] font-bold tracking-tight">{publicEnv.appName}</span>
			</Link>
			<Panel tone="subtle" className="w-full max-w-md overflow-hidden shadow-[var(--shadow-lg)]">
				{children}
			</Panel>
		</div>
	);
}
