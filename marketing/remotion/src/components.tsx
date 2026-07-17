import React, {type CSSProperties, type ReactNode} from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {colors, fonts, rounded, shadows} from './theme';

export const sceneOpacity = (
  frame: number,
  durationInFrames: number,
  fadeFrames = 18,
) => {
  const fadeIn = interpolate(frame, [0, fadeFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - fadeFrames, durationInFrames],
    [1, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.in(Easing.cubic),
    },
  );
  return Math.min(fadeIn, fadeOut);
};

export const rise = (
  frame: number,
  fps: number,
  delay = 0,
  distance = 34,
) => {
  const progress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: {damping: 18, stiffness: 120, mass: 0.8},
  });
  return {
    opacity: progress,
    transform: `translateY(${(1 - progress) * distance}px)`,
  } as CSSProperties;
};

export const scaleIn = (frame: number, fps: number, delay = 0) => {
  const progress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: {damping: 20, stiffness: 115, mass: 0.9},
  });
  return {
    opacity: progress,
    transform: `scale(${0.93 + progress * 0.07})`,
  } as CSSProperties;
};

export const SceneCanvas: React.FC<{
  children: ReactNode;
  glow?: 'emerald' | 'blue' | 'magenta' | 'amber';
  style?: CSSProperties;
}> = ({children, glow = 'emerald', style}) => {
  const frame = useCurrentFrame();
  const glowColor = {
    emerald: 'rgba(52, 209, 123, 0.23)',
    blue: 'rgba(101, 169, 255, 0.20)',
    magenta: 'rgba(229, 140, 255, 0.16)',
    amber: 'rgba(255, 197, 97, 0.15)',
  }[glow];
  const driftX = Math.sin(frame / 90) * 50;
  const driftY = Math.cos(frame / 110) * 36;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(145deg, ${colors.canvasDeep} 0%, ${colors.canvas} 55%, #121713 100%)`,
        color: colors.text,
        fontFamily: fonts.sans,
        overflow: 'hidden',
        ...style,
      }}
    >
      <AbsoluteFill
        style={{
          opacity: 0.33,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          transform: `translate(${driftX * 0.06}px, ${driftY * 0.06}px)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 980,
          height: 980,
          borderRadius: '50%',
          left: -280 + driftX,
          top: -390 + driftY,
          background: `radial-gradient(circle, ${glowColor} 0%, transparent 68%)`,
          filter: 'blur(10px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 760,
          height: 760,
          borderRadius: '50%',
          right: -270 - driftX * 0.5,
          bottom: -360 - driftY * 0.4,
          background:
            'radial-gradient(circle, rgba(52,209,123,0.10) 0%, transparent 70%)',
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

export const BrandMark: React.FC<{size?: number}> = ({size = 62}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.28,
      display: 'grid',
      placeItems: 'center',
      background:
        'linear-gradient(145deg, rgba(100,238,157,1) 0%, rgba(52,209,123,1) 45%, rgba(8,122,67,1) 100%)',
      boxShadow: shadows.emerald,
      flexShrink: 0,
    }}
  >
    <svg width={size * 0.68} height={size * 0.68} viewBox="0 0 64 64" fill="none">
      <path
        d="M17 21.5C21.4 14.8 31.7 12.8 39.4 16.4C45.2 19.1 47.8 24.1 45.8 28.1C43.6 32.4 37.7 33.3 31.5 33.8C25.3 34.3 19.3 35.2 17.2 39.5C15.1 43.8 18.2 48.8 24.2 51.2C32.1 54.3 42.2 51.8 46.2 44.9"
        stroke="white"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M20 18L16 22L20.5 25"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
    </svg>
  </div>
);

export const Wordmark: React.FC<{
  compact?: boolean;
  light?: boolean;
}> = ({compact = false, light = true}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: compact ? 12 : 16}}>
    <BrandMark size={compact ? 42 : 58} />
    <div
      style={{
        fontSize: compact ? 27 : 42,
        fontWeight: 760,
        letterSpacing: '-0.04em',
        color: light ? colors.text : '#131714',
      }}
    >
      Sahel<span style={{color: colors.emeraldBright}}>Flow</span>
    </div>
  </div>
);

export const Eyebrow: React.FC<{children: ReactNode}> = ({children}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      color: colors.emeraldBright,
      fontWeight: 700,
      fontSize: 20,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
    }}
  >
    <span
      style={{
        width: 9,
        height: 9,
        borderRadius: '50%',
        background: colors.emerald,
        boxShadow: '0 0 18px rgba(52,209,123,0.7)',
      }}
    />
    {children}
  </div>
);

export const Headline: React.FC<{
  children: ReactNode;
  size?: number;
  width?: number;
  align?: 'left' | 'center';
}> = ({children, size = 88, width = 1250, align = 'left'}) => (
  <div
    style={{
      maxWidth: width,
      fontSize: size,
      lineHeight: 0.99,
      letterSpacing: '-0.055em',
      fontWeight: 780,
      textAlign: align,
      textWrap: 'balance',
    }}
  >
    {children}
  </div>
);

export const Subheadline: React.FC<{
  children: ReactNode;
  size?: number;
  width?: number;
  align?: 'left' | 'center';
}> = ({children, size = 29, width = 900, align = 'left'}) => (
  <div
    style={{
      maxWidth: width,
      fontSize: size,
      lineHeight: 1.38,
      letterSpacing: '-0.018em',
      color: colors.textSoft,
      textAlign: align,
      textWrap: 'balance',
    }}
  >
    {children}
  </div>
);

export const StatusPill: React.FC<{
  label: string;
  tone?: 'emerald' | 'blue' | 'amber' | 'muted' | 'red';
}> = ({label, tone = 'muted'}) => {
  const toneMap = {
    emerald: [colors.emeraldBright, 'rgba(52,209,123,0.13)'],
    blue: [colors.blue, 'rgba(101,169,255,0.13)'],
    amber: [colors.amber, 'rgba(255,197,97,0.13)'],
    muted: [colors.textSoft, 'rgba(255,255,255,0.07)'],
    red: [colors.red, 'rgba(255,119,110,0.13)'],
  } as const;
  const [foreground, background] = toneMap[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        padding: '7px 11px',
        fontSize: 12,
        fontWeight: 700,
        color: foreground,
        background,
        border: `1px solid ${foreground}28`,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
};

const navItems = [
  ['⌂', 'Command'],
  ['▣', 'Orders'],
  ['◫', 'Inventory'],
  ['◎', 'Customers'],
  ['⇄', 'Delivery'],
  ['◌', 'WhatsApp'],
  ['⌁', 'Automation'],
  ['⌁', 'Analytics'],
];

export const AppWindow: React.FC<{
  children: ReactNode;
  active?: string;
  compact?: boolean;
  title?: string;
}> = ({children, active = 'Command', compact = false, title = 'SahelFlow'}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = scaleIn(frame, fps, 2);
  const sidebarWidth = compact ? 136 : 212;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        borderRadius: compact ? rounded.lg : rounded.xl,
        border: `1px solid ${colors.lineStrong}`,
        background: colors.panel,
        boxShadow: shadows.panel,
        ...enter,
      }}
    >
      <div
        style={{
          height: compact ? 44 : 54,
          display: 'flex',
          alignItems: 'center',
          borderBottom: `1px solid ${colors.line}`,
          background: 'rgba(255,255,255,0.018)',
          padding: compact ? '0 14px' : '0 19px',
          gap: 13,
        }}
      >
        <div style={{display: 'flex', gap: 7}}>
          {['#ff6e68', '#f7c85d', '#4fd479'].map((color) => (
            <span
              key={color}
              style={{width: compact ? 8 : 10, height: compact ? 8 : 10, borderRadius: '50%', background: color}}
            />
          ))}
        </div>
        <div
          style={{
            marginLeft: 8,
            fontSize: compact ? 11 : 13,
            color: colors.textMuted,
            fontWeight: 650,
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginLeft: 'auto',
            borderRadius: 999,
            padding: compact ? '4px 8px' : '5px 10px',
            fontSize: compact ? 9 : 11,
            fontWeight: 700,
            color: colors.emeraldBright,
            border: '1px solid rgba(52,209,123,0.18)',
            background: 'rgba(52,209,123,0.08)',
          }}
        >
          Local desktop
        </div>
      </div>
      <div style={{height: `calc(100% - ${compact ? 44 : 54}px)`, display: 'flex'}}>
        <div
          style={{
            width: sidebarWidth,
            flexShrink: 0,
            padding: compact ? '15px 10px' : '20px 14px',
            borderRight: `1px solid ${colors.line}`,
            background: 'rgba(255,255,255,0.012)',
          }}
        >
          <div style={{padding: compact ? '0 7px 14px' : '0 9px 22px'}}>
            <Wordmark compact />
          </div>
          <div style={{display: 'grid', gap: compact ? 5 : 7}}>
            {navItems.map(([icon, label]) => {
              const isActive = label === active;
              return (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: compact ? 8 : 11,
                    minHeight: compact ? 32 : 40,
                    padding: compact ? '0 8px' : '0 11px',
                    borderRadius: compact ? 8 : 11,
                    color: isActive ? colors.text : colors.textMuted,
                    background: isActive ? 'rgba(52,209,123,0.11)' : 'transparent',
                    border: isActive ? '1px solid rgba(52,209,123,0.13)' : '1px solid transparent',
                    fontSize: compact ? 10 : 13,
                    fontWeight: isActive ? 720 : 570,
                  }}
                >
                  <span
                    style={{
                      width: compact ? 16 : 20,
                      textAlign: 'center',
                      color: isActive ? colors.emeraldBright : colors.textMuted,
                    }}
                  >
                    {icon}
                  </span>
                  {label}
                </div>
              );
            })}
          </div>
        </div>
        <div style={{flex: 1, minWidth: 0, padding: compact ? 16 : 25}}>{children}</div>
      </div>
    </div>
  );
};

export const MetricCard: React.FC<{
  label: string;
  value: string;
  delta: string;
  tone?: 'emerald' | 'blue' | 'amber' | 'magenta';
  delay?: number;
  compact?: boolean;
}> = ({label, value, delta, tone = 'emerald', delay = 0, compact = false}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const accent = {
    emerald: colors.emeraldBright,
    blue: colors.blue,
    amber: colors.amber,
    magenta: colors.magenta,
  }[tone];
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: compact ? 12 : 16,
        border: `1px solid ${colors.line}`,
        background: 'linear-gradient(150deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))',
        padding: compact ? 13 : 18,
        minHeight: compact ? 88 : 118,
        ...rise(frame, fps, delay, 20),
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: 110,
          height: 110,
          right: -35,
          top: -45,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accent}28 0%, transparent 70%)`,
        }}
      />
      <div style={{fontSize: compact ? 10 : 12, color: colors.textMuted, fontWeight: 620}}>{label}</div>
      <div
        style={{
          fontSize: compact ? 23 : 31,
          fontWeight: 780,
          letterSpacing: '-0.04em',
          marginTop: compact ? 6 : 10,
        }}
      >
        {value}
      </div>
      <div style={{fontSize: compact ? 9 : 11, color: accent, fontWeight: 700, marginTop: 4}}>{delta}</div>
    </div>
  );
};

