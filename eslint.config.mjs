import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
	...nextVitals,
	...nextTs,
	// Override default ignores of eslint-config-next.
	globalIgnores([
		// Default ignores of eslint-config-next:
		".next/**",
		"out/**",
		"build/**",
		"next-env.d.ts",
		// Build artifacts
		"tsconfig.tsbuildinfo",
		"coverage/**",
		"scripts/**",
	]),
	{
		name: "sahelflow/custom-rules",
		rules: {
			// ── SahelFlow Project Conventions ──

			// Ban console.error for user-facing feedback (use useToast())
			"no-restricted-syntax": [
				"warn",
				{
					selector:
						"CallExpression[callee.object.name='console'][callee.property.name='error']",
					message:
						"Use useToast() from ToastProvider for user-facing errors, not console.error.",
				},
			],

			// Ban alert/confirm dialogs
			"no-restricted-globals": [
				"error",
				{ name: "alert", message: "Use useToast() instead of alert()." },
				{
					name: "confirm",
					message: "Use custom React modals instead of confirm().",
				},
			],

			// Ban openai package (all LLM calls go through groq.ts)
			"no-restricted-imports": [
				"error",
				{
					paths: [
						{
							name: "openai",
							message:
								"All LLM calls must go through src/lib/agents/groq.ts. Do NOT import openai.",
						},
					],
				},
			],

			// Discourage explicit any
			"@typescript-eslint/no-explicit-any": "error",

			// Prefer const for never-reassigned variables
			"prefer-const": "error",

			// Enforce strict TypeScript
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
		},
	},
	{
		// Server API routes and library files cannot use React hooks like useToast()
		// Allow console.error for server-side logging
		name: "sahelflow/server-files",
		files: ["src/app/api/**/*", "src/lib/**/*.ts"],
		rules: {
			"no-restricted-syntax": "off",
		},
	},
	{
		// Allow console in specific utility/test files
		name: "sahelflow/allow-console-in-utils",
		files: ["src/lib/env.ts", "src/test/**/*"],
		rules: {
			"no-restricted-syntax": "off",
		},
	},
	{
		// Error boundaries need console.error for developer debugging
		name: "sahelflow/error-boundary",
		files: [
			"src/components/ui/ErrorBoundary.tsx",
			"src/app/(dashboard)/dashboard/error.tsx",
		],
		rules: {
			"no-restricted-syntax": "off",
		},
	},
	{
		// Tests need flexibility for mocks
		name: "sahelflow/tests",
		files: ["**/*.test.ts", "**/*.test.tsx"],
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
		},
	},
	{
		// Disable overly aggressive react-hooks rule that flags standard data-fetching patterns
		// useEffect(() => { loadData() }, [loadData]) where loadData = useCallback(...) is valid
		name: "sahelflow/allow-data-fetching-effects",
		files: ["src/**/*"],
		rules: {
			"react-hooks/set-state-in-effect": "off",
		},
	},
]);

export default eslintConfig;
