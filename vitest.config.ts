import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		globals: true,
		setupFiles: ["src/test/setup.ts"],
		coverage: {
			provider: "v8",
			include: ["src/lib/**/*.ts", "src/app/api/webhooks/evolution/route.ts"],
			exclude: [
				"src/lib/supabase/**",
				"src/lib/data/service.ts",
				"src/lib/data/export.ts",
				"src/lib/data/wilayas.ts",
			],
			reporter: ["text", "text-summary", "html", "json"],
			// Coverage thresholds: enabled 2026-06-06 with realistic baselines.
			// Phase 0: baseline matches current coverage to prevent regression.
			// Phase 4 (AAA Sprint): ramp to 100% per module.
			// See docs/ultimate-design-system.md §16 and readiness assessment for targets.
			thresholds: {
				"src/lib/automation/confirmation.ts": { statements: 95, branches: 90 },
				"src/lib/ai/extraction.ts": { statements: 65, branches: 55 },
				"src/lib/ai/upsell-engine.ts": { statements: 95, branches: 75 },
				"src/lib/ai/models/router.ts": { statements: 80, branches: 75 },
				"src/lib/ai/models/classifier.ts": { statements: 85, branches: 80 },
				"src/lib/import/engine.ts": { statements: 80, branches: 70 },
				"src/lib/data/product-service.ts": { statements: 70, branches: 55 },
				"src/lib/delivery/adapters.ts": { statements: 35, branches: 15 },
				"src/lib/data/auth-service.ts": { statements: 55, branches: 50 },
				"src/lib/api-wrapper.ts": { statements: 65, branches: 60 },
				"src/app/api/webhooks/evolution/route.ts": { statements: 100, branches: 100 },
			},
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
