import React, {type CSSProperties, type ReactNode} from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  cinematicOut,
  clamp,
  eased,
  floatNoise,
  premiumColors,
  premiumRadius,
  premiumShadow,
  springIn,
} from './design';
import {premiumFonts} from './fonts';

export const PremiumStage: React.FC<{
  children: ReactNode;
  accent?: 'emerald' | 'blue' | 'amber' | 'magenta' | 'cyan';
  intensity?: number;
  grid?: boolean;
  vignette?: boolean;
  style?: CSSProperties;
}> = ({children, accent = 'emerald', intensity = 1, grid = true, vignette = true, style}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const accentColor = premiumColors[accent];
  const driftX = floatNoise(`stage-${accent}-x`, frame, width * 0.035, 0.006);
  const driftY = floatNoise(`stage-${accent}-y`, frame, height * 0.04, 0.004);
  const grainOffset = frame % 7;

  return (
    <AbsoluteFill
      style={{
        overflow: 'hidden',
        background: premiumColors.black,
        color: premiumColors.text,
        fontFamily: premiumFonts.sans,
        ...style,
      }}
    >
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(circle at 50% -20%, rgba(55, 99, 78, 0.25), transparent 50%), linear-gradient(140deg, #050807 0%, #07100d 52%, #030605 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: width * 0.72,
          height: width * 0.72,
          left: -width * 0.18 + driftX,
          top: -height * 0.45 + driftY,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accentColor}38 0%, ${accentColor}0d 34%, transparent 69%)`,
          filter: 'blur(24px)',
          opacity: 0.78 * intensity,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: width * 0.5,
          height: width * 0.5,
          right: -width * 0.22 - driftX * 0.7,
          bottom: -height * 0.5 - driftY * 0.6,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${premiumColors.cyan}20 0%, transparent 66%)`,
          filter: 'blur(32px)',
          opacity: 0.5 * intensity,
        }}
      />
      {grid ? (
        <AbsoluteFill
          style={{
            opacity: 0.17,
            backgroundImage:
              'linear-gradient(rgba(181,255,216,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(181,255,216,0.08) 1px, transparent 1px)',
            backgroundSize: `${Math.max(44, width / 32)}px ${Math.max(44, width / 32)}px`,
            transform: `perspective(900px) rotateX(66deg) translateY(${height * 0.42}px) scale(1.45)`,
            transformOrigin: 'center bottom',
            maskImage: 'linear-gradient(to top, black, transparent 72%)',
          }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          opacity: 0.035,
          transform: `translate(${grainOffset}px, ${grainOffset * 0.4}px)`,
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg viewBox=%270 0 180 180%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.85%27 numOctaves=%274%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27 opacity=%270.9%27/%3E%3C/svg%3E")',
          mixBlendMode: 'soft-light',
        }}
      />
      {vignette ? (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            boxShadow: `inset 0 0 ${Math.round(width * 0.15)}px rgba(0,0,0,0.82)`,
          }}
        />
      ) : null}
      {children}
    </AbsoluteFill>
  );
};

