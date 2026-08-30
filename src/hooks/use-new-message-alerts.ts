"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";

import { useI18n } from "@/hooks/use-i18n";
import {
  INBOX_UNREAD_SUMMARY_KEY,
  type InboxUnreadLatest,
  type InboxUnreadSummary,
} from "@/hooks/use-inbox-unread";
import { fetcher } from "@/lib/swr/fetcher";
import { toast } from "@/lib/toast";

/**
 * Global new-message alerts for the WhatsApp inbox (R4-a liveness).
 *
 * The seller lives in Orders/Deliveries/Analytics most of the day; without a
 * signal they keep WhatsApp Web open beside SahelFlow (audit d5 finding #1).
 * This hook watches the unread summary (shared SWR key with the sidebar badge
 * — one polling cadence) and on an unread-total INCREASE while the user is on
 * another surface:
 *   - shows at most one toast per cycle (customer + preview when policy
 *     allows) with an "Open inbox" action;
 *   - optionally plays a short built-in chime (no external assets).
 *
 * Alerts never fire while the document is hidden (native notifications own the
 * background case) and never fire on the inbox route itself — the live
 * workspace IS the signal there.
 *
 * Toggles persist in localStorage (sf_inbox_* keys, cookie-free): toast
 * defaults ON, sound defaults OFF. Preferences are read at alert time, not
 * reactively, so the inbox header toggle takes effect on the next message
 * without any cross-component state bridge.
 */

const TOAST_PREFERENCE_KEY = "sf_inbox_toast_alerts_v1";
const SOUND_PREFERENCE_KEY = "sf_inbox_sound_alerts_v1";

export const NEW_MESSAGE_TOAST_PREFERENCE_KEY = TOAST_PREFERENCE_KEY;
export const NEW_MESSAGE_SOUND_PREFERENCE_KEY = SOUND_PREFERENCE_KEY;

/** Toast alerts are ON until the seller opts out. */
export const NEW_MESSAGE_TOAST_DEFAULT = true;
/** Sound is opt-in — a quiet desktop stays quiet by default. */
export const NEW_MESSAGE_SOUND_DEFAULT = false;

function readPreference(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    if (value === "1") return true;
    if (value === "0") return false;
  } catch {
    // Private-mode/blocked storage: the in-memory default still applies.
  }
  return fallback;
}

function writePreference(key: string, enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, enabled ? "1" : "0");
  } catch {
    // Persistence is best-effort; the toggle still applies for this session.
  }
}

export function readNewMessageToastEnabled(): boolean {
  return readPreference(TOAST_PREFERENCE_KEY, NEW_MESSAGE_TOAST_DEFAULT);
}

export function readNewMessageSoundEnabled(): boolean {
  return readPreference(SOUND_PREFERENCE_KEY, NEW_MESSAGE_SOUND_DEFAULT);
}

export function writeNewMessageToastEnabled(enabled: boolean): void {
  writePreference(TOAST_PREFERENCE_KEY, enabled);
}

export function writeNewMessageSoundEnabled(enabled: boolean): void {
  writePreference(SOUND_PREFERENCE_KEY, enabled);
}

/**
 * Two-tone WhatsApp-style chime (~0.15s, 16 kHz 16-bit mono PCM WAV,
 * 4.8 KB — embedded, never fetched). Generated once per activation; a paused
 * {@link AudioContext} (autoplay policy) is resumed on the first user gesture
 * and the chime silently no-ops when playback is not possible.
 */
