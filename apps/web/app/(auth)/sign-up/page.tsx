"use client";

import { Lock, Mail, Server, User, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signUp } from "@/lib/auth-client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default function SignUpPage() {
	const router = useRouter();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		setLoading(true);

		try {
			const result = await signUp.email({ name, email, password });
			if (result.error) {
				setError(result.error.message || "Could not create account");
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
				<div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-white">
					<Server className="h-5 w-5" />
				</div>
				<h1 className="mt-1 text-lg font-semibold">Create Account</h1>
				<p className="text-[13px] text-muted">Get started with your self-hosted application</p>
			</div>
			<form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-6">
				{error ? <Alert className="text-[13px]">{error}</Alert> : null}
				<Field>
					<FieldLabel htmlFor="name" className="text-[13px] font-medium text-foreground">
						Name
					</FieldLabel>
					<div className="relative">
						<User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
						<Input
							id="name"
							type="text"
							placeholder="Your name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
							inputSize="md"
							withIcon
							className="text-[13px]"
						/>
					</div>
				</Field>
				<Field>
					<FieldLabel htmlFor="email" className="text-[13px] font-medium text-foreground">
						Email
					</FieldLabel>
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
							className="text-[13px]"
						/>
					</div>
				</Field>
				<Field>
					<FieldLabel htmlFor="password" className="text-[13px] font-medium text-foreground">
						Password
					</FieldLabel>
					<div className="relative">
						<Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
						<Input
							id="password"
							type="password"
							placeholder="Create a password (min 8 chars)"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							minLength={8}
							inputSize="md"
							withIcon
							className="text-[13px]"
						/>
					</div>
				</Field>
				<Button
					type="submit"
					disabled={loading}
					size="lg"
					fullWidth
					className="mt-1 text-[14px]"
				>
					{loading ? (
						"Creating account..."
					) : (
						<>
							<UserPlus className="mr-1.5 h-3.5 w-3.5" />
							Create Account
						</>
					)}
				</Button>
			</form>
			<div className="border-t border-default/30 px-6 py-4 text-center">
				<p className="text-[13px] text-muted">
					Already have an account?{" "}
					<Link href="/sign-in" className="font-medium text-accent hover:underline">
						Sign In
					</Link>
				</p>
				<p className="mt-2 text-[12px] text-muted">
					If registration is disabled, ask the instance owner to provision your account.
				</p>
			</div>
		</>
	);
}
