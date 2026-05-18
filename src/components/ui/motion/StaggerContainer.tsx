"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface StaggerContainerProps {
	children: ReactNode;
	className?: string;
	stagger?: number;
	delay?: number;
}

export const itemVariants = {
	hidden: { opacity: 0, y: 10 },
	show: {
		opacity: 1,
		y: 0,
		transition: {
			duration: 0.35,
			ease: [0.16, 1, 0.3, 1],
		},
	},
};

export function StaggerContainer({
	children,
	className = "",
	stagger = 0.06,
	delay = 0.05,
}: StaggerContainerProps) {
	return (
		<motion.div
			className={className}
			initial="hidden"
			animate="show"
			variants={{
				hidden: { opacity: 0 },
				show: {
					opacity: 1,
					transition: { staggerChildren: stagger, delayChildren: delay },
				},
			}}
		>
			{children}
		</motion.div>
	);
}

export function StaggerItem({
	children,
	className = "",
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<motion.div variants={itemVariants} className={className}>
			{children}
		</motion.div>
	);
}
