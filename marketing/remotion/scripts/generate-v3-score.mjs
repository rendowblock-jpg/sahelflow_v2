import fs from 'node:fs';
import path from 'node:path';

const sampleRate = 48000;
const outputDirectory = path.resolve('public/audio');
fs.mkdirSync(outputDirectory, {recursive: true});

const tracks = [
  {name: 'v3-vertical-15.wav', duration: 15, bpm: 124, cues: [0, 2, 5.5, 9, 12]},
  {name: 'v3-social-30.wav', duration: 30, bpm: 120, cues: [0, 2.4, 6, 11.2, 16.6, 21.8, 26]},
  {name: 'v3-hero-65.wav', duration: 65, bpm: 116, cues: [0, 5, 10, 15, 24, 33, 41, 48, 55, 60]},
  {name: 'v3-demo-120.wav', duration: 120, bpm: 110, cues: [0, 5, 10, 15, 28, 43, 57, 70, 83, 98, 108, 114]},
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (a, b, value) => {
  const t = clamp((value - a) / Math.max(0.0001, b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const midi = (note) => 440 * 2 ** ((note - 69) / 12);
const sine = (hz, t) => Math.sin(Math.PI * 2 * hz * t);
const triangle = (hz, t) => 1 - 4 * Math.abs(((t * hz) % 1) - 0.5);
const softSquare = (hz, t) => Math.tanh(sine(hz, t) * 2.2);
const noise = (i) => {
  let x = i | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x ^= x >>> 16;
  return ((x >>> 0) / 4294967295) * 2 - 1;
};

const kick = (local) => {
  if (local < 0 || local > 0.48) return 0;
  const frequency = 44 + 116 * Math.exp(-local * 20);
  return sine(frequency, local) * Math.exp(-local * 9.4) * 0.72;
};
const hat = (local, seed) => {
  if (local < 0 || local > 0.09) return 0;
  return noise(seed + Math.floor(local * sampleRate)) * Math.exp(-local * 54) * 0.12;
};
const snap = (local, seed) => {
  if (local < 0 || local > 0.18) return 0;
  const n = noise(seed + Math.floor(local * sampleRate));
  return (n * 0.17 + sine(170, local) * 0.04) * Math.exp(-local * 22);
};
const impact = (local, seed) => {
  if (local < 0 || local > 1.45) return 0;
  const low = sine(38 + 28 * Math.exp(-local * 5), local) * Math.exp(-local * 3.4) * 0.5;
  const air = noise(seed + Math.floor(local * sampleRate)) * Math.exp(-local * 6.2) * 0.085;
  const metal = sine(510 + 120 * Math.exp(-local * 4), local) * Math.exp(-local * 8.5) * 0.035;
  return low + air + metal;
};
const riser = (time, cue, seed) => {
  const start = cue - 1.6;
  const local = time - start;
  if (local < 0 || local > 1.6) return 0;
  const p = local / 1.6;
  return (noise(seed + Math.floor(local * sampleRate)) * 0.055 + triangle(180 + p * 980, time) * 0.025) * p * p;
};
const pluck = (local, frequency) => {
  if (local < 0 || local > 0.8) return 0;
  return (triangle(frequency, local) * 0.7 + sine(frequency * 2, local) * 0.3) * Math.exp(-local * 5.8);
};

function writeTrack({name, duration, bpm, cues}) {
  const frames = Math.floor(duration * sampleRate);
  const channels = 2;
  const bytes = 2;
  const dataSize = frames * channels * bytes;
  const buffer = Buffer.allocUnsafe(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytes, 28);
  buffer.writeUInt16LE(channels * bytes, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  const beat = 60 / bpm;
  const roots = [40, 43, 36, 38];
  let offset = 44;

  for (let i = 0; i < frames; i++) {
    const time = i / sampleRate;
    const beatIndex = Math.floor(time / beat);
    const beatLocal = time - beatIndex * beat;
    const bar = Math.floor(beatIndex / 4);
    const root = roots[bar % roots.length];
    const barLocal = time - bar * beat * 4;
    const barProgress = barLocal / (beat * 4);

    const padEnvelope = 0.42 + Math.sin(Math.PI * clamp(barProgress, 0, 1)) * 0.58;
    const pad = (
      sine(midi(root), time) * 0.048 +
      sine(midi(root + 7), time) * 0.037 +
      sine(midi(root + 12), time) * 0.023 +
      triangle(midi(root + 19), time) * 0.012
    ) * padEnvelope;

    const bassNote = beatIndex % 4 === 3 ? root + 7 : root;
    const bass = softSquare(midi(bassNote - 12), time) * Math.exp(-beatLocal * 4.6) * 0.12;

    const kickSignal = beatIndex % 2 === 0 ? kick(beatLocal) : 0;
    const snapSignal = beatIndex % 4 === 2 ? snap(beatLocal, beatIndex * 23011) : 0;
    const eighth = beat / 2;
    const eighthIndex = Math.floor(time / eighth);
    const hatLocal = time - eighthIndex * eighth;
    const hatSignal = hat(hatLocal, eighthIndex * 91009) * (eighthIndex % 2 ? 0.74 : 1);

    const melodyStep = beatIndex % 8;
    const melodyNotes = [12, 14, 19, 14, 12, 10, 7, 10];
    const melody = pluck(beatLocal, midi(root + melodyNotes[melodyStep])) * 0.052;

    let accents = 0;
    for (let c = 0; c < cues.length; c++) {
      accents += impact(time - cues[c], c * 100003);
      if (c > 0) accents += riser(time, cues[c], c * 170003);
    }

    const intro = smoothstep(0, 1.1, time);
    const outro = 1 - smoothstep(duration - 1.7, duration, time);
    const sectionEnergy = 0.76 + 0.24 * smoothstep(duration * 0.18, duration * 0.58, time);
    const raw = (pad + bass + kickSignal + snapSignal + hatSignal + melody + accents) * intro * outro * sectionEnergy;
    const master = Math.tanh(raw * 1.28) * 0.84;
    const stereo = sine(0.07, time) * 0.035;
    const left = clamp(master + pad * stereo + melody * 0.12, -0.965, 0.965);
    const right = clamp(master - pad * stereo - melody * 0.12, -0.965, 0.965);

    buffer.writeInt16LE(Math.round(left * 32767), offset);
    buffer.writeInt16LE(Math.round(right * 32767), offset + 2);
    offset += 4;
  }

  const target = path.join(outputDirectory, name);
  fs.writeFileSync(target, buffer);
  console.log(`Generated ${target}`);
}

for (const track of tracks) writeTrack(track);
