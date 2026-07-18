import React, {type CSSProperties, type ReactNode} from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {clamp, eased, premiumColors, premiumRadius, premiumShadow, springIn} from './design';
import {premiumFonts} from './fonts';
import {
  AnimatedCursor,
  ChromeWindow,
  GlassPanel,
  MetricValue,
  Sparkline,
  StatusPill,
  Wordmark,
} from './primitives';

const navItems = [
  ['⌂', 'Command center'],
  ['▦', 'Orders'],
  ['◇', 'Inventory'],
  ['◎', 'Customers'],
  ['↗', 'Delivery'],
  ['◌', 'WhatsApp'],
  ['⌁', 'Automations'],
  ['◫', 'Analytics'],
];

const MiniIcon: React.FC<{children: ReactNode; active?: boolean}> = ({children, active}) => (
  <div
    style={{
      width: 28,
      height: 28,
      borderRadius: 9,
      display: 'grid',
      placeItems: 'center',
      background: active ? `${premiumColors.emerald}1b` : 'transparent',
      color: active ? premiumColors.emeraldBright : premiumColors.muted,
      border: active ? `1px solid ${premiumColors.emerald}30` : '1px solid transparent',
      fontSize: 14,
    }}
  >
    {children}
  </div>
);

const Sidebar: React.FC<{active?: string}> = ({active = 'Command center'}) => (
  <div
    style={{
      width: 220,
      borderRight: `1px solid ${premiumColors.line}`,
      padding: '22px 16px',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(3,9,7,0.5)',
    }}
  >
    <Wordmark size={27} />
    <div style={{height: 28}} />
    <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
      {navItems.map(([icon, label]) => {
        const selected = label === active;
        return (
          <div
            key={label}
            style={{
              height: 42,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              borderRadius: 11,
              padding: '0 10px',
              background: selected ? 'linear-gradient(90deg, rgba(53,233,143,0.13), rgba(53,233,143,0.025))' : 'transparent',
              color: selected ? premiumColors.text : premiumColors.muted,
              fontSize: 12,
              fontWeight: selected ? 700 : 600,
            }}
          >
            <MiniIcon active={selected}>{icon}</MiniIcon>
            {label}
          </div>
        );
      })}
    </div>
    <div style={{marginTop: 'auto'}}>
      <div
        style={{
          border: `1px solid ${premiumColors.line}`,
          borderRadius: 14,
          padding: 12,
          background: 'rgba(255,255,255,0.018)',
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 9}}>
          <div style={{width: 30, height: 30, borderRadius: 10, background: `${premiumColors.blue}24`, display: 'grid', placeItems: 'center', color: premiumColors.blue, fontWeight: 800, fontSize: 11}}>DB</div>
          <div>
            <div style={{fontSize: 11, fontWeight: 700}}>Demo Boutique</div>
            <div style={{fontSize: 9, color: premiumColors.muted, marginTop: 2}}>Algeria · DZD</div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const PageHeader: React.FC<{title: string; subtitle: string; action?: string}> = ({title, subtitle, action}) => (
  <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '26px 30px 20px'}}>
    <div>
      <div style={{fontSize: 23, fontWeight: 800, letterSpacing: -0.9}}>{title}</div>
      <div style={{fontSize: 11, color: premiumColors.muted, marginTop: 5}}>{subtitle}</div>
    </div>
    {action ? (
      <div
        style={{
          background: `linear-gradient(135deg, ${premiumColors.emeraldBright}, ${premiumColors.emerald})`,
          color: '#032415',
          padding: '10px 16px',
          borderRadius: 11,
          fontSize: 11,
          fontWeight: 800,
          boxShadow: premiumShadow.glow,
        }}
      >
        {action}
      </div>
    ) : null}
  </div>
);

