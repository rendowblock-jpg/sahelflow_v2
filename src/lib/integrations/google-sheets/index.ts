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
 * Export orders to a Google Sheet.
 * Creates headers if the sheet is empty, then appends order rows.
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
  // Check if headers exist
  const existing = await readSheet(spreadsheetId, "A1:Z1");
  const hasHeaders = existing.length > 0 && existing[0]?.length;

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

  if (!hasHeaders) {
    // Write headers first, then append data
    const headers = [["Order #", "Customer", "Phone", "Wilaya", "Commune", "Total (DZD)", "Status", "Date"]];
    await updateSheet(spreadsheetId, "A1", headers);
    return appendToSheet(spreadsheetId, "A2", rows);
  }

  return appendToSheet(spreadsheetId, "A:Z", rows);
}

/** Store the service account JSON (from the Settings UI upload). */
export async function setServiceAccount(jsonContent: string): Promise<void> {
  const { setSecret } = await import("@/lib/secrets");
  await setSecret(SERVICE_ACCOUNT_SECRET_KEY, jsonContent);
}
