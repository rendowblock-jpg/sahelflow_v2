import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { buildDesktopPairingLink } from "@/lib/connected-platform/pairing-link";
import { importDesktopSigningPrivateKey, signDesktopEncryptionKey } from "@/lib/connected-platform/pairing-trust";
import { connectedOwnerSession, ownerMemberId, relayFailure } from "@/lib/connected-platform/device-admin";
import { updateDeviceApprovals, withDeviceCreated } from "@/lib/connected-platform/device-approvals";
import { db, shopContext } from "@/lib/db";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

/**
 * POST /api/connected/devices/pairing: the owner starts pairing a phone.
 * Returns the link (secrets only in the "#" part), the typing code and the
 * time it expires. 409 PHONE_DEVICE_LIMIT when the relay's phone limit is reached.
 */
export const POST = withErrorHandler(async () => {
  const { actorContext, runtime, workspaceId } = await connectedOwnerSession();
  const memberId = ownerMemberId(actorContext.actor);
  const keys = runtime.desktopKeys;
  // The signed encryption key comes first: no relay slot is used when the
  // desktop cannot prove its key.
  const signingKey = await importDesktopSigningPrivateKey(keys.signingPrivateKeyPkcs8);
  const proof = signingKey ? await signDesktopEncryptionKey(keys.encryptionPublicKeyJwk, signingKey) : null;
  if (!proof?.ok) {
    throw new SahelFlowError("This computer cannot sign its pairing key", "PHONE_KEY_PROOF_UNAVAILABLE", 503);
  }
  const deviceId = `phone_${crypto.randomUUID().replaceAll("-", "")}`;
  let pairing: Awaited<ReturnType<typeof runtime.client.createPairing>>;
  try {
    pairing = await runtime.client.createPairing({ workspaceId, memberId, deviceId });
  } catch (error) {
    throw relayFailure(error);
  }
  const built = await buildDesktopPairingLink({
    pairingId: pairing.pairingId,
    pairingToken: pairing.pairingToken,
    desktopSigningPublicKey: keys.signingPublicKey,
  });
  if (!built) {
    throw new SahelFlowError("The pairing link could not be built", "PHONE_PAIRING_LINK_FAILED", 502);
  }
  await updateDeviceApprovals(workspaceId, (state) => withDeviceCreated(state, deviceId, Date.now()));
  await logAudit(
    { prisma: db, shop: shopContext },
    {
      action: "connected.pairing.create",
      entity: "connected_device",
      entityId: deviceId,
      actor: trustedActorAuditIdentity(actorContext.actor),
      after: { deviceId, expiresAt: pairing.expiresAt },
    },
  );
  return NextResponse.json(
    {
      link: built.link,
      code: built.code,
      expiresAt: pairing.expiresAt,
      desktopFingerprint: built.pin,
      deviceId,
      // The signed RSA key. The relay has no field for it yet (see the notes on S1b).
      desktopKeyProof: { rsaPublicJwk: proof.rsaPublicJwk, signature: proof.signature, context: proof.context },
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}, "POST /api/connected/devices/pairing");
