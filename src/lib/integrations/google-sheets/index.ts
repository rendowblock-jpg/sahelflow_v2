import "server-only";
import { google } from "googleapis";
import { getSecret } from "@/lib/secrets";

/**
 * Google Sheets integration — Service Account auth (server-to-server).
 *
 * Setup (one-time, by the founder):
 * 1. Create a GCP project at https://console.cloud.google.com
 * 2. Enable the Google Sheets API + Google Drive API
 * 3. Create a Service Account + download the JSON key file
 * 4. Place the JSON key at data/google-service-account.json
 * 5. Share the target Google Sheet with the service account email
 *    (<sa>@<project>.iam.gserviceaccount.com)
 *
 * The service account JSON is stored as a secret (key: google_service_account).
 * In dev, it can also be read from data/google-service-account.json.
 */

const SERVICE_ACCOUNT_SECRET_KEY = "google_service_account";

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

/** Load the service account key from the Secret store or the data/ file. */
async function loadServiceAccountKey(): Promise<ServiceAccountKey | null> {
  // 1. Try the Secret store
  const stored = await getSecret(SERVICE_ACCOUNT_SECRET_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as ServiceAccountKey;
    } catch {
      // Invalid JSON in secret — fall through to file
    }
  }

  // 2. Try the data/ file (dev convenience)
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const filePath = join(process.cwd(), "data", "google-service-account.json");
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as ServiceAccountKey;
  } catch {
    return null;
  }
}

/** Create an authenticated Google Sheets client. */
async function getSheetsClient() {
  const key = await loadServiceAccountKey();
  if (!key) {
    throw new Error("Google Service Account not configured. Add credentials in Settings → Integrations.");
  }

  const jwt = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });

  await jwt.authorize();
  return google.sheets({ version: "v4", auth: jwt });
}

/** Check if Google Sheets is configured. */
export async function isGoogleSheetsConfigured(): Promise<boolean> {
  const key = await loadServiceAccountKey();
  return key !== null;
}

/** Read all values from a sheet (by spreadsheet ID + range). */
export async function readSheet(spreadsheetId: string, range: string): Promise<string[][]> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  return (res.data.values ?? []) as string[][];
}

/** Write values to a sheet (append mode). */
export async function appendToSheet(
  spreadsheetId: string,
  range: string,
  values: string[][],
): Promise<{ updatedRows: number }> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values },
  });
  return {
    updatedRows: res.data.updates?.updatedRows ?? 0,
  };
}

/** Write values to a sheet (overwrite mode). */
export async function updateSheet(
  spreadsheetId: string,
  range: string,
  values: string[][],
): Promise<{ updatedRows: number }> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "RAW",
    requestBody: { values },
  });
  return {
    updatedRows: res.data.updatedRows ?? 0,
  };
}

/**
 * Clear a range of cells (W3-6: "clear + rewrite" export strategy).
 *
 * Used by exportOrdersToSheet to wipe any stale rows left over from a
 * previous export before writing the fresh dataset. Without this, an
 * export that has FEWER rows than the previous one would leave the
 * old bottom rows visible (a misleading "phantom tail" of stale data).
 *
 * Google Sheets treats clearing an empty range as a no-op, so it's safe
 * to call unconditionally even on a fresh sheet.
 */
export async function clearSheetRange(
  spreadsheetId: string,
  range: string,
): Promise<void> {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range,
  });
}

/** Create a new spreadsheet and return its ID. */
export async function createSpreadsheet(title: string): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const key = await loadServiceAccountKey();
  if (!key) throw new Error("Google Service Account not configured");

  const jwt = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });
  await jwt.authorize();

  const sheets = google.sheets({ version: "v4", auth: jwt });

  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
    },
  });

  const spreadsheetId = res.data.spreadsheetId ?? "";
  const spreadsheetUrl = res.data.spreadsheetUrl ?? "";

  return { spreadsheetId, spreadsheetUrl };
}

/**
 * W3-6: prepare the sheet for a fresh "clear + rewrite" export.
 *
 * Writes the canonical header row at A1 (overwrites any existing headers
 * — handles schema drift if we ever add a column) and clears the data
 * range below the header (A2:Z100000) so a smaller dataset doesn't leave
 * a phantom tail of stale rows from the previous export.
 *
 * Called once per export, BEFORE any writeOrdersBatch calls.
 */
