import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import {
  AutomationScene,
  BrandReveal,
  ChaosOpening,
  CommandCenterScene,
  ConversationScene,
  DeliveryScene,
  DemoChapterCard,
  FinaleScene,
  IntelligenceScene,
  LocalMultilingualScene,
  OrderFlowScene,
  ThesisReveal,
  VerticalDashboardScene,
  VerticalLocalScene,
  VerticalOrdersScene,
} from './scenes';

export const V3_HERO_DURATION = 1950;
export const V3_SOCIAL_DURATION = 900;
export const V3_VERTICAL_DURATION = 450;
export const V3_DEMO_DURATION = 3600;
export const V3_LOOP_DURATION = 360;

const Score: React.FC<{file: string; volume?: number}> = ({file, volume = 0.72}) => (
  <Audio src={staticFile(`audio/${file}`)} volume={volume} />
);

export const V3Hero65: React.FC = () => (
  <AbsoluteFill>
    <Score file="v3-hero-65.wav" volume={0.74} />
    <Sequence from={0} durationInFrames={180}><ChaosOpening duration={180} /></Sequence>
    <Sequence from={150} durationInFrames={180}><ThesisReveal duration={180} /></Sequence>
    <Sequence from={300} durationInFrames={180}><BrandReveal duration={180} /></Sequence>
    <Sequence from={450} durationInFrames={300}><CommandCenterScene duration={300} /></Sequence>
    <Sequence from={720} durationInFrames={300}><OrderFlowScene duration={300} /></Sequence>
    <Sequence from={990} durationInFrames={240}><ConversationScene duration={240} /></Sequence>
    <Sequence from={1200} durationInFrames={240}><DeliveryScene duration={240} /></Sequence>
    <Sequence from={1410} durationInFrames={240}><AutomationScene duration={240} /></Sequence>
    <Sequence from={1620} durationInFrames={210}><LocalMultilingualScene duration={210} /></Sequence>
    <Sequence from={1800} durationInFrames={150}><FinaleScene duration={150} /></Sequence>
  </AbsoluteFill>
);

export const V3Social30: React.FC = () => (
  <AbsoluteFill>
    <Score file="v3-social-30.wav" volume={0.76} />
    <Sequence from={0} durationInFrames={90}><ChaosOpening duration={90} /></Sequence>
    <Sequence from={72} durationInFrames={120}><BrandReveal duration={120} /></Sequence>
    <Sequence from={174} durationInFrames={186}><CommandCenterScene duration={186} /></Sequence>
    <Sequence from={336} durationInFrames={186}><OrderFlowScene duration={186} /></Sequence>
    <Sequence from={498} durationInFrames={156}><ConversationScene duration={156} /></Sequence>
    <Sequence from={630} durationInFrames={156}><AutomationScene duration={156} /></Sequence>
    <Sequence from={762} durationInFrames={138}><FinaleScene duration={138} /></Sequence>
  </AbsoluteFill>
);

export const V3Vertical15: React.FC = () => (
  <AbsoluteFill>
    <Score file="v3-vertical-15.wav" volume={0.78} />
    <Sequence from={0} durationInFrames={75}><ChaosOpening duration={75} vertical /></Sequence>
    <Sequence from={60} durationInFrames={120}><VerticalDashboardScene duration={120} /></Sequence>
    <Sequence from={165} durationInFrames={120}><VerticalOrdersScene duration={120} /></Sequence>
    <Sequence from={270} durationInFrames={105}><VerticalLocalScene duration={105} /></Sequence>
    <Sequence from={360} durationInFrames={90}><FinaleScene duration={90} vertical /></Sequence>
  </AbsoluteFill>
);

export const V3Demo120: React.FC = () => (
  <AbsoluteFill>
    <Score file="v3-demo-120.wav" volume={0.66} />
    <Sequence from={0} durationInFrames={180}><ChaosOpening duration={180} /></Sequence>
    <Sequence from={150} durationInFrames={150}><ThesisReveal duration={150} /></Sequence>
    <Sequence from={270} durationInFrames={150}><BrandReveal duration={150} /></Sequence>

    <Sequence from={390} durationInFrames={90}><DemoChapterCard index={0} duration={90} /></Sequence>
    <Sequence from={450} durationInFrames={420}><CommandCenterScene duration={420} demo /></Sequence>

    <Sequence from={840} durationInFrames={90}><DemoChapterCard index={1} duration={90} /></Sequence>
    <Sequence from={900} durationInFrames={420}><OrderFlowScene duration={420} demo /></Sequence>

    <Sequence from={1290} durationInFrames={90}><DemoChapterCard index={2} duration={90} /></Sequence>
    <Sequence from={1350} durationInFrames={360}><ConversationScene duration={360} demo /></Sequence>

    <Sequence from={1680} durationInFrames={90}><DemoChapterCard index={3} duration={90} /></Sequence>
    <Sequence from={1740} durationInFrames={360}><DeliveryScene duration={360} demo /></Sequence>

    <Sequence from={2070} durationInFrames={90}><DemoChapterCard index={4} duration={90} /></Sequence>
    <Sequence from={2130} durationInFrames={360}><AutomationScene duration={360} demo /></Sequence>

    <Sequence from={2460} durationInFrames={90}><DemoChapterCard index={5} duration={90} /></Sequence>
    <Sequence from={2520} durationInFrames={420}><IntelligenceScene duration={420} demo /></Sequence>

    <Sequence from={2910} durationInFrames={300}><LocalMultilingualScene duration={300} /></Sequence>
    <Sequence from={3180} durationInFrames={420}><FinaleScene duration={420} /></Sequence>
  </AbsoluteFill>
);

export const V3LandingLoop12: React.FC = () => (
  <AbsoluteFill>
    <Sequence from={0} durationInFrames={180}><CommandCenterScene duration={180} /></Sequence>
    <Sequence from={150} durationInFrames={150}><OrderFlowScene duration={150} /></Sequence>
    <Sequence from={270} durationInFrames={90}><FinaleScene duration={90} /></Sequence>
  </AbsoluteFill>
);
