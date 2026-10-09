/**
 * SahelFlow License Desk — page behaviour. Bundled into one offline HTML
 * file by scripts/build-license-desk.ts. The signing key lives only in this
 * module's memory; the sales ledger lives only in this browser's storage.
 */
import {
  decodeRequestCode,
  DeskError,
  generateSigningKey,
  isValidKeyId,
  keyIdFromFileName,
  keyringVerdict,
  MAXIMUM_EXTRA_SHOPS,
  packageTotalDzd,
  parsePrivateKey,
  PERMANENT_PACKAGE,
  publicKeyBase64,
  salesCsv,
  sellerMessage,
  signLicense,
  type DecodedRequest,
  type MessageLocale,
  type SaleRecord,
  type SignedLicense,
} from "./desk-core";

const LEDGER_KEY = "sahelflow-license-desk-sales-v1";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}

type Tone = "ok" | "warn" | "error";

function setStatus(id: string, message: string, tone: Tone = "ok"): void {
  const node = element<HTMLParagraphElement>(id);
  node.textContent = message;
  node.dataset.tone = tone;
}

function clearStatus(id: string): void {
  element<HTMLParagraphElement>(id).textContent = "";
}

function formatDzd(value: number): string {
  return `${new Intl.NumberFormat("fr-DZ").format(value)} DZD`;
}

function readLedger(): SaleRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEDGER_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as SaleRecord[]) : [];
  } catch {
    return [];
  }
}

function writeLedger(records: SaleRecord[]): boolean {
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

function download(fileName: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function copy(text: string, statusId: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(statusId, done);
  } catch {
    setStatus(statusId, "Copy failed. Select the text and copy it manually.", "warn");
  }
}

const state: {
  privateKey: Uint8Array | null;
  publicKey: string | null;
  request: DecodedRequest | null;
  issued: SignedLicense | null;
} = { privateKey: null, publicKey: null, request: null, issued: null };

function keyId(): string {
  return element<HTMLInputElement>("key-id").value.trim().toLowerCase();
}

function refreshIssueButton(): void {
  const ready =
    state.privateKey !== null &&
    state.request !== null &&
    isValidKeyId(keyId()) &&
    element<HTMLInputElement>("payment-confirmed").checked;
  element<HTMLButtonElement>("issue").disabled = !ready;
}

function refreshKeyVerdict(): void {
  if (!state.publicKey) return;
  const keyring = element<HTMLTextAreaElement>("keyring").value.trim();
  if (!isValidKeyId(keyId())) {
    setStatus("key-status", "The key id must be 8+ lowercase letters, digits or dashes.", "error");
    return;
  }
  if (!keyring) {
    setStatus("key-status", "Key loaded. Optionally paste the app's keyring to confirm it will be accepted.");
    return;
  }
  const verdict = keyringVerdict(keyring, keyId(), state.publicKey);
  if (verdict === "match") {
    setStatus("key-status", "This key is in the app's keyring. Licences you issue will activate.");
  } else if (verdict === "missing") {
    setStatus(
      "key-status",
      `The app's keyring has no "${keyId()}" entry. Licences signed now will be rejected until a release includes this key.`,
      "error",
    );
  } else if (verdict === "different") {
    setStatus(
      "key-status",
      `The keyring's "${keyId()}" is a different key. This file is not the key the app trusts.`,
      "error",
    );
  } else {
    setStatus("key-status", "The keyring text is not valid JSON.", "warn");
  }
}

function showMessage(locale: MessageLocale, issued: SignedLicense): void {
  const box = element<HTMLTextAreaElement>("result-message");
  box.dir = locale === "ar" ? "rtl" : "ltr";
  box.lang = locale;
  box.value = sellerMessage(locale, issued.activationCode, issued.claims.shopSlots);
}

function refreshPackage(): void {
  const extra = Number.parseInt(element<HTMLSelectElement>("extra-shops").value, 10) || 0;
  element("package-total").textContent = formatDzd(packageTotalDzd(extra));
  element("package-summary").textContent =
    `${PERMANENT_PACKAGE.includedShops + extra} shops · owner + ${PERMANENT_PACKAGE.memberLimit - 1} team members · ` +
    `${Math.round((PERMANENT_PACKAGE.baseBackupBytes + extra * PERMANENT_PACKAGE.backupBytesPerExtraShop) / 1e9)} GB backup · ` +
    `${PERMANENT_PACKAGE.supportMonths / 12} years of updates`;
}

function renderLedger(): void {
  const body = element<HTMLTableSectionElement>("ledger-body");
  body.replaceChildren();
  const records = readLedger();
  if (records.length === 0) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 6;
    cell.className = "empty";
    cell.textContent = "No licence issued from this browser yet.";
    return;
  }
  for (const record of [...records].reverse()) {
    const row = body.insertRow();
    const values = [
      new Date(record.issuedAt).toLocaleString(),
      [record.customer, record.phone].filter(Boolean).join(" · ") || "—",
      record.paymentReference || "—",
      String(PERMANENT_PACKAGE.includedShops + record.extraShops),
      formatDzd(record.totalDzd),
      record.licenseId,
    ];
    values.forEach((value, index) => {
      const cell = row.insertCell();
      cell.textContent = value;
      if (index === 3 || index === 4) cell.className = "num";
    });
  }
}

