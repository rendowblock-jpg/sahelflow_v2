import {Easing, interpolate, spring} from 'remotion';

export const v3Colors = {
  black: '#030605',
  ink: '#07100d',
  inkLift: '#0d1914',
  panel: 'rgba(12, 25, 19, 0.90)',
  panelSoft: 'rgba(15, 31, 24, 0.72)',
  text: '#f6fff9',
  textSoft: '#c7d9cf',
  muted: '#82988d',
  line: 'rgba(218,255,237,0.12)',
  lineStrong: 'rgba(218,255,237,0.24)',
  emerald: '#38ed94',
  emeraldBright: '#8dffc4',
  emeraldDeep: '#0a7d4b',
  cyan: '#59e4ed',
  blue: '#73a9ff',
  amber: '#f2be67',
  sand: '#d8b06a',
  magenta: '#df78ff',
  red: '#ff6f79',
  white: '#ffffff',
};

export const v3Shadow = {
  deep: '0 55px 160px rgba(0,0,0,0.72), 0 2px 0 rgba(255,255,255,0.04) inset',
  lifted: '0 30px 90px rgba(0,0,0,0.56), 0 1px 0 rgba(255,255,255,0.055) inset',
  emerald: '0 0 90px rgba(56,237,148,0.28)',
};

export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export const ease = (frame: number, start: number, duration: number) => {
  const progress = clamp((frame - start) / Math.max(1, duration));
  return Easing.bezier(0.16, 1, 0.3, 1)(progress);
};

export const fadeWindow = (frame: number, duration: number, inFrames = 18, outFrames = 18) =>
  interpolate(frame, [0, inFrames, duration - outFrames, duration], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

export const springEnter = (frame: number, fps: number, delay = 0, damping = 20) =>
  spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: {damping, stiffness: 125, mass: 0.82},
    durationInFrames: 42,
  });