export const ParticleField: React.FC<{
  count?: number;
  color?: string;
  depth?: number;
}> = ({count = 42, color = premiumColors.emerald, depth = 1}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();

  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {Array.from({length: count}).map((_, index) => {
        const x = random(`particle-x-${index}`) * width;
        const y = random(`particle-y-${index}`) * height;
        const size = 1 + random(`particle-size-${index}`) * 3.5;
        const speed = 0.15 + random(`particle-speed-${index}`) * 0.5;
        const offset = (frame * speed + random(`particle-offset-${index}`) * height) % (height + 80);
        const opacity = 0.1 + random(`particle-opacity-${index}`) * 0.5;
        return (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: x + Math.sin(frame * 0.008 + index) * 18 * depth,
              top: (y - offset + height + 40) % (height + 80) - 40,
              width: size,
              height: size,
              borderRadius: '50%',
              background: color,
              opacity,
              boxShadow: `0 0 ${size * 6}px ${color}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

export const GlassPanel: React.FC<{
  children: ReactNode;
  style?: CSSProperties;
  glow?: string;
  strong?: boolean;
}> = ({children, style, glow = premiumColors.emerald, strong = false}) => (
  <div
    style={{
      background: strong
        ? 'linear-gradient(145deg, rgba(20,36,29,0.97), rgba(8,17,13,0.94))'
        : 'linear-gradient(145deg, rgba(19,34,28,0.88), rgba(8,16,13,0.76))',
      border: `1px solid ${premiumColors.lineStrong}`,
      borderRadius: premiumRadius.lg,
      boxShadow: `${premiumShadow.panel}, 0 0 80px ${glow}12`,
      backdropFilter: 'blur(22px)',
      overflow: 'hidden',
      ...style,
    }}
  >
    {children}
  </div>
);

export const ChromeWindow: React.FC<{
  children: ReactNode;
  title?: string;
  badge?: string;
  style?: CSSProperties;
  toolbar?: ReactNode;
}> = ({children, title = 'SahelFlow', badge = 'LIVE', style, toolbar}) => (
  <GlassPanel strong style={style}>
    <div
      style={{
        height: 58,
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        borderBottom: `1px solid ${premiumColors.line}`,
        background: 'rgba(255,255,255,0.018)',
      }}
    >
      <div style={{display: 'flex', gap: 8}}>
        {[premiumColors.red, premiumColors.amber, premiumColors.emerald].map((color) => (
          <div key={color} style={{width: 10, height: 10, borderRadius: '50%', background: color, opacity: 0.82}} />
        ))}
      </div>
      <div style={{fontSize: 14, fontWeight: 700, letterSpacing: -0.1, color: premiumColors.textSoft}}>{title}</div>
      <div
        style={{
          marginLeft: 2,
          padding: '5px 9px',
          borderRadius: 999,
          background: `${premiumColors.emerald}14`,
          border: `1px solid ${premiumColors.emerald}2d`,
          color: premiumColors.emeraldBright,
          fontFamily: premiumFonts.mono,
          fontSize: 9,
          letterSpacing: 1.4,
          fontWeight: 800,
        }}
      >
        {badge}
      </div>
      <div style={{marginLeft: 'auto'}}>{toolbar}</div>
    </div>
    {children}
  </GlassPanel>
);

export const CameraRig: React.FC<{
  children: ReactNode;
  rotateX?: number;
  rotateY?: number;
  rotateZ?: number;
  scale?: number;
  x?: number;
  y?: number;
  entrance?: number;
  style?: CSSProperties;
}> = ({children, rotateX = 0, rotateY = 0, rotateZ = 0, scale = 1, x = 0, y = 0, entrance = 0, style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = springIn(frame, fps, entrance, 19);
  const driftX = floatNoise('camera-x', frame, 8, 0.01);
  const driftY = floatNoise('camera-y', frame, 5, 0.008);
  const driftR = floatNoise('camera-r', frame, 0.24, 0.006);

  return (
    <div style={{perspective: 1800, transformStyle: 'preserve-3d', ...style}}>
      <div
        style={{
          transformStyle: 'preserve-3d',
          transform: `translate3d(${x + driftX}px, ${y + (1 - enter) * 90 + driftY}px, 0) scale(${scale * (0.93 + enter * 0.07)}) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ + driftR}deg)`,
          opacity: enter,
        }}
      >
        {children}
      </div>
    </div>
  );
};

export const Wordmark: React.FC<{
  compact?: boolean;
  size?: number;
  monochrome?: boolean;
}> = ({compact = false, size = 34, monochrome = false}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: Math.round(size * 0.35)}}>
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: monochrome
          ? premiumColors.text
          : `linear-gradient(145deg, ${premiumColors.emeraldBright}, ${premiumColors.emeraldDark})`,
        boxShadow: monochrome ? 'none' : `0 0 ${size}px rgba(53,233,143,0.32)`,
        display: 'grid',
        placeItems: 'center',
        color: monochrome ? premiumColors.black : '#042113',
        fontWeight: 900,
        fontSize: Math.round(size * 0.55),
        letterSpacing: -2,
      }}
    >
      S
    </div>
    {!compact ? (
      <div style={{fontWeight: 800, fontSize: Math.round(size * 0.63), letterSpacing: -1.2}}>SahelFlow</div>
    ) : null}
  </div>
);

export const MicroLabel: React.FC<{
  children: ReactNode;
  color?: string;
  style?: CSSProperties;
}> = ({children, color = premiumColors.emerald, style}) => (
  <div
    style={{
      color,
      fontSize: 13,
      fontWeight: 800,
      letterSpacing: 2.4,
      textTransform: 'uppercase',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      ...style,
    }}
  >
    <span style={{width: 28, height: 2, background: color, boxShadow: `0 0 12px ${color}`}} />
    {children}
  </div>
);

export const KineticHeadline: React.FC<{
  text: string;
  accentWords?: string[];
  delay?: number;
  size?: number;
  align?: 'left' | 'center' | 'right';
  maxWidth?: number;
  lineHeight?: number;
  style?: CSSProperties;
}> = ({text, accentWords = [], delay = 0, size = 92, align = 'left', maxWidth = 980, lineHeight = 0.96, style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const words = text.split(' ');

  return (
    <div
      style={{
        maxWidth,
        textAlign: align,
        fontSize: size,
        lineHeight,
        letterSpacing: -size * 0.055,
        fontWeight: 800,
        textWrap: 'balance',
        ...style,
      }}
    >
      {words.map((word, index) => {
        const enter = spring({
          frame: Math.max(0, frame - delay - index * 2.2),
          fps,
          config: {damping: 20, stiffness: 145, mass: 0.75},
          durationInFrames: 31,
        });
        const clean = word.replace(/[.,!?]/g, '');
        const isAccent = accentWords.includes(clean);
        return (
          <span
            key={`${word}-${index}`}
            style={{
              display: 'inline-block',
              marginRight: size * 0.18,
              transform: `translateY(${(1 - enter) * size * 0.48}px) rotateX(${(1 - enter) * 40}deg)`,
              transformOrigin: 'center bottom',
              opacity: enter,
              color: isAccent ? premiumColors.emeraldBright : premiumColors.text,
              textShadow: isAccent ? '0 0 44px rgba(53,233,143,0.24)' : 'none',
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

export const BodyCopy: React.FC<{
  children: ReactNode;
  delay?: number;
  size?: number;
  maxWidth?: number;
  align?: 'left' | 'center' | 'right';
  style?: CSSProperties;
}> = ({children, delay = 0, size = 25, maxWidth = 670, align = 'left', style}) => {
  const frame = useCurrentFrame();
  const enter = eased(frame, delay, 24);
  return (
    <div
      style={{
        maxWidth,
        color: premiumColors.textSoft,
        fontSize: size,
        lineHeight: 1.46,
        letterSpacing: -0.35,
        textAlign: align,
        transform: `translateY(${(1 - enter) * 24}px)`,
        opacity: enter,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const StatusPill: React.FC<{
  children: ReactNode;
  color?: string;
  icon?: string;
  style?: CSSProperties;
}> = ({children, color = premiumColors.emerald, icon, style}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      borderRadius: 999,
      background: `${color}12`,
      border: `1px solid ${color}32`,
      color,
      fontSize: 12,
      fontWeight: 800,
      letterSpacing: 0.2,
      ...style,
    }}
  >
    {icon ? <span>{icon}</span> : <span style={{width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 9px ${color}`}} />}
    {children}
  </div>
);

