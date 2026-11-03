// STUB (test seam): replaced by the real implementation after the red run.
export interface CommuneNameRow {
  name: string;
  nameAr?: string;
  wilayaName?: string;
}

export function resolveCommuneName(_wilayaName: string, raw: string, _communes: readonly CommuneNameRow[]): string {
  return raw;
}
