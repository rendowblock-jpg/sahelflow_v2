from pathlib import Path


def replace_between(path: str, start: str, end: str, replacement: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    start_index = text.find(start)
    if start_index < 0:
        raise SystemExit(f"missing start marker in {path}: {start}")
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise SystemExit(f"missing end marker in {path}: {end}")
    file_path.write_text(
        text[:start_index] + replacement + text[end_index:],
        encoding="utf-8",
    )


replace_between(
    "README.md",
    "### Evidence still open\n",
    "## Binding product shape\n",
    '''### Evidence still open

- current live certification for at least one Required courier and communication
  path using safe current credentials and redacted receipts;
- applicable provider/Windows Level 3 evidence;
- issue #201 installed hydrated-WebView proof;
- explicit protected merge and later Founder-acceptance decisions.

No version bump, MSI, release, Founder acceptance, Phase 3 closure or Stable claim
is authorized by source completion.

''',
)

print("FD-030 evidence sections normalized")
