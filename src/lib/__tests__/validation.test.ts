import { describe, it, expect } from "vitest";
import {
	evolutionWebhookSchema,
	internalWebhookSchema,
	placeOrderSchema,
	sendMessageSchema,
	aiRequestSchema,
	timingSafeEqual,
} from "@/lib/validation";

describe("validation schemas", () => {
	describe("evolutionWebhookSchema", () => {
		it("accepts valid payload", () => {
			const result = evolutionWebhookSchema.safeParse({
				event: "messages.upsert",
				instance: "sahelflow-1",
				data: { message: "hello" },
			});
			expect(result.success).toBe(true);
		});

		it("rejects missing event", () => {
			const result = evolutionWebhookSchema.safeParse({ instance: "x" });
			expect(result.success).toBe(false);
		});

		it("rejects empty event", () => {
			const result = evolutionWebhookSchema.safeParse({
				event: "",
				instance: "x",
			});
			expect(result.success).toBe(false);
		});
	});

	describe("internalWebhookSchema", () => {
		it("accepts order.created with orderId", () => {
			const result = internalWebhookSchema.safeParse({
				type: "order.created",
				orderId: "550e8400-e29b-41d4-a716-446655440000",
				sellerId: "550e8400-e29b-41d4-a716-446655440001",
			});
			expect(result.success).toBe(true);
		});

		it("accepts message.received with conversationId", () => {
			const result = internalWebhookSchema.safeParse({
				type: "message.received",
				conversationId: "550e8400-e29b-41d4-a716-446655440000",
				sellerId: "550e8400-e29b-41d4-a716-446655440001",
			});
			expect(result.success).toBe(true);
		});

		it("rejects order.created without orderId", () => {
			const result = internalWebhookSchema.safeParse({
				type: "order.created",
				sellerId: "550e8400-e29b-41d4-a716-446655440001",
			});
			expect(result.success).toBe(false);
		});

		it("rejects message.received without conversationId", () => {
			const result = internalWebhookSchema.safeParse({
				type: "message.received",
				sellerId: "550e8400-e29b-41d4-a716-446655440001",
			});
			expect(result.success).toBe(false);
		});
	});

	describe("placeOrderSchema", () => {
		const validPayload = {
			form: {
				name: "Ahmed",
				phone: "0555123456",
				wilaya: "Alger",
				commune: "Bab El Oued",
				address: "123 Rue Test",
			},
			items: [
				{
					name: "Parfum",
					quantity: 1,
					price: 2500,
					product_id: "550e8400-e29b-41d4-a716-446655440000",
				},
			],
			total: 2500,
			deliveryCost: 400,
		};

		it("accepts valid order", () => {
			const result = placeOrderSchema.safeParse(validPayload);
			expect(result.success).toBe(true);
		});

		it("accepts desk delivery", () => {
			const result = placeOrderSchema.safeParse({
				...validPayload,
				deliveryType: "desk",
			});
			expect(result.success).toBe(true);
		});

		it("rejects invalid phone", () => {
			const result = placeOrderSchema.safeParse({
				...validPayload,
				form: { ...validPayload.form, phone: "123" },
			});
			expect(result.success).toBe(false);
		});

		it("rejects empty cart", () => {
			const result = placeOrderSchema.safeParse({
				...validPayload,
				items: [],
			});
			expect(result.success).toBe(false);
		});

		it("rejects missing name", () => {
			const result = placeOrderSchema.safeParse({
				...validPayload,
				form: { ...validPayload.form, name: "" },
			});
			expect(result.success).toBe(false);
		});
	});

	describe("sendMessageSchema", () => {
		it("accepts valid message", () => {
			const result = sendMessageSchema.safeParse({
				conversationId: "550e8400-e29b-41d4-a716-446655440000",
				text: "Hello",
			});
			expect(result.success).toBe(true);
		});

		it("rejects text over 4000 chars", () => {
			const result = sendMessageSchema.safeParse({
				conversationId: "550e8400-e29b-41d4-a716-446655440000",
				text: "x".repeat(4001),
			});
			expect(result.success).toBe(false);
		});
	});

	describe("aiRequestSchema", () => {
		it("accepts extract_order action", () => {
			const result = aiRequestSchema.safeParse({
				action: "extract_order",
				message: "I want to order",
			});
			expect(result.success).toBe(true);
		});

		it("accepts locale", () => {
			const result = aiRequestSchema.safeParse({
				action: "ask_assistant",
				locale: "ar",
			});
			expect(result.success).toBe(true);
		});

		it("rejects invalid action", () => {
			const result = aiRequestSchema.safeParse({ action: "hack" });
			expect(result.success).toBe(false);
		});

		it("rejects too many conversation history items", () => {
			const result = aiRequestSchema.safeParse({
				action: "ask_assistant",
				conversationHistory: Array.from({ length: 51 }, (_, i) => ({
					role: "user" as const,
					content: `msg ${i}`,
				})),
			});
			expect(result.success).toBe(false);
		});
	});

	describe("timingSafeEqual", () => {
		it("returns true for identical strings", () => {
			expect(timingSafeEqual("secret", "secret")).toBe(true);
		});

		it("returns false for different strings", () => {
			expect(timingSafeEqual("secret", "wrong")).toBe(false);
		});

		it("returns false for different lengths", () => {
			expect(timingSafeEqual("secret", "secrets")).toBe(false);
		});

		it("returns true for empty strings", () => {
			expect(timingSafeEqual("", "")).toBe(true);
		});
	});
});
