import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { getServerSession } from "@/lib/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
	const session = await getServerSession();

	if (!session) {
		redirect("/sign-in");
	}

	return <DashboardShell>{children}</DashboardShell>;
}
