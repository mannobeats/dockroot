export const publicEnv = {
	appName: process.env.NEXT_PUBLIC_APP_NAME || "Dockroot",
	appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3080",
} as const;
