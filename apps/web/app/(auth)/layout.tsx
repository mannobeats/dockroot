import { Server } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { publicEnv } from "@/lib/public-env";
import { getServerSession } from "@/lib/session";
import { Panel } from "@/components/ui/panel";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
	const session = await getServerSession();

	if (session) {
		redirect("/dashboard");
	}

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
			<Link href="/" className="mb-8 flex items-center gap-2.5">
				<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
					<Server className="h-4 w-4" />
				</div>
				<span className="text-[16px] font-semibold tracking-tight">{publicEnv.appName}</span>
			</Link>
			<Panel tone="subtle" className="w-full max-w-md overflow-hidden">
				{children}
			</Panel>
		</div>
	);
}
