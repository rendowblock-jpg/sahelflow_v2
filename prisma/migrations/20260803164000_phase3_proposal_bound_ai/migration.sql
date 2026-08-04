-- Phase 3 Task 5: immutable AI action proposals, exact approvals and one-time execution claims.
--
-- This migration is additive. Existing AiChatSession/AiChatMessage rows remain
-- readable. Sensitive proposal arguments and result details are encrypted by
-- the application before they enter these tables.

CREATE TABLE "AiActionProposal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "proposalKey" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "requestMessageId" TEXT NOT NULL,
  "toolName" TEXT NOT NULL,
  "actionClass" TEXT NOT NULL,
  "argsJson" TEXT NOT NULL,
  "argsHash" TEXT NOT NULL,
  "proposalDigest" TEXT NOT NULL,
  "summaryJson" TEXT NOT NULL,
  "summaryHash" TEXT NOT NULL,
  "requestActorKind" TEXT NOT NULL,
  "requestActorId" TEXT NOT NULL,
  "requestWorkspaceMemberId" TEXT,
  "requestDeviceId" TEXT,
  "requestSessionId" TEXT NOT NULL,
  "requestRole" TEXT,
  "requestPolicyVersion" INTEGER NOT NULL,
  "requestRevocationEpoch" INTEGER NOT NULL,
  "requiredPermissionsJson" TEXT NOT NULL,
  "permissionHash" TEXT NOT NULL,
  "licenseBindingJson" TEXT NOT NULL,
  "licenseBindingHash" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "shopIncarnationId" TEXT NOT NULL,
  "registryRevision" INTEGER NOT NULL,
  "databaseFileId" TEXT NOT NULL,
  "migrationSetSha256" TEXT NOT NULL,
  "targetBindingJson" TEXT NOT NULL,
  "targetBindingHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "expiresAt" DATETIME NOT NULL,
  "lastErrorCode" TEXT,
  "approvedAt" DATETIME,
  "executionClaimedAt" DATETIME,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiActionProposal_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "AiChatSession" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AiActionProposal_proposalKey_key"
  ON "AiActionProposal"("proposalKey");
CREATE UNIQUE INDEX "AiActionProposal_proposalDigest_key"
  ON "AiActionProposal"("proposalDigest");
CREATE INDEX "AiActionProposal_status_expiresAt_idx"
  ON "AiActionProposal"("status", "expiresAt");
CREATE INDEX "AiActionProposal_sessionId_createdAt_idx"
  ON "AiActionProposal"("sessionId", "createdAt");
CREATE INDEX "AiActionProposal_toolName_status_createdAt_idx"
  ON "AiActionProposal"("toolName", "status", "createdAt");
CREATE INDEX "AiActionProposal_shopIncarnationId_status_createdAt_idx"
  ON "AiActionProposal"("shopIncarnationId", "status", "createdAt");

CREATE TABLE "AiActionApproval" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "proposalId" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "approverActorKind" TEXT NOT NULL,
  "approverActorId" TEXT NOT NULL,
  "approverWorkspaceMemberId" TEXT,
  "approverDeviceId" TEXT,
  "approverSessionId" TEXT NOT NULL,
  "approverRole" TEXT,
  "approverPolicyVersion" INTEGER NOT NULL,
  "approverRevocationEpoch" INTEGER NOT NULL,
  "approvalDigest" TEXT NOT NULL,
  "reasonHash" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiActionApproval_proposalId_fkey"
    FOREIGN KEY ("proposalId") REFERENCES "AiActionProposal" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AiActionApproval_proposalId_key"
  ON "AiActionApproval"("proposalId");
CREATE UNIQUE INDEX "AiActionApproval_approvalDigest_key"
  ON "AiActionApproval"("approvalDigest");
CREATE INDEX "AiActionApproval_decision_createdAt_idx"
  ON "AiActionApproval"("decision", "createdAt");
CREATE INDEX "AiActionApproval_approverActorId_createdAt_idx"
  ON "AiActionApproval"("approverActorId", "createdAt");

CREATE TABLE "AiActionExecution" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "proposalId" TEXT NOT NULL,
  "executionKey" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'claimed',
  "businessCommandId" TEXT,
  "resultJson" TEXT,
  "resultHash" TEXT,
  "errorCode" TEXT,
  "claimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" DATETIME,
  "completedAt" DATETIME,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiActionExecution_proposalId_fkey"
    FOREIGN KEY ("proposalId") REFERENCES "AiActionProposal" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AiActionExecution_proposalId_key"
  ON "AiActionExecution"("proposalId");
CREATE UNIQUE INDEX "AiActionExecution_executionKey_key"
  ON "AiActionExecution"("executionKey");
CREATE INDEX "AiActionExecution_state_claimedAt_idx"
  ON "AiActionExecution"("state", "claimedAt");
CREATE INDEX "AiActionExecution_businessCommandId_idx"
  ON "AiActionExecution"("businessCommandId");
