import type {
	ComponentPropsWithoutRef,
	HTMLAttributes,
	ReactNode,
	TdHTMLAttributes,
	ThHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

export function DataTable({
	className,
	...props
}: ComponentPropsWithoutRef<"table">) {
	return (
		<div className="table-scroll">
			<table className={cn("min-w-full text-left text-sm", className)} {...props} />
		</div>
	);
}

export function DataTableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
	return <thead className={cn(className)} {...props} />;
}

export function DataTableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
	return (
		<th
			className={cn("border-b border-default/10 px-4 py-3 text-xs font-medium text-muted", className)}
			{...props}
		/>
	);
}

export function DataTableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
	return <tbody className={cn("divide-y divide-default/5", className)} {...props} />;
}

export function DataTableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
	return <tr className={cn("transition-colors hover:bg-foreground/[0.02]", className)} {...props} />;
}

export function DataTableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
	return <td className={cn("px-4 py-3", className)} {...props} />;
}

export function DataTableEmpty({
	colSpan,
	children,
}: {
	colSpan: number;
	children: ReactNode;
}) {
	return (
		<tr>
			<td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-muted">
				{children}
			</td>
		</tr>
	);
}
