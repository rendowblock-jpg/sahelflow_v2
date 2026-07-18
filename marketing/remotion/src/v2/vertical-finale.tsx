import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {eased, floatNoise, premiumColors, premiumShadow, springIn} from './design';
import {premiumFonts} from './fonts';
import {GlassPanel, ParticleField, PremiumStage, StatusPill, Wordmark} from './primitives';

const CapabilityCard: React.FC<{
  label: string;
  detail: string;
  icon: string;
  color: string;
  delay: number;
  rotate: number;
}> = ({label, detail, icon, color, delay, rotate}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: {damping: 18, stiffness: 112, mass: 0.82},
    durationInFrames: 34,
  });
  const float = floatNoise(`vertical-finale-${label}`, frame, 8, 0.012);

  return (
    <GlassPanel
      glow={color}
      style={{
        height: 150,
        padding: 22,
        display: 'flex',
        alignItems: 'center',
        gap: 19,
        borderRadius: 25,
        transform: `translateY(${(1 - enter) * 70 + float}px) scale(${0.86 + enter * 0.14}) rotate(${rotate}deg)`,
        opacity: enter,
      }}
    >
      <div
        style={{
          width: 68,
          height: 68,
          flex: '0 0 auto',
          borderRadius: 22,
          display: 'grid',
          placeItems: 'center',
          background: `${color}1c`,
          border: `1px solid ${color}42`,
          color,
          fontSize: 29,
          boxShadow: `0 0 28px ${color}1c`,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{fontSize: 26, fontWeight: 850, letterSpacing: -1.15}}>{label}</div>
        <div style={{fontSize: 15, lineHeight: 1.42, color: premiumColors.textSoft, marginTop: 7}}>{detail}</div>
      </div>
    </GlassPanel>
  );
};

export const VerticalPremiumFinale: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, height} = useVideoConfig();
  const brand = springIn(frame, fps, 0, 17);
  const headline = springIn(frame, fps, 8, 18);
  const footer = eased(frame, 49, 24);
  const halo = interpolate(Math.sin(frame * 0.035), [-1, 1], [0.75, 1.1]);

  return (
    <PremiumStage accent="emerald" intensity={1.55} grid={false}>
      <ParticleField count={86} color={premiumColors.emeraldBright} depth={1.25} />
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 120,
          width: 720,
          height: 720,
          borderRadius: '50%',
          transform: `translateX(-50%) scale(${halo})`,
          background: 'radial-gradient(circle, rgba(53,233,143,0.18), rgba(53,233,143,0.035) 42%, transparent 70%)',
          filter: 'blur(8px)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 64,
          right: 64,
          top: 108,
          display: 'flex',
          justifyContent: 'center',
          opacity: brand,
          transform: `translateY(${(1 - brand) * 30}px) scale(${0.88 + brand * 0.12})`,
        }}
      >
        <Wordmark size={70} />
      </div>

      <div
        style={{
          position: 'absolute',
          left: 54,
          right: 54,
          top: 280,
          textAlign: 'center',
          transform: `translateY(${(1 - headline) * 58}px) scale(${0.9 + headline * 0.1})`,
          opacity: headline,
        }}
      >
        <div style={{fontSize: 88, lineHeight: 0.94, letterSpacing: -5.8, fontWeight: 880, textWrap: 'balance'}}>
          One operating system.
          <br />
          <span style={{color: premiumColors.emeraldBright, textShadow: premiumShadow.glow}}>Built for COD.</span>
        </div>
        <div style={{fontSize: 22, color: premiumColors.textSoft, lineHeight: 1.45, margin: '30px auto 0', maxWidth: 820}}>
          Move from conversation to order, delivery, automation, and insight without losing operational control.
        </div>
      </div>

      <div style={{position: 'absolute', left: 62, right: 62, top: 760, display: 'flex', flexDirection: 'column', gap: 20}}>
        <CapabilityCard label="Orders that move" detail="A visible state and action path for every COD order." icon="▦" color={premiumColors.blue} delay={20} rotate={-1.2} />
        <CapabilityCard label="Delivery you can see" detail="Exceptions, courier movement, and COD visibility in one flow." icon="↗" color={premiumColors.magenta} delay={28} rotate={1.1} />
        <CapabilityCard label="Automation you control" detail="Repeatable rules, dry runs, and seller-readable outcomes." icon="⌁" color={premiumColors.amber} delay={36} rotate={-0.7} />
      </div>

      <div
        style={{
          position: 'absolute',
          left: 58,
          right: 58,
          bottom: 86,
          opacity: footer,
          transform: `translateY(${(1 - footer) * 22}px)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 23,
        }}
      >
        <div style={{display: 'flex', justifyContent: 'center', gap: 9, flexWrap: 'wrap'}}>
          <StatusPill color={premiumColors.emerald}>Windows-first</StatusPill>
          <StatusPill color={premiumColors.blue}>Local-first</StatusPill>
          <StatusPill color={premiumColors.magenta}>AR · FR · EN</StatusPill>
        </div>
        <div style={{fontFamily: premiumFonts.mono, color: premiumColors.muted, fontSize: 12, letterSpacing: 2.1}}>SAHELFLOW · ALGERIAN COD OPERATIONS</div>
      </div>

      <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.max(5, height * 0.004), background: `linear-gradient(90deg, transparent, ${premiumColors.emeraldBright}, transparent)`, boxShadow: `0 0 28px ${premiumColors.emerald}`}} />
    </PremiumStage>
  );
};
