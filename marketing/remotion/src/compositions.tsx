import React, {type CSSProperties, type ReactNode} from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  AutomationPreview,
  ClosingLockup,
  DashboardPreview,
  Eyebrow,
  FeatureChip,
  Headline,
  LanguageStrip,
  OrderBoardPreview,
  SceneCanvas,
  StatusPill,
  Subheadline,
  Wordmark,
  rise,
  scaleIn,
  sceneOpacity,
} from './components';
import {colors, fonts, rounded, shadows} from './theme';

const Scene: React.FC<{
  duration: number;
  children: ReactNode;
  glow?: 'emerald' | 'blue' | 'magenta' | 'amber';
  style?: CSSProperties;
}> = ({duration, children, glow, style}) => {
  const frame = useCurrentFrame();
  return (
    <SceneCanvas glow={glow} style={{opacity: sceneOpacity(frame, duration), ...style}}>
      {children}
    </SceneCanvas>
  );
};

const FloatingOrder: React.FC<{
  delay: number;
  x: number;
  y: number;
  rotate: number;
  id: string;
  customer: string;
  status: string;
  tone: 'blue' | 'amber' | 'emerald' | 'red';
}> = ({delay, x, y, rotate, id, customer, status, tone}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: {damping: 16, stiffness: 105, mass: 0.85},
  });
  const drift = Math.sin((frame + delay) / 17) * 7;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 300,
        borderRadius: 18,
        border: `1px solid ${colors.lineStrong}`,
        background: 'linear-gradient(145deg, rgba(40,45,42,0.96), rgba(22,25,23,0.98))',
        boxShadow: shadows.float,
        padding: 20,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 70 + drift}px) rotate(${rotate}deg) scale(${0.92 + enter * 0.08})`,
      }}
    >
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <strong style={{fontSize: 16}}>{id}</strong>
        <StatusPill label={status} tone={tone} />
      </div>
      <div style={{fontSize: 22, fontWeight: 720, marginTop: 19}}>{customer}</div>
      <div style={{fontSize: 13, color: colors.textMuted, marginTop: 8}}>COD order · Algeria</div>
    </div>
  );
};

const ChaosScene: React.FC<{duration: number; vertical?: boolean}> = ({duration, vertical = false}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const copy = rise(frame, fps, 4, 44);
  const positions = vertical
    ? [
        {x: 70, y: 470, rotate: -4},
        {x: 440, y: 590, rotate: 5},
        {x: 120, y: 780, rotate: 3},
      ]
    : [
        {x: 1160, y: 160, rotate: 5},
        {x: 1460, y: 470, rotate: -4},
        {x: 1070, y: 720, rotate: 3},
      ];
  return (
    <Scene duration={duration} glow="amber">
      <div
        style={{
          position: 'absolute',
          left: vertical ? 68 : 112,
          top: vertical ? 150 : 230,
          width: vertical ? 930 : 960,
          ...copy,
        }}
      >
        <Eyebrow>Algerian COD operations</Eyebrow>
        <div style={{marginTop: 30}}>
          <Headline size={vertical ? 89 : 104} width={vertical ? 920 : 990}>
            Orders should not feel like <span style={{color: colors.amber}}>chaos.</span>
          </Headline>
        </div>
        <div style={{marginTop: 30}}>
          <Subheadline size={vertical ? 30 : 30} width={vertical ? 860 : 760}>
            Messages, spreadsheets, stock checks and delivery follow-ups should move as one operation.
          </Subheadline>
        </div>
      </div>
      {positions.map((position, index) => (
        <FloatingOrder
          key={index}
          delay={10 + index * 7}
          x={position.x}
          y={position.y}
          rotate={position.rotate}
          id={['#10482', '#10483', '#10484'][index]}
          customer={['Nadia B.', 'Sofiane K.', 'Meriem A.'][index]}
          status={['Needs confirmation', 'Stock check', 'Courier update'][index]}
          tone={['amber', 'red', 'blue'][index] as 'amber' | 'red' | 'blue'}
        />
      ))}
    </Scene>
  );
};

const RevealScene: React.FC<{duration: number; vertical?: boolean}> = ({duration, vertical = false}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const mark = scaleIn(frame, fps, 2);
  const lineWidth = interpolate(frame, [10, 52], [0, vertical ? 820 : 1100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  return (
    <Scene duration={duration} glow="emerald">
      <AbsoluteFill style={{display: 'grid', placeItems: 'center', padding: vertical ? 70 : 120}}>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', ...mark}}>
          <Wordmark />
          <div
            style={{
              width: lineWidth,
              height: 1,
              marginTop: 44,
              background: `linear-gradient(90deg, transparent, ${colors.emeraldBright}, transparent)`,
              boxShadow: '0 0 20px rgba(52,209,123,0.35)',
            }}
          />
          <div
            style={{
              marginTop: 42,
              fontSize: vertical ? 55 : 66,
              fontWeight: 760,
              letterSpacing: '-0.045em',
              maxWidth: vertical ? 900 : 1220,
              lineHeight: 1.08,
              ...rise(frame, fps, 14, 30),
            }}
          >
            One command center for the entire COD flow.
          </div>
          <div style={{marginTop: 26, ...rise(frame, fps, 22, 20)}}>
            <Subheadline size={vertical ? 28 : 29} width={vertical ? 800 : 960} align="center">
              Orders, inventory, customers, delivery, WhatsApp workflows, automation and analytics—organized around the seller’s operation.
            </Subheadline>
          </div>
        </div>
      </AbsoluteFill>
    </Scene>
  );
};

const ProductScene: React.FC<{
  duration: number;
  eyebrow: string;
  headline: ReactNode;
  description: string;
  preview: ReactNode;
  glow?: 'emerald' | 'blue' | 'magenta' | 'amber';
  reverse?: boolean;
}> = ({duration, eyebrow, headline, description, preview, glow = 'emerald', reverse = false}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const textStyle = rise(frame, fps, 3, 42);
  const previewStyle = scaleIn(frame, fps, 8);
  return (
    <Scene duration={duration} glow={glow}>
      <div
        style={{
          position: 'absolute',
          inset: '86px 92px',
          display: 'grid',
          gridTemplateColumns: reverse ? '1.25fr 0.78fr' : '0.78fr 1.25fr',
          alignItems: 'center',
          gap: 74,
        }}
      >
        <div style={{order: reverse ? 2 : 1, ...textStyle}}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <div style={{marginTop: 28}}>
            <Headline size={74} width={670}>{headline}</Headline>
          </div>
          <div style={{marginTop: 28}}>
            <Subheadline size={27} width={620}>{description}</Subheadline>
          </div>
        </div>
        <div style={{order: reverse ? 1 : 2, height: 810, ...previewStyle}}>{preview}</div>
      </div>
    </Scene>
  );
};

const FeatureSystemScene: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const features = [
    ['Orders', 'A single operational flow', colors.blue],
    ['Inventory', 'Stock movement stays visible', colors.emeraldBright],
    ['Customers', 'History travels with every order', colors.magenta],
    ['Delivery', 'Courier status stays connected', colors.amber],
    ['WhatsApp', 'Seller-controlled communication', colors.cyan],
    ['Analytics', 'Operational signals, not noise', colors.emeraldBright],
  ];
  return (
    <Scene duration={duration} glow="magenta">
      <div style={{position: 'absolute', inset: '92px 112px'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end'}}>
          <div style={rise(frame, fps, 2, 32)}>
            <Eyebrow>Connected operation</Eyebrow>
            <div style={{marginTop: 25}}>
              <Headline size={78} width={1050}>Every part of the business sees the same flow.</Headline>
            </div>
          </div>
          <div style={{paddingBottom: 8, ...rise(frame, fps, 12, 20)}}>
            <StatusPill label="Local operational authority" tone="emerald" />
          </div>
        </div>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22, marginTop: 70}}>
          {features.map(([title, description, tone], index) => {
            const enter = spring({
              frame: Math.max(0, frame - 8 - index * 5),
              fps,
              config: {damping: 18, stiffness: 112, mass: 0.82},
            });
            return (
              <div
                key={title}
                style={{
                  minHeight: 250,
                  borderRadius: 24,
                  border: `1px solid ${String(tone)}38`,
                  background: 'linear-gradient(145deg, rgba(255,255,255,0.052), rgba(255,255,255,0.016))',
                  padding: 30,
                  opacity: enter,
                  transform: `translateY(${(1 - enter) * 34}px) scale(${0.96 + enter * 0.04})`,
                  boxShadow: '0 22px 60px rgba(0,0,0,0.24)',
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 15,
                    display: 'grid',
                    placeItems: 'center',
                    color: String(tone),
                    background: `${String(tone)}16`,
                    border: `1px solid ${String(tone)}28`,
                    fontSize: 24,
                    fontWeight: 800,
                  }}
                >
                  {index + 1}
                </div>
                <div style={{fontSize: 31, fontWeight: 760, marginTop: 28, letterSpacing: '-0.03em'}}>{title}</div>
                <div style={{fontSize: 20, lineHeight: 1.42, color: colors.textSoft, marginTop: 13}}>{description}</div>
                <div style={{height: 2, marginTop: 28, background: `linear-gradient(90deg, ${String(tone)}, transparent)`, opacity: 0.55}} />
              </div>
            );
          })}
        </div>
      </div>
    </Scene>
  );
};

const LocalFirstScene: React.FC<{duration: number; vertical?: boolean}> = ({duration, vertical = false}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <Scene duration={duration} glow="blue">
      <div
        style={{
          position: 'absolute',
          inset: vertical ? '130px 68px' : '105px 112px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: vertical ? 'flex-start' : 'center',
          justifyContent: 'center',
          textAlign: vertical ? 'left' : 'center',
        }}
      >
        <div style={rise(frame, fps, 2, 34)}>
          <Eyebrow>Built around the real environment</Eyebrow>
        </div>
        <div style={{marginTop: 28, ...rise(frame, fps, 7, 40)}}>
          <Headline size={vertical ? 78 : 86} width={vertical ? 930 : 1350} align={vertical ? 'left' : 'center'}>
            Windows-first. Local-first. Ready for Arabic, French and English.
          </Headline>
        </div>
        <div style={{marginTop: 30, ...rise(frame, fps, 12, 24)}}>
          <Subheadline size={vertical ? 29 : 30} width={vertical ? 880 : 1040} align={vertical ? 'left' : 'center'}>
            SahelFlow is designed for Algerian COD teams who need a clear desktop operation, multilingual workflows and practical control over their data.
          </Subheadline>
        </div>
        <div style={{marginTop: vertical ? 52 : 58, width: '100%', display: 'flex', justifyContent: vertical ? 'flex-start' : 'center'}}>
          <LanguageStrip vertical={vertical} />
        </div>
      </div>
    </Scene>
  );
};

const ClosingScene: React.FC<{duration: number; compact?: boolean; tagline?: string}> = ({duration, compact, tagline}) => (
  <Scene duration={duration} glow="emerald">
    <AbsoluteFill style={{display: 'grid', placeItems: 'center', padding: 70}}>
      <ClosingLockup compact={compact} tagline={tagline} />
    </AbsoluteFill>
  </Scene>
);

const VerticalDashboardScene: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <Scene duration={duration} glow="emerald">
      <div style={{position: 'absolute', inset: '92px 60px', display: 'flex', flexDirection: 'column'}}>
        <div style={rise(frame, fps, 2, 30)}>
          <Eyebrow>One live command center</Eyebrow>
          <div style={{marginTop: 22}}>
            <Headline size={71} width={930}>See the operation. Move the work.</Headline>
          </div>
        </div>
        <div
          style={{
            width: 940,
            height: 600,
            marginTop: 54,
            alignSelf: 'center',
            ...scaleIn(frame, fps, 8),
          }}
        >
          <DashboardPreview compact />
        </div>
        <div style={{display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 42}}>
          {['Orders', 'Inventory', 'Customers', 'Delivery', 'WhatsApp', 'Analytics'].map((label, index) => (
            <FeatureChip key={label} label={label} delay={16 + index * 3} />
          ))}
        </div>
      </div>
    </Scene>
  );
};

const DemoIntro: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <Scene duration={duration} glow="emerald">
      <div style={{position: 'absolute', inset: '90px 112px', display: 'grid', gridTemplateColumns: '0.8fr 1.2fr', gap: 80, alignItems: 'center'}}>
        <div style={rise(frame, fps, 2, 42)}>
          <Wordmark />
          <div style={{marginTop: 46}}>
            <Headline size={76} width={720}>A practical operating system for Algerian COD sellers.</Headline>
          </div>
          <div style={{marginTop: 30}}>
            <Subheadline size={27} width={660}>
              This product walkthrough shows how SahelFlow organizes the seller’s daily operation from new order to delivered cash.
            </Subheadline>
          </div>
        </div>
        <div style={{height: 790, ...scaleIn(frame, fps, 8)}}>
          <DashboardPreview compact />
        </div>
      </div>
    </Scene>
  );
};

const WorkflowSummaryScene: React.FC<{duration: number}> = ({duration}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const steps = [
    ['01', 'Capture', 'Bring the order into one operational queue.'],
    ['02', 'Confirm', 'Track customer contact and confirmation state.'],
    ['03', 'Fulfil', 'Keep stock and preparation visible.'],
    ['04', 'Deliver', 'Follow courier movement and outcomes.'],
    ['05', 'Learn', 'Use delivery, revenue and return signals.'],
  ];
  return (
    <Scene duration={duration} glow="blue">
      <div style={{position: 'absolute', inset: '100px 112px'}}>
        <div style={{textAlign: 'center', ...rise(frame, fps, 2, 34)}}>
          <Eyebrow>The operating rhythm</Eyebrow>
          <div style={{marginTop: 26}}>
            <Headline size={80} width={1350} align="center">From new order to useful operational insight.</Headline>
          </div>
        </div>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginTop: 92}}>
          {steps.map(([number, title, description], index) => {
            const enter = spring({
              frame: Math.max(0, frame - 10 - index * 7),
              fps,
              config: {damping: 17, stiffness: 105, mass: 0.85},
            });
            return (
              <div
                key={title}
                style={{
                  minHeight: 360,
                  borderRadius: 24,
                  border: `1px solid ${colors.lineStrong}`,
                  background: 'linear-gradient(150deg, rgba(255,255,255,0.052), rgba(255,255,255,0.012))',
                  padding: 28,
                  opacity: enter,
                  transform: `translateY(${(1 - enter) * 42}px)`,
                }}
              >
                <div style={{fontFamily: fonts.mono, color: colors.emeraldBright, fontSize: 17, fontWeight: 800}}>{number}</div>
                <div style={{fontSize: 33, fontWeight: 760, marginTop: 50, letterSpacing: '-0.035em'}}>{title}</div>
                <div style={{fontSize: 19, color: colors.textSoft, lineHeight: 1.5, marginTop: 17}}>{description}</div>
                <div style={{width: 46, height: 4, borderRadius: 9, background: index % 2 === 0 ? colors.emeraldBright : colors.blue, marginTop: 43}} />
              </div>
            );
          })}
        </div>
      </div>
    </Scene>
  );
};

export const LaunchFilm60: React.FC = () => (
  <AbsoluteFill>
    <Sequence from={0} durationInFrames={150} premountFor={30}>
      <ChaosScene duration={150} />
    </Sequence>
    <Sequence from={150} durationInFrames={150} premountFor={30}>
      <RevealScene duration={150} />
    </Sequence>
    <Sequence from={300} durationInFrames={240} premountFor={30}>
      <ProductScene
        duration={240}
        eyebrow="Command center"
        headline={<>Know what is happening <span style={{color: colors.emeraldBright}}>now.</span></>}
        description="See the day’s orders, confirmation progress, delivered revenue and operational movement in one place."
        preview={<DashboardPreview compact />}
      />
    </Sequence>
    <Sequence from={540} durationInFrames={240} premountFor={30}>
      <ProductScene
        duration={240}
        eyebrow="Order workflow"
        headline={<>Move every order with a <span style={{color: colors.blue}}>clear status.</span></>}
        description="Keep confirmation, preparation, shipping and delivery connected to the same customer and order history."
        preview={<OrderBoardPreview compact />}
        glow="blue"
        reverse
      />
    </Sequence>
    <Sequence from={780} durationInFrames={240} premountFor={30}>
      <ProductScene
        duration={240}
        eyebrow="Automation"
        headline={<>Automate the repeatable. Keep the seller <span style={{color: colors.amber}}>in control.</span></>}
        description="Build understandable workflows for stock updates, communication and team follow-up without losing operational visibility."
        preview={<AutomationPreview compact />}
        glow="amber"
      />
    </Sequence>
    <Sequence from={1020} durationInFrames={240} premountFor={30}>
      <FeatureSystemScene duration={240} />
    </Sequence>
    <Sequence from={1260} durationInFrames={240} premountFor={30}>
      <LocalFirstScene duration={240} />
    </Sequence>
    <Sequence from={1500} durationInFrames={300} premountFor={30}>
      <ClosingScene duration={300} />
    </Sequence>
  </AbsoluteFill>
);

export const SocialCut30: React.FC = () => (
  <AbsoluteFill>
    <Sequence from={0} durationInFrames={90} premountFor={20}>
      <ChaosScene duration={90} />
    </Sequence>
    <Sequence from={90} durationInFrames={90} premountFor={20}>
      <RevealScene duration={90} />
    </Sequence>
    <Sequence from={180} durationInFrames={180} premountFor={20}>
      <ProductScene
        duration={180}
        eyebrow="Live command center"
        headline={<>Turn daily COD work into one <span style={{color: colors.emeraldBright}}>clear operation.</span></>}
        description="Orders, delivery, inventory and revenue stay visible together."
        preview={<DashboardPreview compact />}
      />
    </Sequence>
    <Sequence from={360} durationInFrames={180} premountFor={20}>
      <ProductScene
        duration={180}
        eyebrow="Order workflow"
        headline={<>Every order. One <span style={{color: colors.blue}}>operational truth.</span></>}
        description="Move from confirmation to delivery without losing the context."
        preview={<OrderBoardPreview compact />}
        glow="blue"
        reverse
      />
    </Sequence>
    <Sequence from={540} durationInFrames={180} premountFor={20}>
      <ProductScene
        duration={180}
        eyebrow="Automation"
        headline={<>Less repetition. More <span style={{color: colors.amber}}>control.</span></>}
        description="Build visible workflows around the seller’s real process."
        preview={<AutomationPreview compact />}
        glow="amber"
      />
    </Sequence>
    <Sequence from={720} durationInFrames={180} premountFor={20}>
      <ClosingScene duration={180} compact />
    </Sequence>
  </AbsoluteFill>
);

export const VerticalCut15: React.FC = () => (
  <AbsoluteFill>
    <Sequence from={0} durationInFrames={75} premountFor={15}>
      <ChaosScene duration={75} vertical />
    </Sequence>
    <Sequence from={75} durationInFrames={90} premountFor={15}>
      <RevealScene duration={90} vertical />
    </Sequence>
    <Sequence from={165} durationInFrames={135} premountFor={15}>
      <VerticalDashboardScene duration={135} />
    </Sequence>
    <Sequence from={300} durationInFrames={90} premountFor={15}>
      <LocalFirstScene duration={90} vertical />
    </Sequence>
    <Sequence from={390} durationInFrames={60} premountFor={15}>
      <ClosingScene duration={60} compact tagline="Run COD with clarity." />
    </Sequence>
  </AbsoluteFill>
);

export const DemoFilm90: React.FC = () => (
  <AbsoluteFill>
    <Sequence from={0} durationInFrames={180} premountFor={30}>
      <DemoIntro duration={180} />
    </Sequence>
    <Sequence from={180} durationInFrames={330} premountFor={30}>
      <ProductScene
        duration={330}
        eyebrow="1 · Command center"
        headline={<>Start with the signals that need <span style={{color: colors.emeraldBright}}>attention.</span></>}
        description="The command center brings order volume, confirmation, delivery and cash movement into one operational view for the day."
        preview={<DashboardPreview />}
      />
    </Sequence>
    <Sequence from={510} durationInFrames={330} premountFor={30}>
      <ProductScene
        duration={330}
        eyebrow="2 · Orders"
        headline={<>Give every order a visible <span style={{color: colors.blue}}>next step.</span></>}
        description="Teams can see what is new, confirmed, shipping or delivered while preserving the order and customer context."
        preview={<OrderBoardPreview />}
        glow="blue"
        reverse
      />
    </Sequence>
    <Sequence from={840} durationInFrames={300} premountFor={30}>
      <WorkflowSummaryScene duration={300} />
    </Sequence>
    <Sequence from={1140} durationInFrames={330} premountFor={30}>
      <ProductScene
        duration={330}
        eyebrow="3 · Automation"
        headline={<>Make repeatable work <span style={{color: colors.amber}}>understandable.</span></>}
        description="Automation flows can connect order events to stock, communication and team actions while keeping the operational sequence visible."
        preview={<AutomationPreview />}
        glow="amber"
      />
    </Sequence>
    <Sequence from={1470} durationInFrames={300} premountFor={30}>
      <FeatureSystemScene duration={300} />
    </Sequence>
    <Sequence from={1770} durationInFrames={300} premountFor={30}>
      <LocalFirstScene duration={300} />
    </Sequence>
    <Sequence from={2070} durationInFrames={300} premountFor={30}>
      <ProductScene
        duration={300}
        eyebrow="The result"
        headline={<>A calmer operation with a <span style={{color: colors.emeraldBright}}>shared view.</span></>}
        description="SahelFlow gives the seller and team one place to understand the day, move the work and learn from operational outcomes."
        preview={<DashboardPreview compact />}
        reverse
      />
    </Sequence>
    <Sequence from={2370} durationInFrames={330} premountFor={30}>
      <ClosingScene duration={330} />
    </Sequence>
  </AbsoluteFill>
);