async function loadKeyFile(file: File | undefined): Promise<void> {
  clearStatus("key-status");
  state.privateKey?.fill(0);
  state.privateKey = null;
  state.publicKey = null;
  element("key-facts").classList.add("hidden");
  if (!file) return refreshIssueButton();
  try {
    if (file.size > 4096) throw new DeskError("This is not a SahelFlow permanent signing key file.");
    state.privateKey = parsePrivateKey(await file.text());
    state.publicKey = await publicKeyBase64(state.privateKey);
    const fromName = keyIdFromFileName(file.name);
    if (fromName) element<HTMLInputElement>("key-id").value = fromName;
    element("key-public").textContent = state.publicKey;
    element("key-facts").classList.remove("hidden");
    refreshKeyVerdict();
  } catch (error) {
    setStatus("key-status", error instanceof Error ? error.message : String(error), "error");
  }
  refreshIssueButton();
}

let decodeGeneration = 0;
async function decodeRequest(): Promise<void> {
  const generation = ++decodeGeneration;
  const text = element<HTMLTextAreaElement>("request-code").value;
  state.request = null;
  element("request-facts").classList.add("hidden");
  clearStatus("request-status");
  refreshIssueButton();
  if (!text.trim()) return;
  try {
    const request = await decodeRequestCode(text);
    if (generation !== decodeGeneration) return;
    state.request = request;
    element("request-installation").textContent = request.installationId;
    element("request-major").textContent = `SahelFlow ${request.productMajor}`;
    element("request-recovery").textContent = String(request.recoveryEpoch);
    element("request-current").textContent = request.currentLicenseId ?? "none (trial or new install)";
    element("request-facts").classList.remove("hidden");
    const earlier = readLedger().filter((record) => record.installation === request.installationId);
    if (earlier.length > 0) {
      setStatus(
        "request-status",
        `Already licensed from this browser on ${new Date(earlier.at(-1)?.issuedAt ?? Date.now()).toLocaleDateString()}. Issuing again replaces that licence (for example after a reinstall).`,
        "warn",
      );
    } else {
      setStatus("request-status", "Request code is valid.");
    }
  } catch (error) {
    if (generation !== decodeGeneration) return;
    setStatus("request-status", error instanceof Error ? error.message : String(error), "error");
  }
  refreshIssueButton();
}

async function issue(): Promise<void> {
  clearStatus("issue-status");
  if (!state.privateKey || !state.request) return;
  const extraShops = Number.parseInt(element<HTMLSelectElement>("extra-shops").value, 10) || 0;
  const button = element<HTMLButtonElement>("issue");
  button.disabled = true;
  try {
    const issued = await signLicense({
      request: state.request,
      extraShops,
      keyId: keyId(),
      privateKey: state.privateKey,
    });
    state.issued = issued;
    showMessage(element<HTMLSelectElement>("reply-locale").value as MessageLocale, issued);
    element("result").classList.remove("hidden");
    clearStatus("result-status");
    const saved = writeLedger([
      ...readLedger(),
      {
        issuedAt: issued.claims.issuedAt,
        licenseId: issued.claims.licenseId,
        installation: issued.claims.installationId,
        customer: element<HTMLInputElement>("customer").value.trim(),
        phone: element<HTMLInputElement>("phone").value.trim(),
        paymentReference: element<HTMLInputElement>("payment-ref").value.trim(),
        extraShops,
        totalDzd: packageTotalDzd(extraShops),
        supportEndsAt: issued.claims.supportEndsAt,
      },
    ]);
    renderLedger();
    setStatus(
      "issue-status",
      saved
        ? `Licence ${issued.claims.licenseId} issued and recorded in the ledger.`
        : `Licence ${issued.claims.licenseId} issued. This browser could not save the ledger entry; note it down.`,
      saved ? "ok" : "warn",
    );
    element("result").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setStatus("issue-status", error instanceof Error ? error.message : String(error), "error");
  } finally {
    element<HTMLInputElement>("payment-confirmed").checked = false;
    refreshIssueButton();
  }
}

