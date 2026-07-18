import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {premiumFonts} from '../v2/fonts';
import {
  V4_DEMO,
  V4_HERO,
  V4_LOOP,
  V4_SOCIAL,
  V4_VERTICAL,
  V4Demo75 as BaseDemo75,
  V4Hero48 as BaseHero48,
  V4LandingLoop8 as BaseLandingLoop8,
  V4Social20 as BaseSocial20,
  V4Vertical12 as BaseVertical12,
} from './film';
import {V4, ease, fade} from './design';

export {V4_DEMO, V4_HERO, V4_LOOP, V4_SOCIAL, V4_VERTICAL};

const EditorialBridge: React.FC<{duration: number; vertical?: boolean}> = ({duration, vertical = false}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const p = ease(frame, 0, Math.max(1, duration - 5));
  const opacity = fade(frame, duration, 5);
  const lineWidth = interpolate(p, [0, 1], [0, vertical ? height * 0.76 : width * 0.72]);

  return (
    <AbsoluteFill
      style={{
        opacity,
        overflow: 'hidden',
        background: 'linear-gradient(120deg,#F4F0E6 0%,#E4DED0 100%)',
        color: V4.black,
        fontFamily: premiumFonts.sans,
        zIndex: 80,
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: vertical ? width * 1.4 : width * 0.62,
          height: vertical ? width * 1.4 : width * 0.62,
          borderRadius: '50%',
          left: vertical ? -width * 0.2 : width * 0.17,
          top: vertical ? height * 0.16 : -height * 0.55,
          background: 'radial-gradient(circle,rgba(107,255,149,.55),transparent 68%)',
          filter: 'blur(28px)',
          transform: `scale(${0.72 + p * 0.38})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          padding: vertical ? 70 : 0,
        }}
      >
        <div style={{textAlign: 'center', transform: `translateY(${(1 - p) * 34}px)`}}>
          <div style={{fontSize: vertical ? 19 : 15, letterSpacing: 4, fontWeight: 900, color: V4.greenDeep}}>
            SAHELFLOW SIGNAL
          </div>
          <div
            style={{
              marginTop: 20,
              fontSize: vertical ? 72 : 82,
              lineHeight: 0.94,
              letterSpacing: vertical ? -4 : -5.5,
              fontWeight: 900,
            }}
          >
            ONE ORDER.<br />ONE CONTROLLED JOURNEY.
          </div>
          <div
            style={{
              position: 'relative',
              margin: vertical ? '42px auto 0' : '34px auto 0',
              width: vertical ? 18 : lineWidth,
              height: vertical ? lineWidth : 7,
              borderRadius: 999,
              background: V4.greenDeep,
              boxShadow: '0 0 38px rgba(11,174,91,.35)',
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const SystemHeaderMask: React.FC<{duration: number; vertical?: boolean}> = ({duration, vertical = false}) => {
  const frame = useCurrentFrame();
  const opacity = fade(frame, duration, 8);
  const p = ease(frame, 2, 22);

  return (
    <AbsoluteFill style={{opacity, pointerEvents: 'none', zIndex: 70}}>
      <div
        style={{
          position: 'absolute',
          inset: '0 0 auto',
          height: 330,
          background: vertical
            ? 'linear-gradient(to bottom,rgba(3,5,4,.98) 0%,rgba(3,5,4,.95) 66%,transparent 100%)'
            : 'linear-gradient(to bottom,rgba(3,5,4,.99) 0%,rgba(3,5,4,.97) 62%,rgba(3,5,4,.70) 82%,transparent 100%)',
          borderBottom: '1px solid rgba(107,255,149,.14)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: vertical ? 55 : 95,
          right: vertical ? 55 : 95,
          top: vertical ? 58 : 44,
          textAlign: 'center',
          color: V4.white,
          fontFamily: premiumFonts.sans,
          transform: `translateY(${(1 - p) * 24}px)`,
          opacity: p,
        }}
      >
        <div style={{fontSize: vertical ? 16 : 14, fontWeight: 900, letterSpacing: 4, color: V4.green}}>
          ONE OPERATING FLOW
        </div>
        <div
          style={{
            marginTop: vertical ? 20 : 14,
            fontSize: vertical ? 58 : 62,
            lineHeight: 0.96,
            letterSpacing: vertical ? -3.5 : -4,
            fontWeight: 900,
          }}
        >
          {vertical ? 'Not more tools. One system.' : 'Not more tools. One operating flow.'}
        </div>
        {!vertical && (
          <div style={{marginTop: 16, fontSize: 18, color: '#AEB8B2'}}>
            Conversation, order, stock, delivery, automation, and decisions move together.
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

export const V4Hero48: React.FC = () => (
  <AbsoluteFill>
    <BaseHero48 />
    <Sequence from={72} durationInFrames={36}><EditorialBridge duration={36} /></Sequence>
    <Sequence from={980} durationInFrames={300}><SystemHeaderMask duration={300} /></Sequence>
  </AbsoluteFill>
);

export const V4Social20: React.FC = () => (
  <AbsoluteFill>
    <BaseSocial20 />
    <Sequence from={45} durationInFrames={30}><EditorialBridge duration={30} /></Sequence>
    <Sequence from={385} durationInFrames={130}><SystemHeaderMask duration={130} /></Sequence>
  </AbsoluteFill>
);

export const V4Vertical12: React.FC = () => (
  <AbsoluteFill>
    <BaseVertical12 />
    <Sequence from={37} durationInFrames={27}><EditorialBridge duration={27} vertical /></Sequence>
    <Sequence from={212} durationInFrames={88}><SystemHeaderMask duration={88} vertical /></Sequence>
  </AbsoluteFill>
);

export const V4Demo75: React.FC = () => (
  <AbsoluteFill>
    <BaseDemo75 />
    <Sequence from={86} durationInFrames={42}><EditorialBridge duration={42} /></Sequence>
    <Sequence from={1565} durationInFrames={470}><SystemHeaderMask duration={470} /></Sequence>
  </AbsoluteFill>
);

export const V4LandingLoop8: React.FC = () => (
  <AbsoluteFill>
    <BaseLandingLoop8 />
    <Sequence from={0} durationInFrames={120}><SystemHeaderMask duration={120} /></Sequence>
  </AbsoluteFill>
);
