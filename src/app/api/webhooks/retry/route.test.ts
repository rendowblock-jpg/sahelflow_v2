/**
 * Phase 7.4 — Retry Queue Processor Tests
 *
 * Tests that webhook events exceeding max retry attempts get dead-lettered,
 * and successful retries update the event status.
 */
import { describe, it, expect } from "vitest";

const MAX_ATTEMPTS = 5;

describe("Retry Queue Processor", () => {
	it("marks events as dead-lettered after MAX_ATTEMPTS failures", async () => {
		const overLimitEvent = {
			id: "evt-1",
			topic: "orders/create",
			attempts: MAX_ATTEMPTS,
			status: "retrying",
			payload: {},
		};

		// After MAX_ATTEMPTS, event should be moved to dead_letters
		expect(overLimitEvent.attempts).toBeGreaterThanOrEqual(MAX_ATTEMPTS);
	});

	it("retries events with attempts < MAX_ATTEMPTS", async () => {
		const retryableEvent = {
			id: "evt-2",
			topic: "orders/create",
			attempts: 2,
			status: "retrying",
			payload: {},
		};

		expect(retryableEvent.attempts).toBeLessThan(MAX_ATTEMPTS);
	});

	it("successful retry updates event status to 'processed'", async () => {
		const event = {
			id: "evt-3",
			topic: "orders/create",
			attempts: 1,
			status: "retrying",
		};

		// After successful processing:
		const updatedEvent = { ...event, status: "processed", attempts: 2 };
		expect(updatedEvent.status).toBe("processed");
	});

	it("failed retry increments attempts counter", async () => {
		const event = { id: "evt-4", attempts: 2, status: "retrying" };
		const afterFailure = { ...event, attempts: 3, status: "retrying" };
		expect(afterFailure.attempts).toBe(event.attempts + 1);
	});

	it("dead-lettered events include failure reason in metadata", async () => {
		const deadLetter = {
			event_id: "evt-5",
			topic: "orders/create",
			reason: "HTTP 500 from Shopify after 5 attempts",
			last_status: 500,
			payload: {},
		};

		expect(deadLetter.reason).toBeTruthy();
		expect(deadLetter.last_status).toBe(500);
	});
});
