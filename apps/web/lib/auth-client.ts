import { createAuthClient } from "better-auth/react";
import { publicEnv } from "@/lib/public-env";

export const authClient = createAuthClient({
	baseURL: typeof window === "undefined" ? publicEnv.appUrl : window.location.origin,
});

export const { signIn, signUp, signOut, useSession } = authClient;
