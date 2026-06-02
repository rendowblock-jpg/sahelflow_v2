"use client";

import { motion } from "framer-motion";
import { ReactNode, useEffect, useState } from "react";

interface FadeInProps {
	children: ReactNode;
	delay?: number;
	duration?: number;
	className?: string;
	direction?: "up" | "down" | "left" | "right" | "none";
	distance?: number;
}

/**
 * Phase 6.10: FadeIn now subscribes to document.dir changes via MutationObserver
 * so it re-renders when the locale switches between LTR and RTL.
 */
export function FadeIn({
	children,
	delay = 0,
	duration = 0.4,
	className = "",
	direction = "up",
	distance = 12,
}: FadeInProps) {
	const [dir, setDir] = useState<"ltr" | "rtl">(() => {
		if (typeof document === "undefined") return "ltr";
		return document.dir === "rtl" ? "rtl" : "ltr";
	});

	useEffect(() => {
		if (typeof document === "undefined") return;

		// Sync initial value
		setDir(document.dir === "rtl" ? "rtl" : "ltr");

		// Observe <html> dir attribute changes (triggered by locale switch)
		const observer = new MutationObserver(() => {
			setDir(document.dir === "rtl" ? "rtl" : "ltr");
		});

		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["dir"],
		});

		return () => observer.disconnect();
	}, []);

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