const CHIME_WAV_BASE64 =
  "UklGRuQSAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YcASAAAAAD4A4ACjAT4CfQJSAs0BCwEYAO3+d/27++/5hPgH+PL4cfs6/5gDoAd3CpwLDAssCZIGtwPPAML9X/qn9gHzQPBn70TxCvYb/SMFdwydEcET5xLKD3ILwAYbAm39aPj68qDtdOnd5wjqUfDz+SIFkw8qF6oa/xkVFlgQDQreA8X9g/f58KLqrOWm49jloewi914D0Q44Fz8b1Br1FioR1Aq9BPb+J/kV8xDtF+iY5d/mdezA9Q0BDgyLFBcZaRlIFhYRMAtvBQAAnPr79EzvYeqH5wPoguym9AX/gwn/EfcW8xeHFewQdQsHBugA5Puu9lfxiexs6T7pwOzP80D9MAeVD+MUeBa1FK8QpQuHBrMBBv0y+DPzje5E64fqKe008737FAVQDd0S+RTWE18QwQvzBmQCBf6M+eT0bvAL7dnrte3Q8nb6LwMwC+gQeRPqEv4PzAtMB/0C5P6/+mv2K/K/7i/tXu6b8mj5fgE3CQcP/BH0EY0PxwuTB4EDqP/Q+8v3xfNd8IXuHe+R8o74AABkBzsNghD3EA8PsQvKB/IDUgDA/Af5PfXl8dbv7u+s8uT3sv64BYcLEA/0D4UOjgvyB1IE6ACU/SL6lPZU8x/xzPDm8mX3kv0yBOsJpw3uDvANXQsMCKMEagFP/h77zPeq9F7ysvE78w73nfzSAmgISQzmDVINIAsZCOcE2wHz/v775/jo9ZHznPKl89r20PuXAf8G9wrfDKwM2AobCB0FPQKD/8T85vkO97X0h/Mi9MX2Kft/ALEFtAnaCwAMhgoSCEgFkQIAAHT9zPoc+Mr1cfSs9Mv2pPqK/34EgAjZClALKwr+B2kF2AJuABD+mfsT+c72VvVA9en2Pvq0/mUDXAfdCZ0KyAnhB4AFFQPNAJj+Ufz0+cL3Nfbc9Rr39fn9/WYCSgbpCOgJXgm7B40FSAMhARH/9PzB+qX4DPd79lz3xfli/YEBSQX8BzMJ7wiNB5IFcgNpAXr/hf15+3f52vcd96z3rfnj/LQAWgQZB34IewhYB5AFkwOnAdf/Bv4g/Dn6nvi+9wb4qPl8/AAAfQNABswHAwgdB4YFrQPdAScAd/61/Ov6Vvle+Gn4tfkr/GP/swJyBR0HiQfbBnUFwAMKAm0A2/47/Y37BPr5+NL40Pnw+9r++wGvBHMGDQeVBl4FzQMxAqsANP+y/SH8pvqQ+T75+PnH+2f+VQH4A80FkAZKBkEF0wNQAuAAgf8b/qb8PPsh+q35Kvqu+wb+wABOAy4FFAb8BR8F1ANqAg4Bxf95/h/9x/ur+hz6Zfqk+7f9PACwApUEmQWrBfgE0AN/AjYBAADM/ov9Rvwt+4r6pvqn+3j9yP8fAgQEHwVYBc0ExgOOAlgBMwAW/+z9u/yo+/f67Pq1+0j9Y/+aAXoDqQQDBZ8EuQOZAnUBYQBW/0P+Jf0c/GD7NvvM+yb9Df8iAfgCNQSuBG0EpwOfAo0BiACP/5D+hv2H/Mb7gfvr+w/9xP61AH8CxQNYBDgEkQOiAqABqgDB/9T+3f3q/Cf8zvsR/AP9iP5VAA4CWgMDBAEEeAOgArAByADt/xH/LP5G/YP8Gvw8/AH9V/4AAKYB8wKvA8kDXAOcArwB4QASAEf/cv6a/dv8Zfxq/Af9Mf62/0YBkgJcA48DPQOUAsUB9gAzAHb/sf7m/Sz9r/yc/BT9Ff52/+8ANgILA1QDHAOJAssBCQFQAKD/6f4s/nn99vzP/Cf9Af4//6EA4AG9AhkD+AJ7As4BGAFqAMT/G/9r/sD9Ov0D/T/99v0R/1oAjwFyAt8C0wJrAs8BJAF/AOT/SP+k/gH+e/04/Vr98f3s/hwARQEqAqUCrQJZAs0BLQGSAAAAb//X/j7+uf1s/Xn98v3O/ub/AAHlAWsChgJEAsgBNQGiABgAkv8F/3X+8/2f/Zr9+f23/rb/wQCkATMCXgIuAsIBOgGwAC0AsP8u/6f+Kv7R/b39BP6n/o3/iQBnAfwBNQIXArkBPQG7AEAAy/9S/9X+XP4B/uH9E/6d/mv/VQAtAcgBDQL+Aa8BPgHEAFAA4/9z//7+i/4v/gX+Jf6X/k7/KAD4AJUB5QHkAaMBPQHMAF4A9/+P/yP/tv5b/in+Of6W/jj/AADHAGUBvQHJAZYBOwHSAGoACACp/0T/3v6E/kz+T/6Z/ib/3f+aADcBlgGuAYcBNwHWAHQAGAC//2L/Av+q/m/+Zv6f/hj/v/9xAAsBcAGSAXgBMgHZAH0AJgDT/33/I//P/pH+fv6o/g//pf9MAOIASwF3AWcBLAHaAIQAMgDk/5T/Qf/w/rH+l/6z/gr/j/8qALwAJwFbAVUBJAHaAIoAPADz/6n/XP8P/9D+sP7A/gf/fv8NAJkABQE/AUMBGwHZAI4ARQAAALz/dP8s/+3+yf7P/gj/cP/0/3kA5QAkATEBEgHXAJIATAALAMz/iv9G/wj/4f7e/gv/Zf/d/1sAxgAKAR4BBwHUAJQAUwAVANv/nf9d/yL/+P7v/hD/Xf/K/0AAqQDwAAsB/ADQAJUAWAAeAOf/rv9z/zr/D/8A/xf/WP+6/ygAjgDXAPgA8QDLAJYAXQAmAPL/vv+G/1D/Jf8R/yD/Vv+s/xMAdQC/AOUA5ADGAJYAYAAsAPz/y/+Y/2X/Of8i/yn/Vf+i/wAAXgCoANIA2AC/AJUAYwAyAAQA1/+o/3f/Tf8y/zT/V/+Z//D/SACSAMAAywC5AJMAZQA3AAsA4v+2/4j/X/9D/z//Wf+T/+L/NQB+AK4AvgCxAJAAZgA7ABIA6//C/5j/cP9T/0r/Xv+O/9X/IwBrAJwAsQCpAI0AZwA+ABcA8//N/6b/gP9i/1b/Y/+M/8v/FABZAIsApAChAIoAZwBBABwA+v/X/7P/jv9x/2L/af+L/8P/BgBIAHsAlwCYAIYAZgBDACAAAADg/77/nP9+/23/cP+L/7z/+/85AGwAigCQAIEAZQBEACQABQDo/wAATAD6AJYBwAFrAbwAzv+O/vD8Q/tP+vf6mf2ZAY0F/wc7CJkGBwQ8AUv+6/pD92z0FvRy9xv+8QUeDKAOSQ12CdgEPgBr+wv23vD67bHv0PaPATMM+BIdFH8QgworBPX9T/cw8Ezqq+i27SP5agduEzgZ+hfeEQEKPQKD+hzyuOmc5PzlSO9M/tINZxg2GyEXaA8dB1v/lPdp70/ob+Wi6Qr1PwTVEUIZLBmKE7AL8AOd/AD1TO2l5z3nC+7f+nMJlhTsGHwW7g9MCBgBD/qh8qzr0uf26fjydQCzDRgWnBdqE3cMQwWG/qv3iPCm6t/oeO0k+IkF3RB0FpAVMxBDCY4CJ/xw9c3uU+rI6pXxR/3fCegS0RUGEwYNXQYfAPD5afOK7cLqeO0S9hsCTg3dE2QUOhAFCsYD6P3c96fx2Oz5683wr/pmBsIP2BNjEl0NRAd2Adr78PVB8Mvs7u2a9C3/+Qk4EQETBxCWCssEYf/u+Tf0Tu9v7YvwqPhRA7gMvhGHEYAN/geWAnf9IfjC8uTuwu6t87786waTDnERnA/4CqIFmwCv+3v2p/EQ77jwKPekANYJkA95EHENjQiGA9H+A/oH9fnw2+8588v6KwT+C8AP/w4uC1IGpAEp/XX41vPJ8D7xJPZj/ikHXA1ADzIN9QhOBPP/nfsN9/vyJPEs8075wAGECfgNNQ44C9wGgQJn/iv61vWI8gryjPWL/LoELQvnDcYMNgnyBOUA+PzU+OD0ifJ08zz4rv8xByUMRQ0aC0UHOgNy/6H7ovc+9AfzU/UX+48CEAl1DDMMUwl2BbEBHP5f+qH2+/P/84z39P0NBVAKNAzVCo0H0gNQAN78Ofng9ST0aPUC+qwADgf1Cn0LTQndBVsCEf+z+zj4bfW79DL3kPwfA4UICwttCrYHTwQLAer9nvpm91P1vvVD+RT/LwVvCagKJgkoBugC3//V/KP50vab9SD3fvtrAcwG0gnmCcIHsgSoAcv+0vvM+Ij2RfbR+MT9ewPsB7wJ4AhZBl0DiQDK/eT6JfiQ9kv3uPr1/y0FkAhDCbAH/gQrAof/2vwP+rj38Pah+Lr89QF0Br8IfQhwBrsDGQGZ/vr7XvmQ96X3Nvq8/q4DTAeJCIQHMwWXAiQAu/0u+9v4s/ep+PL7oAAOBbYHAghvBgUEkgFG/+r8e/qP+CT48Pm+/VMCDQa+B0AHUgXwAqkAeP4p/Oz5g/jf+Gb7gP/AA6kGcgdXBjsE9gHY/7f9e/uI+bz43fn5/CEB2gTnBuUGXAU3AxcBF/8C/eb6Wfk4+RH7kf6OAp0F0QYpBl8ESQJQAGT+XPx0+mT59vlp/BgAuQMIBnYGUwVtA3QBnf+9/cn7K/qs+er60/18AZgEIwboBXIEjAK2APb+IP1P+xP6MPoJ/Dr/rQIoBfgFNwWTA8EBCwBb/pL89vox+uv6Q/2MAJ4DbQWVBXMEwQILAXH/yv0X/MT6hfrU+4b+ugFLBG0FCgWrAwACaQDh/kP9tPvA+g373fzA/7UCswQzBWUE6AJSAdj/Wv7K/HH77PrD+/j94gB2A9kEzQS0AzICuABS/9z9ZPxT+0f7nfwX/98B+QPFBEcEAwONAS0A1f5o/Rb8X/vQ+5D9JwCsAkAEggSvA1kC+QCw/2D+Av3l+5X7fvyP/h4BRANOBBsEEQO9AXUAPP/z/a/82Pv1+0r9iv/xAaUDLASeA3YCMAH//9D+kP1y/PD7fPwn/nUAlgLRA+QDFAPjAbEAk/9q/jv9Uvwu/CH9Cv9GAQwDzQOAA4cCXAFBAC7/DP73/FL8kPzd/eb/9AFQA6EDCwP/AeQA3P/Q/rj9yvxz/BL9pf6vAHgCZwNXA48CgAF4AH7/eP5y/bf8t/yu/W3/XgHQAlYD+AITAg0BGAAn/yj+Pf3C/Bn9Wf4rAOsB/gIlA40CnAGmAMH/1f7h/R396/yV/Qz/1wBSAgUD2wIeAi8BSwBw/4n+qP0V/TH9Jv68/2gBkwLqAoICsQHNAPn/JP9F/n/9KP2R/cL+YADZAa8CtgIgAkoBdQCt/93+Cv5q/Vb9B/5h//AAKQKpAm4CvgHtACcAZ/+c/tv9bP2d/Yz++v9oAVYCiQIbAl8BmQDh/yX/Yv69/YX9+v0Y/4YAwgFkAlMCxAEGAU4AoP/o/jH+sv22/Wn+pf//AP0BVQIPAm0BtgALAGP/sP4N/rv9/f3i/ikAYAEbAjECxAEbAW8Az/8q/3/++P3Z/Vb+YP+gAKYBHgL8AXUBzwAvAJb/9f5Y/vT9DP68/tv/BAHRAQkCvQEpAYoA9v9i/8X+PP4D/lH+Kv9MAFIB4gHjAXgB4gBNAML/MP+c/i/+Jf6l/pr/sACIAd0BsAEzAaEAFwCR/wP/ff4y/lj+A/8EAAMBpQHEAXUB8QBmAOb/Y//a/mn+Rf6b/mb/ZgBAAa0BngE4AbMAMgC5/zj/uf5i/mn+6f7I/7kAaAGiAW4B+wB7AAQAjv8R/6D+av6c/j//JAD8AHsBhwE4AcEASgDa/2b/7/6S/oD+2/6X/3cAKwF7AWEBAQGNAB0As/9B/9T+kf6l/iP/7f+8AEgBbAE0AcwAXQD2/47/IP/C/p3+1/5x/zwA8QBTAVABBAGaADMA0f9r/wT/uf61/hL/v/+BABUBTgEsAdMAbQANAK//TP/v/rz+2v5U/wkAugApATwBAgGlAEUA6/+P/zD/4f7L/gr/mv9NAOMALQEgAdcAegAgAMv/cf8Z/93+5f5B/9//hgD+ACQB/QCtAFMAAACu/1b/CP/k/gn/fv8eALQACgEQAdgAhAAxAOP/kv8////+9P42/7z/WADUAAoB9QCxAGAAEgDI/3j/LP///g//av/4/4cA5wD+ANUAjAA/APf/rv9h/yD/CP8z/6D/LgCsAO4A6gCzAGkAIQDd/5b/Tv8b/xr/Xf/X/14AxADpANAAkQBKAAcAxv+A/z//Hf81/4z/CgCFANEA3ACzAHEALgDw/6//bP82/yj/V/+9/zkAogDTAMgAlABTABUA2f+a/13/NP87/37/7f9hALMAzACwAHcAOAD//8X/iP9R/zn/Vv+o/xkAgAC7AL4AlQBaACAA6v+x/3f/S/9G/3b/1P9BAJYAugCqAHoAQQALANf/n/9r/0z/Wf+a//7/YQCjALEAlABgACoA+P/F/4//Yv9T/3L/wP8jAHoApwCjAHwASAAVAOb/tP+C/1//YP+Q/+f/RQCLAKMAkABkADIAAwDW/6X/eP9h/3P/sf8KAF8AkwCZAHsATQAeAPP/xv+X/3L/av+L/9T/KwBzAJQAiwBmADkADQDk/7j/jf9x/3f/p//2/0YAfwCOAHoAUQAmAP7/1f+r/4X/df+K/8X/FABcAIMAhABnAD4AFQDw/8j/n/+B/37/of8=";

