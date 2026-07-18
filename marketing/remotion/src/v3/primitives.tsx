import React, {type CSSProperties, type ReactNode} from 'react';
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  random,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {premiumFonts} from '../v2/fonts';
import {clamp, ease, springEnter, v3Colors, v3Shadow} from './design';

export const V3Stage: React.FC<{
  children: ReactNode;
  accent?: string;
  grid?: boolean;
  style?: CSSProperties;
}> = ({children, accent = v3Colors.emerald, grid = true, style}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const drift = Math.sin(frame * 0.008) * width * 0.018;
  return (
    <AbsoluteFill style={{overflow: 'hidden', background: v3Colors.black, color: v3Colors.text, fontFamily: premiumFonts.sans, ...style}}>
      <AbsoluteFill style={{background: 'linear-gradient(135deg,#020403 0%,#07110d 48%,#020504 100%)'}} />
      <div style={{position: 'absolute', width: width * 0.72, height: width * 0.72, left: -width * 0.24 + drift, top: -height * 0.52, borderRadius: '50%', background: `radial-gradient(circle, ${accent}35 0%, ${accent}12 36%, transparent 69%)`, filter: 'blur(34px)'}} />
      <div style={{position: 'absolute', width: width * 0.52, height: width * 0.52, right: -width * 0.26 - drift * 0.6, bottom: -height * 0.46, borderRadius: '50%', background: `radial-gradient(circle, ${v3Colors.cyan}1c 0%, transparent 68%)`, filter: 'blur(38px)'}} />
      {grid ? <AbsoluteFill style={{opacity: 0.13, backgroundImage: 'linear-gradient(rgba(190,255,220,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(190,255,220,.08) 1px,transparent 1px)', backgroundSize: '54px 54px', maskImage: 'linear-gradient(to top, black, transparent 75%)', transform: `perspective(1000px) rotateX(68deg) translateY(${height * 0.47}px) scale(1.6)`, transformOrigin: 'center bottom'}} /> : null}
      <AbsoluteFill style={{opacity: 0.034, transform: `translate(${frame % 5}px, ${(frame % 7) * 0.5}px)`, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%270 0 160 160%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%274%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27/%3E%3C/svg%3E")', mixBlendMode: 'soft-light'}} />
      <AbsoluteFill style={{boxShadow: `inset 0 0 ${Math.round(width * 0.16)}px rgba(0,0,0,.85)`, pointerEvents: 'none'}} />
      {children}
    </AbsoluteFill>
  );
};

export const FlowRibbon: React.FC<{
  progress?: number;
  color?: string;
  style?: CSSProperties;
  nodes?: number;
}> = ({progress, color = v3Colors.emerald, style, nodes = 7}) => {
  const frame = useCurrentFrame();
  const p = progress ?? clamp(frame / 95);
  const pathLength = 1300;
  return (
    <svg viewBox="0 0 1400 420" style={{position: 'absolute', overflow: 'visible', ...style}}>
      <defs>
        <filter id="flowGlow"><feGaussianBlur stdDeviation="7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <linearGradient id="flowGradient" x1="0" x2="1"><stop offset="0" stopColor={v3Colors.cyan}/><stop offset="0.48" stopColor={color}/><stop offset="1" stopColor={v3Colors.sand}/></linearGradient>
      </defs>
      <path d="M40 310 C220 310 190 95 390 95 S620 345 800 255 S1030 70 1360 118" fill="none" stroke="rgba(210,255,232,.09)" strokeWidth="3" />
      <path d="M40 310 C220 310 190 95 390 95 S620 345 800 255 S1030 70 1360 118" fill="none" stroke="url(#flowGradient)" strokeWidth="5" strokeLinecap="round" filter="url(#flowGlow)" strokeDasharray={pathLength} strokeDashoffset={pathLength * (1 - p)} />
      {Array.from({length: nodes}).map((_, index) => {
        const x = 65 + index * (1280 / (nodes - 1));
        const y = 210 + Math.sin(index * 1.54) * 105;
        const delay = index / Math.max(1, nodes - 1);
        const visible = clamp((p - delay) * 9);
        return <g key={index} opacity={visible}><circle cx={x} cy={y} r="15" fill={v3Colors.black} stroke={color} strokeWidth="3"/><circle cx={x} cy={y} r="5" fill={color}/></g>;
      })}
    </svg>
  );
};

export const WordmarkV3: React.FC<{size?: number; centered?: boolean}> = ({size = 52, centered = false}) => (
  <div style={{display: 'flex', alignItems: 'center', justifyContent: centered ? 'center' : undefined, gap: size * 0.32}}>
    <div style={{width: size, height: size, borderRadius: size * 0.28, background: `linear-gradient(145deg,${v3Colors.emeraldBright},${v3Colors.emeraldDeep})`, display: 'grid', placeItems: 'center', color: '#032416', fontWeight: 900, fontSize: size * 0.54, letterSpacing: -2, boxShadow: `0 0 ${size * 1.3}px rgba(56,237,148,.34)`}}>S</div>
    <div style={{fontSize: size * 0.72, fontWeight: 800, letterSpacing: -size * 0.035}}>Sahel<span style={{color: v3Colors.emerald}}>Flow</span></div>
  </div>
);

export const SceneCopy: React.FC<{
  eyebrow?: string;
  headline: string;
  body?: string;
  align?: 'left' | 'center' | 'right';
  maxWidth?: number;
  compact?: boolean;
  arabic?: boolean;
  delay?: number;
}> = ({eyebrow, headline, body, align = 'left', maxWidth = 920, compact = false, arabic = false, delay = 0}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = springEnter(frame, fps, delay, 21);
  return (
    <div dir={arabic ? 'rtl' : 'ltr'} style={{maxWidth, textAlign: align, fontFamily: arabic ? premiumFonts.arabic : premiumFonts.sans, transform: `translateY(${(1 - enter) * 50}px)`, opacity: enter}}>
      {eyebrow ? <div style={{fontSize: compact ? 14 : 16, letterSpacing: arabic ? 0 : 3.2, fontWeight: 800, color: v3Colors.emeraldBright, marginBottom: compact ? 18 : 24}}>{eyebrow}</div> : null}
      <div style={{whiteSpace: 'pre-line', fontSize: compact ? 56 : 82, lineHeight: compact ? 0.99 : 0.96, letterSpacing: arabic ? -1.5 : -4.8, fontWeight: 820}}>{headline}</div>
      {body ? <div style={{marginTop: compact ? 21 : 28, fontSize: compact ? 20 : 24, lineHeight: 1.45, color: v3Colors.textSoft, maxWidth: maxWidth * 0.84, marginInline: align === 'center' ? 'auto' : undefined}}>{body}</div> : null}
    </div>
  );
};

const captureTrimFrames: Record<string, number> = {
  'dashboard-fr.webm': 170,
  'orders-fr.webm': 110,
  'deliveries-fr.webm': 105,
  'automations-en.webm': 55,
  'inbox-ar.webm': 190,
};

type CaptureFrameProps = {
  asset: string;
  video?: boolean;
  startFrom?: number;
  scale?: number;
  x?: number;
  y?: number;
  rotateX?: number;
  rotateY?: number;
  rotateZ?: number;
  entrance?: number;
  style?: CSSProperties;
  showChrome?: boolean;
  muted?: boolean;
};

export const CaptureFrame: React.FC<CaptureFrameProps> = ({asset, video = false, startFrom = 0, scale = 1, x = 0, y = 0, rotateX = 0, rotateY = 0, rotateZ = 0, entrance = 0, style, showChrome = true, muted = true}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = springEnter(frame, fps, entrance, 20);
  const driftX = Math.sin((frame + asset.length * 3) * 0.012) * 5;
  const driftY = Math.cos((frame + asset.length * 7) * 0.009) * 4;
  const effectiveStartFrom = video ? Math.max(startFrom, captureTrimFrames[asset] ?? 0) : startFrom;
  const content = video ? (
    <OffthreadVideo src={staticFile(`captures/${asset}`)} startFrom={effectiveStartFrom} muted={muted} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
  ) : (
    <Img src={staticFile(`captures/${asset}`)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
  );
  return (
    <div style={{width: '100%', height: '100%', perspective: 2200, transformStyle: 'preserve-3d', ...style}}>
      <div style={{position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: showChrome ? 26 : 18, border: `1px solid ${v3Colors.lineStrong}`, background: v3Colors.ink, boxShadow: v3Shadow.deep, opacity: enter, transformStyle: 'preserve-3d', transform: `translate3d(${x + driftX}px,${y + (1 - enter) * 90 + driftY}px,0) scale(${scale * (0.92 + enter * 0.08)}) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`}}>
        {showChrome ? <div style={{position: 'absolute', inset: '0 0 auto 0', height: 44, zIndex: 2, display: 'flex', alignItems: 'center', gap: 7, padding: '0 15px', background: 'rgba(4,10,7,.90)', borderBottom: `1px solid ${v3Colors.line}`}}>{[v3Colors.red, v3Colors.amber, v3Colors.emerald].map((c) => <span key={c} style={{width: 8, height: 8, borderRadius: '50%', background: c}} />)}<span style={{fontSize: 11, color: v3Colors.muted, marginLeft: 8}}>SahelFlow · Product capture</span><span style={{marginLeft: 'auto', fontSize: 9, letterSpacing: 1.5, color: v3Colors.emerald}}>AUTHENTIC UI</span></div> : null}
        <div style={{position: 'absolute', inset: showChrome ? '44px 0 0' : 0}}>{content}</div>
        <div style={{position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(135deg,rgba(255,255,255,.055),transparent 24%,transparent 70%,rgba(56,237,148,.045))'}} />
      </div>
    </div>
  );
};

export const KineticLabel: React.FC<{children: ReactNode; color?: string; delay?: number; style?: CSSProperties}> = ({children, color = v3Colors.emerald, delay = 0, style}) => {
  const frame = useCurrentFrame();
  const value = ease(frame, delay, 24);
  return <div style={{display: 'inline-flex', alignItems: 'center', gap: 9, padding: '9px 13px', borderRadius: 999, background: `${color}12`, border: `1px solid ${color}38`, color, fontSize: 12, fontWeight: 800, letterSpacing: 0.5, opacity: value, transform: `translateY(${(1 - value) * 16}px) scale(${0.92 + value * 0.08})`, ...style}}><span style={{width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 13px ${color}`}} />{children}</div>;
};

export const MetricPulse: React.FC<{value: string; label: string; color?: string; delay?: number}> = ({value, label, color = v3Colors.emerald, delay = 0}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = springEnter(frame, fps, delay, 18);
  return <div style={{padding: '18px 20px', borderRadius: 18, background: 'rgba(8,18,14,.76)', border: `1px solid ${v3Colors.lineStrong}`, boxShadow: `0 22px 60px rgba(0,0,0,.42),0 0 40px ${color}10`, opacity: enter, transform: `translateY(${(1 - enter) * 28}px)`}}><div style={{fontSize: 26, fontWeight: 850, letterSpacing: -1.2, color}}>{value}</div><div style={{fontSize: 11, color: v3Colors.muted, marginTop: 5, fontWeight: 700, letterSpacing: 0.8}}>{label}</div></div>;
};

export const ChaosParticleCards: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  return <AbsoluteFill>{Array.from({length: 32}).map((_, index) => {
    const x = random(`chaos-x-${index}`) * width;
    const y = random(`chaos-y-${index}`) * height;
    const speed = 0.45 + random(`chaos-speed-${index}`) * 0.9;
    const value = (frame * speed + index * 47) % (height + 160);
    return <div key={index} style={{position: 'absolute', left: x, top: (y + value) % (height + 160) - 80, width: 3 + random(`chaos-size-${index}`) * 7, height: 3 + random(`chaos-size2-${index}`) * 7, borderRadius: 2, background: index % 5 === 0 ? v3Colors.red : index % 3 === 0 ? v3Colors.amber : v3Colors.emerald, opacity: 0.18 + random(`chaos-o-${index}`) * 0.48, transform: `rotate(${frame * 0.25 + index * 11}deg)`}} />;
  })}</AbsoluteFill>;
};
