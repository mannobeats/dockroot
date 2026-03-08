"use client";

import { Layers3, Lock, LogIn, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "@/lib/auth-client";

export default function SignInPage() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		setLoading(true);

		try {
			const result = await signIn.email({ email, password });
			if (result.error) {
				setError(result.error.message || "Invalid credentials");
			} else {
				router.push("/dashboard");
			}
		} catch {
			setError("Something went wrong. Please try again.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="rounded-xl border border-default/10 bg-surface">
			<div className="flex flex-col items-center gap-2 px-6 pt-8">
				<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground text-background">
					<Layers3 className="h-4 w-4" />
				</div>
				<h1 className="mt-1 text-lg font-semibold">Welcome back</h1>
				<p className="text-sm text-muted">Sign in to Dockroot</p>
			</div>
			<form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-6">
				{error && (
					<div className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
						{error}
					</div>
				)}
				<div className="flex flex-col gap-1.5">
					<label htmlFor="email" className="text-xs font-medium text-muted">
						Email
					</label>
					<div className="relative">
						<Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
						<input
							id="email"
							type="email"
							placeholder="you@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							className="h-10 w-full rounded-lg border border-default/10 bg-background pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/20"
						/>
					</div>
				</div>
				<div className="flex flex-col gap-1.5">
					<label htmlFor="password" className="text-xs font-medium text-muted">
						Password
					</label>
					<div className="relative">
						<Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
						<input
							id="password"
							type="password"
							placeholder="Enter your password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							className="h-10 w-full rounded-lg border border-default/10 bg-background pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/20"
						/>
					</div>
				</div>
				<button
					type="submit"
					disabled={loading}
					className="mt-1 inline-flex h-10 w-full items-center justify-center rounded-lg bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
				>
					{loading ? (
						"Signing in..."
					) : (
						<>
							<LogIn className="mr-1.5 h-3.5 w-3.5" />
							Sign In
						</>
					)}
				</button>
			</form>
			<div className="border-t border-default/10 px-6 py-4 text-center">
				<p className="text-xs text-muted">Account creation is controlled by the instance owner.</p>
			</div>
		</div>
	);
}
