import type { UrlObject } from "node:url";
import type { VariantProps } from "class-variance-authority";
import type { LinkProps } from "next/link";
import Link from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type LinkButtonProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> &
	VariantProps<typeof buttonVariants> &
	Pick<LinkProps, "prefetch" | "replace" | "scroll"> & {
		href: string | UrlObject;
		children: ReactNode;
	};

export function LinkButton({
	href,
	children,
	className,
	variant,
	size,
	fullWidth,
	title,
	onClick,
	prefetch,
	replace,
	scroll,
}: LinkButtonProps) {
	return (
		<Link
			href={href}
			title={title}
			onClick={onClick}
			prefetch={prefetch}
			replace={replace}
			scroll={scroll}
			className={cn(buttonVariants({ variant, size, fullWidth }), className)}
		>
			{children}
		</Link>
	);
}