let chimeBufferPromise: Promise<AudioBuffer> | null = null;

/** Preview/test entry point (also used by the inbox header sound toggle). */
export async function playNewMessageChime(): Promise<void> {
  return playChime();
}

async function playChime(): Promise<void> {
  if (typeof window === "undefined") return;
  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextCtor) return;

  const context = new AudioContextCtor();
  try {
    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch {
        // Autoplay policy — no user gesture yet. Skip silently.
        void context.close();
        return;
      }
    }
    if (!chimeBufferPromise) {
      const binary = atob(CHIME_WAV_BASE64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      chimeBufferPromise = context.decodeAudioData(bytes.buffer);
    }
    const buffer = await chimeBufferPromise;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start();
    source.onended = () => {
      void context.close();
    };
  } catch {
    chimeBufferPromise = null;
    try {
      void context.close();
    } catch {
      // Already closed.
    }
  }
}

/**
 * Module-level single-flight guard. The sidebar mounts in more than one shell
 * instance (the desktop rail stays mounted while the mobile sheet renders a
 * second copy), and each instance tracks the same shared SWR snapshot. This
 * timestamp lets exactly one instance deliver the alert per delta.
 */
const ALERT_SINGLE_FLIGHT_MS = 750;
let lastAlertDeliveredAt = 0;