const MetricCard: React.FC<{
  label: string;
  value: number;
  suffix?: string;
  prefix?: string;
  change: string;
  color: string;
  delay: number;
}> = ({label, value, suffix, prefix, change, color, delay}) => (
  <div
    style={{
      flex: 1,
      padding: 18,
      borderRadius: 16,
      border: `1px solid ${premiumColors.line}`,
      background: 'linear-gradient(150deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012))',
      minWidth: 0,
    }}
  >
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
      <div style={{fontSize: 10, color: premiumColors.muted, fontWeight: 700}}>{label}</div>
      <div style={{width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 12px ${color}`}} />
    </div>
    <MetricValue
      value={value}
      suffix={suffix}
      prefix={prefix}
      delay={delay}
      style={{fontSize: 25, fontWeight: 800, letterSpacing: -1.2, marginTop: 12}}
    />
    <div style={{fontSize: 9, color, marginTop: 7, fontWeight: 700}}>{change}</div>
  </div>
);

export const DashboardScreen: React.FC<{cursor?: boolean; compact?: boolean}> = ({cursor = true, compact = false}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pulse = 0.5 + Math.sin(frame * 0.08) * 0.5;
  const activity = [
    ['Order #SF-2847 confirmed', '2 min', premiumColors.emerald],
    ['Stock warning · Wireless mic', '7 min', premiumColors.amber],
    ['Delivery assigned · Yalidine', '11 min', premiumColors.blue],
  ];
  const enter = springIn(frame, fps, 0, 20);

  return (
    <ChromeWindow title="SahelFlow · Command center" badge="LOCAL · LIVE" style={{width: compact ? 980 : 1320, height: compact ? 590 : 760}}>
      <div style={{height: 'calc(100% - 58px)', display: 'flex'}}>
        <Sidebar />
        <div style={{flex: 1, minWidth: 0, position: 'relative'}}>
          <PageHeader title="Command center" subtitle="Today’s operational truth across your COD business" action="+ New order" />
          <div style={{padding: '0 30px 24px', display: 'flex', flexDirection: 'column', gap: 16}}>
            <div style={{display: 'flex', gap: 12}}>
              <MetricCard label="ORDERS TODAY" value={148} change="↑ 18.4% vs yesterday" color={premiumColors.blue} delay={6} />
              <MetricCard label="CONFIRMATION" value={72} suffix="%" change="↑ 5.2 pts" color={premiumColors.emerald} delay={9} />
              <MetricCard label="DELIVERY RATE" value={83} suffix="%" change="Stable this week" color={premiumColors.amber} delay={12} />
              <MetricCard label="COLLECTED" value={1864000} suffix=" DZD" change="Cash visibility" color={premiumColors.magenta} delay={15} />
            </div>
            <div style={{display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 14, minHeight: 0}}>
              <div style={{border: `1px solid ${premiumColors.line}`, borderRadius: 17, padding: 18, background: 'rgba(255,255,255,0.018)'}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                  <div>
                    <div style={{fontSize: 11, fontWeight: 800}}>Revenue movement</div>
                    <div style={{fontSize: 9, color: premiumColors.muted, marginTop: 4}}>Last 14 days · confirmed and delivered</div>
                  </div>
                  <StatusPill color={premiumColors.emerald}>Healthy</StatusPill>
                </div>
                <div style={{marginTop: 18, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between'}}>
                  <div>
                    <MetricValue value={1864000} suffix=" DZD" delay={16} style={{fontSize: 29, fontWeight: 800, letterSpacing: -1.4}} />
                    <div style={{color: premiumColors.emerald, fontSize: 10, fontWeight: 700, marginTop: 6}}>+24.8% operating momentum</div>
                  </div>
                  <Sparkline values={[22, 27, 25, 31, 34, 39, 37, 46, 49, 58, 62, 70, 76, 89]} width={420} height={140} delay={14} />
                </div>
              </div>
              <div style={{border: `1px solid ${premiumColors.line}`, borderRadius: 17, padding: 18, background: 'rgba(255,255,255,0.018)'}}>
                <div style={{fontSize: 11, fontWeight: 800}}>Operational pulse</div>
                <div style={{fontSize: 9, color: premiumColors.muted, marginTop: 4}}>Live seller-relevant events</div>
                <div style={{display: 'flex', flexDirection: 'column', gap: 9, marginTop: 16}}>
                  {activity.map(([label, time, color], index) => {
                    const itemEnter = spring({frame: Math.max(0, frame - 12 - index * 5), fps, config: {damping: 18, stiffness: 130}, durationInFrames: 30});
                    return (
                      <div key={label} style={{display: 'flex', alignItems: 'center', gap: 10, padding: '10px 11px', borderRadius: 11, background: 'rgba(255,255,255,0.022)', transform: `translateX(${(1 - itemEnter) * 24}px)`, opacity: itemEnter}}>
                        <div style={{width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 ${8 + pulse * 7}px ${color}`}} />
                        <div style={{fontSize: 9.5, fontWeight: 650, flex: 1}}>{label}</div>
                        <div style={{fontSize: 8.5, color: premiumColors.muted}}>{time}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div style={{display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: 12}}>
              {[
                ['Confirmation queue', '18 waiting', premiumColors.blue, '▦'],
                ['Inventory risk', '3 products', premiumColors.amber, '◇'],
                ['Delivery follow-up', '7 exceptions', premiumColors.red, '↗'],
              ].map(([label, value, color, icon]) => (
                <div key={label} style={{padding: '13px 15px', borderRadius: 13, border: `1px solid ${premiumColors.line}`, display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.015)'}}>
                  <MiniIcon active>{icon}</MiniIcon>
                  <div>
                    <div style={{fontSize: 9, color: premiumColors.muted}}>{label}</div>
                    <div style={{fontSize: 12, fontWeight: 800, color, marginTop: 3}}>{value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {cursor ? <AnimatedCursor from={[980, 60]} to={[840, 255]} start={18} duration={42} clickAt={63} scale={0.78} /> : null}
          <div style={{position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 1 - enter, background: premiumColors.black}} />
        </div>
      </div>
    </ChromeWindow>
  );
};

type OrderTone = 'blue' | 'amber' | 'emerald' | 'red' | 'magenta';
const orderTone: Record<OrderTone, string> = {
  blue: premiumColors.blue,
  amber: premiumColors.amber,
  emerald: premiumColors.emerald,
  red: premiumColors.red,
  magenta: premiumColors.magenta,
};

const OrderCard: React.FC<{
  id: string;
  customer: string;
  city: string;
  amount: string;
  product: string;
  tone: OrderTone;
  style?: CSSProperties;
  highlight?: boolean;
}> = ({id, customer, city, amount, product, tone, style, highlight}) => {
  const color = orderTone[tone];
  return (
    <div
      style={{
        border: `1px solid ${highlight ? `${color}80` : premiumColors.line}`,
        borderRadius: 13,
        padding: 12,
        background: highlight ? `linear-gradient(150deg, ${color}18, rgba(255,255,255,0.025))` : 'rgba(255,255,255,0.026)',
        boxShadow: highlight ? `0 0 34px ${color}16` : 'none',
        ...style,
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        <div style={{fontFamily: premiumFonts.mono, fontSize: 8.5, color}}>{id}</div>
        <div style={{fontSize: 8, color: premiumColors.muted}}>{amount}</div>
      </div>
      <div style={{fontSize: 11, fontWeight: 800, marginTop: 9}}>{customer}</div>
      <div style={{fontSize: 8.5, color: premiumColors.muted, marginTop: 4}}>{city} · {product}</div>
      <div style={{height: 3, borderRadius: 999, background: `${color}20`, marginTop: 10, overflow: 'hidden'}}>
        <div style={{height: '100%', width: highlight ? '78%' : '42%', background: color, boxShadow: `0 0 8px ${color}`}} />
      </div>
    </div>
  );
};

const columns = [
  {label: 'New', color: premiumColors.blue},
  {label: 'Confirming', color: premiumColors.amber},
  {label: 'Confirmed', color: premiumColors.emerald},
  {label: 'In delivery', color: premiumColors.magenta},
  {label: 'Delivered', color: premiumColors.cyan},
];

export const OrdersScreen: React.FC<{compact?: boolean}> = ({compact = false}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const move = spring({frame: Math.max(0, frame - 62), fps, config: {damping: 17, stiffness: 90, mass: 0.95}, durationInFrames: 65});
  const cardX = interpolate(move, [0, 1], [0, 215]);
  const cardY = interpolate(move, [0, 1], [0, 8]);
  const cardRotate = interpolate(move, [0, 0.55, 1], [0, -4, 0]);
  const confirmation = eased(frame, 105, 20);

  const orders = [
    ['#SF-2851', 'Sofiane B.', 'Blida', '6,900 DZD', 'Smart watch', 'blue'],
    ['#SF-2849', 'Lina K.', 'Oran', '4,500 DZD', 'Skin care set', 'amber'],
    ['#SF-2848', 'Yacine M.', 'Sétif', '8,200 DZD', 'Wireless mic', 'emerald'],
  ] as const;

  return (
    <ChromeWindow title="SahelFlow · Orders" badge="148 TODAY" style={{width: compact ? 1040 : 1380, height: compact ? 610 : 780}}>
      <div style={{height: 'calc(100% - 58px)', display: 'flex'}}>
        <Sidebar active="Orders" />
        <div style={{flex: 1, minWidth: 0, position: 'relative'}}>
          <PageHeader title="Orders" subtitle="One operational state for every COD order" action="+ Capture order" />
          <div style={{padding: '0 26px 24px'}}>
            <div style={{display: 'flex', gap: 10, padding: 10, borderRadius: 14, border: `1px solid ${premiumColors.line}`, background: 'rgba(255,255,255,0.015)', marginBottom: 14}}>
              {['All orders', 'Needs action 18', 'High risk 4', 'Delivery exceptions 7'].map((filter, index) => (
                <div key={filter} style={{padding: '8px 12px', borderRadius: 9, fontSize: 9, fontWeight: 700, color: index === 0 ? premiumColors.text : premiumColors.muted, background: index === 0 ? 'rgba(255,255,255,0.07)' : 'transparent'}}>{filter}</div>
              ))}
              <div style={{marginLeft: 'auto', padding: '8px 13px', borderRadius: 9, border: `1px solid ${premiumColors.line}`, color: premiumColors.muted, fontSize: 9}}>Search orders…</div>
            </div>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10}}>
              {columns.map((column, columnIndex) => (
                <div key={column.label} style={{minHeight: compact ? 410 : 505, borderRadius: 15, border: `1px solid ${premiumColors.line}`, background: 'rgba(255,255,255,0.013)', padding: 10, position: 'relative'}}>
                  <div style={{display: 'flex', alignItems: 'center', gap: 7, padding: '2px 3px 11px'}}>
                    <div style={{width: 7, height: 7, borderRadius: '50%', background: column.color, boxShadow: `0 0 10px ${column.color}`}} />
                    <div style={{fontSize: 9.5, fontWeight: 800}}>{column.label}</div>
                    <div style={{marginLeft: 'auto', color: premiumColors.muted, fontFamily: premiumFonts.mono, fontSize: 8}}>{[18, 12, 43, 39, 36][columnIndex]}</div>
                  </div>
                  <div style={{display: 'flex', flexDirection: 'column', gap: 9}}>
                    {columnIndex === 0 ? (
                      <>
                        <OrderCard id={orders[0][0]} customer={orders[0][1]} city={orders[0][2]} amount={orders[0][3]} product={orders[0][4]} tone="blue" style={{opacity: 0.38}} />
                        <div style={{height: 106}} />
                        <OrderCard id="#SF-2846" customer="Nadia L." city="Alger" amount="5,200 DZD" product="Kitchen set" tone="blue" />
                      </>
                    ) : null}
                    {columnIndex === 1 ? (
                      <>
                        <OrderCard id={orders[1][0]} customer={orders[1][1]} city={orders[1][2]} amount={orders[1][3]} product={orders[1][4]} tone="amber" />
                        <OrderCard id="#SF-2845" customer="Amine R." city="Tlemcen" amount="7,100 DZD" product="Car accessory" tone="amber" />
                      </>
                    ) : null}
                    {columnIndex === 2 ? (
                      <>
                        <OrderCard id={orders[2][0]} customer={orders[2][1]} city={orders[2][2]} amount={orders[2][3]} product={orders[2][4]} tone="emerald" />
                        <OrderCard id="#SF-2844" customer="Sarah T." city="Annaba" amount="3,900 DZD" product="Beauty kit" tone="emerald" />
                      </>
                    ) : null}
                    {columnIndex === 3 ? (
                      <>
                        <OrderCard id="#SF-2843" customer="Mehdi D." city="Batna" amount="11,500 DZD" product="Mini projector" tone="magenta" />
                        <OrderCard id="#SF-2842" customer="Imane S." city="Béjaïa" amount="6,300 DZD" product="Hair styler" tone="magenta" />
                      </>
                    ) : null}
                    {columnIndex === 4 ? (
                      <>
                        <OrderCard id="#SF-2841" customer="Riad A." city="Chlef" amount="9,800 DZD" product="Tool set" tone="blue" />
                        <OrderCard id="#SF-2840" customer="Meriem O." city="Alger" amount="4,100 DZD" product="Storage bags" tone="blue" />
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{position: 'absolute', left: 250 + cardX, top: 185 + cardY, width: 194, transform: `rotate(${cardRotate}deg)`, zIndex: 20, opacity: move < 0.98 ? 1 : 1 - confirmation * 0.08}}>
            <OrderCard id="#SF-2851" customer="Sofiane B." city="Blida" amount="6,900 DZD" product="Smart watch" tone={move > 0.72 ? 'amber' : 'blue'} highlight />
          </div>
          <AnimatedCursor from={[430, 220]} to={[650, 238]} start={40} duration={46} clickAt={92} scale={0.76} />
          <div style={{position: 'absolute', left: 610, top: 312, opacity: confirmation, transform: `translateY(${(1 - confirmation) * 12}px)`}}>
            <StatusPill color={premiumColors.emerald}>State changed · audit recorded</StatusPill>
          </div>
        </div>
      </div>
    </ChromeWindow>
  );
};

const MessageBubble: React.FC<{side: 'left' | 'right'; children: ReactNode; delay: number; color?: string}> = ({side, children, delay, color}) => {
  const frame = useCurrentFrame();
  const enter = eased(frame, delay, 18);
  const right = side === 'right';
  return (
    <div style={{display: 'flex', justifyContent: right ? 'flex-end' : 'flex-start', opacity: enter, transform: `translateY(${(1 - enter) * 16}px)`}}>
      <div style={{maxWidth: '82%', padding: '10px 12px', borderRadius: right ? '13px 13px 4px 13px' : '13px 13px 13px 4px', background: right ? `${premiumColors.emerald}24` : 'rgba(255,255,255,0.065)', border: `1px solid ${color ?? (right ? `${premiumColors.emerald}3a` : premiumColors.line)}`, fontSize: 10, lineHeight: 1.45}}>{children}</div>
    </div>
  );
};

export const InboxCaptureScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const capture = eased(frame, 104, 28);
  const pulse = 0.55 + Math.sin(frame * 0.11) * 0.45;

  return (
    <div style={{width: 1380, height: 770, display: 'grid', gridTemplateColumns: '0.78fr 1.55fr', gap: 22}}>
      <GlassPanel strong style={{position: 'relative', padding: 18, borderRadius: 34}}>
        <div style={{width: 64, height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.13)', margin: '0 auto 14px'}} />
        <div style={{borderRadius: 24, height: 'calc(100% - 20px)', background: 'linear-gradient(180deg, #0b1713, #07100d)', border: `1px solid ${premiumColors.line}`, overflow: 'hidden', display: 'flex', flexDirection: 'column'}}>
          <div style={{padding: '14px 15px', borderBottom: `1px solid ${premiumColors.line}`, display: 'flex', alignItems: 'center', gap: 10}}>
            <div style={{width: 34, height: 34, borderRadius: '50%', background: `${premiumColors.cyan}24`, display: 'grid', placeItems: 'center', color: premiumColors.cyan, fontWeight: 800}}>NB</div>
            <div>
              <div style={{fontSize: 11, fontWeight: 800}}>Nesrine B.</div>
              <div style={{fontSize: 8, color: premiumColors.emerald}}>online</div>
            </div>
            <div style={{marginLeft: 'auto', color: premiumColors.muted, fontSize: 12}}>•••</div>
          </div>
          <div style={{padding: 13, display: 'flex', flexDirection: 'column', gap: 11, flex: 1}}>
            <MessageBubble side="left" delay={5}>سلام، نحب نطلب الساعة الذكية بالأسود.</MessageBubble>
            <MessageBubble side="right" delay={24}>مرحبا! نعم متوفرة. الولاية والبلدية من فضلك؟</MessageBubble>
            <MessageBubble side="left" delay={45}>البليدة، بوفاريك. 0550 12 34 56</MessageBubble>
            <MessageBubble side="right" delay={65}>تم تسجيل الطلب. المجموع 6,900 دج مع التوصيل.</MessageBubble>
          </div>
          <div style={{padding: 12, borderTop: `1px solid ${premiumColors.line}`}}>
            <div style={{height: 38, borderRadius: 12, background: 'rgba(255,255,255,0.055)', color: premiumColors.muted, fontSize: 9, display: 'flex', alignItems: 'center', padding: '0 12px'}}>Write a message…</div>
          </div>
        </div>
      </GlassPanel>
      <ChromeWindow title="SahelFlow · WhatsApp inbox" badge="CONNECTED" style={{height: 770}}>
        <div style={{height: 'calc(100% - 58px)', display: 'grid', gridTemplateColumns: '250px 1fr 310px'}}>
          <div style={{borderRight: `1px solid ${premiumColors.line}`, padding: 14}}>
            <div style={{height: 36, borderRadius: 11, background: 'rgba(255,255,255,0.045)', padding: '0 11px', color: premiumColors.muted, fontSize: 9, display: 'flex', alignItems: 'center'}}>Search conversations…</div>
            <div style={{marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7}}>
              {[
                ['Nesrine B.', 'البليدة · new order', premiumColors.emerald],
                ['Walid K.', 'Delivery question', premiumColors.blue],
                ['Mouna A.', 'Product availability', premiumColors.amber],
                ['Karim D.', 'Confirmation pending', premiumColors.magenta],
              ].map(([name, preview, color], index) => (
                <div key={name} style={{padding: '11px 10px', borderRadius: 12, background: index === 0 ? `${premiumColors.emerald}0e` : 'transparent', border: `1px solid ${index === 0 ? `${premiumColors.emerald}26` : 'transparent'}`, display: 'flex', gap: 9}}>
                  <div style={{width: 31, height: 31, borderRadius: 10, background: `${color}1e`, display: 'grid', placeItems: 'center', color, fontSize: 9, fontWeight: 800}}>{name.split(' ').map((part) => part[0]).join('')}</div>
                  <div style={{minWidth: 0}}>
                    <div style={{fontSize: 10, fontWeight: 750}}>{name}</div>
                    <div style={{fontSize: 8, color: premiumColors.muted, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{preview}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{padding: 20, position: 'relative'}}>
            <div style={{fontSize: 12, fontWeight: 800}}>Nesrine B.</div>
            <div style={{fontSize: 8.5, color: premiumColors.muted, marginTop: 4}}>WhatsApp · Customer found · Blida</div>
            <div style={{display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22}}>
              <MessageBubble side="left" delay={5}>سلام، نحب نطلب الساعة الذكية بالأسود.</MessageBubble>
              <MessageBubble side="right" delay={24}>مرحبا! نعم متوفرة. الولاية والبلدية من فضلك؟</MessageBubble>
              <MessageBubble side="left" delay={45}>البليدة، بوفاريك. 0550 12 34 56</MessageBubble>
              <MessageBubble side="right" delay={65}>تم تسجيل الطلب. المجموع 6,900 دج مع التوصيل.</MessageBubble>
            </div>
            <div style={{position: 'absolute', left: 22, right: 22, bottom: 18, height: 43, borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: `1px solid ${premiumColors.line}`, display: 'flex', alignItems: 'center', padding: '0 12px', color: premiumColors.muted, fontSize: 9}}>Reply or use a saved template…</div>
          </div>
          <div style={{borderLeft: `1px solid ${premiumColors.line}`, padding: 16, background: 'rgba(255,255,255,0.012)'}}>
            <div style={{fontSize: 11, fontWeight: 800}}>Order capture</div>
            <div style={{fontSize: 8.5, color: premiumColors.muted, marginTop: 4}}>Review before creating the canonical order</div>
            <div style={{marginTop: 15, display: 'flex', flexDirection: 'column', gap: 9}}>
              {[
                ['Customer', 'Nesrine B.'],
                ['Phone', '0550 12 34 56'],
                ['Location', 'Boufarik · Blida'],
                ['Product', 'Smart watch · Black'],
                ['Total', '6,900 DZD'],
              ].map(([label, value], index) => (
                <div key={label} style={{padding: '10px 11px', borderRadius: 11, background: 'rgba(255,255,255,0.025)', border: `1px solid ${premiumColors.line}`, opacity: clamp(capture * 1.4 - index * 0.12), transform: `translateX(${(1 - clamp(capture * 1.4 - index * 0.12)) * 18}px)`}}>
                  <div style={{fontSize: 7.5, color: premiumColors.muted, textTransform: 'uppercase', letterSpacing: 0.8}}>{label}</div>
                  <div style={{fontSize: 10, fontWeight: 750, marginTop: 4}}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{marginTop: 12, height: 38, borderRadius: 11, background: `linear-gradient(135deg, ${premiumColors.emeraldBright}, ${premiumColors.emerald})`, color: '#032415', display: 'grid', placeItems: 'center', fontWeight: 850, fontSize: 10, boxShadow: `0 0 ${30 + pulse * 15}px rgba(53,233,143,0.28)`, opacity: capture}}>Create reviewed order</div>
          </div>
        </div>
      </ChromeWindow>
    </div>
  );
};

type NodeProps = {x: number; y: number; title: string; subtitle: string; color: string; delay: number; icon: string};
const AutomationNode: React.FC<NodeProps> = ({x, y, title, subtitle, color, delay, icon}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame: Math.max(0, frame - delay), fps, config: {damping: 17, stiffness: 105}, durationInFrames: 34});
  return (
    <div style={{position: 'absolute', left: x, top: y, width: 214, padding: 15, borderRadius: 16, border: `1px solid ${color}45`, background: `linear-gradient(145deg, ${color}14, rgba(9,17,14,0.94))`, boxShadow: `0 20px 50px rgba(0,0,0,0.32), 0 0 40px ${color}12`, transform: `scale(${0.82 + enter * 0.18}) translateY(${(1 - enter) * 24}px)`, opacity: enter}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
        <div style={{width: 34, height: 34, borderRadius: 11, display: 'grid', placeItems: 'center', background: `${color}20`, color, fontSize: 15}}>{icon}</div>
        <div>
          <div style={{fontSize: 11, fontWeight: 800}}>{title}</div>
          <div style={{fontSize: 8, color: premiumColors.muted, marginTop: 3}}>{subtitle}</div>
        </div>
      </div>
    </div>
  );
};

const Connector: React.FC<{from: [number, number]; to: [number, number]; delay: number; color?: string}> = ({from, to, delay, color = premiumColors.emerald}) => {
  const frame = useCurrentFrame();
  const draw = eased(frame, delay, 32);
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  return (
    <div style={{position: 'absolute', left: from[0], top: from[1], width: length, height: 2, transform: `rotate(${angle}deg)`, transformOrigin: 'left center', background: `linear-gradient(90deg, ${color}, ${color}20)`, opacity: 0.72, clipPath: `inset(0 ${100 - draw * 100}% 0 0)`, boxShadow: `0 0 12px ${color}`}}>
      <div style={{position: 'absolute', right: 0, top: -3, width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 14px ${color}`}} />
    </div>
  );
};

export const AutomationCanvas: React.FC = () => {
  const frame = useCurrentFrame();
  const completed = eased(frame, 120, 22);
  return (
    <ChromeWindow title="SahelFlow · Automation studio" badge="SELLER CONTROLLED" style={{width: 1380, height: 770}}>
      <div style={{height: 'calc(100% - 58px)', display: 'flex'}}>
        <Sidebar active="Automations" />
        <div style={{flex: 1, position: 'relative', overflow: 'hidden'}}>
          <PageHeader title="Confirmation flow" subtitle="Repeatable work with visible rules and outcomes" action="Test flow" />
          <div style={{position: 'absolute', left: 22, right: 22, top: 94, bottom: 22, borderRadius: 18, border: `1px solid ${premiumColors.line}`, backgroundImage: 'radial-gradient(rgba(181,255,216,0.12) 1px, transparent 1px)', backgroundSize: '24px 24px', backgroundColor: 'rgba(2,8,6,0.42)', overflow: 'hidden'}}>
            <Connector from={[205, 190]} to={[373, 190]} delay={22} />
            <Connector from={[585, 190]} to={[750, 120]} delay={52} color={premiumColors.blue} />
            <Connector from={[585, 190]} to={[750, 320]} delay={52} color={premiumColors.amber} />
            <Connector from={[960, 120]} to={[1070, 215]} delay={83} color={premiumColors.emerald} />
            <Connector from={[960, 320]} to={[1070, 245]} delay={83} color={premiumColors.emerald} />
            <AutomationNode x={20} y={135} title="New COD order" subtitle="Trigger · any shop" color={premiumColors.blue} delay={0} icon="⚡" />
            <AutomationNode x={373} y={135} title="Validate order" subtitle="Phone, address, stock" color={premiumColors.emerald} delay={25} icon="✓" />
            <AutomationNode x={750} y={65} title="Send confirmation" subtitle="Approved WhatsApp template" color={premiumColors.blue} delay={55} icon="◌" />
            <AutomationNode x={750} y={265} title="Create task" subtitle="Operator follow-up queue" color={premiumColors.amber} delay={55} icon="▦" />
            <AutomationNode x={1070} y={170} title="Record outcome" subtitle="Order state + audit trail" color={premiumColors.emerald} delay={88} icon="◎" />
            <div style={{position: 'absolute', left: 910, bottom: 36, padding: '12px 15px', borderRadius: 13, background: `${premiumColors.emerald}12`, border: `1px solid ${premiumColors.emerald}38`, opacity: completed, transform: `translateY(${(1 - completed) * 18}px)`}}>
              <div style={{fontSize: 8, color: premiumColors.emerald, textTransform: 'uppercase', fontWeight: 800, letterSpacing: 1.2}}>Dry run complete</div>
              <div style={{fontSize: 11, fontWeight: 800, marginTop: 5}}>5 steps · 0 unsafe effects</div>
            </div>
            <AnimatedCursor from={[1110, 480]} to={[1020, 488]} start={92} duration={30} clickAt={122} scale={0.75} />
          </div>
        </div>
      </div>
    </ChromeWindow>
  );
};

const cityNodes = [
  {name: 'Alger', x: 540, y: 180, volume: 52, color: premiumColors.emerald},
  {name: 'Oran', x: 245, y: 270, volume: 31, color: premiumColors.blue},
  {name: 'Sétif', x: 770, y: 255, volume: 28, color: premiumColors.amber},
  {name: 'Constantine', x: 955, y: 215, volume: 23, color: premiumColors.magenta},
  {name: 'Ouargla', x: 720, y: 485, volume: 14, color: premiumColors.cyan},
];

export const DeliveryMapScreen: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <ChromeWindow title="SahelFlow · Delivery control" badge="7 EXCEPTIONS" style={{width: 1380, height: 770}}>
      <div style={{height: 'calc(100% - 58px)', display: 'flex'}}>
        <Sidebar active="Delivery" />
        <div style={{flex: 1, position: 'relative'}}>
          <PageHeader title="Delivery control" subtitle="See courier movement, exceptions, and COD collection in one place" action="Reconcile COD" />
          <div style={{display: 'grid', gridTemplateColumns: '1.7fr 0.8fr', gap: 14, padding: '0 26px 24px', height: 610}}>
            <div style={{position: 'relative', border: `1px solid ${premiumColors.line}`, borderRadius: 18, overflow: 'hidden', background: 'radial-gradient(circle at 50% 42%, rgba(53,233,143,0.08), transparent 38%), rgba(255,255,255,0.012)'}}>
              <div style={{position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(181,255,216,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(181,255,216,0.06) 1px, transparent 1px)', backgroundSize: '38px 38px', opacity: 0.45}} />
              <svg width="100%" height="100%" viewBox="0 0 1120 580" style={{position: 'absolute', inset: 0}}>
                <path d="M120 330 C 250 160, 390 120, 540 180 S 820 260, 1040 160" stroke="rgba(197,216,206,0.1)" strokeWidth="2" fill="none" />
                <path d="M220 500 C 390 360, 570 380, 720 485" stroke="rgba(197,216,206,0.07)" strokeWidth="2" fill="none" />
                {cityNodes.slice(1).map((city, index) => {
                  const origin = cityNodes[0];
                  const draw = eased(frame, 20 + index * 12, 45);
                  const path = `M ${origin.x} ${origin.y} Q ${(origin.x + city.x) / 2} ${Math.min(origin.y, city.y) - 90 - index * 8} ${city.x} ${city.y}`;
                  return (
                    <path key={city.name} d={path} fill="none" stroke={city.color} strokeWidth="3" strokeDasharray="700" strokeDashoffset={700 * (1 - draw)} opacity={0.7} style={{filter: `drop-shadow(0 0 8px ${city.color})`}} />
                  );
                })}
              </svg>
              {cityNodes.map((city, index) => {
                const enter = eased(frame, 10 + index * 10, 26);
                const pulse = 0.5 + Math.sin(frame * 0.08 + index) * 0.5;
                return (
                  <div key={city.name} style={{position: 'absolute', left: city.x - 30, top: city.y - 30, width: 60, textAlign: 'center', opacity: enter, transform: `scale(${0.75 + enter * 0.25})`}}>
                    <div style={{width: 17 + pulse * 4, height: 17 + pulse * 4, margin: '0 auto', borderRadius: '50%', background: city.color, border: '4px solid rgba(5,8,7,0.9)', boxShadow: `0 0 ${20 + pulse * 18}px ${city.color}`}} />
                    <div style={{fontSize: 9, fontWeight: 800, marginTop: 6}}>{city.name}</div>
                    <div style={{fontSize: 7.5, color: premiumColors.muted}}>{city.volume} orders</div>
                  </div>
                );
              })}
              <div style={{position: 'absolute', left: 24, bottom: 22, display: 'flex', gap: 8}}>
                <StatusPill color={premiumColors.emerald}>83% delivered</StatusPill>
                <StatusPill color={premiumColors.amber}>7 exceptions</StatusPill>
                <StatusPill color={premiumColors.blue}>3 couriers</StatusPill>
              </div>
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
              <div style={{border: `1px solid ${premiumColors.line}`, borderRadius: 16, padding: 16, background: 'rgba(255,255,255,0.016)'}}>
                <div style={{fontSize: 10, color: premiumColors.muted}}>COD expected</div>
                <MetricValue value={842000} suffix=" DZD" delay={20} style={{fontSize: 25, fontWeight: 800, marginTop: 8, letterSpacing: -1.1}} />
                <Sparkline values={[12, 18, 15, 23, 26, 28, 37, 43, 49]} width={245} height={80} delay={24} color={premiumColors.blue} />
              </div>
              <div style={{border: `1px solid ${premiumColors.line}`, borderRadius: 16, padding: 16, background: 'rgba(255,255,255,0.016)', flex: 1}}>
                <div style={{fontSize: 11, fontWeight: 800}}>Needs attention</div>
                <div style={{display: 'flex', flexDirection: 'column', gap: 9, marginTop: 13}}>
                  {[
                    ['#SF-2798', 'Customer unreachable', premiumColors.red],
                    ['#SF-2804', 'Address clarification', premiumColors.amber],
                    ['#SF-2811', 'Courier status stale', premiumColors.blue],
                    ['#SF-2819', 'COD mismatch', premiumColors.magenta],
                  ].map(([id, issue, color], index) => {
                    const item = eased(frame, 45 + index * 7, 20);
                    return (
                      <div key={id} style={{padding: '11px 10px', borderRadius: 11, background: 'rgba(255,255,255,0.024)', border: `1px solid ${premiumColors.line}`, opacity: item, transform: `translateX(${(1 - item) * 16}px)`}}>
                        <div style={{display: 'flex', justifyContent: 'space-between'}}>
                          <div style={{fontFamily: premiumFonts.mono, fontSize: 8, color}}>{id}</div>
                          <div style={{width: 6, height: 6, borderRadius: '50%', background: color}} />
                        </div>
                        <div style={{fontSize: 9.5, fontWeight: 700, marginTop: 6}}>{issue}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ChromeWindow>
  );
};

export const LocalFirstVisual: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const core = springIn(frame, fps, 10, 17);
  return (
    <div style={{position: 'relative', width: 980, height: 660}}>
      {[0, 1, 2].map((ring) => {
        const rotation = frame * (ring % 2 === 0 ? 0.18 : -0.13) + ring * 28;
        return (
          <div key={ring} style={{position: 'absolute', left: 490 - (230 + ring * 70), top: 330 - (230 + ring * 70), width: (230 + ring * 70) * 2, height: (230 + ring * 70) * 2, borderRadius: '50%', border: `1px solid ${ring === 0 ? `${premiumColors.emerald}52` : premiumColors.line}`, transform: `rotate(${rotation}deg)`, opacity: 0.65 - ring * 0.13}}>
            <div style={{position: 'absolute', left: '50%', top: -5, width: 10, height: 10, borderRadius: '50%', background: [premiumColors.emerald, premiumColors.blue, premiumColors.amber][ring], boxShadow: `0 0 18px ${[premiumColors.emerald, premiumColors.blue, premiumColors.amber][ring]}`}} />
          </div>
        );
      })}
      <div style={{position: 'absolute', left: 285, top: 125, width: 410, height: 410, borderRadius: 52, background: 'linear-gradient(145deg, rgba(20,39,31,0.98), rgba(5,13,10,0.96))', border: `1px solid ${premiumColors.emerald}45`, boxShadow: `${premiumShadow.panel}, ${premiumShadow.glowStrong}`, display: 'grid', placeItems: 'center', transform: `scale(${0.82 + core * 0.18})`, opacity: core}}>
        <div style={{textAlign: 'center'}}>
          <div style={{width: 96, height: 96, borderRadius: 30, margin: '0 auto', background: `linear-gradient(145deg, ${premiumColors.emeraldBright}, ${premiumColors.emeraldDark})`, display: 'grid', placeItems: 'center', color: '#032415', fontSize: 46, fontWeight: 900, boxShadow: premiumShadow.glowStrong}}>S</div>
          <div style={{fontSize: 25, fontWeight: 850, marginTop: 22}}>Windows desktop authority</div>
          <div style={{fontSize: 13, color: premiumColors.textSoft, marginTop: 9}}>Your operational data stays under seller control.</div>
          <div style={{display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20}}>
            <StatusPill color={premiumColors.emerald}>Local-first</StatusPill>
            <StatusPill color={premiumColors.blue}>5 shops</StatusPill>
          </div>
        </div>
      </div>
      {[
        ['Orders', 80, 150, premiumColors.blue],
        ['Inventory', 760, 120, premiumColors.amber],
        ['Customers', 60, 475, premiumColors.magenta],
        ['Analytics', 790, 480, premiumColors.cyan],
      ].map(([label, x, y, color], index) => {
        const item = springIn(frame, fps, 35 + index * 6, 18);
        return (
          <div key={label} style={{position: 'absolute', left: x, top: y, padding: '13px 16px', borderRadius: 14, background: `${color}12`, border: `1px solid ${color}35`, color, fontWeight: 800, fontSize: 12, boxShadow: `0 0 34px ${color}10`, transform: `scale(${0.8 + item * 0.2})`, opacity: item}}>{label}</div>
        );
      })}
    </div>
  );
};
