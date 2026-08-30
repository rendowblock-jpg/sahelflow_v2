import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildNewMessageAlertBody,
  NEW_MESSAGE_SOUND_DEFAULT,
  NEW_MESSAGE_TOAST_DEFAULT,
  NEW_MESSAGE_TOAST_PREFERENCE_KEY,
  NEW_MESSAGE_SOUND_PREFERENCE_KEY,
  readNewMessageSoundEnabled,
  readNewMessageToastEnabled,
  shouldFireNewMessageAlert,
  writeNewMessageSoundEnabled,
  writeNewMessageToastEnabled,
} from "@/hooks/use-new-message-alerts";

function stubLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("new-message alert delta decision", () => {
  it("never fires on the seeding snapshot", () => {
    expect(
      shouldFireNewMessageAlert(null, 7, {
        pathname: "/orders",
        documentHidden: false,
      }),
    ).toBe(false);
  });

  it("fires exactly once per unread-total increase", () => {
    const context = { pathname: "/orders", documentHidden: false };
    expect(shouldFireNewMessageAlert(3, 5, context)).toBe(true);
    // A follow-up poll with the same or lower total never re-fires.
    expect(shouldFireNewMessageAlert(5, 5, context)).toBe(false);
    expect(shouldFireNewMessageAlert(5, 4, context)).toBe(false);
    expect(shouldFireNewMessageAlert(4, 9, context)).toBe(true);
  });

  it("stays quiet on the inbox route — the live workspace is the signal", () => {
    expect(
      shouldFireNewMessageAlert(2, 3, {
        pathname: "/inbox",
        documentHidden: false,
      }),
    ).toBe(false);
    expect(
      shouldFireNewMessageAlert(2, 3, {
        pathname: "/inbox?conversation=abc",
        documentHidden: false,
      }),
    ).toBe(false);
  });

  it("never fires while the document is hidden (native OS notifications own that)", () => {
    expect(
      shouldFireNewMessageAlert(2, 3, {
        pathname: "/orders",
        documentHidden: true,
      }),
    ).toBe(false);
  });
});

describe("new-message alert toast body", () => {
  const translate = (
    _key: "inbox.liveness.newMessageBody",
    params: { name: string; preview: string },
  ) => `${params.name}: ${params.preview}`;

  it("combines customer name and preview when both are projectable", () => {
    expect(
      buildNewMessageAlertBody(
        { conversationId: "c1", name: "Amine", preview: "Salam, l prix?", unread: 1 },
        translate,
      ),
    ).toBe("Amine: Salam, l prix?");
  });

  it("falls back to the bare name when no preview exists", () => {
    expect(
      buildNewMessageAlertBody(
        { conversationId: "c1", name: "Amine", preview: null, unread: 1 },
        translate,
      ),
    ).toBe("Amine");
  });

  it("returns undefined for a generic title-only toast when contact is restricted", () => {
    expect(
      buildNewMessageAlertBody(
        { conversationId: "c1", name: null, preview: null, unread: 1 },
        translate,
      ),
    ).toBeUndefined();
    expect(buildNewMessageAlertBody(null, translate)).toBeUndefined();
  });
});

describe("new-message alert preferences", () => {
  it("defaults to toast ON and sound OFF with no stored value", () => {
    stubLocalStorage();
    expect(readNewMessageToastEnabled()).toBe(NEW_MESSAGE_TOAST_DEFAULT);
    expect(readNewMessageToastEnabled()).toBe(true);
    expect(readNewMessageSoundEnabled()).toBe(NEW_MESSAGE_SOUND_DEFAULT);
    expect(readNewMessageSoundEnabled()).toBe(false);
  });

  it("round-trips both toggles through localStorage", () => {
    const store = stubLocalStorage();
    writeNewMessageToastEnabled(false);
    writeNewMessageSoundEnabled(true);
    expect(store.get(NEW_MESSAGE_TOAST_PREFERENCE_KEY)).toBe("0");
    expect(store.get(NEW_MESSAGE_SOUND_PREFERENCE_KEY)).toBe("1");
    expect(readNewMessageToastEnabled()).toBe(false);
    expect(readNewMessageSoundEnabled()).toBe(true);
  });

  it("ignores corrupt stored values and falls back to the defaults", () => {
    stubLocalStorage({
      [NEW_MESSAGE_TOAST_PREFERENCE_KEY]: "maybe",
      [NEW_MESSAGE_SOUND_PREFERENCE_KEY]: "definitely",
    });
    expect(readNewMessageToastEnabled()).toBe(true);
    expect(readNewMessageSoundEnabled()).toBe(false);
  });

  it("survives blocked storage (private mode) without throwing", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("SecurityError");
        },
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    });
    expect(() => readNewMessageToastEnabled()).not.toThrow();
    expect(() => writeNewMessageToastEnabled(true)).not.toThrow();
    expect(readNewMessageToastEnabled()).toBe(true);
  });

  it("falls back to defaults during SSR (no window)", () => {
    expect(readNewMessageToastEnabled()).toBe(true);
    expect(readNewMessageSoundEnabled()).toBe(false);
  });
});