async function createKey(): Promise<void> {
  const id = keyId();
  if (!isValidKeyId(id)) {
    setStatus("key-status", "Choose a key id first (8+ lowercase letters, digits or dashes).", "error");
    return;
  }
  const { privateKeyText, publicKey } = await generateSigningKey();
  download(`${id}.private`, privateKeyText, "text/plain");
  const entry = element<HTMLTextAreaElement>("key-new-entry");
  entry.value =
    `Add this entry to the GitHub variable SF_LICENSE_PERMANENT_PUBLIC_KEYS (keep existing entries):\n` +
    JSON.stringify({ [id]: publicKey });
  entry.classList.remove("hidden");
  setStatus(
    "key-status",
    "New key downloaded. Store it offline, add the public entry to GitHub, then open the file above. Licences signed with it activate on releases built after that.",
    "warn",
  );
}

function init(): void {
  const select = element<HTMLSelectElement>("extra-shops");
  for (let extra = 0; extra <= MAXIMUM_EXTRA_SHOPS; extra += 1) {
    const option = document.createElement("option");
    option.value = String(extra);
    option.textContent =
      extra === 0
        ? `None (${PERMANENT_PACKAGE.includedShops} shops)`
        : `+${extra} (${PERMANENT_PACKAGE.includedShops + extra} shops)`;
    select.append(option);
  }
  element<HTMLInputElement>("key-file").addEventListener("change", (event) => {
    void loadKeyFile((event.target as HTMLInputElement).files?.[0]);
  });
  element<HTMLInputElement>("key-id").addEventListener("input", () => {
    refreshKeyVerdict();
    refreshIssueButton();
  });
  element<HTMLTextAreaElement>("keyring").addEventListener("input", refreshKeyVerdict);
  element<HTMLTextAreaElement>("request-code").addEventListener("input", () => void decodeRequest());
  select.addEventListener("change", refreshPackage);
  element<HTMLInputElement>("payment-confirmed").addEventListener("change", refreshIssueButton);
  element<HTMLButtonElement>("issue").addEventListener("click", () => void issue());
  element<HTMLButtonElement>("key-generate").addEventListener("click", () => void createKey());
  element<HTMLButtonElement>("copy-message").addEventListener("click", () => {
    void copy(element<HTMLTextAreaElement>("result-message").value, "result-status", "Message copied.");
  });
  element<HTMLButtonElement>("copy-code").addEventListener("click", () => {
    if (state.issued) void copy(state.issued.activationCode, "result-status", "Activation code copied.");
  });
  element<HTMLButtonElement>("download-license").addEventListener("click", () => {
    if (!state.issued) return;
    download(
      `sahelflow-${state.issued.claims.licenseId}.sflicense`,
      `${state.issued.activationCode}\n`,
      "text/plain",
    );
  });
  element<HTMLSelectElement>("reply-locale").addEventListener("change", () => {
    if (!state.issued) return;
    showMessage(element<HTMLSelectElement>("reply-locale").value as MessageLocale, state.issued);
  });
  element<HTMLButtonElement>("export-ledger").addEventListener("click", () => {
    download(
      `sahelflow-sales-${new Date().toISOString().slice(0, 10)}.csv`,
      salesCsv(readLedger()),
      "text/csv",
    );
  });
  window.addEventListener("beforeunload", () => state.privateKey?.fill(0));
  refreshPackage();
  renderLedger();
}

init();
