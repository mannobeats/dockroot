"use client";

import { Layers3, Lock, LogIn, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "@/lib/auth-client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

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
		<>
			<div className="flex flex-col items-center gap-2 px-6 pt-8">
				<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground text-background">
					<Layers3 className="h-4 w-4" />
				</div>
				<h1 className="mt-1 text-lg font-semibold">Welcome back</h1>
				<p className="text-sm text-muted">Sign in to Dockroot</p>
			</div>
			<form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-6">
				{error ? <Alert>{error}</Alert> : null}
				<Field>
					<FieldLabel htmlFor="email">Email</FieldLabel>
					<div className="relative">
						<Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
						<Input
							id="email"
							type="email"
							placeholder="you@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							inputSize="md"
							withIcon
						/>
					</div>
				</Field>
				<Field>
					<FieldLabel htmlFor="password">Password</FieldLabel>
					<div className="relative">
						<Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
						<Input
							id="password"
							type="password"
							placeholder="Enter your password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							inputSize="md"
							withIcon
						/>
					</div>
				</Field>
				<Button
					type="submit"
					disabled={loading}
					size="lg"
					fullWidth
					className="mt-1"
				>
					{loading ? (
						"Signing in..."
					) : (
						<>
							<LogIn className="mr-1.5 h-3.5 w-3.5" />
							Sign In
						</>
					)}
				</Button>
			</form>
			<div className="border-t border-default/10 px-6 py-4 text-center">
				<p className="text-xs text-muted">Account creation is controlled by the instance owner.</p>
			</div>
		</>
	);
}
