/**
 * The Google Apps Script a seller pastes into the sheet that receives their
 * orders (Extensions → Apps Script). Deployed as a web app that runs as the
 * seller, it lets this SahelFlow installation — and only a caller holding the
 * key embedded below — read order rows and write SahelFlow's status back.
 *
 * Why a script instead of Google sign-in: it needs no Google Cloud project, no
 * app verification and no SahelFlow-held Google credential. The seller's data
 * never passes through a SahelFlow server; this desktop app calls the seller's
 * own web app directly.
 *
 * Contract (bridge v1), one JSON POST per call, `key` required:
 *   ping   → spreadsheet identity, tabs, headers, row count
 *   rows   → { fromRow, limit, sheet? } rows with a stable "SahelFlow ID"
 *            (assigned once per row, so sorting or deleting rows never breaks
 *            de-duplication or write-back)
 *   status → { updates: [{ id, status, order, tracking }] } written into the
 *            SahelFlow columns of the matching rows only
 * The script only ever writes the four SahelFlow columns it owns.
 */

export const BRIDGE_SCRIPT_VERSION = 1;

export const BRIDGE_COLUMNS = {
  id: "SahelFlow ID",
  status: "SahelFlow Status",
  order: "SahelFlow Order",
  tracking: "SahelFlow Tracking",
} as const;

