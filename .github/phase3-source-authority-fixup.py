from pathlib import Path

path = Path("scripts/sf-audit.ts")
text = path.read_text(encoding="utf-8")
old = '''  validateClosure(checkpointPath, "Task 3"

  validateClosure(checkpointPath, "Task 3",'''
new = '''  validateClosure(checkpointPath, "Task 3",'''
if text.count(old) != 1:
    raise SystemExit("expected one duplicated Task 3 closure prefix")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Phase 3 generated audit closure call fixed")
