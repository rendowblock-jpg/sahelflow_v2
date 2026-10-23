-- S01a-01: the business-truth fact tables are append-only, and now the database says so.
--
-- InventoryMovement, FinancialMovement, DomainEvent, CompensationFact and ProjectionInvalidation
-- are pure facts. The command kernel only INSERTs into them (command-kernel.ts), and no other code
-- UPDATEs them. Until now nothing stopped a later `update`, a maintenance script or a raw UPDATE
-- from rewriting a stock movement, a money movement or an event, with no error and no trace.
-- Each trigger below refuses every UPDATE of its table, whatever column it touches and with no
-- condition that could switch it off. This follows the pattern of the 19 append-only triggers
-- that already protect COD, delivery, return and refund facts.
--
-- On purpose NOT here:
--  * BusinessCommand, OutboxIntent and InventoryReservation: their state moves (a command goes
--    from 'processing' to 'committed', an intent from 'queued' to 'succeeded', a hold from
--    'active' to 'consumed'), so they are not pure facts.
--  * AuditLog, OrderChange and Refund: production or demo code still UPDATEs them
--    (refund-service.ts, the demo clock normalizer). They need their own decision.
--  * DELETE: the shop erase (privacy/lifecycle.ts), the demo loader and the test clean-up delete
--    these rows. Blocking DELETE needs a controlled bypass and is S01a-02.
--
-- The migration changes no row. A trigger is dropped silently if a later migration rebuilds its
-- table (S01a-03); append-only-fact-tables.integration.test.ts checks the full migration set.

CREATE TRIGGER "InventoryMovement_append_only_update"
BEFORE UPDATE ON "InventoryMovement"
BEGIN
  SELECT RAISE(ABORT, 'InventoryMovement is append-only; record a correcting movement instead');
END;

CREATE TRIGGER "FinancialMovement_append_only_update"
BEFORE UPDATE ON "FinancialMovement"
BEGIN
  SELECT RAISE(ABORT, 'FinancialMovement is append-only; record a reversing movement instead');
END;

CREATE TRIGGER "DomainEvent_append_only_update"
BEFORE UPDATE ON "DomainEvent"
BEGIN
  SELECT RAISE(ABORT, 'DomainEvent is append-only; append a new event instead');
END;

CREATE TRIGGER "CompensationFact_append_only_update"
BEFORE UPDATE ON "CompensationFact"
BEGIN
  SELECT RAISE(ABORT, 'CompensationFact is append-only; append a new fact instead');
END;

CREATE TRIGGER "ProjectionInvalidation_append_only_update"
BEFORE UPDATE ON "ProjectionInvalidation"
BEGIN
  SELECT RAISE(ABORT, 'ProjectionInvalidation is append-only; append a new invalidation instead');
END;
