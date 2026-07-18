import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {premiumFonts} from '../v2/fonts';
import {heroCopy, demoChapters} from './copy';
import {clamp, ease, fadeWindow, springEnter, v3Colors} from './design';
import {
  CaptureFrame,
  ChaosParticleCards,
  FlowRibbon,
  KineticLabel,
  MetricPulse,
  SceneCopy,
  V3Stage,
  WordmarkV3,
} from './primitives';

const SceneFade: React.FC<{duration: number; children: React.ReactNode}> = ({duration, children}) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{opacity: fadeWindow(frame, duration, 18, 18)}}>{children}</AbsoluteFill>;
};

const FilmBars: React.FC = () => (
  <>
    <div style={{position: 'absolute', inset: '0 0 auto', height: 28, background: '#000', zIndex: 40}} />
    <div style={{position: 'absolute', inset: 'auto 0 0', height: 28, background: '#000', zIndex: 40}} />
  </>
);

export const ChaosOpening: React.FC<{duration?: number; vertical?: boolean}> = ({duration = 180, vertical = false}) => {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const collapse = ease(frame, duration - 58, 44);
  const enter = springEnter(frame, fps, 0, 18);
  const cardW = vertical ? width * 0.82 : width * 0.42;
  const cardH = cardW * 0.56;
  const cards = vertical
    ? [
        {asset: 'inbox-ar.png', x: width * 0.08, y: height * 0.12, r: -5},
        {asset: 'orders-vertical-fr.png', x: width * 0.10, y: height * 0.46, r: 4},
      ]
    : [
        {asset: 'inbox-ar.png', x: width * 0.035, y: height * 0.14, r: -5},
        {asset: 'orders-fr.png', x: width * 0.52, y: height * 0.08, r: 4},
        {asset: 'deliveries-fr.png', x: width * 0.10, y: height * 0.56, r: 3},
        {asset: 'analytics-fr.png', x: width * 0.55, y: height * 0.53, r: -3},
      ];
  return (
    <SceneFade duration={duration}>
      <V3Stage accent={v3Colors.red} grid={false}>
        <ChaosParticleCards />
        {cards.map((card, index) => {
          const stagger = springEnter(frame, fps, index * 5, 17);
          const centerX = width / 2 - cardW / 2;
          const centerY = height / 2 - cardH / 2;
          const x = interpolate(collapse, [0, 1], [card.x, centerX]);
          const y = interpolate(collapse, [0, 1], [card.y, centerY]);
          const scale = interpolate(collapse, [0, 1], [1, 0.16]);
          return (
            <CaptureFrame
              key={card.asset}
              asset={card.asset}
              style={{position: 'absolute', width: cardW, height: cardH, left: x, top: y, zIndex: index + 1}}
              rotateZ={card.r * (1 - collapse)}
              scale={scale * (0.94 + stagger * 0.06)}
              entrance={index * 4}
              showChrome={false}
            />
          );
        })}
        {!vertical ? (
          <div style={{position: 'absolute', left: 110, top: 78, zIndex: 20, opacity: enter}}>
            <KineticLabel color={v3Colors.red}>Unconfirmed orders</KineticLabel>
          </div>
        ) : null}
        <div style={{position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 30, padding: vertical ? 56 : 0}}>
          <div style={{opacity: clamp((frame - 18) / 24) * (1 - collapse), transform: `scale(${0.96 + enter * 0.04})`}}>
            <SceneCopy
              eyebrow={heroCopy.chaos.eyebrow}
              headline={heroCopy.chaos.headline}
              body={vertical ? undefined : heroCopy.chaos.body}
              align="center"
              compact={vertical}
              maxWidth={vertical ? 920 : 1120}
            />
          </div>
        </div>
        <div style={{position: 'absolute', left: '50%', top: '50%', width: 16, height: 16, margin: -8, borderRadius: '50%', background: v3Colors.emerald, boxShadow: `0 0 ${50 + collapse * 130}px ${v3Colors.emerald}`, opacity: collapse}} />
        <FilmBars />
      </V3Stage>
    </SceneFade>
  );
};

