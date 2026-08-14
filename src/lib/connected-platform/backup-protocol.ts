export const CLOUD_BACKUP_VERIFICATION_DOMAIN = "sahelflow.cloud-backup.verification.v1";

export function canonicalBackupVerificationBytes(input: Readonly<{
  workspaceId: string;
  shopId: string;
  backupId: string;
  manifestSha256: string;
  totalBytes: number;
  chunkCount: number;
  verifiedAt: string;
}>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify([
    CLOUD_BACKUP_VERIFICATION_DOMAIN,
    input.workspaceId,
    input.shopId,
    input.backupId,
    input.manifestSha256,
    input.totalBytes,
    input.chunkCount,
    input.verifiedAt,
  ]));
}
