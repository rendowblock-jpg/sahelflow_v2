import { describe, it, expect } from "vitest";
import { tools } from "../agent";
import { DEFAULT_MODEL } from "../../agents/groq";

describe("AI Agent Tools & Config", () => {
	it("uses the correct upgraded model (llama-4-scout for free tier sustainability)", () => {
		expect(DEFAULT_MODEL).toBe("meta-llama/llama-4-scout-17b-16e-instruct");
	});

	describe("Tools Array Structure", () => {
		it("contains exactly 24 tools", () => {
			expect(tools.length).toBe(24);
		});

		it("has no duplicate tool names", () => {
			const toolNames = tools.map((t) => t.name);
			const uniqueNames = new Set(toolNames);
			expect(uniqueNames.size).toBe(toolNames.length);
		});

		it("has all required fields for every tool", () => {
			tools.forEach((tool) => {
				expect(tool).toHaveProperty("name");
				expect(typeof tool.name).toBe("string");
				expect(tool.name.length).toBeGreaterThan(0);

				expect(tool).toHaveProperty("description");
				expect(typeof tool.description).toBe("string");
				expect(tool.description.length).toBeGreaterThan(0);

				if (tool.schema) {
					expect(typeof tool.schema).toBe("object");
				}

				expect(tool).toHaveProperty("execute");
				expect(typeof tool.execute).toBe("function");
			});
		});
	});
});