const TEMPLATE = String.raw`/**
 * SahelFlow ⇄ Google Sheets — bridge v__VERSION__
 *
 * 1. Paste this whole file into Extensions → Apps Script (replace everything), then Save.
 * 2. Deploy → New deployment → type "Web app".
 *    Execute as: Me.  Who has access: Anyone.  → Deploy → Authorize.
 * 3. Copy the Web app URL into SahelFlow.
 *
 * Keep this script private: its key lets your SahelFlow read this sheet.
 * SahelFlow only adds and fills the four "SahelFlow …" columns.
 */
var SAHELFLOW_KEY = "__KEY__";
var SAHELFLOW_VERSION = __VERSION__;
var SAHELFLOW_COLUMNS = ["__COL_ID__", "__COL_STATUS__", "__COL_ORDER__", "__COL_TRACKING__"];

function doGet() {
  return sahelflowJson_({ ok: true, service: "sahelflow-bridge", version: SAHELFLOW_VERSION });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return sahelflowJson_({ ok: false, error: "BAD_REQUEST" });
  }
  if (!body || !sahelflowSameKey_(String(body.key || ""), SAHELFLOW_KEY)) {
    return sahelflowJson_({ ok: false, error: "UNAUTHORIZED" });
  }
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(20000)) return sahelflowJson_({ ok: false, error: "BUSY" });
  try {
    var sheet = sahelflowSheet_(body.sheet);
    if (body.action === "ping") return sahelflowJson_(sahelflowPing_(sheet));
    if (body.action === "rows") return sahelflowJson_(sahelflowRows_(sheet, body));
    if (body.action === "status") return sahelflowJson_(sahelflowStatus_(sheet, body));
    return sahelflowJson_({ ok: false, error: "UNKNOWN_ACTION" });
  } catch (err) {
    var message = String((err && err.message) || err).slice(0, 300);
    if (message === "SHEET_NOT_FOUND") return sahelflowJson_({ ok: false, error: "SHEET_NOT_FOUND" });
    return sahelflowJson_({ ok: false, error: "SCRIPT_ERROR", message: message });
  } finally {
    lock.releaseLock();
  }
}

function sahelflowJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function sahelflowSameKey_(given, expected) {
  if (given.length !== expected.length) return false;
  var diff = 0;
  for (var i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function sahelflowSheet_(name) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = name ? spreadsheet.getSheetByName(String(name)) : spreadsheet.getSheets()[0];
  if (!sheet) throw new Error("SHEET_NOT_FOUND");
  return sheet;
}

function sahelflowHeaders_(sheet) {
  var width = sheet.getLastColumn();
  if (width < 1) return [];
  return sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(function (value) {
    return String(value).trim();
  });
}

/** Adds any missing SahelFlow column at the end of the header row; returns 1-based column numbers. */
function sahelflowColumns_(sheet) {
  var headers = sahelflowHeaders_(sheet);
  var columns = {};
  for (var i = 0; i < SAHELFLOW_COLUMNS.length; i++) {
    var title = SAHELFLOW_COLUMNS[i];
    var index = headers.indexOf(title);
    if (index < 0) {
      headers.push(title);
      index = headers.length - 1;
      sheet.getRange(1, index + 1).setValue(title).setFontWeight("bold");
    }
    columns[title] = index + 1;
  }
  return { headers: headers, columns: columns };
}

function sahelflowPing_(sheet) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return {
    ok: true,
    version: SAHELFLOW_VERSION,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetName: spreadsheet.getName(),
    sheet: sheet.getName(),
    sheets: spreadsheet.getSheets().map(function (s) { return s.getName(); }),
    headers: sahelflowHeaders_(sheet).filter(function (h) { return SAHELFLOW_COLUMNS.indexOf(h) < 0; }),
    rowCount: Math.max(0, sheet.getLastRow() - 1),
    timeZone: spreadsheet.getSpreadsheetTimeZone()
  };
}

function sahelflowRows_(sheet, body) {
  var fromRow = Math.max(2, Math.floor(Number(body.fromRow) || 2));
  var limit = Math.min(500, Math.max(1, Math.floor(Number(body.limit) || 200)));
  var layout = sahelflowColumns_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < fromRow) return { ok: true, rows: [], nextRow: fromRow, lastRow: lastRow };
  var count = Math.min(limit, lastRow - fromRow + 1);
  var width = layout.headers.length;
  var values = sheet.getRange(fromRow, 1, count, width).getDisplayValues();
  var idColumn = layout.columns[SAHELFLOW_COLUMNS[0]];
  var ids = sheet.getRange(fromRow, idColumn, count, 1).getValues();
  var changed = false;
  var rows = [];
  for (var r = 0; r < count; r++) {
    var cells = {};
    var filled = false;
    for (var c = 0; c < width; c++) {
      var header = layout.headers[c];
      if (SAHELFLOW_COLUMNS.indexOf(header) >= 0) continue;
      var key = header || "Column " + (c + 1);
      while (Object.prototype.hasOwnProperty.call(cells, key)) key = key + " ·";
      var value = String(values[r][c]).trim();
      cells[key] = value;
      if (value) filled = true;
    }
    if (!filled) continue;
    var id = String(ids[r][0] || "").trim();
    if (!id) {
      id = Utilities.getUuid();
      ids[r][0] = id;
      changed = true;
    }
    rows.push({
      row: fromRow + r,
      id: id,
      status: String(values[r][layout.columns[SAHELFLOW_COLUMNS[1]] - 1] || ""),
      cells: cells
    });
  }
  if (changed) sheet.getRange(fromRow, idColumn, count, 1).setValues(ids);
  return { ok: true, rows: rows, nextRow: fromRow + count, lastRow: lastRow };
}

function sahelflowStatus_(sheet, body) {
  var updates = Array.isArray(body.updates) ? body.updates.slice(0, 500) : [];
  var layout = sahelflowColumns_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2 || updates.length === 0) return { ok: true, updated: 0, missing: [] };
  var count = lastRow - 1;
  var idColumn = layout.columns[SAHELFLOW_COLUMNS[0]];
  var ids = sheet.getRange(2, idColumn, count, 1).getValues();
  var rowById = {};
  for (var i = 0; i < count; i++) {
    var id = String(ids[i][0] || "").trim();
    if (id) rowById[id] = i;
  }
  var targets = [SAHELFLOW_COLUMNS[1], SAHELFLOW_COLUMNS[2], SAHELFLOW_COLUMNS[3]];
  var fields = ["status", "order", "tracking"];
  var blocks = targets.map(function (title) {
    return sheet.getRange(2, layout.columns[title], count, 1).getValues();
  });
  var updated = 0;
  var missing = [];
  for (var u = 0; u < updates.length; u++) {
    var update = updates[u] || {};
    var index = rowById[String(update.id || "")];
    if (index === undefined) {
      missing.push(String(update.id || ""));
      continue;
    }
    for (var f = 0; f < fields.length; f++) {
      if (typeof update[fields[f]] === "string") blocks[f][index][0] = update[fields[f]].slice(0, 200);
    }
    updated++;
  }
  if (updated > 0) {
    targets.forEach(function (title, t) {
      sheet.getRange(2, layout.columns[title], count, 1).setValues(blocks[t]);
    });
  }
  return { ok: true, updated: updated, missing: missing };
}
`;

/** The script for one installation, with its private key embedded. */
export function renderBridgeScript(key: string): string {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(key)) {
    throw new Error("Bridge key must be a URL-safe random token");
  }
  return TEMPLATE.replaceAll("__VERSION__", String(BRIDGE_SCRIPT_VERSION))
    .replace("__KEY__", key)
    .replace("__COL_ID__", BRIDGE_COLUMNS.id)
    .replace("__COL_STATUS__", BRIDGE_COLUMNS.status)
    .replace("__COL_ORDER__", BRIDGE_COLUMNS.order)
    .replace("__COL_TRACKING__", BRIDGE_COLUMNS.tracking);
}