export const MetricValue: React.FC<{
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  delay?: number;
  duration?: number;
  style?: CSSProperties;
}> = ({value, suffix = '', prefix = '', decimals = 0, delay = 0, duration = 42, style}) => {
  const frame = useCurrentFrame();
  const p = eased(frame, delay, duration);
  const shown = value * p;
  return (
    <div style={{fontVariantNumeric: 'tabular-nums', ...style}}>
      {prefix}
      {shown.toLocaleString('fr-DZ', {minimumFractionDigits: decimals, maximumFractionDigits: decimals})}
      {suffix}
    </div>
  );
};

export const Sparkline: React.FC<{
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  delay?: number;
  fill?: boolean;
}> = ({values, color = premiumColors.emerald, width = 320, height = 100, delay = 0, fill = true}) => {
  const frame = useCurrentFrame();
  const p = eased(frame, delay, 48);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * (height * 0.78) - height * 0.11;
    return [x, y] as const;
  });
  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const fillPath = `${line} L ${width} ${height} L 0 ${height} Z`;
  const length = width * 1.6;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{overflow: 'visible'}}>
      <defs>
        <linearGradient id={`spark-fill-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill ? <path d={fillPath} fill={`url(#spark-fill-${color.replace('#', '')})`} opacity={p} /> : null}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={length}
        strokeDashoffset={length * (1 - p)}
        style={{filter: `drop-shadow(0 0 10px ${color}88)`}}
      />
    </svg>
  );
};

