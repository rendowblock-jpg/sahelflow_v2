"use client";

import { useEffect, useState, memo } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { getLocaleTag } from "@/components/ui/charts/chart-utils";

interface AnimatedStatCardProps {
	label: string;
	value: string;
	variant: "brand" | "success" | "warning" | "danger";
	icon?: LucideIcon;
	delay?: number;
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
}: AnimatedStatCardProps) {
	const { locale } = useI18n();
	const [displayValue, setDisplayValue] = useState("0");
	const { prefix, num, suffix } = parseNumericValue(value);

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

	return (
		<motion.div
			className={`sf-card sf-stat sf-stat-${variant}`}
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{
				duration: 0.4,
				delay: delay / 1000,
				ease: [0.16, 1, 0.3, 1],
			}}
		>
			<div className="sf-flex-between">
				<div>
					<p className="sf-stat-label">{label}</p>
					<p className="sf-stat-value sf-text-tabular">{displayValue}</p>
				</div>
				{Icon && (
					<Icon
						size={20}
						className="sf-text-tertiary"
						style={{ opacity: 0.5 }}
					/>
				)}
			</div>
		</motion.div>
	);
}

export const AnimatedStatCard = memo(AnimatedStatCardComponent);
