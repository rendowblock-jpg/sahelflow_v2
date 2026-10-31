import type { Catalog } from "./types";

// W3b F6b: the settings / devices screen. The PIN only locks the screen: no text may say it encrypts.
export const settingsEn: Catalog = {
  "settings.lastSync": "Last update {{time}}",
  "settings.lastSync.none": "No update yet",
  "settings.pairedSince": "Paired since {{date}}",
  "settings.pinNote": "The PIN only locks the screen. It does not encrypt your data.",
  "settings.offline.note": "No connection. Lock, language and removing this phone still work.",
  "settings.error.load": "The settings could not be loaded.",
  "settings.error.wipe": "This phone could not be removed completely. Close the app and try again.",
  "settings.commands.title": "Open commands",
  "settings.commands.empty": "Nothing is waiting.",
  "settings.commands.state.queued": "Waiting to be sent",
  "settings.commands.state.sent": "Sent, waiting for your PC",
  "settings.commands.state.unknown": "Not sure it ran. Check again.",
  "settings.commands.retry": "Retry",
  "settings.commands.discard": "Discard",
  "settings.commands.kind.confirm": "Confirm order",
  "settings.commands.kind.reject": "Reject order",
  "settings.commands.kind.reply": "Reply",
  "settings.commands.kind.note": "Note",
};
