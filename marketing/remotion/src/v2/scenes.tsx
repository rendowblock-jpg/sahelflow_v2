import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {clamp, eased, floatNoise, premiumColors, premiumShadow, springIn} from './design';
import {premiumFonts} from './fonts';
import {
  BodyCopy,
  CameraRig,
  CaptionRail,
  GlassPanel,
  ImpactFlash,
  KineticHeadline,
  MicroLabel,
  ParticleField,
  PremiumStage,
  StatusPill,
  Wordmark,
} from './primitives';
import {
  AutomationCanvas,
  DashboardScreen,
  DeliveryMapScreen,
  InboxCaptureScreen,
  LocalFirstVisual,
  OrdersScreen,
} from './product-ui';

const ChaosCard: React.FC<{
  seed: string;
  x: number;
  y: number;
  rotate: number;
  delay: number;
  title: string;
  detail: string;
  color: string;
}> = ({seed, x, y, rotate, delay, title, detail, color}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: {damping: 15, stiffness: 115, mass: 0.78},
    durationInFrames: 34,
  });
  const driftX = floatNoise(`${seed}-x`, frame, 20, 0.013);
  const driftY = floatNoise(`${seed}-y`, frame, 13, 0.011);
  const driftR = floatNoise(`${seed}-r`, frame, 1.4, 0.008);
  return (
    <GlassPanel
      glow={color}
      style={{
        position: 'absolute',
        left: x + driftX,
        top: y + driftY,
        width: 248,
        padding: 18,
        borderRadius: 20,
        transform: `translateY(${(1 - enter) * 90}px) scale(${0.76 + enter * 0.24}) rotate(${rotate + driftR}deg)`,
        opacity: enter,
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        <div style={{fontFamily: premiumFonts.mono, fontSize: 10, color}}>NEW SIGNAL</div>
        <div style={{width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 14px ${color}`}} />
      </div>
      <div style={{fontSize: 16, fontWeight: 800, marginTop: 14}}>{title}</div>
      <div style={{fontSize: 11, color: premiumColors.textSoft, marginTop: 6, lineHeight: 1.45}}>{detail}</div>
    </GlassPanel>
  );
};

export const PremiumColdOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const collapse = eased(frame, 96, 45);
  return (
    <PremiumStage accent="amber" intensity={1.1}>
      <ParticleField count={65} color={premiumColors.amber} />
      <ChaosCard seed="message" x={width * 0.63} y={height * 0.13} rotate={7} delay={2} title="34 unread messages" detail="Orders, questions, and address changes mixed together." color={premiumColors.blue} />
      <ChaosCard seed="stock" x={width * 0.74} y={height * 0.43} rotate={-5} delay={10} title="Stock mismatch" detail="Three channels still show different availability." color={premiumColors.amber} />
      <ChaosCard seed="delivery" x={width * 0.56} y={height * 0.62} rotate={4} delay={18} title="7 delivery exceptions" detail="No shared place to see what needs action now." color={premiumColors.red} />
      <ChaosCard seed="cod" x={width * 0.82} y={height * 0.71} rotate={-9} delay={24} title="COD still uncollected" detail="Cash visibility arrives too late to steer the day." color={premiumColors.magenta} />
      <div
        style={{
          position: 'absolute',
          left: width * 0.075,
          top: height * 0.19,
          width: width * 0.49,
          transform: `translateX(${collapse * width * 0.04}px)`,
        }}
      >
        <MicroLabel color={premiumColors.amber}>Algerian COD operations</MicroLabel>
        <div style={{height: 28}} />
        <KineticHeadline
          text="Your business is moving. Your operation should keep up."
          accentWords={['operation']}
          size={width > 1200 ? 86 : 56}
          maxWidth={900}
        />
        <BodyCopy delay={24} size={23} maxWidth={690}>
          Messages, orders, stock, delivery, and cash should not live as separate fragments.
        </BodyCopy>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 82,
          borderTop: `1px solid ${premiumColors.line}`,
          background: 'rgba(2,6,5,0.72)',
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
          opacity: 1 - collapse,
        }}
      >
        <div style={{whiteSpace: 'nowrap', transform: `translateX(${-frame * 3.4}px)`, color: premiumColors.muted, fontFamily: premiumFonts.mono, fontSize: 12, letterSpacing: 1.2}}>
          ORDER #SF-2851 · BLIDA · 6,900 DZD &nbsp;&nbsp;&nbsp; STOCK ALERT · WIRELESS MIC &nbsp;&nbsp;&nbsp; DELIVERY EXCEPTION · ORAN &nbsp;&nbsp;&nbsp; COD RECONCILIATION · 842,000 DZD &nbsp;&nbsp;&nbsp; WHATSAPP · 34 UNREAD &nbsp;&nbsp;&nbsp; ORDER #SF-2851 · BLIDA · 6,900 DZD &nbsp;&nbsp;&nbsp; STOCK ALERT · WIRELESS MIC &nbsp;&nbsp;&nbsp; DELIVERY EXCEPTION · ORAN
        </div>
      </div>
      <ImpactFlash at={108} color={premiumColors.emeraldBright} />
    </PremiumStage>
  );
};

export const PremiumBrandReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const enter = springIn(frame, fps, 4, 17);
  const ring = eased(frame, 12, 50);
  const subtitle = eased(frame, 40, 26);
  return (
    <PremiumStage accent="emerald" intensity={1.35}>
      <ParticleField count={95} color={premiumColors.emeraldBright} depth={1.4} />
      <div style={{position: 'absolute', left: width / 2, top: height / 2, transform: 'translate(-50%, -50%)'}}>
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: -(230 + index * 90),
              top: -(230 + index * 90),
              width: (230 + index * 90) * 2,
              height: (230 + index * 90) * 2,
              borderRadius: '50%',
              border: `1px solid ${index === 0 ? `${premiumColors.emerald}58` : premiumColors.line}`,
              transform: `scale(${0.62 + ring * 0.38}) rotate(${frame * (index % 2 === 0 ? 0.22 : -0.16)}deg)`,
              opacity: ring * (0.72 - index * 0.16),
            }}
          >
            <div style={{position: 'absolute', left: '50%', top: -5, width: 10, height: 10, borderRadius: '50%', background: [premiumColors.emerald, premiumColors.cyan, premiumColors.amber][index], boxShadow: `0 0 18px ${[premiumColors.emerald, premiumColors.cyan, premiumColors.amber][index]}`}} />
          </div>
        ))}
        <div style={{transform: `scale(${0.78 + enter * 0.22})`, opacity: enter}}>
          <div style={{display: 'flex', justifyContent: 'center'}}><Wordmark size={82} /></div>
          <div style={{textAlign: 'center', fontSize: 31, color: premiumColors.textSoft, marginTop: 25, letterSpacing: -0.8, opacity: subtitle, transform: `translateY(${(1 - subtitle) * 18}px)`}}>The operating system for Algerian COD sellers.</div>
        </div>
      </div>
      <div style={{position: 'absolute', left: 62, bottom: 48, fontFamily: premiumFonts.mono, color: premiumColors.muted, fontSize: 11, letterSpacing: 1.4}}>WINDOWS-FIRST · LOCAL-FIRST · AR / FR / EN</div>
      <div style={{position: 'absolute', right: 62, bottom: 43}}><StatusPill color={premiumColors.emerald}>Built around the seller</StatusPill></div>
    </PremiumStage>
  );
};

export const PremiumCommandCenter: React.FC<{demo?: boolean}> = ({demo = false}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const zoom = interpolate(frame, [0, 120, 240], [0.84, 0.96, demo ? 1.06 : 1.02], {extrapolateRight: 'clamp'});
  const x = interpolate(frame, [0, 180], [width * 0.11, width * 0.02], {extrapolateRight: 'clamp'});
  const y = interpolate(frame, [0, 180], [height * 0.16, height * 0.11], {extrapolateRight: 'clamp'});
  return (
    <PremiumStage accent="emerald" intensity={0.9}>
      <CaptionRail index="01" kicker="Live command center" title="Know what is happening now." body="Orders, confirmation, inventory, delivery, and cash become one seller-readable operating view." />
      <CameraRig rotateX={3} rotateY={-5} rotateZ={-0.8} scale={zoom} x={x} y={y} entrance={3} style={{position: 'absolute', left: width * 0.20, top: height * 0.10}}>
        <DashboardScreen cursor />
      </CameraRig>
      <div style={{position: 'absolute', left: 76, bottom: 58, display: 'flex', gap: 9}}>
        <StatusPill color={premiumColors.emerald}>Local operational truth</StatusPill>
        <StatusPill color={premiumColors.blue}>Actionable queues</StatusPill>
      </div>
    </PremiumStage>
  );
};

export const PremiumOrders: React.FC<{demo?: boolean}> = ({demo = false}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const push = interpolate(frame, [0, 180, 270], [0.8, 0.94, demo ? 1.04 : 1], {extrapolateRight: 'clamp'});
  return (
    <PremiumStage accent="blue" intensity={0.85}>
      <CaptionRail index="02" kicker="Order workflow" title="Every order gets a visible state." body="Move from new to confirmed, delivery, and outcome without losing the customer story or the audit trail." align="right" />
      <CameraRig rotateX={2.5} rotateY={5.2} rotateZ={0.7} scale={push} x={-width * 0.08} y={height * 0.13} entrance={0} style={{position: 'absolute', left: width * 0.03, top: height * 0.03}}>
        <OrdersScreen />
      </CameraRig>
      <div style={{position: 'absolute', right: 76, bottom: 58, display: 'flex', gap: 9}}>
        <StatusPill color={premiumColors.blue}>Clear ownership</StatusPill>
        <StatusPill color={premiumColors.emerald}>State + audit</StatusPill>
      </div>
    </PremiumStage>
  );
};

export const PremiumInbox: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const scale = interpolate(frame, [0, 190], [0.76, 0.93], {extrapolateRight: 'clamp'});
  const shift = interpolate(frame, [0, 190], [width * 0.08, -width * 0.01], {extrapolateRight: 'clamp'});
  return (
    <PremiumStage accent="cyan" intensity={0.9}>
      <CaptionRail index="03" kicker="WhatsApp to order" title="Turn conversation into reviewed work." body="Keep the customer context visible while the operator verifies and creates the order." />
      <CameraRig rotateX={2} rotateY={-4} rotateZ={-0.6} scale={scale} x={shift} y={height * 0.12} entrance={0} style={{position: 'absolute', left: width * 0.08, top: height * 0.06}}>
        <InboxCaptureScreen />
      </CameraRig>
      <div style={{position: 'absolute', left: 76, bottom: 58, display: 'flex', gap: 9}}>
        <StatusPill color={premiumColors.cyan}>Arabic conversation</StatusPill>
        <StatusPill color={premiumColors.emerald}>Reviewed capture</StatusPill>
      </div>
    </PremiumStage>
  );
};

export const PremiumDelivery: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const scale = interpolate(frame, [0, 190], [0.78, 0.94], {extrapolateRight: 'clamp'});
  return (
    <PremiumStage accent="magenta" intensity={0.85}>
      <CaptionRail index="04" kicker="Delivery control" title="See movement, exceptions, and COD." body="Prioritize what needs action while keeping courier and cash visibility in the same operational flow." align="right" />
      <CameraRig rotateX={2} rotateY={4.2} rotateZ={0.6} scale={scale} x={-width * 0.08} y={height * 0.11} entrance={0} style={{position: 'absolute', left: width * 0.02, top: height * 0.05}}>
        <DeliveryMapScreen />
      </CameraRig>
      <div style={{position: 'absolute', right: 76, bottom: 58, display: 'flex', gap: 9}}>
        <StatusPill color={premiumColors.magenta}>Courier visibility</StatusPill>
        <StatusPill color={premiumColors.amber}>Exception queues</StatusPill>
      </div>
    </PremiumStage>
  );
};

export const PremiumAutomation: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const scale = interpolate(frame, [0, 175], [0.78, 0.95], {extrapolateRight: 'clamp'});
  return (
    <PremiumStage accent="amber" intensity={0.95}>
      <CaptionRail index="05" kicker="Seller-controlled automation" title="Less repetition. More control." body="Connect routine steps with visible rules, dry runs, and outcomes the seller can understand." />
      <CameraRig rotateX={2.4} rotateY={-4.5} rotateZ={-0.6} scale={scale} x={width * 0.08} y={height * 0.10} entrance={0} style={{position: 'absolute', left: width * 0.08, top: height * 0.04}}>
        <AutomationCanvas />
      </CameraRig>
      <div style={{position: 'absolute', left: 76, bottom: 58, display: 'flex', gap: 9}}>
        <StatusPill color={premiumColors.amber}>Dry-run visible</StatusPill>
        <StatusPill color={premiumColors.emerald}>Seller remains in control</StatusPill>
      </div>
    </PremiumStage>
  );
};

export const PremiumLocalFirst: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const copy = eased(frame, 38, 28);
  return (
    <PremiumStage accent="emerald" intensity={1.2}>
      <ParticleField count={54} color={premiumColors.emerald} />
      <div style={{position: 'absolute', left: width * 0.06, top: height * 0.18, width: width * 0.42}}>
        <MicroLabel>Windows-first · Local-first</MicroLabel>
        <div style={{height: 26}} />
        <KineticHeadline text="Your operation. Your data. Your control." accentWords={['Your', 'control.']} size={76} maxWidth={760} />
        <BodyCopy delay={30} size={22} maxWidth={620}>
          SahelFlow is designed around the desktop as the seller’s operational home—not a browser tab that becomes a second source of truth.
        </BodyCopy>
        <div style={{display: 'flex', gap: 10, marginTop: 28, opacity: copy, transform: `translateY(${(1 - copy) * 18}px)`}}>
          <StatusPill color={premiumColors.emerald}>Windows x64</StatusPill>
          <StatusPill color={premiumColors.blue}>Up to 5 included shops</StatusPill>
        </div>
      </div>
      <div style={{position: 'absolute', right: width * 0.025, top: height * 0.12, transform: `scale(${width / 1920})`}}>
        <LocalFirstVisual />
      </div>
    </PremiumStage>
  );
};

export const PremiumLanguage: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const languages = [
    {label: 'العربية', subtitle: 'واجهة تعمل باتجاه RTL', color: premiumColors.emerald, font: premiumFonts.arabic, direction: 'rtl' as const},
    {label: 'Français', subtitle: 'Pensé pour les opérations COD', color: premiumColors.blue, font: premiumFonts.sans, direction: 'ltr' as const},
    {label: 'English', subtitle: 'Clear operational language', color: premiumColors.magenta, font: premiumFonts.sans, direction: 'ltr' as const},
  ];
  return (
    <PremiumStage accent="blue" intensity={1.05}>
      <ParticleField count={40} color={premiumColors.blue} />
      <div style={{position: 'absolute', left: width * 0.07, right: width * 0.07, top: height * 0.19}}>
        <MicroLabel color={premiumColors.blue}>One product · Three working languages</MicroLabel>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginTop: 48}}>
          {languages.map((language, index) => {
            const enter = springIn(frame, fps, 10 + index * 12, 17);
            const float = floatNoise(`language-${index}`, frame, 10, 0.012);
            return (
              <GlassPanel
                key={language.label}
                glow={language.color}
                style={{
                  padding: 34,
                  height: 360,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transform: `translateY(${(1 - enter) * 70 + float}px) rotate(${index === 0 ? -1.5 : index === 2 ? 1.5 : 0}deg)`,
                  opacity: enter,
                }}
              >
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <div style={{width: 10, height: 10, borderRadius: '50%', background: language.color, boxShadow: `0 0 18px ${language.color}`}} />
                  <div style={{fontFamily: premiumFonts.mono, fontSize: 10, color: premiumColors.muted}}>0{index + 1}</div>
                </div>
                <div dir={language.direction} style={{fontFamily: language.font, textAlign: language.direction === 'rtl' ? 'right' : 'left'}}>
                  <div style={{fontSize: 58, fontWeight: 800, letterSpacing: language.direction === 'rtl' ? 0 : -2.8, color: language.color}}>{language.label}</div>
                  <div style={{fontSize: 17, color: premiumColors.textSoft, marginTop: 14, lineHeight: 1.45}}>{language.subtitle}</div>
                </div>
                <StatusPill color={language.color}>{index === 0 ? 'RTL ready' : index === 1 ? 'Seller familiar' : 'Support ready'}</StatusPill>
              </GlassPanel>
            );
          })}
        </div>
      </div>
    </PremiumStage>
  );
};

const MontageCard: React.FC<{children: React.ReactNode; x: number; y: number; scale: number; rotate: number; delay: number}> = ({children, x, y, scale, rotate, delay}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = springIn(frame, fps, delay, 18);
  return (
    <div style={{position: 'absolute', left: x, top: y, transform: `scale(${scale * (0.82 + enter * 0.18)}) rotate(${rotate}deg) translateY(${(1 - enter) * 70}px)`, transformOrigin: 'top left', opacity: enter}}>{children}</div>
  );
};

export const PremiumFinale: React.FC<{compact?: boolean}> = ({compact = false}) => {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const logo = springIn(frame, fps, 18, 16);
  const callout = eased(frame, 52, 26);
  return (
    <PremiumStage accent="emerald" intensity={1.4}>
      <ParticleField count={84} color={premiumColors.emeraldBright} depth={1.2} />
      {!compact ? (
        <>
          <MontageCard x={width * 0.02} y={height * 0.08} scale={0.38} rotate={-5} delay={0}><DashboardScreen cursor={false} /></MontageCard>
          <MontageCard x={width * 0.67} y={height * 0.08} scale={0.36} rotate={5} delay={6}><OrdersScreen /></MontageCard>
          <MontageCard x={width * 0.06} y={height * 0.61} scale={0.34} rotate={4} delay={12}><AutomationCanvas /></MontageCard>
          <MontageCard x={width * 0.71} y={height * 0.62} scale={0.32} rotate={-4} delay={18}><DeliveryMapScreen /></MontageCard>
        </>
      ) : null}
      <div style={{position: 'absolute', left: width / 2, top: height / 2, transform: `translate(-50%, -50%) scale(${0.78 + logo * 0.22})`, opacity: logo, textAlign: 'center', width: compact ? width * 0.86 : width * 0.54}}>
        <div style={{display: 'flex', justifyContent: 'center'}}><Wordmark size={compact ? 58 : 76} /></div>
        <div style={{fontSize: compact ? 50 : 72, fontWeight: 850, lineHeight: 1.02, letterSpacing: compact ? -2.7 : -4.2, marginTop: 30}}>Run your COD operation with clarity.</div>
        <div style={{fontSize: compact ? 19 : 23, color: premiumColors.textSoft, marginTop: 20, opacity: callout}}>Orders. Inventory. Customers. Delivery. WhatsApp. Automation. Analytics.</div>
        <div style={{display: 'flex', justifyContent: 'center', gap: 10, marginTop: 28, opacity: callout, transform: `translateY(${(1 - callout) * 16}px)`}}>
          <StatusPill color={premiumColors.emerald}>Windows-first</StatusPill>
          <StatusPill color={premiumColors.blue}>Local-first</StatusPill>
          <StatusPill color={premiumColors.magenta}>AR · FR · EN</StatusPill>
        </div>
      </div>
    </PremiumStage>
  );
};

export const VerticalHook: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  return (
    <PremiumStage accent="amber" intensity={1.15}>
      <ParticleField count={48} color={premiumColors.amber} />
      <ChaosCard seed="v-message" x={width * 0.49} y={height * 0.12} rotate={7} delay={0} title="34 messages" detail="Orders and questions mixed." color={premiumColors.blue} />
      <ChaosCard seed="v-stock" x={width * 0.08} y={height * 0.60} rotate={-6} delay={8} title="Stock mismatch" detail="Different channels. Different truth." color={premiumColors.amber} />
      <div style={{position: 'absolute', left: 66, right: 66, top: height * 0.30}}>
        <MicroLabel color={premiumColors.amber}>COD should not feel like chaos</MicroLabel>
        <div style={{height: 30}} />
        <KineticHeadline text="See the operation. Move the work." accentWords={['operation.', 'work.']} size={74} maxWidth={900} />
      </div>
      <div style={{position: 'absolute', bottom: 64, left: 66, fontFamily: premiumFonts.mono, color: premiumColors.muted, fontSize: 12}}>SAHELFLOW · ALGERIAN COD</div>
      <ImpactFlash at={68} />
    </PremiumStage>
  );
};

export const VerticalDashboard: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const scale = interpolate(frame, [0, 90], [0.7, 0.88], {extrapolateRight: 'clamp'});
  return (
    <PremiumStage accent="emerald" intensity={1}>
      <div style={{position: 'absolute', left: 58, right: 58, top: 82}}>
        <MicroLabel>One command center</MicroLabel>
        <div style={{fontSize: 55, lineHeight: 1.02, letterSpacing: -3, fontWeight: 850, marginTop: 22}}>Know what needs action now.</div>
      </div>
      <CameraRig rotateX={3} rotateY={-4} rotateZ={-1.2} scale={scale} x={-40} y={height * 0.34} entrance={0} style={{position: 'absolute', left: width * 0.05, top: height * 0.10}}>
        <DashboardScreen compact cursor={false} />
      </CameraRig>
      <div style={{position: 'absolute', left: 58, bottom: 72, display: 'flex', gap: 8}}><StatusPill color={premiumColors.emerald}>Live queues</StatusPill><StatusPill color={premiumColors.blue}>Clear metrics</StatusPill></div>
    </PremiumStage>
  );
};

export const VerticalOrderMove: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const scale = interpolate(frame, [0, 100], [0.68, 0.84], {extrapolateRight: 'clamp'});
  return (
    <PremiumStage accent="blue" intensity={1}>
      <div style={{position: 'absolute', left: 58, right: 58, top: 82, zIndex: 5}}>
        <MicroLabel color={premiumColors.blue}>Visible order states</MicroLabel>
        <div style={{fontSize: 52, lineHeight: 1.02, letterSpacing: -2.8, fontWeight: 850, marginTop: 20}}>Move every order with confidence.</div>
      </div>
      <CameraRig rotateX={2} rotateY={5} rotateZ={1} scale={scale} x={-170} y={height * 0.36} entrance={0} style={{position: 'absolute', left: -40, top: height * 0.10}}>
        <OrdersScreen compact />
      </CameraRig>
      <div style={{position: 'absolute', left: 58, bottom: 72}}><StatusPill color={premiumColors.emerald}>State + audit recorded</StatusPill></div>
    </PremiumStage>
  );
};

export const VerticalLanguageFinale: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const enter = springIn(frame, fps, 4, 17);
  return (
    <PremiumStage accent="emerald" intensity={1.35}>
      <ParticleField count={58} color={premiumColors.emeraldBright} />
      <div style={{position: 'absolute', left: 58, right: 58, top: height * 0.16, textAlign: 'center', transform: `scale(${0.82 + enter * 0.18})`, opacity: enter}}>
        <div style={{display: 'flex', justifyContent: 'center'}}><Wordmark size={62} /></div>
        <div dir="rtl" style={{fontFamily: premiumFonts.arabic, fontSize: 52, fontWeight: 800, marginTop: 70, color: premiumColors.emeraldBright}}>تحكّم في عملياتك بوضوح</div>
        <div style={{fontSize: 37, fontWeight: 800, marginTop: 26}}>Pilotez votre activité avec clarté.</div>
        <div style={{fontSize: 34, fontWeight: 800, marginTop: 18, color: premiumColors.textSoft}}>Run your COD operation with clarity.</div>
        <div style={{display: 'flex', justifyContent: 'center', gap: 8, marginTop: 42}}><StatusPill color={premiumColors.emerald}>Windows-first</StatusPill><StatusPill color={premiumColors.blue}>Local-first</StatusPill></div>
      </div>
    </PremiumStage>
  );
};
