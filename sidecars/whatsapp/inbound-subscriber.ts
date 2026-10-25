/**
 * The gate every provider message passes between the WhatsApp connection and
 * the durable inbound spool.
 *
 * It used to live inline in index.ts and drop any message that arrived while
 * the manager's status was not "connected". That lost every message WhatsApp
 * held for SahelFlow while it was closed. On login WhatsApp hands over that
 * backlog at once, and Baileys flushes it to `messages.upsert` when it sees
 * the "offline messages done" signal (`CB:ib,,offline`). Baileys only reports
 * `connection: "open"` after two more awaited round trips (a pre-key check and
 * the "active" request), so the whole backlog reached this gate while the
 * status was still "connecting": the founder's own diagnostics show
 * `receivedPendingNotifications: true` about a second BEFORE `connection.open`
 * in every launch. The same happens on every reconnect after a network blip.
 * The gate's comment said it itself: "gone for good: the provider will not
 * resend what it has already acknowledged".
 *
 * The account a message belongs to is not decided by "open". It is the account
 * in the saved login credentials, which the provider has already accepted
 * before it sends any message. So a message that arrives before "open" is
 * spooled under that identity, and delivered to the app as soon as the app
 * sees the connection as connected (until then the app answers 409 and the
 * spool retries). It is dropped only when there is no paired account at all.
 *
 * Kept free of the HTTP server and the provider socket so it can be tested.
 */
import { describeError, type DiagnosticsSink } from "./diagnostics-log";
import type { IngressJidKind, IngressRecorder } from "./ingress-health";
import {
  isIndividualInboundJid,
  type IncomingMessage,
  type SidecarEvent,
} from "./whatsapp";

/** Diagnostics lines for messages spooled before "open", per process. */
const EARLY_LINES_PER_PROCESS = 20;

export type InboundAccountDecision =
  | { action: "spool"; accountId: string; beforeOpen: boolean }
  | { action: "drop"; connection: string };

/**
 * Which paired account a provider message belongs to, if any.
 *
 * `connectedUserId` is the identity the manager publishes once the connection
 * is open. `credentialAccountId` is the identity in the saved credentials, the
 * same string the manager publishes later, available from the moment the saved
 * login is loaded.
 */
export function decideInboundAccount(input: {
  connection: string;
  connectedUserId: string | null | undefined;
  credentialAccountId: string | null | undefined;
}): InboundAccountDecision {
  if (input.connection === "connected" && input.connectedUserId) {
    return { action: "spool", accountId: input.connectedUserId, beforeOpen: false };
  }
  if (input.credentialAccountId) {
    return { action: "spool", accountId: input.credentialAccountId, beforeOpen: true };
  }
  return { action: "drop", connection: input.connection };
}

export interface InboundSubscriberDeps {
  getStatus(): { status: string; user: { id: string } | null };
  credentialAccountId(): string | null;
  spool: { enqueue(accountId: string, message: IncomingMessage): unknown };
  diagnostics: DiagnosticsSink;
  broadcast(event: SidecarEvent): void;
  /** Counts the losses and the last customer message for /status. Optional: tests and old wiring omit it. */
  health?: IngressRecorder;
}

/** Only the kind of chat address leaves this function, never the address. */
function jidKind(jid: string | null | undefined): IngressJidKind {
  if (jid?.endsWith("@lid")) return "lid";
  if (jid?.endsWith("@s.whatsapp.net")) return "phone";
  return "other";
}

export function createInboundSubscriber(
  deps: InboundSubscriberDeps,
): (event: SidecarEvent) => void {
  const { diagnostics, spool } = deps;
  let earlyLines = 0;
  // The health report must never be able to break the inbound path.
  const report = (fn: (health: IngressRecorder) => void): void => {
    if (!deps.health) return;
    try {
      fn(deps.health);
    } catch {
      // Counting is best effort.
    }
  };

  return (event) => {
    if (event.type !== "message" || !event.message) {
      deps.broadcast(event);
      return;
    }
    // C1 ingress scope: group/status/broadcast surfaces are intentionally
    // unsupported (ledger #317). Skip them before the spool so they can never
    // loop against the app or appear as phantom conversations. fromMe 1:1
    // echoes are spooled too; the app stores them as outbound, once.
    if (!isIndividualInboundJid(event.message.key.remoteJid) || !event.message.key.id) {
      if (event.message.key.fromMe) deps.broadcast(event);
      else {
        console.warn(
          `[sahelflow-whatsapp-sidecar] skipping non-individual inbound jid ${event.message.key.remoteJid ?? "<empty>"}`,
        );
        // The packaged desktop discards the console. Only the part after the
        // "@" is recorded (g.us, broadcast, newsletter, ...): never an identity.
        diagnostics.record("inbound.dropped", {
          reason: "non-individual-jid",
          jidKind: (event.message.key.remoteJid ?? "").split("@")[1] ?? "none",
        });
      }
      return;
    }

    const status = deps.getStatus();
    const decision = decideInboundAccount({
      connection: status.status,
      connectedUserId: status.user?.id,
      credentialAccountId: deps.credentialAccountId(),
    });
    if (decision.action === "drop") {
      console.error(
        "[sahelflow-whatsapp-sidecar] refusing inbound publication without paired account authority",
      );
      // There is no paired account at all, so there is nothing to attribute the
      // message to. It must still never vanish without a trace.
      diagnostics.record("inbound.dropped", {
        reason: "no-paired-account",
        connection: decision.connection,
      });
      report((health) => health.recordLost("noPairedAccount"));
      return;
    }
    if (decision.beforeOpen && earlyLines < EARLY_LINES_PER_PROCESS) {
      earlyLines += 1;
      // Proof that the offline backlog (or a reconnect's) reached the gate
      // before "open", and was kept. Counts only.
      diagnostics.record("inbound.early", { connection: status.status });
    }
    try {
      // enqueue() performs an atomic synchronous file commit before returning.
      // It schedules app delivery; this callback intentionally does not broadcast.
      spool.enqueue(decision.accountId, event.message);
      report((health) =>
        health.recordSpooled({
          fromMe: event.message?.key.fromMe === true,
          kind: jidKind(event.message?.key.remoteJid),
        }),
      );
    } catch (error) {
      console.error(
        "[sahelflow-whatsapp-sidecar] failed to durably spool inbound message",
        error instanceof Error ? error.message : String(error),
      );
      diagnostics.record("inbound.spool-failed", describeError(error));
      report((health) => health.recordLost("spoolFailed"));
    }
  };
}
