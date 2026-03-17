"use client";

import { ScrollText } from "lucide-react";
import { useState } from "react";
import { DeployLogDrawer } from "@/components/deploy-log-drawer";
import { Button } from "@/components/ui/button";

export function DeployLogTrigger({
	stackId,
	stackName,
	initialLog,
}: {
	stackId: string;
	stackName?: string;
	initialLog?: string | null;
}) {
	const [open, setOpen] = useState(false);

	return (
		<>
			<Button
				variant="outline"
				size="xs"
				onClick={() => setOpen(true)}
				title="View deploy log"
			>
				<ScrollText className="h-3.5 w-3.5" />
				Logs
			</Button>
			<DeployLogDrawer
				stackId={stackId}
				stackName={stackName}
				initialLog={initialLog}
				open={open}
				onClose={() => setOpen(false)}
			/>
		</>
	);
}
