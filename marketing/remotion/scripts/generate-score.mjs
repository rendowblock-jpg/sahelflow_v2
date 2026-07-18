import fs from 'node:fs';
import path from 'node:path';

const sampleRate = 24000;
const outputDirectory = path.resolve('public/audio');
fs.mkdirSync(outputDirectory, {recursive: true});

const tracks = [
  {name: 'premium-vertical-15.wav', duration: 15, bpm: 122, cues: [0, 2.5, 5.8, 9.1, 12.5]},
  {name: 'premium-social-30.wav', duration: 30, bpm: 118, cues: [0, 3, 8, 14, 20, 25.8]},
  {name: 'premium-launch-60.wav', duration: 60, bpm: 116, cues: [0, 5, 12.3, 22, 31.2, 39.5, 47.2, 54.5]},
  {name: 'premium-demo-90.wav', duration: 90, bpm: 112, cues: [0, 6, 16, 26, 36, 46, 54.7, 63.4, 72, 80, 86]},
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const hashNoise = (index) => {
  let x = index | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x ^= x >>> 16;
  return ((x >>> 0) / 4294967295) * 2 - 1;
};

const noteFrequency = (midi) => 440 * 2 ** ((midi - 69) / 12);

const oscillator = (frequency, time, shape = 'sine') => {
  const phase = (time * frequency) % 1;
  if (shape === 'triangle') return 1 - 4 * Math.abs(phase - 0.5);
  if (shape === 'soft-square') return Math.tanh(Math.sin(phase * Math.PI * 2) * 2.4);
  return Math.sin(phase * Math.PI * 2);
};

const envelope = (time, start, attack, release, duration) => {
  const local = time - start;
  if (local < 0 || local > duration) return 0;
  const inGain = smoothstep(0, attack, local);
  const outGain = 1 - smoothstep(duration - release, duration, local);
  return inGain * outGain;
};

const addKick = (time, beatTime) => {
  const local = time - beatTime;
  if (local < 0 || local > 0.42) return 0;
  const pitch = 48 + 90 * Math.exp(-local * 18);
  return Math.sin(Math.PI * 2 * pitch * local) * Math.exp(-local * 10) * 0.72;
};

const addTick = (time, tickTime, seed) => {
  const local = time - tickTime;
  if (local < 0 || local > 0.08) return 0;
  return hashNoise(seed + Math.floor(local * sampleRate)) * Math.exp(-local * 60) * 0.17;
};

const addImpact = (time, cue, seed) => {
  const local = time - cue;
  if (local < 0 || local > 1.1) return 0;
  const low = Math.sin(Math.PI * 2 * (42 + 18 * Math.exp(-local * 4)) * local) * Math.exp(-local * 4.3);
  const air = hashNoise(seed + Math.floor(local * sampleRate)) * Math.exp(-local * 7.5);
  return low * 0.55 + air * 0.12;
};

const addRiser = (time, cue, seed) => {
  const start = cue - 1.35;
  const local = time - start;
  if (local < 0 || local > 1.35) return 0;
  const progress = local / 1.35;
  const noise = hashNoise(seed + Math.floor(local * sampleRate));
  const tone = oscillator(220 + progress * 640, time, 'triangle');
  return (noise * 0.07 + tone * 0.035) * progress ** 2;
};

const writeWav = ({name, duration, bpm, cues}) => {
  const frameCount = Math.floor(duration * sampleRate);
  const channels = 2;
  const bytesPerSample = 2;
  const dataSize = frameCount * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  const beatDuration = 60 / bpm;
  const chordProgression = [40, 43, 36, 38];
  const beatCount = Math.ceil(duration / beatDuration) + 2;
  let offset = 44;

  for (let index = 0; index < frameCount; index += 1) {
    const time = index / sampleRate;
    const bar = Math.floor(time / (beatDuration * 4));
    const root = chordProgression[bar % chordProgression.length];
    const barStart = bar * beatDuration * 4;
    const barProgress = (time - barStart) / (beatDuration * 4);

    const padEnvelope = 0.42 + 0.58 * Math.sin(Math.PI * clamp(barProgress, 0, 1));
    const pad =
      oscillator(noteFrequency(root), time, 'triangle') * 0.08 +
      oscillator(noteFrequency(root + 7), time, 'sine') * 0.055 +
      oscillator(noteFrequency(root + 12), time, 'sine') * 0.035;

    let bass = 0;
    let percussion = 0;
    for (let beat = Math.max(0, Math.floor(time / beatDuration) - 1); beat < Math.min(beatCount, Math.floor(time / beatDuration) + 2); beat += 1) {
      const beatTime = beat * beatDuration;
      const local = time - beatTime;
      if (local >= 0 && local < beatDuration * 0.9) {
        const bassNote = beat % 4 === 3 ? root + 7 : root;
        bass += oscillator(noteFrequency(bassNote - 12), time, 'soft-square') * Math.exp(-local * 4.8) * 0.13;
      }
      if (beat % 4 === 0 || beat % 4 === 2) percussion += addKick(time, beatTime);
      percussion += addTick(time, beatTime + beatDuration / 2, beat * 7001);
      percussion += addTick(time, beatTime + beatDuration * 0.75, beat * 9001) * 0.65;
    }

    let accents = 0;
    cues.forEach((cue, cueIndex) => {
      accents += addImpact(time, cue, cueIndex * 100003);
      if (cueIndex > 0) accents += addRiser(time, cue, cueIndex * 170003);
    });

    const intro = smoothstep(0, 1.2, time);
    const outro = 1 - smoothstep(duration - 1.8, duration, time);
    const master = intro * outro;
    const signal = clamp((pad * padEnvelope + bass + percussion + accents) * master, -0.96, 0.96);

    const width = oscillator(0.08, time) * 0.05;
    const left = clamp(signal + pad * width, -0.98, 0.98);
    const right = clamp(signal - pad * width, -0.98, 0.98);

    buffer.writeInt16LE(Math.round(left * 32767), offset);
    buffer.writeInt16LE(Math.round(right * 32767), offset + 2);
    offset += 4;
  }

  const target = path.join(outputDirectory, name);
  fs.writeFileSync(target, buffer);
  console.log(`Generated ${target}`);
};

for (const track of tracks) writeWav(track);
