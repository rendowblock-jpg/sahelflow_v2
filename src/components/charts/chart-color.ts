/**
 * The ECharts colour boundary.
 *
 * SahelFlow authors its design tokens in OKLCH, but the CSS pipeline may hand
 * the browser a different serialization: the production build lowers every
 * `oklch()` token into a hex fallback plus a `lab()` value, and Chromium then
 * reports `lab(...)` from getComputedStyle. The SVG renderer paints those
 * strings as-is, so charts look right at rest. ZRender's own colour parser,
 * however, only understands hex/rgb/hsl/named colours. The moment a chart
 * derives a colour (hover emphasis, blur, animation interpolation) it parses
 * the base colour, fails, and writes `fill="none"`/no stroke: the series
 * vanishes under the pointer.
 *
 * Every colour that crosses into ECharts is therefore converted here to plain
 * sRGB. The CSS Color 4 spaces (lab, lch, oklab, oklch) are converted exactly;
 * anything else modern (color(), color-mix(), relative colours) is resolved by
 * the browser itself through a one-pixel canvas; colours ZRender already
 * understands pass through untouched.
 */

type Rgba = readonly [red: number, green: number, blue: number, alpha: number];

const MODERN_FUNCTION = /^(oklch|oklab|lch|lab)\((.*)\)$/i;
const BROWSER_RESOLVED = /^(color|color-mix|light-dark)\(|\bfrom\b/i;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Parse one CSS Color 4 channel. `percentScale` is what 100% means for the
 * channel in its space (e.g. 0.4 for OKLCH chroma, 125 for Lab a/b).
 */
function parseChannel(token: string, percentScale: number): number | null {
  if (token.toLowerCase() === "none") return 0;
  const numeric = Number.parseFloat(token);
  if (!Number.isFinite(numeric)) return null;
  return token.endsWith("%") ? (numeric / 100) * percentScale : numeric;
}

function parseHue(token: string): number | null {
  if (token.toLowerCase() === "none") return 0;
  const numeric = Number.parseFloat(token);
  if (!Number.isFinite(numeric)) return null;
  if (token.endsWith("turn")) return numeric * 360;
  if (token.endsWith("grad")) return numeric * 0.9;
  if (token.endsWith("rad")) return (numeric * 180) / Math.PI;
  return numeric;
}

function parseAlpha(token: string | undefined): number | null {
  if (!token) return 1;
  if (token.toLowerCase() === "none") return 0;
  const numeric = Number.parseFloat(token);
  if (!Number.isFinite(numeric)) return null;
  return clamp(token.endsWith("%") ? numeric / 100 : numeric);
}

function encodeSrgb(linear: number) {
  const sign = linear < 0 ? -1 : 1;
  const magnitude = Math.abs(linear);
  const encoded =
    magnitude <= 0.0031308
      ? 12.92 * magnitude
      : 1.055 * Math.pow(magnitude, 1 / 2.4) - 0.055;
  return clamp(sign * encoded);
}

function fromLinearSrgb(
  linearR: number,
  linearG: number,
  linearB: number,
  alpha: number,
): Rgba {
  return [
    Math.round(encodeSrgb(linearR) * 255),
    Math.round(encodeSrgb(linearG) * 255),
    Math.round(encodeSrgb(linearB) * 255),
    alpha,
  ];
}

function oklabToRgba(l: number, a: number, b: number, alpha: number): Rgba {
  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b;

  const lCube = lPrime * lPrime * lPrime;
  const mCube = mPrime * mPrime * mPrime;
  const sCube = sPrime * sPrime * sPrime;

  return fromLinearSrgb(
    4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube,
    -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube,
    -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube,
    alpha,
  );
}

// CIE Lab is relative to D50 (CSS Color 4 §9).
const D50 = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585] as const;
const LAB_KAPPA = 24389 / 27;
const LAB_EPSILON = 216 / 24389;

