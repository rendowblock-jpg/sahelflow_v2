import "server-only";

import { getMasterKey } from "@/lib/crypto/master-key";

/**
 * Bun preload for the supported offline protected-data migration commands.
 *
 * Resolve and cache the explicit installation root before the migration entry
 * module can create its durable maintenance lease. If root authority is absent,
 * unavailable or invalid, Bun aborts during preload and no migration lock or
 * AppData directory is created. The migration module later receives the same
 * process-cached Buffer and zeroes it in its existing completion path.
 */
getMasterKey();
