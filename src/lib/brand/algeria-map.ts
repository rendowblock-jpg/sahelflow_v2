/**
 * Stylised Algeria geometry for the live entry map. Same projection as
 * sahelflow.com (`marketing/src/algeria.mjs`): equirectangular with a
 * mid-latitude correction, not a survey map.
 */

const OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [-2.2, 35.1], [-1.2, 35.7], [-0.2, 35.85], [0.7, 36.3], [1.6, 36.55], [2.6, 36.6], [3.1, 36.8],
  [4.0, 36.9], [5.0, 36.75], [5.6, 36.85], [6.4, 37.05], [7.2, 37.05], [7.8, 36.95], [8.6, 36.95],
  [8.4, 36.4], [8.3, 35.6], [8.25, 34.6], [7.8, 33.8], [7.6, 33.2], [8.3, 32.5], [9.05, 31.6],
  [9.5, 30.2], [9.9, 29.4], [9.75, 28.2], [9.6, 27.2], [9.9, 26.5], [10.3, 25.5], [10.9, 24.7],
  [11.99, 23.52], [9.8, 22.4], [7.5, 20.85], [5.8, 19.45], [4.25, 19.15], [3.3, 19.4],
  [1.2, 20.7], [-1.0, 21.6], [-3.0, 23.3], [-4.83, 24.99], [-6.67, 26.13], [-8.67, 27.29],
  [-8.67, 28.7], [-7.0, 29.5], [-5.6, 29.9], [-4.4, 30.6], [-3.6, 31.2], [-2.9, 31.6],
  [-1.2, 32.1], [-1.5, 32.8], [-1.4, 34.0], [-1.8, 34.6],
];

export const ALGERIA_CITIES = {
  algiers: [3.06, 36.75],
  oran: [-0.63, 35.7],
  constantine: [6.61, 36.36],
  annaba: [7.77, 36.9],
  setif: [5.41, 36.19],
  bejaia: [5.08, 36.75],
  tlemcen: [-1.32, 34.88],
  biskra: [5.73, 34.85],
  ghardaia: [3.67, 32.49],
  ouargla: [5.33, 31.95],
  bechar: [-2.22, 31.62],
  tamanrasset: [5.52, 22.79],
  adrar: [-0.29, 27.87],
  eloued: [6.86, 33.37],
  illizi: [8.48, 26.48],
  tindouf: [-8.15, 27.67],
} as const;

export type AlgeriaCity = keyof typeof ALGERIA_CITIES;

const LON0 = -9.2;
const LON1 = 12.4;
const LAT0 = 18.6;
const LAT1 = 37.6;
const KX = Math.cos((28 * Math.PI) / 180);
const W = 1000;
const SCALE = W / ((LON1 - LON0) * KX);
export const ALGERIA_MAP_WIDTH = W;
export const ALGERIA_MAP_HEIGHT = Math.round((LAT1 - LAT0) * SCALE);

export function projectAlgeria([lon, lat]: readonly [number, number]): [number, number] {
  return [
    +((lon - LON0) * KX * SCALE).toFixed(1),
    +((LAT1 - lat) * SCALE).toFixed(1),
  ];
}

function inside(
  [x, y]: readonly [number, number],
  polygon: ReadonlyArray<readonly [number, number]>,
): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export function algeriaMapDots(step = 0.48): Array<[number, number]> {
  const dots: Array<[number, number]> = [];
  for (let lat = LAT0; lat <= LAT1; lat += step) {
    for (let lon = LON0; lon <= LON1; lon += step / KX) {
      if (inside([lon, lat], OUTLINE)) dots.push(projectAlgeria([lon, lat]));
    }
  }
  return dots;
}

export function algeriaOutlinePath(): string {
  return `M${OUTLINE.map((point) => projectAlgeria(point).join(",")).join("L")}Z`;
}

export type AlgeriaPoint = readonly [number, number];

/** Start, control and end points of the lifted arc a parcel flies along. */
export function algeriaArcPoints(
  from: AlgeriaCity,
  to: AlgeriaCity,
): [AlgeriaPoint, AlgeriaPoint, AlgeriaPoint] {
  const [x1, y1] = projectAlgeria(ALGERIA_CITIES[from]);
  const [x2, y2] = projectAlgeria(ALGERIA_CITIES[to]);
  const lift = Math.hypot(x2 - x1, y2 - y1) * 0.28;
  return [
    [x1, y1],
    [(x1 + x2) / 2, +((y1 + y2) / 2 - lift).toFixed(1)],
    [x2, y2],
  ];
}

export function algeriaArcPath(from: AlgeriaCity, to: AlgeriaCity): string {
  const [[x1, y1], [cx, cy], [x2, y2]] = algeriaArcPoints(from, to);
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
}

/** A point on the quadratic arc at progress t (0–1). */
export function pointOnArc(
  [p0, p1, p2]: readonly [AlgeriaPoint, AlgeriaPoint, AlgeriaPoint],
  t: number,
): [number, number] {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ];
}

/** Approximate arc length, used so every parcel travels at a similar speed. */
export function arcLength(points: readonly [AlgeriaPoint, AlgeriaPoint, AlgeriaPoint]): number {
  let length = 0;
  let previous = pointOnArc(points, 0);
  for (let step = 1; step <= 24; step += 1) {
    const next = pointOnArc(points, step / 24);
    length += Math.hypot(next[0] - previous[0], next[1] - previous[1]);
    previous = next;
  }
  return length;
}

/** Destinations from Algiers — same set as the cinematic sahelflow.com map. */
export const ALGERIA_LIVE_ROUTES: readonly AlgeriaCity[] = [
  "oran",
  "constantine",
  "annaba",
  "bejaia",
  "setif",
  "ghardaia",
  "ouargla",
  "tamanrasset",
  "bechar",
  "adrar",
  "tlemcen",
  "biskra",
  "illizi",
  "tindouf",
  "eloued",
];
