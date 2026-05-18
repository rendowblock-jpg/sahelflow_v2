"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface AnimatedCardProps {
	children: ReactNode;
	className?: string;
	hoverScale?: number;
	tapScale?: number;
}

export function AnimatedCard({
	children,
	className = "",
	hoverScale = 1.01,
	tapScale = 0.99,
}: AnimatedCardProps) {
	return (
		<motion.div
			className={className}
			whileHover={{ scale: hoverScale, y: -1 }}
			whileTap={{ scale: tapScale }}
			transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
		>
			{children}
		</motion.div>
	);
}
