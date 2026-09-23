/**
 * Agent capabilities API — returns the scope-filtered tool catalog.
 *
 * GET /api/agents/capabilities
 *
 * Response: { tools: [...], groups: [...] }
 * Tools are filtered by the caller's permissions (registration-time scope hiding).
 */

import { NextResponse } from "next/server";

import { getVisibleTools } from "@/lib/mcp/registry";
import type { McpCapabilityGroup } from "@/lib/mcp/types";
import { requireAuth } from "@/lib/auth/server";

export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const visibility = getVisibleTools(auth.permissions);

    // Group tools by capability group
    const groups: Record<string, Array<Record<string, unknown>>> = {};
    for (const tool of visibility.visibleTools) {
      if (!groups[tool.group]) groups[tool.group] = [];
      groups[tool.group].push({
        name: tool.name,
        description: tool.description,
        annotations: tool.annotations,
        executionClass: tool.annotations.readOnlyHint ? "read" : "sensitive",
      });
    }

    return NextResponse.json({
      groups,
      totalRegistered: visibility.totalRegistered,
      totalVisible: visibility.visibleTools.length,
    });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
