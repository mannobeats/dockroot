import { redirect } from "next/navigation";

export default async function LegacyProjectStackPage({
	params,
}: {
	params: Promise<{ stackId: string }>;
}) {
	const { stackId } = await params;
	redirect(`/dashboard/stacks/${stackId}`);
}