export const ThesisReveal: React.FC<{duration?: number}> = ({duration = 180}) => {
  const frame = useCurrentFrame();
  const p = ease(frame, 18, 120);
  return (
    <SceneFade duration={duration}>
      <V3Stage accent={v3Colors.emerald} grid={false}>
        <FlowRibbon progress={p} style={{width: '82%', height: '50%', left: '9%', top: '32%'}} />
        <div style={{position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', paddingBottom: 210}}>
          <SceneCopy eyebrow={heroCopy.thesis.eyebrow} headline={heroCopy.thesis.headline} align="center" maxWidth={1200} />
        </div>
      </V3Stage>
    </SceneFade>
  );
};

export const BrandReveal: React.FC<{duration?: number}> = ({duration = 180}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = springEnter(frame, fps, 10, 17);
  return (
    <SceneFade duration={duration}>
      <V3Stage accent={v3Colors.emerald}>
        <FlowRibbon progress={ease(frame, 0, 90)} style={{width: '90%', left: '5%', top: '45%', height: '44%'}} nodes={9} />
        <div style={{position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', paddingBottom: 90, transform: `scale(${0.86 + enter * 0.14})`, opacity: enter}}>
          <div style={{textAlign: 'center'}}>
            <WordmarkV3 size={92} centered />
            <div style={{marginTop: 30, fontSize: 22, color: v3Colors.textSoft, letterSpacing: 0.2}}>The operating system for Algerian COD sellers.</div>
          </div>
        </div>
      </V3Stage>
    </SceneFade>
  );
};

export const CommandCenterScene: React.FC<{duration?: number; demo?: boolean}> = ({duration = 330, demo = false}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const zoom = interpolate(frame, [0, duration], [1.02, 1.1], {extrapolateRight: 'clamp'});
  return (
    <SceneFade duration={duration}>
      <V3Stage accent={v3Colors.blue}>
        <div style={{position: 'absolute', left: demo ? 74 : 82, top: demo ? 88 : 72, width: demo ? width * 0.84 : width * 0.77, height: demo ? height * 0.80 : height * 0.77}}>
          <CaptureFrame asset="dashboard-fr.webm" video startFrom={55} scale={zoom} rotateY={demo ? 0 : -3.2} rotateX={demo ? 0 : 1.3} />
        </div>
        {!demo ? <div style={{position: 'absolute', right: 88, top: 116, width: 520}}><SceneCopy eyebrow={heroCopy.command.eyebrow} headline={heroCopy.command.headline} body={heroCopy.command.body} compact maxWidth={520} /></div> : null}
        {!demo ? (
          <div style={{position: 'absolute', right: 92, bottom: 120, display: 'grid', gap: 12}}>
            <MetricPulse value="18" label="ORDERS WAITING" color={v3Colors.blue} delay={18} />
            <MetricPulse value="7" label="DELIVERY EXCEPTIONS" color={v3Colors.amber} delay={24} />
            <MetricPulse value="3" label="STOCK RISKS" color={v3Colors.red} delay={30} />
          </div>
        ) : null}
        <FlowRibbon progress={ease(frame, 20, duration - 60)} style={{width: '52%', height: '28%', right: '-2%', bottom: '-2%'}} nodes={5} />
      </V3Stage>
    </SceneFade>
  );
};

export const OrderFlowScene: React.FC<{duration?: number; demo?: boolean}> = ({duration = 330, demo = false}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const step = Math.min(3, Math.floor(clamp((frame - 40) / Math.max(1, duration - 90)) * 4));
  const states = ['Captured', 'Confirmed', 'Shipped', 'Delivered'];
  return (
    <SceneFade duration={duration}>
      <V3Stage accent={v3Colors.amber}>
        <div style={{position: 'absolute', left: 66, top: 80, width: demo ? width * 0.85 : width * 0.65, height: height * 0.78}}>
          <CaptureFrame asset="orders-fr.webm" video startFrom={48} scale={1.04} rotateY={demo ? 0 : 3.5} rotateX={demo ? 0 : 1.2} />
        </div>
        {!demo ? <div style={{position: 'absolute', right: 78, top: 92, width: 560}}><SceneCopy eyebrow={heroCopy.orders.eyebrow} headline={heroCopy.orders.headline} body={heroCopy.orders.body} compact maxWidth={560} /></div> : null}
        <div style={{position: 'absolute', right: demo ? 68 : 88, bottom: demo ? 92 : 108, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', width: demo ? 780 : 570}}>
          {states.map((state, index) => (
            <React.Fragment key={state}>
              <KineticLabel color={index <= step ? v3Colors.emerald : v3Colors.muted} delay={20 + index * 8}>{state}</KineticLabel>
              {index < states.length - 1 ? <span style={{color: index < step ? v3Colors.emerald : v3Colors.lineStrong, fontSize: 24}}>→</span> : null}
            </React.Fragment>
          ))}
        </div>
        <FlowRibbon progress={ease(frame, 18, duration - 62)} style={{width: '56%', height: '30%', right: '-2%', top: '47%'}} nodes={6} />
      </V3Stage>
    </SceneFade>
  );
};

export const ConversationScene: React.FC<{duration?: number; demo?: boolean}> = ({duration = 300, demo = false}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  return (
    <SceneFade duration={duration}>
      <V3Stage accent={v3Colors.magenta}>
        <div style={{position: 'absolute', right: demo ? 74 : 62, top: 74, width: demo ? width * 0.84 : width * 0.67, height: height * 0.80}}>
          <CaptureFrame asset="inbox-ar.webm" video startFrom={48} scale={1.03} rotateY={demo ? 0 : -3.5} rotateX={demo ? 0 : 1.1} />
        </div>
        {!demo ? <div style={{position: 'absolute', left: 86, top: 112, width: 560}}><SceneCopy eyebrow={heroCopy.conversation.eyebrow} headline={heroCopy.conversation.headline} body={heroCopy.conversation.body} compact maxWidth={560} /></div> : null}
        <div dir="rtl" style={{position: 'absolute', left: 92, bottom: 116, width: 520, padding: '22px 26px', borderRadius: 22, background: 'rgba(9,20,15,.88)', border: `1px solid ${v3Colors.lineStrong}`, fontFamily: premiumFonts.arabic, boxShadow: '0 25px 70px rgba(0,0,0,.48)'}}>
          <div style={{fontSize: 28, lineHeight: 1.6, fontWeight: 650}}>سلام، نحب نطلب المنتج والتوصيل إلى الجزائر العاصمة.</div>
          <div style={{fontSize: 13, color: v3Colors.muted, marginTop: 12}}>Conversation context stays connected to the order.</div>
        </div>
        <FlowRibbon progress={ease(frame, 14, duration - 50)} style={{width: '50%', height: '26%', left: '-4%', bottom: '-2%'}} nodes={5} />
      </V3Stage>
    </SceneFade>
  );
};

export const DeliveryScene: React.FC<{duration?: number; demo?: boolean}> = ({duration = 300, demo = false}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  return (
    <SceneFade duration={duration}>
      <V3Stage accent={v3Colors.cyan}>
        <div style={{position: 'absolute', left: 72, top: 76, width: demo ? width * 0.84 : width * 0.71, height: height * 0.80}}>
          <CaptureFrame asset="deliveries-fr.webm" video startFrom={48} scale={1.03} rotateY={demo ? 0 : 3} rotateX={demo ? 0 : 1.2} />
        </div>
        {!demo ? <div style={{position: 'absolute', right: 80, top: 110, width: 500}}><SceneCopy eyebrow="04 · DELIVERY" headline={'Keep exceptions visible.\nKeep the history intact.'} body="Courier progress and follow-up remain connected to the same operational record." compact maxWidth={500} /></div> : null}
        <div style={{position: 'absolute', right: 94, bottom: 122, display: 'grid', gap: 10}}>
          <KineticLabel color={v3Colors.cyan} delay={20}>Courier assigned</KineticLabel>
          <KineticLabel color={v3Colors.amber} delay={28}>Exception surfaced</KineticLabel>
          <KineticLabel color={v3Colors.emerald} delay={36}>COD reconciled</KineticLabel>
        </div>
        <FlowRibbon progress={ease(frame, 14, duration - 55)} style={{width: '54%', height: '28%', right: '-3%', bottom: '-1%'}} nodes={6} />
      </V3Stage>
    </SceneFade>
  );
};

export const AutomationScene: React.FC<{duration?: number; demo?: boolean}> = ({duration = 300, demo = false}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  return (
    <SceneFade duration={duration}>
      <V3Stage accent={v3Colors.emerald}>
        <div style={{position: 'absolute', right: 70, top: 76, width: demo ? width * 0.84 : width * 0.69, height: height * 0.80}}>
          <CaptureFrame asset="automations-en.webm" video startFrom={48} scale={1.03} rotateY={demo ? 0 : -3.2} rotateX={demo ? 0 : 1.1} />
        </div>
        {!demo ? <div style={{position: 'absolute', left: 84, top: 110, width: 570}}><SceneCopy eyebrow={heroCopy.automation.eyebrow} headline={heroCopy.automation.headline} body={heroCopy.automation.body} compact maxWidth={570} /></div> : null}
        <div style={{position: 'absolute', left: 92, bottom: 120, display: 'flex', flexDirection: 'column', gap: 10}}>
          {['WHEN · Order confirmed', 'IF · Risk below threshold', 'THEN · Prepare courier handoff'].map((label, index) => <KineticLabel key={label} color={index === 0 ? v3Colors.blue : index === 1 ? v3Colors.amber : v3Colors.emerald} delay={18 + index * 12}>{label}</KineticLabel>)}
        </div>
        <FlowRibbon progress={ease(frame, 12, duration - 45)} style={{width: '48%', height: '27%', left: '-3%', top: '43%'}} nodes={5} />
      </V3Stage>
    </SceneFade>
  );
};

export const IntelligenceScene: React.FC<{duration?: number; demo?: boolean}> = ({duration = 330, demo = false}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const assets = ['analytics-fr.png', 'products-fr.png', 'customers-fr.png'];
  return (
    <SceneFade duration={duration}>
      <V3Stage accent={v3Colors.blue}>
        {assets.map((asset, index) => (
          <CaptureFrame key={asset} asset={asset} entrance={index * 11} style={{position: 'absolute', width: width * 0.58, height: height * 0.65, left: 100 + index * 190, top: 118 + index * 34, zIndex: index + 1}} rotateY={-5 + index * 5} rotateZ={-2 + index * 2} scale={0.96 - index * 0.04} />
        ))}
        <div style={{position: 'absolute', left: 100, top: 72}}><KineticLabel color={v3Colors.blue}>One operating context</KineticLabel></div>
        <div style={{position: 'absolute', right: 88, bottom: 104, width: 610}}><SceneCopy eyebrow="06 · OPERATIONAL INTELLIGENCE" headline={'Read the signals\nwithout losing the work.'} body="Analytics, inventory and customer patterns stay close to the operational decisions they affect." compact maxWidth={610} /></div>
        <FlowRibbon progress={ease(frame, 16, duration - 60)} style={{width: '54%', height: '27%', right: '-3%', top: '10%'}} nodes={6} />
      </V3Stage>
    </SceneFade>
  );
};

export const LocalMultilingualScene: React.FC<{duration?: number}> = ({duration = 330}) => {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const enter = springEnter(frame, fps, 10, 19);
  return (
    <SceneFade duration={duration}>
      <V3Stage accent={v3Colors.sand}>
        <div style={{position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', paddingBottom: 330}}><SceneCopy eyebrow={heroCopy.local.eyebrow} headline={heroCopy.local.headline} align="center" maxWidth={1180} /></div>
        <div style={{position: 'absolute', left: width * 0.12, top: height * 0.54, width: width * 0.30, height: height * 0.32}}><CaptureFrame asset="dashboard-fr.png" scale={0.98} rotateY={7} rotateZ={-2} /></div>
        <div style={{position: 'absolute', left: width * 0.36, top: height * 0.49, width: width * 0.30, height: height * 0.34, zIndex: 3}}><CaptureFrame asset="dashboard-ar.png" scale={1.03} rotateY={0} /></div>
        <div style={{position: 'absolute', left: width * 0.60, top: height * 0.54, width: width * 0.30, height: height * 0.32}}><CaptureFrame asset="dashboard-en.png" scale={0.98} rotateY={-7} rotateZ={2} /></div>
        <div style={{position: 'absolute', bottom: 74, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 16, opacity: enter}}>
          <KineticLabel color={v3Colors.blue}>Français</KineticLabel>
          <KineticLabel color={v3Colors.emerald}>العربية</KineticLabel>
          <KineticLabel color={v3Colors.sand}>English</KineticLabel>
          <KineticLabel color={v3Colors.cyan}>Local-first</KineticLabel>
        </div>
      </V3Stage>
    </SceneFade>
  );
};

export const FinaleScene: React.FC<{duration?: number; vertical?: boolean}> = ({duration = 300, vertical = false}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = springEnter(frame, fps, 10, 18);
  return (
    <SceneFade duration={duration}>
      <V3Stage accent={v3Colors.emerald} grid={false}>
        <FlowRibbon progress={ease(frame, 0, duration * 0.58)} style={{width: vertical ? '150%' : '92%', height: vertical ? '36%' : '48%', left: vertical ? '-25%' : '4%', top: vertical ? '50%' : '39%'}} nodes={vertical ? 6 : 9} />
        <div style={{position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: vertical ? '0 52px 230px' : '0 0 120px', textAlign: 'center', opacity: enter, transform: `scale(${0.88 + enter * 0.12})`}}>
          <div>
            <WordmarkV3 size={vertical ? 70 : 92} centered />
            <div style={{whiteSpace: 'pre-line', fontSize: vertical ? 68 : 94, lineHeight: 0.95, fontWeight: 850, letterSpacing: vertical ? -3.2 : -5.8, marginTop: vertical ? 42 : 48}}>{heroCopy.finale.headline}</div>
            <div style={{marginTop: 28, fontSize: vertical ? 21 : 24, color: v3Colors.textSoft}}>Built for the reality of Algerian COD.</div>
          </div>
        </div>
        <div style={{position: 'absolute', bottom: vertical ? 88 : 54, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 12}}>
          <KineticLabel color={v3Colors.emerald} delay={35}>Orders</KineticLabel>
          <KineticLabel color={v3Colors.blue} delay={42}>Customers</KineticLabel>
          <KineticLabel color={v3Colors.amber} delay={49}>Delivery</KineticLabel>
          {!vertical ? <KineticLabel color={v3Colors.magenta} delay={56}>Automation</KineticLabel> : null}
        </div>
      </V3Stage>
    </SceneFade>
  );
};

export const DemoChapterCard: React.FC<{index: number; duration?: number}> = ({index, duration = 150}) => {
  const chapter = demoChapters[index];
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = springEnter(frame, fps, 4, 19);
  if (!chapter) return null;
  return (
    <SceneFade duration={duration}>
      <V3Stage accent={index % 2 === 0 ? v3Colors.emerald : v3Colors.blue} grid={false}>
        <div style={{position: 'absolute', inset: 0, display: 'grid', placeItems: 'center'}}>
          <div style={{width: 1120, padding: '56px 62px', borderRadius: 32, border: `1px solid ${v3Colors.lineStrong}`, background: 'linear-gradient(145deg,rgba(16,35,27,.94),rgba(5,13,9,.91))', boxShadow: '0 55px 150px rgba(0,0,0,.60)', opacity: enter, transform: `translateY(${(1 - enter) * 55}px)`}}>
            <div style={{fontSize: 16, letterSpacing: 4, color: v3Colors.emeraldBright, fontWeight: 800}}>CHAPTER {chapter.number}</div>
            <div style={{fontSize: 78, lineHeight: 1, letterSpacing: -4, fontWeight: 850, marginTop: 26}}>{chapter.title}</div>
            <div style={{fontSize: 25, color: v3Colors.textSoft, marginTop: 26, lineHeight: 1.45, maxWidth: 890}}>{chapter.copy}</div>
          </div>
        </div>
      </V3Stage>
    </SceneFade>
  );
};

export const VerticalDashboardScene: React.FC<{duration?: number}> = ({duration = 120}) => (
  <SceneFade duration={duration}>
    <V3Stage accent={v3Colors.blue} grid={false}>
      <div style={{position: 'absolute', left: 54, right: 54, top: 140, bottom: 180}}><CaptureFrame asset="dashboard-vertical-ar.png" scale={1.02} showChrome={false} /></div>
      <div style={{position: 'absolute', left: 66, top: 70}}><KineticLabel color={v3Colors.emerald}>التحكم في العمليات</KineticLabel></div>
      <div style={{position: 'absolute', left: 70, bottom: 72, right: 70, fontFamily: premiumFonts.arabic, fontSize: 46, fontWeight: 800, textAlign: 'center'}}>كل ما يحتاج انتباهك، الآن.</div>
    </V3Stage>
  </SceneFade>
);

export const VerticalOrdersScene: React.FC<{duration?: number}> = ({duration = 120}) => {
  const frame = useCurrentFrame();
  const step = Math.min(3, Math.floor(clamp((frame - 18) / 76) * 4));
  return (
    <SceneFade duration={duration}>
      <V3Stage accent={v3Colors.amber} grid={false}>
        <div style={{position: 'absolute', left: 46, right: 46, top: 170, height: 1100}}><CaptureFrame asset="orders-vertical-fr.png" scale={1.02} showChrome={false} /></div>
        <div style={{position: 'absolute', left: 50, right: 50, top: 70, textAlign: 'center', fontSize: 56, fontWeight: 850, letterSpacing: -2.8}}>One order. One visible journey.</div>
        <div style={{position: 'absolute', left: 56, right: 56, bottom: 100, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
          {['Captured', 'Confirmed', 'Shipped', 'Delivered'].map((label, index) => <KineticLabel key={label} color={index <= step ? v3Colors.emerald : v3Colors.muted} delay={index * 5} style={{justifyContent: 'center', fontSize: 15, padding: '13px 16px'}}>{label}</KineticLabel>)}
        </div>
      </V3Stage>
    </SceneFade>
  );
};

export const VerticalLocalScene: React.FC<{duration?: number}> = ({duration = 105}) => {
  const frame = useCurrentFrame();
  return (
    <SceneFade duration={duration}>
      <V3Stage accent={v3Colors.sand} grid={false}>
        <div style={{position: 'absolute', left: 55, right: 55, top: 74, textAlign: 'center'}}>
          <div style={{fontSize: 18, letterSpacing: 3, color: v3Colors.emeraldBright, fontWeight: 800}}>BUILT AROUND ALGERIAN COD</div>
          <div style={{whiteSpace: 'pre-line', fontSize: 64, lineHeight: 0.98, letterSpacing: -3.2, fontWeight: 850, marginTop: 24}}>{'Local-first.\nThree working languages.'}</div>
        </div>
        <div style={{position: 'absolute', left: 64, right: 64, top: 520, height: 750}}>
          <CaptureFrame asset="dashboard-vertical-ar.png" showChrome={false} scale={1.02} />
        </div>
        <div style={{position: 'absolute', left: 70, right: 70, bottom: 110, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10}}>
          <KineticLabel color={v3Colors.emerald} delay={10} style={{justifyContent: 'center'}}>العربية</KineticLabel>
          <KineticLabel color={v3Colors.blue} delay={18} style={{justifyContent: 'center'}}>Français</KineticLabel>
          <KineticLabel color={v3Colors.sand} delay={26} style={{justifyContent: 'center'}}>English</KineticLabel>
        </div>
        <FlowRibbon progress={ease(frame, 0, duration - 18)} style={{width: '150%', left: '-24%', height: '25%', bottom: '-1%'}} nodes={6} />
      </V3Stage>
    </SceneFade>
  );
};
