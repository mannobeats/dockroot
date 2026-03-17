export interface InstallationRepository {
	id: number;
	name: string;
	full_name: string;
	private: boolean;
	default_branch: string;
	owner: {
		login: string;
	};
}

export interface InstallationOption {
	id: string;
	providerId?: string | null;
	appSlug?: string | null;
	accountLogin: string;
	accountType: string | null;
	repositories: InstallationRepository[];
	repositoryError?: string;
}

export interface GitHubProviderOption {
	id: string;
	name: string;
	appSlug: string;
	githubAppId: string;
	createdAt: string | Date;
	updatedAt: string | Date;
}
