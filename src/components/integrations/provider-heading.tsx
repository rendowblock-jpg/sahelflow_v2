import type { ReactNode } from "react";

import { TestingBadge } from "@/components/integrations/testing-badge";
import type { IntegrationId } from "@/lib/integrations/certification";

/**
 * Title of a provider row: logo, name, "in testing" chip. A long name is cut with an ellipsis; the chip is a sibling
 * of that name (never inside it) and does not shrink, so it always shows whole.
 */
export function ProviderHeading({
  logo,
  name,
  integration,
}: {
  logo: ReactNode;
  name: string;
  integration: IntegrationId;
}) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      {logo}
      <span className="min-w-0 truncate font-medium">{name}</span>
      <TestingBadge integration={integration} />
    </span>
  );
}
