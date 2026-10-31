import { z } from "zod";
import { decideOrderForActor } from "@/lib/orders/decide-order-for-actor";
import { REJECT_REASON_KEYS } from "../contracts";
import { authorizeRemoteCommand } from "./common";
import type { CommandHandler, CommandHandlerInput } from "./types";

export const confirmPayload = z.object({
  orderId: z.string().trim().min(1).max(128),
  expectedVersion: z.number().int().positive().safe(),
}).strict();

export const rejectPayload = confirmPayload.extend({
  reasonKey: z.enum(REJECT_REASON_KEYS),
}).strict();

async function decide(
  kind: "command.orders.confirm" | "command.orders.reject",
  input: CommandHandlerInput,
) {
  const { context, envelope } = input;
  const actorContext = await authorizeRemoteCommand(kind, input);
  const decision = kind === "command.orders.confirm" ? "confirm" : "reject";
  let orderId: string;
  let expectedVersion: number;
  let reasonKey: string | undefined;
  if (decision === "confirm") {
    const data = confirmPayload.parse(input.payload);
    orderId = data.orderId;
    expectedVersion = data.expectedVersion;
  } else {
    const data = rejectPayload.parse(input.payload);
    orderId = data.orderId;
    expectedVersion = data.expectedVersion;
    reasonKey = data.reasonKey;
  }
  const outcome = await decideOrderForActor(context, actorContext, {
    orderId,
    decision,
    expectedVersion,
    idempotencyKey: `connected:${envelope.idempotencyKey}`,
    correlationId: envelope.envelopeId,
    ...(reasonKey ? { reasonKey } : {}),
  });
  return {
    orderId: outcome.orderId,
    status: outcome.status,
    version: outcome.version,
    replayed: outcome.replayed,
  };
}

export const confirmHandler: CommandHandler = (input) => decide("command.orders.confirm", input);
export const rejectHandler: CommandHandler = (input) => decide("command.orders.reject", input);
