// W3b F6a: which install help this phone needs. Pure: the screen and the tests give it the facts, it reads nothing itself.
export type InstallState = "android" | "ios" | "inapp" | "installed" | "unsupported";
export type InstallEnv = Readonly<{ ua: string; platform: string; maxTouchPoints: number; standalone: boolean; canPrompt: boolean }>;
// WhatsApp, Facebook (FBAN/FBAV/FB_IAB), Instagram, Line, TikTok: windows that cannot install an app. `Line/` is exact so "Linux" never matches.
const INAPP = /WhatsApp|FBAN|FBAV|FB_IAB|Instagram|\bLine\/|TikTok|musical_ly|BytedanceWebview/i;
export function installState(e: InstallEnv): InstallState {
  if (e.standalone) return "installed";
  if (INAPP.test(e.ua)) return "inapp";
  // iPadOS 13+ reports a Mac: only touch points tell it from a real Mac.
  if (/iPhone|iPad|iPod/.test(e.ua) || (/Macintosh|MacIntel/.test(`${e.ua} ${e.platform}`) && e.maxTouchPoints > 1)) return "ios";
  return e.canPrompt ? "android" : "unsupported";
}
