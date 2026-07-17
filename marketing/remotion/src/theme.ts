import type {CSSProperties} from 'react';

export const colors = {
  canvas: '#111312',
  canvasDeep: '#090b0a',
  panel: '#191c1a',
  panelRaised: '#222623',
  panelSoft: '#2a302c',
  line: 'rgba(255,255,255,0.10)',
  lineStrong: 'rgba(255,255,255,0.17)',
  text: '#f5f7f5',
  textSoft: '#b7c0ba',
  textMuted: '#7f8a83',
  emerald: '#34d17b',
  emeraldBright: '#64ee9d',
  emeraldDeep: '#087a43',
  blue: '#65a9ff',
  amber: '#ffc561',
  magenta: '#e58cff',
  cyan: '#61d9e8',
  red: '#ff776e',
  white: '#ffffff',
  black: '#000000',
} as const;

export const fonts = {
  sans: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
  arabic: 'Tahoma, "Segoe UI", Arial, sans-serif',
} as const;

export const shadows = {
  panel: '0 30px 90px rgba(0,0,0,0.48), 0 1px 0 rgba(255,255,255,0.05) inset',
  float: '0 18px 50px rgba(0,0,0,0.42)',
  emerald: '0 0 48px rgba(52,209,123,0.28)',
} as const;

export const rounded = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 30,
} as const;

export const absoluteFill: CSSProperties = {
  position: 'absolute',
  inset: 0,
};

export const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));