/**
 * Pure delta decision — one alert per unread-total increase, never on the
 * seeding snapshot, never on the inbox route (the live workspace IS the
 * signal there) and never while the document is hidden (native OS
 * notifications own the background case).
 */
export function shouldFireNewMessageAlert(
  previousTotal: number | null,
  total: number,
  context: { pathname: string | null; documentHidden: boolean },
): boolean {
  if (previousTotal === null) return false;
  if (total <= previousTotal) return false;
  // usePathname is query-free, but tolerate a query-bearing value anyway.
  const pathname = context.pathname?.split("?")[0] ?? null;
  if (pathname !== null && (pathname === "/inbox" || pathname.startsWith("/inbox/"))) {
    return false;
  }
  if (context.documentHidden) return false;
  return true;
}

/**
 * Toast body from the summary's latest unread conversation: customer name +
 * preview when the contact policy allowed projecting them, bare name when the
 * preview is unavailable, undefined for a generic title-only toast.
 */
export function buildNewMessageAlertBody(
  latest: InboxUnreadLatest | null,
  translate: (
    key: "inbox.liveness.newMessageBody",
    params: { name: string; preview: string },
  ) => string,
): string | undefined {
  if (!latest?.name) return undefined;
  if (!latest.preview) return latest.name;
  return translate("inbox.liveness.newMessageBody", {
    name: latest.name,
    preview: latest.preview,
  });
}

