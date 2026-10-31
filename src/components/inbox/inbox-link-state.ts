import type { WhatsAppStatus } from "@/lib/whatsapp/types";

/**
 * The ONE place that decides what the inbox says about the WhatsApp link.
 * Pure on purpose: the header tag, the single banner and the tests all read
 * this result, so the same bad news can never be written twice.
 */
export type InboxLinkKind =
  | "connected"
  | "connecting"
  | "disconnected"
  | "offline"
  | "error"
  | "unofficial-only";

/** Shape carries the meaning, colour only helps: dot ok, ring neutral, triangle failed. */
export type InboxLinkShape = "dot" | "ring" | "triangle";

export type InboxLinkReason =
  | "ok"
  | "checking"
  | "connecting"
  | "socket-closed"
  | "not-linked"
  | "link-lost"
  | "service-unreachable"
  | "browser-offline";

/** Every action is a click. Nothing here starts a reconnect by itself. */
export type InboxLinkAction = "reconnect" | "retry" | "pair";

export interface InboxLinkInputs {
  /** transport.status from the workspace; null until the first answer. */
  status: WhatsAppStatus | null;
  /** transport.reachable: can the app reach the WhatsApp service (null = not known yet). */
  reachable: boolean | null;
  /** transport.wsOpen: the live push channel. */
  wsOpen: boolean;
  /** window online flag; null when unknown (server render). */
  browserOnline: boolean | null;
  /** The chat list could not be refreshed (chatQueue.dataDegraded). */
  dataDegraded: boolean;
}

export interface InboxLinkState {
  kind: InboxLinkKind;
  shape: InboxLinkShape;
  reason: InboxLinkReason;
  /**
   * True whenever Send must not be offered. The thread today only checks
   * status === "connected"; it should read this field so offline and an
   * unreachable service block Send too.
   */
  blocksSending: boolean;
  /** The single banner is drawn only for these blocked kinds. */
  showBanner: boolean;
  action: InboxLinkAction | null;
  /**
   * Drafts reach the local database through PUT /draft without the WhatsApp
   * link, so this is true only where the app server still answers.
   */
  savedOnDevice: boolean;
  listStale: boolean;
  /** The unofficial-link sentence: open while linking, a "?" detail otherwise. */
  unofficialDetail: "open" | "collapsed";
}

function make(
  inputs: InboxLinkInputs,
  kind: InboxLinkKind,
  shape: InboxLinkShape,
  reason: InboxLinkReason,
  blocksSending: boolean,
  action: InboxLinkAction | null,
  savedOnDevice: boolean,
): InboxLinkState {
  return {
    kind,
    shape,
    reason,
    blocksSending,
    showBanner:
      kind === "disconnected" ||
      kind === "offline" ||
      kind === "error" ||
      kind === "unofficial-only",
    action,
    savedOnDevice,
    listStale: inputs.dataDegraded,
    unofficialDetail: kind === "unofficial-only" ? "open" : "collapsed",
  };
}

export function deriveInboxLinkState(inputs: InboxLinkInputs): InboxLinkState {
  // Order matters: the nearest cause wins, so one problem is named once.
  if (inputs.browserOnline === false) {
    return make(inputs, "offline", "triangle", "browser-offline", true, "retry", false);
  }
  if (inputs.reachable === false) {
    return make(inputs, "error", "triangle", "service-unreachable", true, "retry", true);
  }
  if (inputs.status === "connected") {
    return inputs.wsOpen
      ? make(inputs, "connected", "dot", "ok", false, null, false)
      : make(inputs, "connecting", "ring", "socket-closed", false, "reconnect", false);
  }
  if (inputs.status === "connecting") {
    return make(inputs, "connecting", "ring", "connecting", true, null, false);
  }
  if (inputs.status === "qr") {
    return make(inputs, "unofficial-only", "ring", "not-linked", true, "pair", false);
  }
  if (inputs.status === "disconnected") {
    return make(inputs, "disconnected", "triangle", "link-lost", true, "reconnect", true);
  }
  return make(inputs, "connecting", "ring", "checking", true, null, false);
}

/**
 * Where the "Connect WhatsApp" button lives, so one problem has one action.
 *  - "banner": the link is waiting for a scan, the banner owns the button.
 *  - "none": the app cannot reach the WhatsApp service at all. Connecting cannot
 *    help there (no code can be made); the banner offers Retry and only that.
 *  - "header": every other case, the header keeps its button.
 */
export function pairingButtonPlacement(input: {
  status: WhatsAppStatus | null;
  reachable: boolean | null;
  canManage: boolean;
}): "banner" | "header" | "none" {
  if (input.reachable === false) return "none";
  if (input.status === "qr" && input.canManage) return "banner";
  return "header";
}
