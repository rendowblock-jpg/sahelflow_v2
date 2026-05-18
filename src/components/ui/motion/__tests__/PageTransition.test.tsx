import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { PageTransition } from "../PageTransition";

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
	motion: {
		div: ({
			children,
			className,
		}: {
			children: React.ReactNode;
			className?: string;
		}) => createElement("div", { className }, children),
	},
}));

describe("PageTransition", () => {
	it("renders children", () => {
		const html = renderToString(
			createElement(PageTransition, {}, createElement("span", {}, "Hello")),
		);
		expect(html).toContain("Hello");
	});

	it("applies custom className", () => {
		const html = renderToString(
			createElement(
				PageTransition,
				{ className: "custom-class" },
				createElement("span", {}, "Test"),
			),
		);
		expect(html).toContain("custom-class");
	});

	it("renders without className prop", () => {
		const html = renderToString(
			createElement(PageTransition, {}, createElement("div", {}, "No class")),
		);
		expect(html).toContain("No class");
	});

	it("renders nested elements", () => {
		const html = renderToString(
			createElement(
				PageTransition,
				{ className: "wrapper" },
				createElement("section", {}, createElement("p", {}, "Nested")),
			),
		);
		expect(html).toContain("wrapper");
		expect(html).toContain("Nested");
	});
});
