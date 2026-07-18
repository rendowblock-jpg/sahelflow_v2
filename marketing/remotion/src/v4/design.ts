import {Easing, interpolate, spring} from 'remotion';

export const V4 = {
  black: '#050606',
  ink: '#0B0D0C',
  ivory: '#F3F0E7',
  paper: '#E9E4D8',
  green: '#6BFF95',
  greenDeep: '#0BAE5B',
  red: '#FF514D',
  amber: '#FFB21A',
  blue: '#3B82F6',
  cyan: '#22D3EE',
  grape: '#8B5CF6',
  white: '#FFFFFF',
  muted: '#9AA39E',
  line: 'rgba(255,255,255,.13)',
};

export const clamp = (v: number) => Math.min(1, Math.max(0, v));
export const ease = (frame: number, start: number, duration: number) => interpolate(frame, [start, start + duration], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(.22,.9,.25,1)});
export const fade = (frame: number, duration: number, edge = 14) => Math.min(clamp(frame / edge), clamp((duration - frame) / edge));
export const enter = (frame: number, fps: number, delay = 0, damping = 18) => spring({frame: frame - delay, fps, config: {damping, stiffness: 140, mass: .75}});
export const snap = (frame: number, start: number, duration: number) => interpolate(frame, [start, start + duration], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
