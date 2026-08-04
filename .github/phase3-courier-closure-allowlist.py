from pathlib import Path

path = Path("src/lib/delivery/__tests__/canonical-courier-closure.integration.test.ts")
text = path.read_text(encoding="utf-8")
marker = '''      resolve(
        process.cwd(),
        "src/lib/integrations/delivery/__tests__/provider-authority-source-contract.test.ts",
      ),
'''
addition = '''      resolve(
        process.cwd(),
        "src/lib/integrations/__tests__/phase3-source-closure.test.ts",
      ),
'''
if text.count(marker) != 1:
    raise SystemExit("expected one courier source-contract allowlist marker")
if addition in text:
    raise SystemExit("Phase 3 source-closure test is already allowlisted")
path.write_text(text.replace(marker, marker + addition, 1), encoding="utf-8")
print("Phase 3 courier authority inspection allowlist applied")
