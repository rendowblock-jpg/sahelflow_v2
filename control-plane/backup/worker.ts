import { handleBackupRequest } from "./routes";
import { runScheduledMaintenance } from "./scheduled";
import type { BackupWorkerEnvironment } from "./types";

export { handleBackupRequest } from "./routes";

type ScheduledContext = { waitUntil(promise: Promise<unknown>): void };

export default {
  fetch: handleBackupRequest,
  scheduled(
    _controller: unknown,
    environment: BackupWorkerEnvironment,
    context: ScheduledContext,
  ): void {
    context.waitUntil(runScheduledMaintenance(environment));
  },
};
