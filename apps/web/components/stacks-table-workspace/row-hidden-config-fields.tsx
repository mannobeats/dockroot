export function StackRowConfigFileFields({
	configFiles,
	actionName,
}: {
	configFiles: string[];
	actionName: string;
}) {
	return configFiles.map((configFile) => (
		<input
			key={`${actionName}-${configFile}`}
			type="hidden"
			name="configFiles"
			value={configFile}
		/>
	));
}
