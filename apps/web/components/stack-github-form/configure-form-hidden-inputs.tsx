interface StackGitHubConfigureFormHiddenInputsProps {
	installationId: string;
	repositoryId: string;
	owner: string;
	repository: string;
	stackName: string;
	description: string;
	branch: string;
	composePath: string;
	envPath: string;
	composeYaml: string;
	envFileContent: string;
	autoDeployEnabled: boolean;
	autoDeployPaths: string;
}

export function StackGitHubConfigureFormHiddenInputs({
	installationId,
	repositoryId,
	owner,
	repository,
	stackName,
	description,
	branch,
	composePath,
	envPath,
	composeYaml,
	envFileContent,
	autoDeployEnabled,
	autoDeployPaths,
}: StackGitHubConfigureFormHiddenInputsProps) {
	return (
		<>
			<input type="hidden" name="installationId" value={installationId} />
			<input type="hidden" name="repositoryId" value={repositoryId} />
			<input type="hidden" name="owner" value={owner} />
			<input type="hidden" name="repository" value={repository} />
			<input type="hidden" name="name" value={stackName} />
			<input type="hidden" name="description" value={description} />
			<input type="hidden" name="branch" value={branch} />
			<input type="hidden" name="composePath" value={composePath} />
			<input type="hidden" name="envPath" value={envPath} />
			<input type="hidden" name="composeYaml" value={composeYaml} />
			<input type="hidden" name="envFileContent" value={envFileContent} />
			<input type="hidden" name="autoDeployEnabled" value={autoDeployEnabled ? "true" : "false"} />
			<input type="hidden" name="autoDeployPaths" value={autoDeployPaths} />
		</>
	);
}