export async function prepareSheetForExport(spreadsheetId: string): Promise<void> {
  const headers = [["Order #", "Customer", "Phone", "Wilaya", "Commune", "Total (DZD)", "Status", "Date"]];
  await updateSheet(spreadsheetId, "A1", headers);
  await clearSheetRange(spreadsheetId, "A2:Z100000");
}

/**
 * W3-6: write a single batch of orders to the sheet at the given 1-based
 * start row. Each batch maps to a contiguous row range
 * (e.g. startRow=2 → A2:H501 for a 500-row batch) so successive batches
 * never overlap.
 *
 * Use this when you want to stream orders from a paginated DB cursor
 * into the sheet without holding the full dataset in memory.
 *
 * Caller is responsible for:
 *   - Calling prepareSheetForExport ONCE before the first batch.
 *   - Computing the correct startRow for each batch (row 1 = headers,
 *     so batch N starts at row 2 + N * BATCH_SIZE).
 */
export async function writeOrdersBatch(
  spreadsheetId: string,
  orders: Array<{
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    wilaya: string;
    commune: string;
    totalPrice: number;
    status: string;
    createdAt: Date;
  }>,
  startRow: number,
): Promise<{ updatedRows: number }> {
  if (orders.length === 0) {
    return { updatedRows: 0 };
  }
  const rows: string[][] = orders.map((o) => [
    o.orderNumber,
    o.customerName,
    o.customerPhone,
    o.wilaya,
    o.commune,
    String(o.totalPrice),
    o.status,
    o.createdAt.toISOString(),
  ]);
  const endRow = startRow + rows.length - 1;
  const range = `A${startRow}:H${endRow}`;
  return updateSheet(spreadsheetId, range, rows);
}

/**
 * Export orders to a Google Sheet.
 *
 * W3-6 (clear + rewrite strategy): previously this function APPENDED order
 * rows to whatever was already in the sheet — so re-exporting produced
 * duplicates, and the route capped the input at 1000 orders. The new
 * contract:
 *   1. Always (re)write the header row at A1 — handles schema drift if
 *      we ever add a new column.
 *   2. Clear the entire data range (A2:Z100000) — wipes stale rows from
 *      the previous export (so a smaller dataset doesn't leave a phantom
 *      tail of old data, AND re-exporting doesn't append duplicates).
 *   3. Write all order rows back in batches of 500 — keeps each API
 *      request body well under the Sheets API's 10MB limit.
 *
 * The dedup problem is solved structurally: there is never an "old row
 * next to a new row" because every export starts from a clean slate.
 *
 * For very large datasets (50k+ orders), prefer calling prepareSheetForExport
 * + writeOrdersBatch directly from the route so you can stream DB batches
 * into the sheet without holding the full dataset in memory.
 *
 * The 1000-order cap is removed at the route layer (which now paginates
 * Prisma with skip/take in batches of 500) — this function accepts any
 * number of orders.
 */
export async function exportOrdersToSheet(
  spreadsheetId: string,
  orders: Array<{
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    wilaya: string;
    commune: string;
    totalPrice: number;
    status: string;
    createdAt: Date;
  }>,
): Promise<{ updatedRows: number }> {
  await prepareSheetForExport(spreadsheetId);

  if (orders.length === 0) {
    return { updatedRows: 0 };
  }

  // Write in batches of 500 — each batch starts at the row after the
  // previous one. Row 1 = headers, so batch 0 starts at row 2.
  const BATCH_SIZE = 500;
  let totalUpdated = 0;
  for (let i = 0; i < orders.length; i += BATCH_SIZE) {
    const batch = orders.slice(i, i + BATCH_SIZE);
    const startRow = i + 2; // +2 because row 1 = headers
    const result = await writeOrdersBatch(spreadsheetId, batch, startRow);
    totalUpdated += result.updatedRows;
  }

  return { updatedRows: totalUpdated };
}

/** Store the service account JSON (from the Settings UI upload). */
export async function setServiceAccount(jsonContent: string): Promise<void> {
  const { setSecret } = await import("@/lib/secrets");
  await setSecret(SERVICE_ACCOUNT_SECRET_KEY, jsonContent);
}
