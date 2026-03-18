import { Input } from "@/components/ui/input";

export function StackGitHubConfigureAutoDeploySection({
	autoDeployEnabled,
	autoDeployPaths,
	setAutoDeployEnabled,
	setAutoDeployPaths,
}: {
	autoDeployEnabled: boolean;
	autoDeployPaths: string;
	setAutoDeployEnabled: (value: boolean) => void;
	setAutoDeployPaths: (value: string) => void;
}) {
	return (
		<div className="flex items-center gap-3 rounded-lg border border-default/8 px-3 py-2.5">
			<label className="flex items-center gap-2 text-xs">
				<input
					type="checkbox"
					checked={autoDeployEnabled}
					onChange={(event) => setAutoDeployEnabled(event.target.checked)}
				/>
				<span className="font-medium">Auto-deploy on push</span>
			</label>
			{autoDeployEnabled ? (
				<Input
					value={autoDeployPaths}
					onChange={(event) => setAutoDeployPaths(event.target.value)}
					placeholder="Path filters (optional)"
					inputSize="sm"
					className="flex-1 text-xs"
				/>
			) : null}
		</div>
	);
}
