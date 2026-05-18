/**
 * SahelFlow Groq Health Probe
 * Phase 64F: Cached health check to detect Groq API outages before wasting user time.
 *
 * NOTE: Both isGroqAvailable() and resetHealthCache() were removed in Phase 3
 * after audit found them as dead code (zero imports across the codebase).
 * Health monitoring is now handled reactively by the executor fallback chain.
 */

// Health cache removed — see agent.ts executeWithFallback for runtime health handling.