const Sparkline: React.FC<{progress: number; color: string}> = ({progress, color}) => {
  const dash = 370;
  return (
    <svg viewBox="0 0 420 130" width="100%" height="100%" preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 105 C40 94 60 100 96 78 C130 56 148 73 180 60 C215 46 231 52 266 28 C300 8 320 37 352 20 C382 4 399 18 420 4 L420 130 L0 130 Z"
        fill="url(#spark-fill)"
        opacity={progress}
      />
      <path
        d="M0 105 C40 94 60 100 96 78 C130 56 148 73 180 60 C215 46 231 52 266 28 C300 8 320 37 352 20 C382 4 399 18 420 4"
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={dash}
        strokeDashoffset={dash * (1 - progress)}
      />
    </svg>
  );
};

export const DashboardPreview: React.FC<{compact?: boolean}> = ({compact = false}) => {
  const frame = useCurrentFrame();
  const chartProgress = interpolate(frame, [12, 68], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const metrics = [
    ['Orders today', '148', '+18%', 'emerald'],
    ['Confirmed', '96', '+12%', 'blue'],
    ['Delivered', '72', '48.6%', 'amber'],
    ['COD collected', '386K', '+21%', 'magenta'],
  ] as const;

  return (
    <AppWindow active="Command" compact={compact}>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: compact ? 12 : 20}}>
        <div>
          <div style={{fontSize: compact ? 16 : 24, fontWeight: 750}}>Command center</div>
          <div style={{fontSize: compact ? 9 : 12, color: colors.textMuted, marginTop: 4}}>Saturday · Live operational view</div>
        </div>
        <StatusPill label="All systems clear" tone="emerald" />
      </div>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: compact ? 8 : 12}}>
        {metrics.map(([label, value, delta, tone], index) => (
          <MetricCard
            key={label}
            label={label}
            value={value}
            delta={delta}
            tone={tone}
            delay={index * 4}
            compact={compact}
          />
        ))}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1.7fr 1fr' : '1.65fr 1fr',
          gap: compact ? 8 : 12,
          marginTop: compact ? 8 : 12,
          height: compact ? 178 : 255,
        }}
      >
        <div
          style={{
            borderRadius: compact ? 12 : 16,
            border: `1px solid ${colors.line}`,
            padding: compact ? 13 : 18,
            background: 'rgba(255,255,255,0.018)',
          }}
        >
          <div style={{display: 'flex', justifyContent: 'space-between'}}>
            <div>
              <div style={{fontSize: compact ? 10 : 12, color: colors.textMuted}}>Delivered revenue</div>
              <div style={{fontSize: compact ? 22 : 30, fontWeight: 780, marginTop: 5}}>1.86M DZD</div>
            </div>
            <StatusPill label="Last 7 days" tone="muted" />
          </div>
          <div style={{height: compact ? 96 : 142, marginTop: compact ? 10 : 15}}>
            <Sparkline progress={chartProgress} color={colors.emeraldBright} />
          </div>
        </div>
        <div
          style={{
            borderRadius: compact ? 12 : 16,
            border: `1px solid ${colors.line}`,
            padding: compact ? 13 : 18,
            background: 'rgba(255,255,255,0.018)',
          }}
        >
          <div style={{fontSize: compact ? 10 : 12, color: colors.textMuted}}>Today’s flow</div>
          <div style={{display: 'grid', gap: compact ? 9 : 12, marginTop: compact ? 11 : 16}}>
            {[
              ['New orders', 148, colors.blue],
              ['Confirmed', 96, colors.emeraldBright],
              ['Out for delivery', 81, colors.amber],
              ['Delivered', 72, colors.magenta],
            ].map(([label, value, color], index) => {
              const width = interpolate(frame, [10 + index * 5, 55 + index * 5], [0, Number(value) / 1.48], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              });
              return (
                <div key={String(label)}>
                  <div style={{display: 'flex', justifyContent: 'space-between', fontSize: compact ? 9 : 11}}>
                    <span style={{color: colors.textSoft}}>{label}</span>
                    <strong>{value}</strong>
                  </div>
                  <div style={{height: compact ? 5 : 7, borderRadius: 99, background: 'rgba(255,255,255,0.06)', marginTop: 5, overflow: 'hidden'}}>
                    <div style={{width: `${width}%`, height: '100%', borderRadius: 99, background: String(color)}} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AppWindow>
  );
};

const orderColumns = [
  {
    title: 'New',
    tone: 'blue' as const,
    orders: [
      ['#10482', 'Nadia B.', 'Alger', '4,900 DZD'],
      ['#10483', 'Sofiane K.', 'Oran', '6,200 DZD'],
      ['#10484', 'Meriem A.', 'Sétif', '3,850 DZD'],
    ],
  },
  {
    title: 'Confirmed',
    tone: 'emerald' as const,
    orders: [
      ['#10475', 'Amine R.', 'Blida', '7,100 DZD'],
      ['#10477', 'Yasmine D.', 'Tlemcen', '5,300 DZD'],
    ],
  },
  {
    title: 'Shipping',
    tone: 'amber' as const,
    orders: [
      ['#10461', 'Walid M.', 'Béjaïa', '8,400 DZD'],
      ['#10465', 'Sara L.', 'Annaba', '4,200 DZD'],
    ],
  },
  {
    title: 'Delivered',
    tone: 'muted' as const,
    orders: [
      ['#10442', 'Rania H.', 'Alger', '5,750 DZD'],
      ['#10444', 'Kamel N.', 'Batna', '6,900 DZD'],
    ],
  },
];

export const OrderBoardPreview: React.FC<{compact?: boolean}> = ({compact = false}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <AppWindow active="Orders" compact={compact}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: compact ? 11 : 18}}>
        <div>
          <div style={{fontSize: compact ? 16 : 24, fontWeight: 760}}>Orders</div>
          <div style={{fontSize: compact ? 9 : 12, color: colors.textMuted, marginTop: 3}}>One flow from confirmation to delivery</div>
        </div>
        <div style={{display: 'flex', gap: 7}}>
          <StatusPill label="148 today" tone="blue" />
          <StatusPill label="72 delivered" tone="emerald" />
        </div>
      </div>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: compact ? 7 : 11, height: compact ? 297 : 421}}>
        {orderColumns.map((column, columnIndex) => (
          <div
            key={column.title}
            style={{
              borderRadius: compact ? 11 : 15,
              border: `1px solid ${colors.line}`,
              background: 'rgba(255,255,255,0.016)',
              padding: compact ? 8 : 11,
              overflow: 'hidden',
            }}
          >
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: compact ? '2px 2px 7px' : '3px 3px 10px'}}>
              <StatusPill label={column.title} tone={column.tone} />
              <span style={{fontSize: compact ? 9 : 11, color: colors.textMuted}}>{column.orders.length}</span>
            </div>
            <div style={{display: 'grid', gap: compact ? 6 : 8}}>
              {column.orders.map(([id, name, city, amount], cardIndex) => {
                const progress = spring({
                  frame: Math.max(0, frame - columnIndex * 5 - cardIndex * 3),
                  fps,
                  config: {damping: 20, stiffness: 125, mass: 0.75},
                });
                const nudge = columnIndex === 1 && cardIndex === 0
                  ? Math.sin(Math.max(0, frame - 38) / 11) * Math.max(0, 1 - (frame - 38) / 70)
                  : 0;
                return (
                  <div
                    key={id}
                    style={{
                      borderRadius: compact ? 9 : 12,
                      border: `1px solid ${colors.line}`,
                      background: 'linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.022))',
                      padding: compact ? 8 : 11,
                      opacity: progress,
                      transform: `translateY(${(1 - progress) * 18 + nudge * 3}px)`,
                      boxShadow: columnIndex === 1 && cardIndex === 0 ? '0 12px 30px rgba(52,209,123,0.08)' : undefined,
                    }}
                  >
                    <div style={{display: 'flex', justifyContent: 'space-between', fontSize: compact ? 8 : 10}}>
                      <strong style={{color: colors.text}}>{id}</strong>
                      <span style={{color: colors.textMuted}}>{city}</span>
                    </div>
                    <div style={{fontSize: compact ? 9 : 12, fontWeight: 680, marginTop: compact ? 6 : 8}}>{name}</div>
                    <div style={{fontSize: compact ? 8 : 10, color: colors.emeraldBright, marginTop: compact ? 4 : 6, fontWeight: 720}}>{amount}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </AppWindow>
  );
};

export const AutomationPreview: React.FC<{compact?: boolean}> = ({compact = false}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const nodes = [
    {title: 'Order confirmed', subtitle: 'Trigger', tone: colors.blue, x: 4},
    {title: 'Update stock', subtitle: 'Action', tone: colors.emeraldBright, x: 35},
    {title: 'Send message', subtitle: 'WhatsApp', tone: colors.amber, x: 66},
    {title: 'Notify team', subtitle: 'Done', tone: colors.magenta, x: 88},
  ];
  const progress = interpolate(frame, [18, 80], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });

  return (
    <AppWindow active="Automation" compact={compact}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <div>
          <div style={{fontSize: compact ? 16 : 24, fontWeight: 760}}>Automation canvas</div>
          <div style={{fontSize: compact ? 9 : 12, color: colors.textMuted, marginTop: 3}}>Turn repeatable work into a reliable flow</div>
        </div>
        <StatusPill label="Active" tone="emerald" />
      </div>
      <div
        style={{
          position: 'relative',
          marginTop: compact ? 13 : 22,
          height: compact ? 290 : 410,
          borderRadius: compact ? 13 : 18,
          border: `1px solid ${colors.line}`,
          overflow: 'hidden',
          backgroundImage:
            'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: compact ? '20px 20px' : '26px 26px',
          backgroundColor: 'rgba(0,0,0,0.12)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: compact ? '8%' : '8%',
            right: compact ? '8%' : '8%',
            top: '50%',
            height: 3,
            transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.07)',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress * 100}%`,
              background: `linear-gradient(90deg, ${colors.blue}, ${colors.emeraldBright}, ${colors.amber}, ${colors.magenta})`,
              boxShadow: '0 0 18px rgba(52,209,123,0.35)',
            }}
          />
        </div>
        {nodes.map((node, index) => {
          const enter = spring({
            frame: Math.max(0, frame - 6 - index * 12),
            fps,
            config: {damping: 17, stiffness: 120, mass: 0.8},
          });
          const pulse = index === Math.min(nodes.length - 1, Math.floor(progress * nodes.length))
            ? 1 + Math.sin(frame / 4) * 0.02
            : 1;
          return (
            <div
              key={node.title}
              style={{
                position: 'absolute',
                left: `${node.x}%`,
                top: '50%',
                width: compact ? 112 : 160,
                minHeight: compact ? 72 : 96,
                transform: `translate(-50%, -50%) scale(${(0.88 + enter * 0.12) * pulse})`,
                opacity: enter,
                borderRadius: compact ? 11 : 15,
                border: `1px solid ${node.tone}4a`,
                background: 'linear-gradient(155deg, rgba(35,40,37,0.98), rgba(21,24,22,0.98))',
                boxShadow: `0 16px 40px rgba(0,0,0,0.38), 0 0 24px ${node.tone}14`,
                padding: compact ? 10 : 14,
              }}
            >
              <div style={{width: compact ? 8 : 10, height: compact ? 8 : 10, borderRadius: '50%', background: node.tone, boxShadow: `0 0 14px ${node.tone}`}} />
              <div style={{fontSize: compact ? 10 : 13, fontWeight: 740, marginTop: compact ? 8 : 12}}>{node.title}</div>
              <div style={{fontSize: compact ? 8 : 10, color: colors.textMuted, marginTop: 4}}>{node.subtitle}</div>
            </div>
          );
        })}
        <div
          style={{
            position: 'absolute',
            left: compact ? 18 : 26,
            bottom: compact ? 14 : 22,
            display: 'flex',
            gap: compact ? 6 : 9,
          }}
        >
          <StatusPill label="Idempotent steps" tone="muted" />
          <StatusPill label="Clear status" tone="muted" />
          {!compact && <StatusPill label="Seller-controlled" tone="muted" />}
        </div>
      </div>
    </AppWindow>
  );
};

export const LanguageStrip: React.FC<{vertical?: boolean}> = ({vertical = false}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const languages = [
    {code: 'AR', label: 'العربية', dir: 'rtl' as const, fontFamily: fonts.arabic},
    {code: 'FR', label: 'Français', dir: 'ltr' as const, fontFamily: fonts.sans},
    {code: 'EN', label: 'English', dir: 'ltr' as const, fontFamily: fonts.sans},
  ];
  return (
    <div style={{display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: vertical ? 12 : 16}}>
      {languages.map((language, index) => (
        <div
          key={language.code}
          dir={language.dir}
          style={{
            minWidth: vertical ? 300 : 210,
            borderRadius: 18,
            border: `1px solid ${colors.lineStrong}`,
            background: 'rgba(255,255,255,0.035)',
            padding: '18px 21px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            fontFamily: language.fontFamily,
            ...rise(frame, fps, index * 6, 24),
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 13,
              display: 'grid',
              placeItems: 'center',
              color: colors.emeraldBright,
              background: 'rgba(52,209,123,0.10)',
              border: '1px solid rgba(52,209,123,0.17)',
              fontSize: 14,
              fontWeight: 800,
              fontFamily: fonts.sans,
            }}
          >
            {language.code}
          </div>
          <div>
            <div style={{fontSize: 20, fontWeight: 720}}>{language.label}</div>
            <div style={{fontSize: 11, color: colors.textMuted, marginTop: 4}}>Full interface</div>
          </div>
        </div>
      ))}
    </div>
  );
};

export const FeatureChip: React.FC<{
  label: string;
  delay?: number;
}> = ({label, delay = 0}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <div
      style={{
        borderRadius: 999,
        padding: '12px 17px',
        border: `1px solid ${colors.lineStrong}`,
        background: 'rgba(255,255,255,0.035)',
        color: colors.textSoft,
        fontSize: 16,
        fontWeight: 650,
        ...rise(frame, fps, delay, 16),
      }}
    >
      {label}
    </div>
  );
};

export const ClosingLockup: React.FC<{
  compact?: boolean;
  tagline?: string;
}> = ({compact = false, tagline = 'Run your COD operation with clarity.'}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        ...scaleIn(frame, fps, 2),
      }}
    >
      <Wordmark />
      <div
        style={{
          fontSize: compact ? 36 : 58,
          fontWeight: 760,
          letterSpacing: '-0.04em',
          marginTop: compact ? 27 : 36,
          maxWidth: compact ? 760 : 950,
          lineHeight: 1.06,
        }}
      >
        {tagline}
      </div>
      <div
        style={{
          marginTop: compact ? 20 : 27,
          borderRadius: 999,
          padding: compact ? '12px 18px' : '15px 24px',
          color: '#07180e',
          background: `linear-gradient(135deg, ${colors.emeraldBright}, ${colors.emerald})`,
          fontSize: compact ? 14 : 18,
          fontWeight: 800,
          boxShadow: shadows.emerald,
        }}
      >
        Windows-first · Local-first · Built for Algerian COD
      </div>
    </div>
  );
};
