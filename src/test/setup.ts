import { vi } from "vitest";

// Provide minimal env vars so modules that import env.ts don't crash in tests
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.GROQ_API_KEY = "test-groq-key";

vi.mock("@/lib/agents/groq", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/groq")>();
  return {
    ...actual,
    callLLMJson: vi
      .fn()
      .mockRejectedValue(new Error("LLM mocked in unit tests")),
    callLLM: vi.fn().mockRejectedValue(new Error("LLM mocked in unit tests")),
    callLLMWithTools: vi
      .fn()
      .mockRejectedValue(new Error("LLM mocked in unit tests")),
  };
});

// Mock the modern AI service path so tests importing @/lib/ai/service get
// controllable mocks instead of falling through to the real Groq API.
// Individual tests can override these via vi.mocked(...).mockResolvedValueOnce(...).
vi.mock("@/lib/ai/service", () => ({
  extractOrderFromMessage: vi
    .fn()
    .mockRejectedValue(new Error("AI service mocked in unit tests")),
  askSellerAssistant: vi
    .fn()
    .mockRejectedValue(new Error("AI service mocked in unit tests")),
  generateReplySuggestions: vi
    .fn()
    .mockRejectedValue(new Error("AI service mocked in unit tests")),
}));
