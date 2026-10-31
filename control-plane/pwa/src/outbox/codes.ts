// What a result code means on the phone. The list of codes is F2's command-result-codes.ts; until that file is merged the
// four that change what the seller sees are matched here by name.
export type ResultUi = "done" | "review" | "send_anyway" | "resync" | "expired" | "failed";
export function mapResultCode(code: string | undefined): ResultUi {
  if (code === undefined) return "failed";
  if (code.startsWith("ORDER_ALREADY_")) return "done"; // neutral: "already handled on your PC"
  if (code === "ORDER_CHANGED") return "review"; // never retried by itself
  if (code === "ALREADY_ANSWERED") return "send_anyway"; // a NEW command with force
  if (code === "REMOTE_POLICY_STALE") return "resync";
  if (code === "EXPIRED") return "expired";
  return "failed";
}
