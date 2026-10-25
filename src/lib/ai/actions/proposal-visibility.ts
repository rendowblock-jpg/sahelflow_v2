import { Prisma } from "@prisma/client";

import type { Phase2Action } from "@/lib/identity/permissions";

/**
 * Who may read which AI action proposals.
 *
 * A member who holds `approvals.approve` (the owner preset) reviews every
 * proposal. Everybody else with `ai.use` only sees the proposals they
 * requested themselves, matched on the requester person id the proposal
 * stores at creation.
 */
export interface ProposalViewer {
  personId: string;
  seesAll: boolean;
}

export function proposalViewer(
  personId: string,
  permissions: readonly Phase2Action[],
): ProposalViewer {
  return { personId, seesAll: permissions.includes("approvals.approve") };
}

export function canViewProposalRequestedBy(
  viewer: ProposalViewer,
  requestActorId: string,
): boolean {
  return viewer.seesAll || viewer.personId === requestActorId;
}

/**
 * SQL twin of canViewProposalRequestedBy for queries aliased `p`. It is part
 * of the WHERE clause so a row LIMIT counts only rows the viewer may see.
 */
export function proposalRequesterFilterSql(viewer: ProposalViewer): Prisma.Sql {
  return viewer.seesAll
    ? Prisma.empty
    : Prisma.sql`AND p."requestActorId" = ${viewer.personId}`;
}