export type NewMessageNotify = (
  title: string,
  body: string | undefined,
  actionLabel: string,
  onAction: () => void,
) => void;

export interface NewMessageAlertOptions {
  /** Test seam: notification dispatcher (defaults to the shared toast). */
  notify?: NewMessageNotify;
  /** Test seam: chime player. */
  playSound?: () => void;
}

/** Module-level default so the effect deps stay referentially stable. */
const defaultNotify: NewMessageNotify = (title, body, actionLabel, onAction) => {
  toast.info(title, {
    description: body,
    action: { label: actionLabel, onClick: onAction },
  });
};

export function useNewMessageAlerts(
  options: NewMessageAlertOptions = {},
): void {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const notify = options.notify ?? defaultNotify;
  const playSound = options.playSound ?? playChime;

  // Shares the exact SWR key (and therefore the single 15s cadence + cache
  // entry) with the sidebar badge hook — no second network loop.
  const { data } = useSWR<InboxUnreadSummary>(
    INBOX_UNREAD_SUMMARY_KEY,
    fetcher,
    {
      refreshInterval: 15_000,
      revalidateOnFocus: true,
      refreshWhenHidden: false,
      keepPreviousData: true,
    },
  );

  // Seed on the first snapshot so pre-existing unread backlog never announces
  // itself as "new" when the shell mounts (NotificationAnnouncer pattern).
  const previousTotalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!data) return;
    const previous = previousTotalRef.current;
    previousTotalRef.current = data.total;
    if (
      !shouldFireNewMessageAlert(previous, data.total, {
        pathname: pathname ?? null,
        documentHidden:
          typeof document === "undefined" ? false : document.hidden,
      })
    ) {
      return;
    }
    const now = Date.now();
    if (now - lastAlertDeliveredAt < ALERT_SINGLE_FLIGHT_MS) return;
    lastAlertDeliveredAt = now;

    if (readNewMessageToastEnabled()) {
      notify(
        t("inbox.liveness.newMessageTitle"),
        buildNewMessageAlertBody(data.latest, t),
        t("inbox.liveness.openInbox"),
        () => {
          router.push("/inbox");
        },
      );
    }
    if (readNewMessageSoundEnabled()) {
      playSound();
    }
  }, [data, pathname, notify, playSound, router, t]);
}