function labToRgba(lightness: number, a: number, b: number, alpha: number): Rgba {
  const fy = (lightness + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;

  const xr = fx ** 3 > LAB_EPSILON ? fx ** 3 : (116 * fx - 16) / LAB_KAPPA;
  const yr =
    lightness > LAB_KAPPA * LAB_EPSILON ? fy ** 3 : lightness / LAB_KAPPA;
  const zr = fz ** 3 > LAB_EPSILON ? fz ** 3 : (116 * fz - 16) / LAB_KAPPA;

  const x50 = xr * D50[0];
  const y50 = yr * D50[1];
  const z50 = zr * D50[2];

  // Bradford chromatic adaptation D50 → D65.
  const x =
    0.955473421488075 * x50 -
    0.02309845494876471 * y50 +
    0.06325924320057072 * z50;
  const y =
    -0.0283697093338637 * x50 +
    1.0099953980813041 * y50 +
    0.021041441191917323 * z50;
  const z =
    0.012314014864481998 * x50 -
    0.020507649298898964 * y50 +
    1.330365926242124 * z50;

  return fromLinearSrgb(
    3.2409699419045226 * x - 1.537383177570094 * y - 0.4986107602930034 * z,
    -0.9692436362808796 * x + 1.8759675015077202 * y + 0.04155505740717559 * z,
    0.05563007969699366 * x - 0.20397695888897652 * y + 1.0569715142428786 * z,
    alpha,
  );
}

function polar(chroma: number, hue: number) {
  const radians = (hue * Math.PI) / 180;
  return [chroma * Math.cos(radians), chroma * Math.sin(radians)] as const;
}

function parseModernColor(input: string): Rgba | null {
  const match = input.match(MODERN_FUNCTION);
  if (!match) return null;
  const space = match[1]!.toLowerCase();
  const body = match[2]?.trim();
  if (!body) return null;

  const [coordinates, alphaToken] = body.split(/\s*\/\s*/, 2);
  const channels = coordinates?.trim().split(/[\s,]+/) ?? [];
  if (channels.length !== 3) return null;
  const alpha = parseAlpha(alphaToken?.trim());
  if (alpha === null) return null;
  const [first = "", second = "", third = ""] = channels;

  if (space === "oklch" || space === "oklab") {
    const lightness = parseChannel(first, 1);
    if (lightness === null) return null;
    if (space === "oklab") {
      const a = parseChannel(second, 0.4);
      const b = parseChannel(third, 0.4);
      return a === null || b === null ? null : oklabToRgba(lightness, a, b, alpha);
    }
    const chroma = parseChannel(second, 0.4);
    const hue = parseHue(third);
    if (chroma === null || hue === null) return null;
    const [a, b] = polar(chroma, hue);
    return oklabToRgba(lightness, a, b, alpha);
  }

  const lightness = parseChannel(first, 100);
  if (lightness === null) return null;
  if (space === "lab") {
    const a = parseChannel(second, 125);
    const b = parseChannel(third, 125);
    return a === null || b === null ? null : labToRgba(lightness, a, b, alpha);
  }
  const chroma = parseChannel(second, 150);
  const hue = parseHue(third);
  if (chroma === null || hue === null) return null;
  const [a, b] = polar(chroma, hue);
  return labToRgba(lightness, a, b, alpha);
}

let probe: CanvasRenderingContext2D | null | undefined;

/** Let the browser resolve colours with no closed-form conversion here. */
function resolveInBrowser(input: string): Rgba | null {
  if (typeof document === "undefined") return null;
  if (probe === undefined) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    probe = canvas.getContext("2d", { willReadFrequently: true });
  }
  if (!probe) return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#000";
  probe.fillStyle = input;
  probe.fillRect(0, 0, 1, 1);
  const [red = 0, green = 0, blue = 0, alpha = 255] = probe.getImageData(
    0,
    0,
    1,
    1,
  ).data;
  return [red, green, blue, alpha / 255];
}

function serialize([red, green, blue, alpha]: Rgba): string {
  if (alpha >= 0.9995) return `rgb(${red}, ${green}, ${blue})`;
  return `rgba(${red}, ${green}, ${blue}, ${Number(alpha.toFixed(3))})`;
}

/** Convert any CSS colour to a string ZRender can parse and interpolate. */
export function normalizeChartColor(value: string): string {
  const input = value.trim();
  const modern = parseModernColor(input);
  if (modern) return serialize(modern);
  if (BROWSER_RESOLVED.test(input)) {
    const resolved = resolveInBrowser(input);
    if (resolved) return serialize(resolved);
  }
  return input;
}
