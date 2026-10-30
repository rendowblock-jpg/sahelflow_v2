/**
 * Browser-safe port of the SahelFlow connected-platform envelope protocol.
 *
 * Everything in this folder uses WebCrypto (crypto.subtle), TextEncoder and
 * plain typed arrays only: no node: module, no Node Buffer and no server-only
 * import, so a phone PWA, a worker and the desktop can all import it. The one
 * file it reads from outside is ../protocol.ts (pure types and validators).
 *
 * Do not import ../envelope.ts or ../payload-crypto.ts from browser code: they
 * are server-only and use node:crypto.
 *
 * Private keys made here are non-extractable CryptoKey objects: scripts can ask
 * the browser to sign or decrypt with them but can never read them out. Storing
 * them (IndexedDB) is another slice. Only the public halves are exported, in
 * the exact shape POST /v1/pairings/exchange expects.
 *
 * Byte parity with the Node implementation is guarded by the tests in
 * __tests__ (generated envelopes, both-way interop and frozen golden vectors).
 */
export {
  base64Decode,
  base64Encode,
  base64UrlDecode,
  base64UrlEncode,
  bytesToHex,
  concatBytes,
  timingSafeEqualBytes,
  utf8Decode,
  utf8Encode,
} from "./bytes";
export {
  aadDigestHex,
  canonicalAadBytes,
  canonicalEnvelopeBytes,
  type EnvelopeMetadata,
  type UnsignedEnvelope,
} from "./canonical";
export {
  openEnvelopeWeb,
  sealEnvelopeWeb,
  type OpenEnvelopeResult,
  type OpenExpectations,
  type OpenFailureReason,
  type OpenOptions,
} from "./envelope-web";
export {
  deviceFingerprint,
  formatPairingHash,
  parsePairingLink,
  type PairingLink,
} from "./fingerprint";
export {
  buildPairingExchangeBody,
  exportPublicKeys,
  generateDeviceKeys,
  importSigningPublicKey,
  supportsEd25519,
  type DeviceKeys,
  type DevicePublicKeys,
  type GenerateDeviceKeysResult,
  type KeyOptions,
  type KeygenFailureReason,
} from "./keys";
