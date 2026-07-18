import {Easing, interpolate, random, spring} from 'remotion';

// The palette is intentionally dynamic because several cinematic data arrays mix
// labels, coordinates and CSS color values before destructuring in JSX.
export const premiumColors: Record<string, any> = {
  black: '#050807',
  canvas: '#07100d',
  canvasLift: '#0a1612',
  panel: 'rgba(13, 24, 20, 0.86)',
  panelSolid: '#0d1814',
  panelHigh: '#14221d',
  line: 'rgba(218, 255, 237, 0.11)',
  lineStrong: 'rgba(218, 255, 237, 0.2)',
  text: '#f4fff9',
  textSoft: '#c5d8ce',
  muted: '#80978b',
  emerald: '#35e98f',
  emeraldBright: '#7affba',
  emeraldDark: '#0c8a55',
  cyan: '#4edce6',
  blue: '#6ea8ff',
  amber: '#ffc45d',
  magenta: '#e37aff',
  red: '#ff6e76',
  white: '#ffffff',
};

export const premiumShadow = {
  panel: '0 36px 120px rgba(0, 0, 0, 0.58), 0 2px 0 rgba(255,255,255,0.035) inset',
  raised: '0 28px 70px rgba(0,0,0,0.48), 0 1px 0 rgba(255,255,255,0.06) inset',
  glow: '0 0 64px rgba(53,233,143,0.26)',
  glowStrong: '0 0 100px rgba(53,233,143,0.38)',
};

export const premiumRadius = {
  sm: 12,
  md: 18,
  lg: 28,
  xl: 40,
};

export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export const progress = (frame: number, start: number, duration: number) =>
  clamp((frame - start) / Math.max(1, duration));

export const eased = (frame: number, start: number, duration: number) =>
  Easing.bezier(0.16, 1, 0.3, 1)(progress(frame, start, duration));

export const springIn = (frame: number, fps: number, delay = 0, damping = 18) =>
  spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: {damping, stiffness: 120, mass: 0.82},
    durationInFrames: 36,
  });

export const cinematicOut = (frame: number, duration: number, tail = 20) =>
  interpolate(frame, [duration - tail, duration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });

export const floatNoise = (seed: string, frame: number, amplitude = 1, speed = 0.015) => {
  const a = random(`${seed}-a`) * Math.PI * 2;
  const b = random(`${seed}-b`) * Math.PI * 2;
  return (
    Math.sin(frame * speed + a) * amplitude * 0.62 +
    Math.cos(frame * speed * 0.57 + b) * amplitude * 0.38
  );
};

export const formatDzd = (value: number) =>
  `${new Intl.NumberFormat('fr-DZ', {maximumFractionDigits: 0}).format(value)} DZD`;
