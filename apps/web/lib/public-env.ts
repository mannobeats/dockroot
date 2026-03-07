export const publicEnv = {
	appName: process.env.NEXT_PUBLIC_APP_NAME || "Lab Starter",
	appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
} as const;
