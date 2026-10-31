/**
 * The three exact numbers the phone's Today screen shows next to the
 * eight-order sample. One SQLite file is one shop, so the shop's own client is
 * the shop scope. Each number is a single read; a failing read leaves only its
 * own number null and never throws, so the projection still publishes.
 *
 * ordersWaiting: orders in the confirmation queue = status "pending", not
 *   soft-deleted (the `where` of getConfirmationWorkbenchPage, pinned by test).
 * whatsappHeld: WhatsApp send intents the guard held for the owner: status
 *   "failed", outcome "none", the guard's hold code (isHeldOutboxIntent), of one
 *   of the five send types. An approved row leaves "failed", so it stops counting.
 * codToCollectDzd: integer DZD, sum of totalPrice (the amount the COD ledger
 *   sums) of "shipped" orders whose cash the courier has not collected: not
 *   soft-deleted, codCollected not true, and no canonical state says the parcel
 *   is coming back or the cash is already collected/remitted. NULL canonical
 *   states (legacy rows) count: NOT IN would silently drop them.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { SEND_GUARD_HOLD_ERROR_CODE } from "@/lib/whatsapp/send-guard";

export type PhoneTodayCounts = Readonly<{
  ordersWaiting: number | null;
  whatsappHeld: number | null;
  codToCollectDzd: number | null;
}>;

export type PhoneTodayWants = Readonly<{
  ordersWaiting: boolean;
  whatsappHeld: boolean;
  codToCollectDzd: boolean;
}>;

/** Mirrors the WHATSAPP_*_EFFECT_TYPE constants of durable-send (pinned by test). */
export const HELD_SEND_EFFECT_TYPES = [
  "whatsapp.text.send.v1",
  "whatsapp.image.send.v1",
  "whatsapp.video.send.v1",
  "whatsapp.document.send.v1",
  "whatsapp.voice.send.v1",
] as const;

const RETURNING_DELIVERY_STATES = ["refused", "return_in_transit", "returned"];
const CASH_SETTLED_COD_STATES = ["collected", "partially_remitted", "remitted"];

const ORDERS_WAITING_WHERE: Prisma.OrderWhereInput = {
  status: "pending",
  deletedAt: null,
};

const WHATSAPP_HELD_WHERE: Prisma.OutboxIntentWhereInput = {
  status: "failed",
  outcomeState: "none",
  lastErrorCode: SEND_GUARD_HOLD_ERROR_CODE,
  effectType: { in: [...HELD_SEND_EFFECT_TYPES] },
};

const COD_TO_COLLECT_WHERE: Prisma.OrderWhereInput = {
  status: "shipped",
  deletedAt: null,
  AND: [
    { OR: [{ codCollected: null }, { codCollected: false }] },
    { OR: [{ deliveryState: null }, { deliveryState: { notIn: RETURNING_DELIVERY_STATES } }] },
    { OR: [{ codState: null }, { codState: { notIn: CASH_SETTLED_COD_STATES } }] },
  ],
};

export interface PhoneTodayPrisma {
  order: {
    count(args: { where: Prisma.OrderWhereInput }): PromiseLike<number>;
    aggregate(args: {
      where: Prisma.OrderWhereInput;
      _sum: { totalPrice: true };
    }): PromiseLike<{ _sum: { totalPrice: number | null } }>;
  };
  outboxIntent: {
    count(args: { where: Prisma.OutboxIntentWhereInput }): PromiseLike<number>;
  };
}

export type PhoneTodayDeps = Readonly<{
  prisma?: PhoneTodayPrisma;
  /** A number the actor may not see is not queried at all. Default: all three. */
  want?: PhoneTodayWants;
}>;

const WANT_ALL: PhoneTodayWants = Object.freeze({
  ordersWaiting: true,
  whatsappHeld: true,
  codToCollectDzd: true,
});

async function settle(
  wanted: boolean,
  read: () => PromiseLike<number>,
): Promise<number | null> {
  if (!wanted) return null;
  try {
    const value = await read();
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

export async function readPhoneTodayCounts(
  deps: PhoneTodayDeps = {},
): Promise<PhoneTodayCounts> {
  const want = deps.want ?? WANT_ALL;
  const client = (): PhoneTodayPrisma => deps.prisma ?? (db as unknown as PhoneTodayPrisma);
  const [ordersWaiting, whatsappHeld, codToCollectDzd] = await Promise.all([
    settle(want.ordersWaiting, () => client().order.count({ where: ORDERS_WAITING_WHERE })),
    settle(want.whatsappHeld, () => client().outboxIntent.count({ where: WHATSAPP_HELD_WHERE })),
    settle(want.codToCollectDzd, async () => {
      const sum = await client().order.aggregate({
        where: COD_TO_COLLECT_WHERE,
        _sum: { totalPrice: true },
      });
      return sum._sum.totalPrice ?? 0;
    }),
  ]);
  return Object.freeze({ ordersWaiting, whatsappHeld, codToCollectDzd });
}
