"use client";

import { ReactNode } from "react";
import { EmptyState } from "../EmptyState";
import { SkeletonCard } from "../Skeleton";

interface ChartContainerProps {
	title: string;
	children: ReactNode;
	loading?: boolean;
	empty?: boolean;
	emptyTitle?: string;
	emptyDescription?: string;
	height?: number;
	className?: string;
}

export function ChartContainer({
	title,
	children,
	loading = false,
	empty = false,
	emptyTitle,
	emptyDescription,
	height = 260,
	className = "",
}: ChartContainerProps) {

	return (
		<div
			className={`sf-card ${className}`}
		>
			<h3 className="sf-section-title">{title}</h3>
			{loading ? (
				<SkeletonCard />
			) : empty ? (
				<div
					style={{
						height,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<EmptyState
						title={emptyTitle || "No data"}
						description={
							emptyDescription || "There is no data to display for this chart."
						}
					/>
				</div>
			) : (
				<div style={{ width: "100%", height }}>{children}</div>
			)}
		</div>
	);
}
