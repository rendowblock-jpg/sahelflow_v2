/**
 * Google Sheets integration tests — T-AUTH-INFRA.
 *
 * Mocks `googleapis` (google.auth.JWT + google.sheets) and `@/lib/secrets`
 * (getSecret / setSecret) so no network or file IO happens.
 *
 * Covers:
 *   - isGoogleSheetsConfigured (with/without secret + invalid JSON fallback)
 *   - readSheet / appendToSheet / updateSheet / createSpreadsheet
 *   - exportOrdersToSheet (headers + no-headers paths)
 *   - setServiceAccount stores via @/lib/secrets
 *   - getSheetsClient throws when no key is configured
 *   - JWT constructed with email + key + correct scopes
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock @/lib/secrets ──────────────────────────────────────────────────────
const secretsMock = vi.hoisted(() => ({
  getSecret: vi.fn(),
  setSecret: vi.fn(),
}));

vi.mock("@/lib/secrets", () => ({
  getSecret: secretsMock.getSecret,
  setSecret: secretsMock.setSecret,
}));

// ── Mock googleapis ─────────────────────────────────────────────────────────
const jwtInstance = vi.hoisted(() => ({
  authorize: vi.fn(),
}));

const sheetsClient = vi.hoisted(() => ({
  spreadsheets: {
    values: {
      get: vi.fn(),
      append: vi.fn(),
      update: vi.fn(),
    },
    create: vi.fn(),
  },
}));

const JwtCtor = vi.hoisted(() => vi.fn(() => jwtInstance));
const sheetsCtor = vi.hoisted(() => vi.fn(() => sheetsClient));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      JWT: JwtCtor,
    },
    sheets: sheetsCtor,
  },
}));

// Suppress console.error from the loadServiceAccountKey file-fallback path
// (data/google-service-account.json doesn't exist in tests)
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

import {
  isGoogleSheetsConfigured,
  readSheet,
  appendToSheet,
  updateSheet,
  createSpreadsheet,
  exportOrdersToSheet,
  setServiceAccount,
} from "../index";

const VALID_SA_JSON = JSON.stringify({
  type: "service_account",
  project_id: "test-project",
  private_key_id: "pkid1",
  private_key: "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n",
  client_email: "sa@test-project.iam.gserviceaccount.com",
  client_id: "123",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/sa%40test.iam.gserviceaccount.com",
});

beforeEach(() => {
  secretsMock.getSecret.mockReset();
  secretsMock.setSecret.mockReset();
  jwtInstance.authorize.mockReset();
  JwtCtor.mockClear();
  sheetsCtor.mockClear();
  sheetsClient.spreadsheets.values.get.mockReset();
  sheetsClient.spreadsheets.values.append.mockReset();
  sheetsClient.spreadsheets.values.update.mockReset();
  sheetsClient.spreadsheets.create.mockReset();

  jwtInstance.authorize.mockResolvedValue(undefined);
});

// ── isGoogleSheetsConfigured ─────────────────────────────────────────────────
describe("isGoogleSheetsConfigured", () => {
  it("returns true when the Secret store has a valid service account JSON", async () => {
    secretsMock.getSecret.mockResolvedValue(VALID_SA_JSON);
    expect(await isGoogleSheetsConfigured()).toBe(true);
  });

  it("returns false when no secret is stored + no file", async () => {
    secretsMock.getSecret.mockResolvedValue(null);
    expect(await isGoogleSheetsConfigured()).toBe(false);
  });

  it("returns false when the stored secret is invalid JSON (falls through to missing file)", async () => {
    secretsMock.getSecret.mockResolvedValue("{ not valid json");
    expect(await isGoogleSheetsConfigured()).toBe(false);
  });
});

// ── readSheet ────────────────────────────────────────────────────────────────
describe("readSheet", () => {
  it("constructs a JWT from the stored service account + calls sheets.values.get", async () => {
    secretsMock.getSecret.mockResolvedValue(VALID_SA_JSON);
    sheetsClient.spreadsheets.values.get.mockResolvedValue({
      data: { values: [["a", "b"], ["c", "d"]] },
    });

    const result = await readSheet("sheet-123", "A1:B2");
    expect(result).toEqual([["a", "b"], ["c", "d"]]);

    // JWT constructed with the email + key from the service account
    expect(JwtCtor).toHaveBeenCalledWith({
      email: "sa@test-project.iam.gserviceaccount.com",
      key: "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n",
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive.file",
      ],
    });
    expect(jwtInstance.authorize).toHaveBeenCalledTimes(1);
    expect(sheetsCtor).toHaveBeenCalledWith({ version: "v4", auth: jwtInstance });
    expect(sheetsClient.spreadsheets.values.get).toHaveBeenCalledWith({
      spreadsheetId: "sheet-123",
      range: "A1:B2",
    });
  });

  it("returns [] when the sheet is empty", async () => {
    secretsMock.getSecret.mockResolvedValue(VALID_SA_JSON);
    sheetsClient.spreadsheets.values.get.mockResolvedValue({ data: {} });
    const result = await readSheet("sheet-123", "A1:Z1");
    expect(result).toEqual([]);
  });

  it("throws when no service account is configured", async () => {
    secretsMock.getSecret.mockResolvedValue(null);
    await expect(readSheet("sheet-123", "A1")).rejects.toThrow(/not configured/i);
  });
});

// ── appendToSheet ────────────────────────────────────────────────────────────
describe("appendToSheet", () => {
  it("appends rows + returns updatedRows count", async () => {
    secretsMock.getSecret.mockResolvedValue(VALID_SA_JSON);
    sheetsClient.spreadsheets.values.append.mockResolvedValue({
      data: { updates: { updatedRows: 3 } },
    });

    const result = await appendToSheet("sheet-1", "A1", [["r1c1"], ["r2c1"], ["r3c1"]]);
    expect(result).toEqual({ updatedRows: 3 });
    expect(sheetsClient.spreadsheets.values.append).toHaveBeenCalledWith({
      spreadsheetId: "sheet-1",
      range: "A1",
      valueInputOption: "RAW",
      requestBody: { values: [["r1c1"], ["r2c1"], ["r3c1"]] },
    });
  });

  it("returns 0 when the API response has no updates object", async () => {
    secretsMock.getSecret.mockResolvedValue(VALID_SA_JSON);
    sheetsClient.spreadsheets.values.append.mockResolvedValue({ data: {} });
    const result = await appendToSheet("sheet-1", "A1", [["x"]]);
    expect(result).toEqual({ updatedRows: 0 });
  });
});

// ── updateSheet ──────────────────────────────────────────────────────────────
describe("updateSheet", () => {
  it("updates rows + returns updatedRows count", async () => {
    secretsMock.getSecret.mockResolvedValue(VALID_SA_JSON);
    sheetsClient.spreadsheets.values.update.mockResolvedValue({
      data: { updatedRows: 2 },
    });

    const result = await updateSheet("sheet-1", "A1:B1", [["a", "b"]]);
    expect(result).toEqual({ updatedRows: 2 });
    expect(sheetsClient.spreadsheets.values.update).toHaveBeenCalledWith({
      spreadsheetId: "sheet-1",
      range: "A1:B1",
      valueInputOption: "RAW",
      requestBody: { values: [["a", "b"]] },
    });
  });

  it("returns 0 when the API response has no updatedRows", async () => {
    secretsMock.getSecret.mockResolvedValue(VALID_SA_JSON);
    sheetsClient.spreadsheets.values.update.mockResolvedValue({ data: {} });
    const result = await updateSheet("sheet-1", "A1", [["x"]]);
    expect(result).toEqual({ updatedRows: 0 });
  });
});

// ── createSpreadsheet ────────────────────────────────────────────────────────
describe("createSpreadsheet", () => {
  it("creates a new spreadsheet + returns its id + url", async () => {
    secretsMock.getSecret.mockResolvedValue(VALID_SA_JSON);
    sheetsClient.spreadsheets.create.mockResolvedValue({
      data: { spreadsheetId: "new-sheet-id", spreadsheetUrl: "https://docs.google.com/spreadsheets/d/new-sheet-id" },
    });

    const result = await createSpreadsheet("My Orders Sheet");
    expect(result).toEqual({
      spreadsheetId: "new-sheet-id",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/new-sheet-id",
    });
    expect(sheetsClient.spreadsheets.create).toHaveBeenCalledWith({
      requestBody: { properties: { title: "My Orders Sheet" } },
    });
  });

  it("throws when no service account is configured", async () => {
    secretsMock.getSecret.mockResolvedValue(null);
    await expect(createSpreadsheet("X")).rejects.toThrow(/not configured/i);
  });

  it("returns empty strings when API response lacks id/url", async () => {
    secretsMock.getSecret.mockResolvedValue(VALID_SA_JSON);
    sheetsClient.spreadsheets.create.mockResolvedValue({ data: {} });
    const result = await createSpreadsheet("X");
    expect(result).toEqual({ spreadsheetId: "", spreadsheetUrl: "" });
  });
});

// ── exportOrdersToSheet ──────────────────────────────────────────────────────
describe("exportOrdersToSheet", () => {
  const orders = [
    {
      orderNumber: "ORD-0001",
      customerName: "Ahmed Benali",
      customerPhone: "0555123456",
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      totalPrice: 5000,
      status: "confirmed",
      createdAt: new Date("2026-01-15T10:30:00Z"),
    },
  ];

  it("writes headers + appends data when the sheet is empty (no headers)", async () => {
    secretsMock.getSecret.mockResolvedValue(VALID_SA_JSON);
    // First call: readSheet returns [] (no headers)
    sheetsClient.spreadsheets.values.get.mockResolvedValueOnce({ data: { values: [] } });
    sheetsClient.spreadsheets.values.update.mockResolvedValueOnce({ data: { updatedRows: 1 } });
    sheetsClient.spreadsheets.values.append.mockResolvedValueOnce({
      data: { updates: { updatedRows: 1 } },
    });

    const result = await exportOrdersToSheet("sheet-1", orders);
    expect(result).toEqual({ updatedRows: 1 });

    // Headers were written via updateSheet
    expect(sheetsClient.spreadsheets.values.update).toHaveBeenCalledWith({
      spreadsheetId: "sheet-1",
      range: "A1",
      valueInputOption: "RAW",
      requestBody: {
        values: [["Order #", "Customer", "Phone", "Wilaya", "Commune", "Total (DZD)", "Status", "Date"]],
      },
    });
    // Data was appended at A2
    expect(sheetsClient.spreadsheets.values.append).toHaveBeenCalledWith({
      spreadsheetId: "sheet-1",
      range: "A2",
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          "ORD-0001",
          "Ahmed Benali",
          "0555123456",
          "Alger",
          "Bab Ezzouar",
          "5000",
          "confirmed",
          "2026-01-15T10:30:00.000Z",
        ]],
      },
    });
  });

  it("only appends data when headers already exist", async () => {
    secretsMock.getSecret.mockResolvedValue(VALID_SA_JSON);
    // readSheet returns existing headers
    sheetsClient.spreadsheets.values.get.mockResolvedValueOnce({
      data: { values: [["Order #", "Customer", "Phone", "Wilaya", "Commune", "Total (DZD)", "Status", "Date"]] },
    });
    sheetsClient.spreadsheets.values.append.mockResolvedValueOnce({
      data: { updates: { updatedRows: 1 } },
    });

    const result = await exportOrdersToSheet("sheet-1", orders);
    expect(result).toEqual({ updatedRows: 1 });

    // Headers should NOT have been updated
    expect(sheetsClient.spreadsheets.values.update).not.toHaveBeenCalled();
    // Data appended at A:Z (default range)
    expect(sheetsClient.spreadsheets.values.append).toHaveBeenCalledWith(
      expect.objectContaining({ spreadsheetId: "sheet-1", range: "A:Z" }),
    );
  });

  it("writes headers when readSheet returns empty inner array", async () => {
    secretsMock.getSecret.mockResolvedValue(VALID_SA_JSON);
    sheetsClient.spreadsheets.values.get.mockResolvedValueOnce({ data: { values: [[]] } });
    sheetsClient.spreadsheets.values.update.mockResolvedValueOnce({ data: { updatedRows: 1 } });
    sheetsClient.spreadsheets.values.append.mockResolvedValueOnce({
      data: { updates: { updatedRows: 0 } },
    });

    await exportOrdersToSheet("sheet-1", orders);
    // existing[0]?.length is 0 → falsy → headers path
    expect(sheetsClient.spreadsheets.values.update).toHaveBeenCalled();
  });
});

// ── setServiceAccount ────────────────────────────────────────────────────────
describe("setServiceAccount", () => {
  it("stores the JSON content under the google_service_account secret key", async () => {
    secretsMock.setSecret.mockResolvedValue(undefined);
    await setServiceAccount(VALID_SA_JSON);
    expect(secretsMock.setSecret).toHaveBeenCalledWith("google_service_account", VALID_SA_JSON);
  });
});
