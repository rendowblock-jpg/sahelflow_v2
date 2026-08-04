-- Phase 3 Task 5 adversarial state guards.

CREATE TRIGGER "AiActionExecution_valid_state_insert"
BEFORE INSERT ON "AiActionExecution"
WHEN NEW."state" NOT IN ('claimed', 'running', 'succeeded', 'failed', 'conflict')
BEGIN
  SELECT RAISE(ABORT, 'invalid AiActionExecution state');
END;

CREATE TRIGGER "AiActionExecution_valid_state_update"
BEFORE UPDATE OF "state" ON "AiActionExecution"
WHEN NEW."state" NOT IN ('claimed', 'running', 'succeeded', 'failed', 'conflict')
BEGIN
  SELECT RAISE(ABORT, 'invalid AiActionExecution state');
END;

CREATE TRIGGER "AiActionExecution_succeeded_terminal"
BEFORE UPDATE OF "state" ON "AiActionExecution"
WHEN OLD."state" = 'succeeded' AND NEW."state" <> 'succeeded'
BEGIN
  SELECT RAISE(ABORT, 'succeeded AI execution is terminal');
END;

CREATE TRIGGER "AiActionProposal_valid_status_insert"
BEFORE INSERT ON "AiActionProposal"
WHEN NEW."status" NOT IN (
  'pending', 'approved', 'executing', 'succeeded',
  'failed', 'conflict', 'expired', 'rejected'
)
BEGIN
  SELECT RAISE(ABORT, 'invalid AiActionProposal status');
END;

CREATE TRIGGER "AiActionProposal_valid_status_update"
BEFORE UPDATE OF "status" ON "AiActionProposal"
WHEN NEW."status" NOT IN (
  'pending', 'approved', 'executing', 'succeeded',
  'failed', 'conflict', 'expired', 'rejected'
)
BEGIN
  SELECT RAISE(ABORT, 'invalid AiActionProposal status');
END;

CREATE TRIGGER "AiActionProposal_succeeded_terminal"
BEFORE UPDATE OF "status" ON "AiActionProposal"
WHEN OLD."status" = 'succeeded' AND NEW."status" <> 'succeeded'
BEGIN
  SELECT RAISE(ABORT, 'succeeded AI proposal is terminal');
END;
