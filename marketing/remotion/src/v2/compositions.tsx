import React from 'react';
import {AbsoluteFill, Audio, staticFile} from 'remotion';
import {linearTiming, TransitionSeries} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import {wipe} from '@remotion/transitions/wipe';
import {
  PremiumAutomation,
  PremiumBrandReveal,
  PremiumColdOpen,
  PremiumCommandCenter,
  PremiumDelivery,
  PremiumFinale,
  PremiumInbox,
  PremiumLanguage,
  PremiumLocalFirst,
  PremiumOrders,
  VerticalDashboard,
  VerticalHook,
  VerticalLanguageFinale,
  VerticalOrderMove,
} from './scenes';

export const PREMIUM_LAUNCH_DURATION = 1800;
export const PREMIUM_SOCIAL_DURATION = 900;
export const PREMIUM_VERTICAL_DURATION = 450;
export const PREMIUM_DEMO_DURATION = 2700;

const premiumTiming = linearTiming({durationInFrames: 18});
const socialTiming = linearTiming({durationInFrames: 15});
const fadePresentation = fade();
const slideFromRight = slide({direction: 'from-right'});
const slideFromLeft = slide({direction: 'from-left'});
const wipeFromRight = wipe({direction: 'from-right'});
const wipeFromBottom = wipe({direction: 'from-bottom'});

const PremiumAudio: React.FC<{src: string; volume?: number}> = ({src, volume = 0.56}) => (
  <Audio src={staticFile(`audio/${src}`)} volume={volume} />
);

export const PremiumLaunch60: React.FC = () => (
  <AbsoluteFill>
    <PremiumAudio src="premium-launch-60.wav" volume={0.58} />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={150}><PremiumColdOpen /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipeFromRight} timing={premiumTiming} />
      <TransitionSeries.Sequence durationInFrames={190}><PremiumBrandReveal /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fadePresentation} timing={premiumTiming} />
      <TransitionSeries.Sequence durationInFrames={270}><PremiumCommandCenter /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slideFromRight} timing={premiumTiming} />
      <TransitionSeries.Sequence durationInFrames={260}><PremiumOrders /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipeFromBottom} timing={premiumTiming} />
      <TransitionSeries.Sequence durationInFrames={240}><PremiumInbox /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slideFromLeft} timing={premiumTiming} />
      <TransitionSeries.Sequence durationInFrames={230}><PremiumDelivery /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipeFromRight} timing={premiumTiming} />
      <TransitionSeries.Sequence durationInFrames={220}><PremiumAutomation /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fadePresentation} timing={premiumTiming} />
      <TransitionSeries.Sequence durationInFrames={220}><PremiumLocalFirst /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slideFromRight} timing={premiumTiming} />
      <TransitionSeries.Sequence durationInFrames={164}><PremiumFinale /></TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);

export const PremiumSocial30: React.FC = () => (
  <AbsoluteFill>
    <PremiumAudio src="premium-social-30.wav" volume={0.6} />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={90}><PremiumColdOpen /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipeFromRight} timing={socialTiming} />
      <TransitionSeries.Sequence durationInFrames={110}><PremiumBrandReveal /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fadePresentation} timing={socialTiming} />
      <TransitionSeries.Sequence durationInFrames={160}><PremiumCommandCenter /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slideFromRight} timing={socialTiming} />
      <TransitionSeries.Sequence durationInFrames={160}><PremiumOrders /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipeFromBottom} timing={socialTiming} />
      <TransitionSeries.Sequence durationInFrames={150}><PremiumInbox /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slideFromLeft} timing={socialTiming} />
      <TransitionSeries.Sequence durationInFrames={150}><PremiumAutomation /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fadePresentation} timing={socialTiming} />
      <TransitionSeries.Sequence durationInFrames={170}><PremiumFinale /></TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);

export const PremiumVertical15: React.FC = () => (
  <AbsoluteFill>
    <PremiumAudio src="premium-vertical-15.wav" volume={0.62} />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={75}><VerticalHook /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipeFromBottom} timing={socialTiming} />
      <TransitionSeries.Sequence durationInFrames={100}><VerticalDashboard /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slideFromRight} timing={socialTiming} />
      <TransitionSeries.Sequence durationInFrames={110}><VerticalOrderMove /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fadePresentation} timing={socialTiming} />
      <TransitionSeries.Sequence durationInFrames={100}><VerticalLanguageFinale /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipeFromRight} timing={socialTiming} />
      <TransitionSeries.Sequence durationInFrames={125}><PremiumFinale compact /></TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);

export const PremiumDemo90: React.FC = () => (
  <AbsoluteFill>
    <PremiumAudio src="premium-demo-90.wav" volume={0.52} />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={180}><PremiumColdOpen /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipeFromRight} timing={premiumTiming} />
      <TransitionSeries.Sequence durationInFrames={220}><PremiumBrandReveal /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fadePresentation} timing={premiumTiming} />
      <TransitionSeries.Sequence durationInFrames={330}><PremiumCommandCenter demo /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slideFromRight} timing={premiumTiming} />
      <TransitionSeries.Sequence durationInFrames={330}><PremiumOrders demo /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipeFromBottom} timing={premiumTiming} />
      <TransitionSeries.Sequence durationInFrames={300}><PremiumInbox /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slideFromLeft} timing={premiumTiming} />
      <TransitionSeries.Sequence durationInFrames={300}><PremiumDelivery /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipeFromRight} timing={premiumTiming} />
      <TransitionSeries.Sequence durationInFrames={300}><PremiumAutomation /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fadePresentation} timing={premiumTiming} />
      <TransitionSeries.Sequence durationInFrames={260}><PremiumLocalFirst /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slideFromRight} timing={premiumTiming} />
      <TransitionSeries.Sequence durationInFrames={240}><PremiumLanguage /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipeFromBottom} timing={premiumTiming} />
      <TransitionSeries.Sequence durationInFrames={220}><PremiumCommandCenter demo /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fadePresentation} timing={premiumTiming} />
      <TransitionSeries.Sequence durationInFrames={200}><PremiumFinale /></TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
