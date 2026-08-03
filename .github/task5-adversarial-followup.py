core = "src/lib/ai/chat/tools/core-tools.ts"
replace_lines(
    core,
    [
        "  status: z.enum([",
        '    "draft",',
        '    "pending",',
        '    "shipped",',
        '    "delivered",',
        '    "cancelled",',
        '    "returned",',
        "  ]),",
    ],
    [
        "  status: z.enum([",
        '    "draft",',
        '    "pending",',
        '    "confirmed",',
        '    "shipped",',
        '    "delivered",',
        '    "cancelled",',
        '    "returned",',
        "  ]),",
    ],
)
insert_after(
    core,
    "      const input = updateOrderStatusSchema.parse(params);\n",
    """      if (input.status === "confirmed") {
        return {
          success: false,
          error:
            "La confirmation exige la commande gouvernée; l’IA ne peut pas utiliser le chemin historique.",
        };
      }
""",
)

phase1_test = "src/lib/orders/__tests__/phase1-adopted-source-bypass.test.ts"
replace_exact(
    phase1_test,
    "    expect(files.ai).toContain('sourceBusinessPrincipal(\\n            \"ai_chat\",');",
    '    expect(files.ai).toMatch(/sourceBusinessPrincipal\\(\\s*"ai_chat",/);',
)
