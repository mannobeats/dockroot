"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

const AppThemeProvider = ThemeProvider as unknown as React.ComponentType<
	React.PropsWithChildren<{
		attribute: "class";
		defaultTheme: string;
		enableSystem: boolean;
		disableTransitionOnChange: boolean;
	}>
>;

export function Providers({ children }: { children: ReactNode }) {
	return (
		<AppThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
			{children}
		</AppThemeProvider>
	);
}
