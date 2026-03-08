import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	transpilePackages: ["@dockroot/auth", "@dockroot/db"],
	headers: async () => [
		{
			source: "/(.*)",
			headers: [
				{
					key: "Content-Security-Policy",
					value: "base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
				},
				{ key: "Cross-Origin-Opener-Policy", value: "same-origin" },
				{ key: "Cross-Origin-Resource-Policy", value: "same-origin" },
				{ key: "Origin-Agent-Cluster", value: "?1" },
				{ key: "X-Frame-Options", value: "DENY" },
				{ key: "X-Content-Type-Options", value: "nosniff" },
				{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
				{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
			],
		},
	],
};

export default nextConfig;
