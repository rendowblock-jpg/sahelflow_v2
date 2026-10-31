// W3b PWA lab: what the lab puts into the desktop's own database (4 orders, 3 chats, one with a HELD WhatsApp message). Not a test.
import type { PrismaClient } from "@prisma/client";
import { cleanDb, seedCustomer, seedOrder, seedProduct } from "@/lib/data/__tests__/helpers";
import { db } from "@/lib/db";
import { trustedManualOrderSourceMetadata } from "@/lib/orders/manual-order-authority";
import { SEND_GUARD_HOLD_ERROR_CODE } from "@/lib/whatsapp/send-guard";

const raw = db as unknown as PrismaClient;
export const CHATS = { plain: "conv-plain-0001", unread: "conv-unread-0002", held: "conv-held-00003" } as const;
const ORDERS = [
  { name: "فاطمة الزهراء بوزيد", phone: "0550000001", wilaya: "Oran", status: "pending", total: 7200 },
  { name: "Maximilian Alexander Montgomery-Featherstonehaugh", phone: "0550000002", wilaya: "Constantine", status: "pending", total: 12500 },
  { name: "Karim Mansouri", phone: "0550000003", wilaya: "Alger", status: "confirmed", total: 4800 },
  { name: "Yasmine Haddad", phone: "0550000004", wilaya: "Sétif", status: "delivered", total: 9100 },
] as const;
export interface SeededOrder { id: string; orderNumber: string; name: string; wilaya: string; status: string }

async function chat(id: string, name: string, t0: number, o: { unread?: number; last: number; held?: string }, seq: number): Promise<void> {
  const at = new Date(t0 - 3_600_000 + o.last * 60_000);
  await db.conversation.create({ data: { id, channel: "whatsapp", contactName: name, contactPhone: `0661${id.slice(-4)}`, sourceId: `${id}@s.whatsapp.net`, unreadCount: o.unread ?? 0, lastMessageAt: at } });
  const messageId = `${id}-m1`;
  await db.message.create({ data: { id: messageId, conversationId: id, body: "Is this still available?", direction: o.held ? "outbound" : "inbound", timestamp: at, messageType: "text" } });
  if (!o.held) return;
  const effectKey = `effect-${seq}`;
  await raw.businessCommand.create({ data: { id: `cmd-${seq}`, idempotencyKey: `key-${seq}`, commandType: "whatsapp_message.queue.v1", aggregateType: "whatsapp-message", aggregateId: messageId, requestHash: "0".repeat(64), actor: "test", correlationId: messageId, expectedVersion: 0, committedVersion: 1 } });
  await raw.outboxIntent.create({ data: { id: `intent-${seq}`, effectKey, commandId: `cmd-${seq}`, effectType: "whatsapp.text.send.v1", payloadJson: "{}", status: o.held, outcomeState: "none", lastErrorCode: SEND_GUARD_HOLD_ERROR_CODE, createdAt: at } });
  await raw.whatsAppOutboundEffect.create({ data: { effectKey, messageId } });
}

export async function seedWorld(t0: number): Promise<SeededOrder[]> {
  await cleanDb(raw); await db.collaborationComment.deleteMany(); await db.businessAggregateVersion.deleteMany(); await db.message.deleteMany(); await db.conversation.deleteMany();
  const product = await seedProduct(raw, { stock: 40, lowStockThreshold: 5 });
  const out: SeededOrder[] = [];
  for (const o of ORDERS) {
    const customer = await seedCustomer(raw, { name: o.name, phone: o.phone });
    const order = await seedOrder(raw, { status: o.status, customerId: customer.id, productId: product.id, totalPrice: o.total });
    await raw.order.update({ where: { id: order.id }, data: { sourceMetadata: trustedManualOrderSourceMetadata(), wilaya: o.wilaya, phone: o.phone } });
    out.push({ id: order.id, orderNumber: order.orderNumber, name: o.name, wilaya: o.wilaya, status: o.status });
  }
  await chat(CHATS.plain, "Plain Pat", t0, { last: 10 }, 1); await chat(CHATS.unread, "Unread Ulla", t0, { last: 20, unread: 3 }, 2); await chat(CHATS.held, "Held Hana", t0, { last: 5, held: "failed" }, 3);
  return out;
}
