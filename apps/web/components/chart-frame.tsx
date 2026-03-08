"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

export function ChartFrame({
	className,
	children,
}: {
	className?: string;
	children: (size: { width: number; height: number }) => ReactNode;
}) {
	const ref = useRef<HTMLDivElement | null>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });

	useEffect(() => {
		const element = ref.current;
		if (!element) {
			return;
		}

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) {
				return;
			}

			const nextWidth = Math.floor(entry.contentRect.width);
			const nextHeight = Math.floor(entry.contentRect.height);

			setSize((current) => {
				if (current.width === nextWidth && current.height === nextHeight) {
					return current;
				}

				return {
					width: nextWidth,
					height: nextHeight,
				};
			});
		});

		observer.observe(element);

		return () => {
			observer.disconnect();
		};
	}, []);

	return (
		<div ref={ref} className={className}>
			{size.width > 0 && size.height > 0 ? children(size) : null}
		</div>
	);
}
