import { createAuthClient } from "better-auth/react";
import { publicEnv } from "@/lib/public-env";

export const authClient = createAuthClient({
	baseURL: publicEnv.appUrl,
});

export const { signIn, signUp, signOut, useSession } = authClient;
