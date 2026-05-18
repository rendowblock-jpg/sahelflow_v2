-- ================================================
-- SahelFlow Migration 011: Fix Automation CHECK Constraints
-- Run this in Supabase SQL Editor
-- ================================================
-- The original automations table (001) had restrictive CHECK constraints
-- on trigger_type and action_type that only allowed Phase 1 values.
-- Phase 11 introduced the recipe system with new trigger/action types
-- (e.g. 'order.created', 'send_template', 'flag_review') that are
-- rejected by these constraints, causing silent INSERT failures.
--
-- Fix: Drop the restrictive CHECK constraints entirely.
-- These are freeform strings controlled by application code (recipes.ts).

ALTER TABLE public.automations DROP CONSTRAINT IF EXISTS automations_trigger_type_check;
ALTER TABLE public.automations DROP CONSTRAINT IF EXISTS automations_action_type_check;

-- Also drop any unnamed check constraints on those columns
-- (Supabase may have generated different constraint names)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attnum = ANY(con.conkey) AND att.attrelid = con.conrelid
    WHERE con.conrelid = 'public.automations'::regclass
      AND con.contype = 'c'
      AND att.attname IN ('trigger_type', 'action_type')
  ) LOOP
    EXECUTE 'ALTER TABLE public.automations DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;
