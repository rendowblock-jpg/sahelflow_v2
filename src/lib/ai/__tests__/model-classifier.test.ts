import { describe, it, expect } from "vitest";
import {
	classifyIntent,
	isFlashWorthy,
	isGreeting,
} from "../models/classifier";

describe("AI Model Classifier", () => {
	describe("Greeting detection", () => {
		it("detects English greetings", () => {
			expect(isGreeting("hello")).toBe(true);
			expect(isGreeting("Hi there")).toBe(true);
			expect(isGreeting("Hey")).toBe(true);
		});

		it("detects Arabic greetings", () => {
			expect(isGreeting("مرحبا")).toBe(true);
			expect(isGreeting("salam")).toBe(true);
			
		});

		it("detects French greetings", () => {
			expect(isGreeting("bonjour")).toBe(true);
			expect(isGreeting("salut")).toBe(true);
		});

		it("rejects non-greetings", () => {
			expect(isGreeting("show me orders")).toBe(false);
			expect(isGreeting("what is my revenue")).toBe(false);
			expect(isGreeting("")).toBe(false);
		});
	});

	describe("Flash worthiness", () => {
		it("returns true for simple extraction patterns (phone)", () => {
			expect(isFlashWorthy("0555123456")).toBe(true);
			
		});

		it("returns true for wilaya references", () => {
			expect(isFlashWorthy("Algiers wilaya 16")).toBe(true);
		});

		it("returns true for simple product requests", () => {
			expect(isFlashWorthy("bghit t-shirt")).toBe(true);
			expect(isFlashWorthy("I want this product")).toBe(true);
		});

		it("returns false for long complex messages", () => {
			expect(
				isFlashWorthy(
					"analyze my revenue trends and suggest improvements for next month",
				),
			).toBe(false);
		});
	});

	describe("Intent classification — keyword-based", () => {
		it("classifies business queries from keywords", () => {
			const intent = classifyIntent("show my dashboard stats");
			expect(intent.primaryIntent).toBe("business_query");
			expect(intent.complexity).toBe("simple");
		});

		it("classifies tool execution from keywords", () => {
			const intent = classifyIntent("create order for Ahmed");
			expect(intent.primaryIntent).toBe("tool_execution");
		});

		it("classifies creative writing from keywords", () => {
			const intent = classifyIntent("write a product description");
			expect(intent.primaryIntent).toBe("creative_writing");
			expect(intent.requiresCreativity).toBe(true);
		});

		it("classifies simple chat / greeting", () => {
			const intent = classifyIntent("hi there");
			expect(intent.primaryIntent).toBe("simple_chat");
			expect(intent.complexity).toBe("simple");
		});

		it("classifies extraction queries", () => {
			const intent = classifyIntent("extract customer phone");
			expect(intent.primaryIntent).toBe("extraction");
		});

		it("classifies code generation", () => {
			const intent = classifyIntent("generate a JSON query");
			expect(intent.primaryIntent).toBe("code_generation");
		});

		it("handles inputs with no keywords as simple_chat", () => {
			const intent = classifyIntent("get all products");
			expect(intent.primaryIntent).toBe("simple_chat");
		});

		it("returns confidence between 0 and 1", () => {
			const intent = classifyIntent("how is my revenue");
			expect(intent.confidence).toBeGreaterThanOrEqual(0);
			expect(intent.confidence).toBeLessThanOrEqual(1);
		});

		it("returns subIntents as an array", () => {
			const intent = classifyIntent("how is my revenue");
			expect(Array.isArray(intent.subIntents)).toBe(true);
		});
	});

	describe("Language detection", () => {
		it("detects Arabic script", () => {
			const intent = classifyIntent("مرحبا كيف حالك");
			expect(intent.language).toBe("ar");
		});

		it("detects French", () => {
			const intent = classifyIntent("bonjour le monde");
			expect(intent.language).toBe("fr");
		});

		it("detects English", () => {
			const intent = classifyIntent("how are you today");
			expect(intent.language).toBe("en");
		});

		it("detects mixed French-English", () => {
			const intent = classifyIntent("how are you et merci");
			expect(intent.language).toBe("mixed");
		});

		it("detects Darija via markers", () => {
			const intent = classifyIntent("bghit nchri produit");
			expect(intent.language).toBe("darija");
			expect(intent.hasDarija).toBe(true);
		});

		it("detects Darija via Franco-Arab pattern", () => {
			// Contains both Arabic and Latin-with-numbers
			const intent = classifyIntent("واش 3andi commands");
			expect(intent.language).toBe("darija");
			expect(intent.hasDarija).toBe(true);
		});
	});
});
