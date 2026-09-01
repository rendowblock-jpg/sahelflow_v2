/**
 * Campaign row B3 round-3 probe: POST exact client-shaped document sends at
 * the REAL sidecar /send-document and report which validation condition fires.
 *
 * A 503 WHATSAPP_NOT_CONNECTED means every validation condition passed
 * (the status gate sits after validation). A 400 names the failing condition.
 *
 * Run: bun sidecars/whatsapp/probe-document-reject.ts
 */
const TOKEN = process.env.PROBE_SIDECAR_TOKEN ?? "probe-token-0123456789abcdef";
const PORT = process.env.PROBE_SIDECAR_PORT ?? "3901";
const BASE = `http://127.0.0.1:${PORT}`;

const DOCX = Buffer.concat([
  Buffer.from([0x50, 0x0d, 0x0b, 0x04]),
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from("probe-ooxml-zip-payload\n", "utf8"),
]);

function clientShape(overrides: Record<string, string | Blob | undefined>) {
  const form = new FormData();
  const base: Record<string, string | Blob> = {
    to: "213555123456@s.whatsapp.net",
    effectKey:
      "wa:0123456789abcdef0123456789abcdef:" +
      "b".repeat(64) +
      ":document:probeeffect1",
    requestBinding: "a".repeat(64),
    caption: "",
    fileName: "contrat-commercial.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    document: new Blob([new Uint8Array(DOCX)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  };
  const merged = { ...base, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined) continue; // simulate the field being absent
    form.set(key, value);
  }
  return form;
}

const CASES: Array<{ name: string; form: FormData }> = [
  { name: "1-happy-docx", form: clientShape({}) },
  { name: "2-arabic-file-name", form: clientShape({ fileName: "عقد البيع - نسخة موقعة.docx" }) },
  {
    name: "3-file-name-over-180",
    form: clientShape({ fileName: "d".repeat(181) + ".docx" }),
  },
  { name: "4-file-name-backslash", form: clientShape({ fileName: "a\\b.docx" }) },
  { name: "5-missing-mime-field", form: clientShape({ mimeType: undefined }) },
  { name: "6-zip-declared", form: clientShape({ mimeType: "application/zip" }) },
  {
    name: "7-effect-key-short-hash",
    form: clientShape({ effectKey: "wa:0123456789abcdef0123456789abcdef:0123456789abcdef:document:probeeffect1" }),
  },
  {
    name: "8-uppercase-binding",
    form: clientShape({ requestBinding: "A".repeat(64) }),
  },
  {
    name: "9-lid-recipient",
    form: clientShape({ to: "123456789012345@lid" }),
  },
  {
    name: "10-long-caption",
    form: clientShape({ caption: "c".repeat(4001) }),
  },
  {
    name: "11-missing-file-name-field",
    form: clientShape({ fileName: undefined }),
  },
];

for (const testCase of CASES) {
  const response = await fetch(`${BASE}/send-document`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: testCase.form,
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = "<non-json>";
  }
  console.log(
    `${testCase.name.padEnd(32)} -> ${response.status} ${JSON.stringify(body)}`,
  );
}
