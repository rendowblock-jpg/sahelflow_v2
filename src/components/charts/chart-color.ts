const OKLCH_PREFIX = /^oklch\(/i;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function parseLightness(value: string): number | null {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return null;
  return value.endsWith("%") ? numeric / 100 : numeric;
}

function parseChroma(value: string): number | null {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return null;
  // CSS Color 4 defines 100% chroma as 0.4 for Lab-family percentage syntax.
  return value.endsWith("%") ? (numeric / 100) * 0.4 : numeric;
}

function parseHue(value: string): number | null {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return null;
  if (value.endsWith("turn")) return numeric * 360;
  if (value.endsWith("rad")) return (numeric * 180) / Math.PI;
  if (value.endsWith("grad")) return numeric * 0.9;
  return numeric;
}

function parseAlpha(value: string | undefined): number | null {
  if (!value) return 1;
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return null;
  return clamp(value.endsWith("%") ? numeric / 100 : numeric);
}

function linearToSrgb(value: number) {
  const encoded =
    value <= 0.0031308
      ? 12.92 * value
      : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
  return clamp(encoded);
}

/**
 * Normalize SahelFlow's OKLCH design tokens at the chart-engine boundary.
 *
 * ECharts' SVG renderer can pass modern CSS colors through to the browser, but
 * ZRender's interpolation parser does not currently classify OKLCH strings as
 * interpolatable colors. Feeding the renderer sRGB keeps SahelFlow's OKLCH CSS
 * token authority intact while making chart animation/theme transitions
 * deterministic across WebView2 and Chromium.
 */
export function normalizeChartColor(value: string): string {
  const input = value.trim();
  if (!OKLCH_PREFIX.test(input)) return input;

  const match = input.match(/^oklch\((.*)\)$/i);
  if (!match) return input;

  const body = match[1]?.trim();
  if (!body) return input;

  const [coordinates, alphaToken] = body.split(/\s*\/\s*/, 2);
  const channels = coordinates?.trim().split(/\s+/) ?? [];
  if (channels.length !== 3) return input;

  const lightness = parseLightness(channels[0] ?? "");
  const chroma = parseChroma(channels[1] ?? "");
  const hue = parseHue(channels[2] ?? "");
  const alpha = parseAlpha(alphaToken?.trim());
  if (
    lightness === null ||
    chroma === null ||
    hue === null ||
    alpha === null
  ) {
    return input;
  }

  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);

  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;

  const l = lPrime * lPrime * lPrime;
  const m = mPrime * mPrime * mPrime;
  const s = sPrime * sPrime * sPrime;

  const linearR = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const linearG = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const linearB = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const red = Math.round(linearToSrgb(linearR) * 255);
  const green = Math.round(linearToSrgb(linearG) * 255);
  const blue = Math.round(linearToSrgb(linearB) * 255);

  if (alpha >= 0.9995) return `rgb(${red}, ${green}, ${blue})`;
  const normalizedAlpha = Number(alpha.toFixed(3));
  return `rgba(${red}, ${green}, ${blue}, ${normalizedAlpha})`;
}
