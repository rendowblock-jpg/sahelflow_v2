"use client";

import { useEffect, useState, memo } from "react";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { getLocaleTag } from "@/components/ui/charts/chart-utils";

interface AnimatedStatCardProps {
	label: string;
	value: string;
	variant: "brand" | "success" | "warning" | "danger";
	icon?: LucideIcon;
	delay?: number;
	sparklinePercent?: number;
}

function parseNumericValue(str: string): {
	prefix: string;
	num: number;
	suffix: string;
} {
	const match = str.match(/^([^0-9]*)([0-9,.]+)([^0-9]*)$/);
	if (!match) return { prefix: "", num: 0, suffix: str };
	const num = parseFloat(match[2].replace(/,/g, ""));
	return { prefix: match[1], num: isNaN(num) ? 0 : num, suffix: match[3] };
}

function AnimatedStatCardComponent({
	label,
	value,
	variant,
	icon: Icon,
	delay = 0,
	sparklinePercent,
}: AnimatedStatCardProps) {
	const { locale } = useI18n();
	const [displayValue, setDisplayValue] = useState("0");
	const [mounted, setMounted] = useState(false);
	const { prefix, num, suffix } = parseNumericValue(value);

	useEffect(() => {
		const t = setTimeout(() => setMounted(true), delay);
		return () => clearTimeout(t);
	}, [delay]);

	useEffect(() => {
		if (num === 0) {
			setDisplayValue(value);
			return;
		}
		const duration = 900;
		const startTime = performance.now();
		let raf: number;

		const tick = (now: number) => {
			const elapsed = now - startTime;
			const t = Math.min(elapsed / duration, 1);
			const eased = 1 - Math.pow(1 - t, 3);
			const current = Math.round(eased * num);
			setDisplayValue(
				`${prefix}${current.toLocaleString(getLocaleTag(locale))}${suffix}`,
			);
			if (t < 1) raf = requestAnimationFrame(tick);
		};

		const timer = setTimeout(() => {
			raf = requestAnimationFrame(tick);
		}, delay);

		return () => {
			clearTimeout(timer);
			if (raf) cancelAnimationFrame(raf);
		};
	}, [num, prefix, suffix, delay, value, locale]);

	// Only show sparkline when real trend data is provided.
	// Previously computed a fake ~83% value from the number itself — decorative, not real data.
	const spark = sparklinePercent !== undefined
		? Math.min(100, Math.max(0, sparklinePercent))
		: null;

	return (
		<div
			className={`sf-stat-card-aaa sf-stat-card-aaa--${variant}`}
			style={{
				opacity: mounted ? 1 : 0,
				transform: mounted ? "translateY(0)" : "translateY(8px)",
				transition: `opacity 0.35s ease ${delay}ms, transform 0.35s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
			}}
		>
			<div className="sf-stat-card-aaa__header">
				<div>
					<p className="sf-stat-card-aaa__label">{label}</p>
					<p className="sf-stat-card-aaa__value sf-text-tabular">{displayValue}</p>
				</div>
				{Icon && (
					<div className="sf-stat-card-aaa__icon">
						<Icon size={18} strokeWidth={2} />
					</div>
				)}
			</div>
			{spark !== null && (
				<div className="sf-stat-card-aaa__sparkline">
					<div
						className="sf-stat-card-aaa__sparkline-fill"
						style={{ width: `${spark}%` }}
					/>
				</div>
			)}
		</div>
	);
}

export const AnimatedStatCard = memo(AnimatedStatCardComponent);
