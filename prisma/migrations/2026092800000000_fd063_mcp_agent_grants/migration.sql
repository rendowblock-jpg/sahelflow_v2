-- FD-063 MCP-12: durable MCP agent grants.
-- Additive only. A grant names one external agent, narrows it to an explicit
-- tool list and can be revoked instantly. Only a hash of the grant secret is
-- stored; the secret is shown to the seller once and never persisted.

CREATE TABLE "McpAgentGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "secretHint" TEXT NOT NULL,
    "toolsJson" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    "lastClientName" TEXT,
    "lastClientVersion" TEXT,
    "revokedAt" DATETIME,
    "revokedBy" TEXT
);

CREATE UNIQUE INDEX "McpAgentGrant_secretHash_key" ON "McpAgentGrant"("secretHash");
CREATE INDEX "McpAgentGrant_revokedAt_createdAt_idx" ON "McpAgentGrant"("revokedAt", "createdAt");
