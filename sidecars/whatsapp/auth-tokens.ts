import { createHmac } from "node:crypto";

const WS_TOKEN_PURPOSE = "sahelflow/whatsapp/websocket-token/v1";

/**
 * Derive the browser-visible WebSocket credential from the private REST token.
 * Knowledge of the derived token does not authorize REST sends, callbacks,
 * connection changes or logout.
 */
export function deriveSidecarWebSocketToken(restToken: string): string {
  if (restToken.length < 16) {
    throw new Error("Sidecar REST token is too short");
  }
  return createHmac("sha256", restToken)
    .update(WS_TOKEN_PURPOSE)
    .digest("hex");
}