import { describe, it, expect, vi } from "vitest";

describe("env helper getGroqApiKeyForModel", () => {
	it("falls back to shared key when no per-model key is set", async () => {
		vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
		vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon");
		vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service");
		vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://test.com");
		vi.stubEnv("GROQ_API_KEY", "shared-key");

		const { getGroqApiKeyForModel } = await import("@/lib/env");
		expect(getGroqApiKeyForModel("flash")).toBe("shared-key");
		expect(getGroqApiKeyForModel("unknown")).toBe("shared-key");
	});
});