export const AnimatedCursor: React.FC<{
  from: [number, number];
  to: [number, number];
  start?: number;
  duration?: number;
  clickAt?: number;
  scale?: number;
}> = ({from, to, start = 0, duration = 40, clickAt, scale = 1}) => {
  const frame = useCurrentFrame();
  const p = Easing.bezier(0.16, 1, 0.3, 1)(clamp((frame - start) / duration));
  const x = interpolate(p, [0, 1], [from[0], to[0]]);
  const y = interpolate(p, [0, 1], [from[1], to[1]]);
  const clickProgress = clickAt === undefined ? 0 : clamp(1 - Math.abs(frame - clickAt) / 10);

  return (
    <div style={{position: 'absolute', left: x, top: y, transform: `scale(${scale * (1 - clickProgress * 0.12)})`, zIndex: 50}}>
      {clickProgress > 0 ? (
        <div
          style={{
            position: 'absolute',
            left: -18,
            top: -18,
            width: 42 + clickProgress * 32,
            height: 42 + clickProgress * 32,
            borderRadius: '50%',
            border: `2px solid ${premiumColors.emerald}`,
            opacity: 1 - clickProgress,
            transform: `translate(${-clickProgress * 16}px, ${-clickProgress * 16}px)`,
          }}
        />
      ) : null}
      <svg width="34" height="42" viewBox="0 0 34 42">
        <path d="M3 2 L29 25 L18 27 L24 39 L18 41 L12 29 L4 36 Z" fill="#f8fffb" stroke="#07100d" strokeWidth="2.5" />
      </svg>
    </div>
  );
};

export const CaptionRail: React.FC<{
  kicker: string;
  title: string;
  body?: string;
  index?: string;
  align?: 'left' | 'right';
  delay?: number;
}> = ({kicker, title, body, index = '01', align = 'left', delay = 0}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = springIn(frame, fps, delay, 20);
  const isRight = align === 'right';

  return (
    <div
      style={{
        position: 'absolute',
        left: isRight ? undefined : 74,
        right: isRight ? 74 : undefined,
        top: 72,
        width: 490,
        textAlign: isRight ? 'right' : 'left',
        transform: `translateX(${(1 - enter) * (isRight ? 48 : -48)}px)`,
        opacity: enter,
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', justifyContent: isRight ? 'flex-end' : 'flex-start', gap: 12, marginBottom: 18}}>
        <span style={{fontFamily: premiumFonts.mono, color: premiumColors.muted, fontSize: 12}}>{index}</span>
        <MicroLabel>{kicker}</MicroLabel>
      </div>
      <div style={{fontSize: 43, lineHeight: 1.02, letterSpacing: -2.2, fontWeight: 800}}>{title}</div>
      {body ? <div style={{marginTop: 18, color: premiumColors.textSoft, fontSize: 18, lineHeight: 1.52}}>{body}</div> : null}
    </div>
  );
};

export const SceneFade: React.FC<{duration: number; children: ReactNode}> = ({duration, children}) => {
  const frame = useCurrentFrame();
  const opacity = cinematicOut(frame, duration, 14);
  return <div style={{width: '100%', height: '100%', opacity}}>{children}</div>;
};

export const EdgeLight: React.FC<{color?: string; side?: 'left' | 'right'}> = ({color = premiumColors.emerald, side = 'left'}) => (
  <div
    style={{
      position: 'absolute',
      top: '8%',
      bottom: '8%',
      [side]: -2,
      width: 3,
      background: `linear-gradient(transparent, ${color}, transparent)`,
      boxShadow: `0 0 34px ${color}`,
      opacity: 0.72,
    }}
  />
);

export const ImpactFlash: React.FC<{at: number; color?: string}> = ({at, color = premiumColors.emeraldBright}) => {
  const frame = useCurrentFrame();
  const distance = Math.abs(frame - at);
  const opacity = clamp(1 - distance / 5) * 0.25;
  return <AbsoluteFill style={{background: color, opacity, mixBlendMode: 'screen', pointerEvents: 'none'}} />;
};
