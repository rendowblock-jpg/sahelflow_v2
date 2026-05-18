"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface FadeInProps {
	children: ReactNode;
	delay?: number;
	duration?: number;
	className?: string;
	direction?: "up" | "down" | "left" | "right" | "none";
	distance?: number;
}

export function FadeIn({
	children,
	delay = 0,
	duration = 0.4,
	className = "",
	direction = "up",
	distance = 12,
}: FadeInProps) {
	const dir =
		typeof document !== "undefined" && document.dir === "rtl" ? "rtl" : "ltr";

	const initial: Record<string, number> = { opacity: 0 };
	if (direction === "up") initial["y"] = distance;
	if (direction === "down") initial["y"] = -distance;
	if (direction === "left") initial["x"] = dir === "rtl" ? -distance : distance;
	if (direction === "right")
		initial["x"] = dir === "rtl" ? distance : -distance;

	return (
		<motion.div
			initial={initial}
			animate={{ opacity: 1, x: 0, y: 0 }}
			transition={{
				duration,
				delay,
				ease: [0.16, 1, 0.3, 1],
			}}
			className={className}
		>
			{children}
		</motion.div>
	);
}
