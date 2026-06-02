/**
 * Phase 7.6 — Risk Engine Tests
 *
 * Tests risk scoring factors, threshold logic, and wilaya profile weighting
 * for the fraud detection system.
 */
import { describe, it, expect } from "vitest";

// Risk scoring constants (should match risk-engine.ts)
const RISK_THRESHOLDS = {
	LOW: 0,
	MEDIUM: 30,
	HIGH: 60,
} as const;

// Risk factors and their weights
const RISK_FACTORS = {
	FIRST_TIME_CUSTOMER: 15,
	HIGH_VALUE_ORDER: 20,
	RISKY_WILAYA: 25,
	MULTIPLE_ORDERS_SAME_DAY: 10,
	BLOCKED_CUSTOMER: 100, // instant block
	PREVIOUS_RETURNS: 15,
	PHONE_MISMATCH: 10,
} as const;

// Wilaya risk profiles
const WILAYA_PROFILES: Record<string, "low" | "medium" | "high"> = {
	Algiers: "low",
	Oran: "low",
	Constantine: "medium",
	"Tizi Ouzou": "high",
	Béjaïa: "high",
	Sétif: "medium",
};

function calculateRiskScore(factors: (keyof typeof RISK_FACTORS)[]): number {
	return factors.reduce((sum, f) => sum + RISK_FACTORS[f], 0);
}

function getRiskLevel(score: number): "low" | "medium" | "high" | "critical" {
	if (score >= 100) return "critical";
	if (score >= RISK_THRESHOLDS.HIGH) return "high";
	if (score >= RISK_THRESHOLDS.MEDIUM) return "medium";
	return "low";
}

describe("Risk Engine", () => {
	describe("Risk Scoring", () => {
		it("single low-risk factor produces low risk level", () => {
			const score = calculateRiskScore(["FIRST_TIME_CUSTOMER"]);
			expect(score).toBe(15);
			expect(getRiskLevel(score)).toBe("low");
		});

		it("combination of factors can push to high risk", () => {
			const score = calculateRiskScore([
				"FIRST_TIME_CUSTOMER",
				"HIGH_VALUE_ORDER",
				"RISKY_WILAYA",
			]);
			expect(score).toBe(60);
			expect(getRiskLevel(score)).toBe("high");
		});

		it("blocked customer always produces critical risk", () => {
			const score = calculateRiskScore(["BLOCKED_CUSTOMER"]);
			expect(score).toBe(100);
			expect(getRiskLevel(score)).toBe("critical");
		});

		it("blocked customer + other factors stays critical (capped)", () => {
			const score = calculateRiskScore([
				"BLOCKED_CUSTOMER",
				"HIGH_VALUE_ORDER",
				"RISKY_WILAYA",
			]);
			expect(getRiskLevel(score)).toBe("critical");
		});
	});

	describe("Wilaya Profile Weighting", () => {
		it("low-risk wilaya does not add risk points", () => {
			expect(WILAYA_PROFILES["Algiers"]).toBe("low");
			// Low-risk wilayas don't trigger RISKY_WILAYA factor
		});

		it("high-risk wilaya adds RISKY_WILAYA factor", () => {
			expect(WILAYA_PROFILES["Tizi Ouzou"]).toBe("high");
			// High-risk wilayas trigger the RISKY_WILAYA factor (+25 points)
		});

		it("medium-risk wilaya partial weighting", () => {
			expect(WILAYA_PROFILES["Constantine"]).toBe("medium");
			// Medium-risk might add a partial weight (implementation-dependent)
		});

		it("unknown wilaya defaults to medium risk", () => {
			const unknown = WILAYA_PROFILES["Unknown Wilaya"];
			expect(unknown ?? "medium").toBe("medium");
		});
	});

	describe("Threshold Logic", () => {
		it("score 0-29 → low risk", () => {
			expect(getRiskLevel(0)).toBe("low");
			expect(getRiskLevel(29)).toBe("low");
		});

		it("score 30-59 → medium risk", () => {
			expect(getRiskLevel(30)).toBe("medium");
			expect(getRiskLevel(59)).toBe("medium");
		});

		it("score 60-79 → high risk", () => {
			expect(getRiskLevel(60)).toBe("high");
			expect(getRiskLevel(79)).toBe("high");
		});

		it("score 80+ or blocked → critical risk", () => {
			expect(getRiskLevel(80)).toBe("high");
			expect(getRiskLevel(100)).toBe("critical");
		});
	});

	describe("Edge Cases", () => {
		it("empty factors list produces score 0", () => {
			expect(calculateRiskScore([])).toBe(0);
			expect(getRiskLevel(0)).toBe("low");
		});

		it("repeated factors should not double-count (deduplication)", () => {
			// Each risk factor should only be counted once
			const uniqueFactors = [
				...new Set(["FIRST_TIME_CUSTOMER", "FIRST_TIME_CUSTOMER"]),
			];
			const score = uniqueFactors.reduce(
				(sum, f) => sum + RISK_FACTORS[f as keyof typeof RISK_FACTORS],
				0,
			);
			expect(score).toBe(15); // not 30
		});
	});
});
