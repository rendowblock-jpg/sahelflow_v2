import React, {CSSProperties, ReactNode} from 'react';
import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig, interpolate} from 'remotion';
import {premiumFonts} from '../v2/fonts';
import {V4, ease, enter, fade} from './design';

const trims: Record<string, number> = {
  'dashboard-fr.webm': 170,
  'orders-fr.webm': 110,
  'deliveries-fr.webm': 105,
  'automations-en.webm': 55,
  'inbox-ar.webm': 190,
};

const Stage: React.FC<{children: ReactNode; bg?: string; accent?: string; light?: boolean; grain?: boolean}> = ({children, bg, accent = V4.green, light = false, grain = true}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const drift = Math.sin(frame * .01) * width * .02;
  const base = bg ?? (light ? V4.ivory : V4.black);
  return <AbsoluteFill style={{overflow:'hidden', background:base, color:light ? V4.black : V4.white, fontFamily:premiumFonts.sans}}>
    <AbsoluteFill style={{background:light ? 'linear-gradient(135deg,#F5F2E9,#DED8C9)' : 'radial-gradient(circle at 20% 10%,#17231D 0%,#090C0A 34%,#030403 80%)'}} />
    <div style={{position:'absolute', width:width*.7, height:width*.7, left:-width*.25+drift, top:-height*.55, borderRadius:'50%', background:`radial-gradient(circle,${accent}30,transparent 68%)`, filter:'blur(38px)'}} />
    {!light && <AbsoluteFill style={{backgroundImage:'linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px)',backgroundSize:'54px 54px',maskImage:'linear-gradient(to bottom,black,transparent 82%)',opacity:.35}}/>}
    {grain && <AbsoluteFill style={{opacity:light ? .055 : .035, mixBlendMode:light?'multiply':'soft-light', transform:`translate(${frame%4}px,${(frame%5)*.5}px)`, backgroundImage:'url("data:image/svg+xml,%3Csvg viewBox=%270 0 160 160%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%274%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27/%3E%3C/svg%3E")'}}/>}
    {children}
    <AbsoluteFill style={{boxShadow:`inset 0 0 ${width*.13}px rgba(0,0,0,${light?.18:.78})`, pointerEvents:'none'}} />
  </AbsoluteFill>;
};

const FrameFade: React.FC<{duration:number; children:ReactNode}> = ({duration,children}) => {
  const frame=useCurrentFrame();
  return <AbsoluteFill style={{opacity:fade(frame,duration)}}>{children}</AbsoluteFill>;
};

const Wordmark: React.FC<{size?:number; dark?:boolean}> = ({size=48,dark=false}) => <div style={{display:'flex',alignItems:'center',gap:size*.25}}>
  <div style={{width:size,height:size,borderRadius:size*.28,background:`linear-gradient(145deg,${V4.green},${V4.greenDeep})`,display:'grid',placeItems:'center',color:'#052515',fontWeight:900,fontSize:size*.52,boxShadow:`0 0 ${size}px rgba(107,255,149,.28)`}}>S</div>
  <div style={{fontWeight:850,fontSize:size*.64,letterSpacing:-size*.035,color:dark?V4.black:V4.white}}>Sahel<span style={{color:V4.greenDeep}}>Flow</span></div>
</div>;

const BigCopy: React.FC<{eyebrow?:string; headline:string; body?:string; light?:boolean; align?:'left'|'center'|'right'; compact?:boolean; style?:CSSProperties}> = ({eyebrow,headline,body,light=false,align='left',compact=false,style}) => {
  const frame=useCurrentFrame(); const {fps}=useVideoConfig(); const p=enter(frame,fps,4,20);
  return <div style={{textAlign:align,maxWidth:compact?680:1120,transform:`translateY(${(1-p)*55}px)`,opacity:p,...style}}>
    {eyebrow&&<div style={{fontSize:15,fontWeight:850,letterSpacing:3.5,color:light?V4.greenDeep:V4.green,marginBottom:22}}>{eyebrow}</div>}
    <div style={{whiteSpace:'pre-line',fontSize:compact?58:94,lineHeight:.94,letterSpacing:compact?-3.5:-6,fontWeight:860}}>{headline}</div>
    {body&&<div style={{fontSize:compact?20:25,lineHeight:1.45,color:light?'#444B47':'#AFB8B3',marginTop:25,maxWidth:'85%',marginInline:align==='center'?'auto':undefined}}>{body}</div>}
  </div>;
};

const ProductShot: React.FC<{asset:string; video?:boolean; crop?:string; scale?:number; x?:number; y?:number; rotate?:number; radius?:number; chrome?:boolean; style?:CSSProperties; startFrom?:number}> = ({asset,video=false,crop='50% 50%',scale=1,x=0,y=0,rotate=0,radius=28,chrome=true,style,startFrom=0}) => {
  const frame=useCurrentFrame(); const {fps}=useVideoConfig(); const p=enter(frame,fps,0,18); const drift=Math.sin((frame+asset.length)*.009)*4;
  const mediaStyle:CSSProperties={position:'absolute',inset:chrome?'38px 0 0':'0',width:'100%',height:chrome?'calc(100% - 38px)':'100%',objectFit:'cover',objectPosition:crop};
  return <div style={{position:'relative',width:'100%',height:'100%',perspective:2200,...style}}>
    <div style={{position:'absolute',inset:0,overflow:'hidden',borderRadius:radius,border:`1px solid rgba(255,255,255,.17)`,background:'#080A09',boxShadow:'0 42px 130px rgba(0,0,0,.62)',transform:`translate3d(${x+drift}px,${y+(1-p)*70}px,0) scale(${scale*(.94+p*.06)}) rotateZ(${rotate}deg)`,opacity:p}}>
      {chrome&&<div style={{position:'absolute',inset:'0 0 auto',height:38,background:'rgba(2,5,4,.92)',borderBottom:'1px solid rgba(255,255,255,.11)',display:'flex',alignItems:'center',padding:'0 14px',gap:7,zIndex:4}}>{[V4.red,V4.amber,V4.green].map(c=><span key={c} style={{width:7,height:7,borderRadius:'50%',background:c}}/>)}<span style={{fontSize:10,letterSpacing:1.1,color:'#87918C',marginLeft:7}}>SAHELFLOW / LIVE PRODUCT</span></div>}
      {video?<OffthreadVideo src={staticFile(`captures/${asset}`)} startFrom={Math.max(startFrom,trims[asset]??0)} muted style={mediaStyle}/>:<Img src={staticFile(`captures/${asset}`)} style={mediaStyle}/>} 
      <div style={{position:'absolute',inset:0,background:'linear-gradient(135deg,rgba(255,255,255,.05),transparent 24%,transparent 70%,rgba(107,255,149,.05))',pointerEvents:'none',zIndex:5}}/>
    </div>
  </div>;
};

const OrderCapsule: React.FC<{label?:string; amount?:string; stage?:string; color?:string; progress?:number; style?:CSSProperties; arabic?:boolean}> = ({label='Fatima Zohra',amount='5,900 DA',stage='CAPTURED',color=V4.green,progress=1,style,arabic=false}) => {
  const frame=useCurrentFrame(); const {fps}=useVideoConfig(); const p=enter(frame,fps,0,16);
  return <div dir={arabic?'rtl':'ltr'} style={{display:'flex',alignItems:'center',gap:18,padding:'17px 22px',borderRadius:999,background:'rgba(7,10,8,.92)',border:`1px solid ${color}75`,boxShadow:`0 22px 70px rgba(0,0,0,.55),0 0 55px ${color}20`,fontFamily:arabic?premiumFonts.arabic:premiumFonts.sans,transform:`scale(${.88+p*.12})`,opacity:p,...style}}>
    <span style={{width:11,height:11,borderRadius:'50%',background:color,boxShadow:`0 0 20px ${color}`}}/>
    <div><div style={{fontSize:14,color:'#A7B0AB'}}>{label}</div><div style={{fontSize:23,fontWeight:850,letterSpacing:-.7}}>{amount}</div></div>
    <div style={{width:90,height:5,borderRadius:99,background:'rgba(255,255,255,.11)',overflow:'hidden'}}><div style={{height:'100%',width:`${progress*100}%`,background:color}}/></div>
    <div style={{fontSize:12,letterSpacing:2,fontWeight:850,color}}>{stage}</div>
  </div>;
};

const StatusRail: React.FC<{active:number; vertical?:boolean}> = ({active,vertical=false}) => {
  const items=[['CAPTURED',V4.red],['CONFIRMED',V4.amber],['SHIPPED',V4.blue],['DELIVERED',V4.green]] as const;
  return <div style={{display:'flex',flexDirection:vertical?'column':'row',gap:vertical?13:12}}>{items.map(([t,c],i)=><div key={t} style={{display:'flex',alignItems:'center',gap:9,padding:vertical?'15px 17px':'11px 15px',borderRadius:14,background:i<=active?`${c}18`:'rgba(255,255,255,.045)',border:`1px solid ${i<=active?c+'70':'rgba(255,255,255,.1)'}`,color:i<=active?c:'#68716C',fontSize:vertical?17:12,fontWeight:850,letterSpacing:1}}><span style={{width:7,height:7,borderRadius:'50%',background:i<=active?c:'#4A504D'}}/>{t}</div>)}</div>;
};

const SignalLine: React.FC<{progress:number; color?:string; vertical?:boolean}> = ({progress,color=V4.green,vertical=false}) => {
  const dash=1200*(1-progress);
  return vertical?<svg viewBox="0 0 200 1000" style={{position:'absolute',width:200,height:1000}}><path d="M100 10 C20 160 180 280 100 430 S20 720 100 990" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="4"/><path d="M100 10 C20 160 180 280 100 430 S20 720 100 990" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray="1200" strokeDashoffset={dash}/></svg>:<svg viewBox="0 0 1400 260" style={{position:'absolute',width:'100%',height:'100%'}}><path d="M15 165 C190 165 190 55 360 55 S560 220 760 150 S1010 35 1380 75" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="3"/><path d="M15 165 C190 165 190 55 360 55 S560 220 760 150 S1010 35 1380 75" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray="1600" strokeDashoffset={1600*(1-progress)}/></svg>;
};

const ChaosScene: React.FC<{duration:number;vertical?:boolean}> = ({duration,vertical=false}) => {
  const frame=useCurrentFrame(); const {width,height,fps}=useVideoConfig(); const p=enter(frame,fps,0,15); const collapse=ease(frame,duration-42,34);
  const shots=vertical?[
    {a:'inbox-ar.png',x:70,y:160,w:940,h:580,r:-4},
    {a:'orders-vertical-fr.png',x:80,y:820,w:920,h:760,r:4},
  ]:[
    {a:'inbox-ar.png',x:35,y:120,w:780,h:470,r:-5},
    {a:'orders-fr.png',x:1050,y:70,w:800,h:470,r:4},
    {a:'deliveries-fr.png',x:100,y:610,w:760,h:430,r:3},
    {a:'analytics-fr.png',x:1040,y:590,w:810,h:430,r:-4},
  ];
  return <FrameFade duration={duration}><Stage accent={V4.red}>
    {shots.map((s)=>{const cx=width/2-s.w/2,cy=height/2-s.h/2;return <ProductShot key={s.a} asset={s.a} chrome={false} style={{position:'absolute',width:s.w,height:s.h,left:interpolate(collapse,[0,1],[s.x,cx]),top:interpolate(collapse,[0,1],[s.y,cy])}} scale={interpolate(collapse,[0,1],[1,.1])} rotate={s.r*(1-collapse)}/>})}
    <div style={{position:'absolute',inset:0,display:'grid',placeItems:'center',padding:vertical?70:0}}><div style={{opacity:(1-collapse)*p,textAlign:'center'}}><div style={{fontSize:vertical?76:104,lineHeight:.9,fontWeight:900,letterSpacing:vertical?-4:-7}}>ONE ORDER.<br/><span style={{color:V4.red}}>SIX PLACES TO LOSE IT.</span></div><div style={{fontSize:vertical?22:24,color:'#AAB2AE',marginTop:26}}>Messages. Sheets. Stock. Couriers. Exceptions. Cash.</div></div></div>
  </Stage></FrameFade>;
};

const ThesisScene: React.FC<{duration:number}> = ({duration}) => {
  const frame=useCurrentFrame();
  return <FrameFade duration={duration}><Stage light accent={V4.greenDeep}>
    <div style={{position:'absolute',left:110,top:110}}><Wordmark size={42} dark/></div>
    <div style={{position:'absolute',left:120,top:280,width:1280}}><BigCopy light eyebrow="THE REAL PROBLEM" headline={'The order is not broken.\nThe operation around it is.'} body="SahelFlow turns every COD order into one visible, controlled journey."/></div>
    <div style={{position:'absolute',left:170,bottom:80,width:1550,height:250}}><SignalLine progress={ease(frame,20,duration-50)} color={V4.greenDeep}/></div>
  </Stage></FrameFade>;
};

const ConversationScene: React.FC<{duration:number;vertical?:boolean}> = ({duration,vertical=false}) => {
  const frame=useCurrentFrame(); const p=ease(frame,8,duration-25);
  return <FrameFade duration={duration}><Stage accent={V4.grape}>
    <div style={{position:'absolute',left:vertical?38:70,top:vertical?260:70,width:vertical?1004:1230,height:vertical?1250:920}}><ProductShot asset="inbox-ar.png" crop={vertical?'63% 50%':'58% 50%'} scale={vertical?1.18:1.08} chrome={!vertical}/></div>
    <div style={{position:'absolute',left:vertical?70:1340,top:vertical?70:110,width:vertical?940:500}}><BigCopy compact={vertical} eyebrow="01 · MESSAGE" headline={vertical?'رسالة واحدة.\nطلب واضح.':'A message becomes\na real order.'} body={vertical?undefined:'The customer context stays connected to the order from the first conversation.'} align={vertical?'center':'left'}/></div>
    <OrderCapsule arabic label="فاطمة الزهراء" amount="5,900 DA" stage="CAPTURED" color={V4.red} progress={p*.25} style={{position:'absolute',left:vertical?80:1320,bottom:vertical?90:115}}/>
  </Stage></FrameFade>;
};

const OrderScene: React.FC<{duration:number;vertical?:boolean}> = ({duration,vertical=false}) => {
  const frame=useCurrentFrame(); const p=ease(frame,10,duration-30);
  return <FrameFade duration={duration}><Stage accent={V4.amber}>
    <div style={{position:'absolute',left:vertical?34:65,top:vertical?300:68,width:vertical?1012:1430,height:vertical?1170:920}}><ProductShot asset={vertical?'orders-vertical-fr.png':'orders-fr.png'} crop={vertical?'50% 35%':'50% 48%'} scale={vertical?1.12:1.04} chrome={!vertical}/></div>
    <div style={{position:'absolute',right:vertical?60:75,top:vertical?75:95,width:vertical?960:455}}><BigCopy compact eyebrow="02 · CONFIRMATION" headline={vertical?'One order.\nOne visible journey.':'Nothing disappears\nbetween teams.'} body={vertical?undefined:'Confirmation, inventory, and status stay connected to the same order.'} align={vertical?'center':'left'}/></div>
    <div style={{position:'absolute',right:vertical?85:88,bottom:vertical?95:105}}><StatusRail active={Math.min(1,Math.floor(p*2))} vertical={vertical}/></div>
  </Stage></FrameFade>;
};

const DeliveryScene: React.FC<{duration:number}> = ({duration}) => {
  const frame=useCurrentFrame(); const p=ease(frame,8,duration-35);
  return <FrameFade duration={duration}><Stage accent={V4.blue}>
    <div style={{position:'absolute',left:72,top:70,width:1360,height:920}}><ProductShot asset="deliveries-fr.png" crop="48% 52%" scale={1.04}/></div>
    <div style={{position:'absolute',right:80,top:98,width:430}}><BigCopy compact eyebrow="03 · DELIVERY" headline={'Exceptions become\nactionable.'} body="Courier progress and delivery failures stay visible while there is still time to act."/></div>
    <OrderCapsule amount="5,900 DA" stage="SHIPPED" color={V4.blue} progress={.55+p*.25} style={{position:'absolute',right:90,bottom:110}}/>
  </Stage></FrameFade>;
};

const CashScene: React.FC<{duration:number}> = ({duration}) => {
  const frame=useCurrentFrame(); const p=ease(frame,10,duration-30);
  return <FrameFade duration={duration}><Stage light accent={V4.greenDeep}>
    <div style={{position:'absolute',left:75,top:68,width:1220,height:930}}><ProductShot asset="dashboard-fr.png" crop="45% 45%" scale={1.06}/></div>
    <div style={{position:'absolute',right:80,top:150,width:520}}><BigCopy light compact eyebrow="04 · OUTCOME" headline={'Delivered.\nVisible.\nAccountable.'} body="The order arrives as a result, not another disconnected update."/></div>
    <OrderCapsule amount="5,900 DA" stage="DELIVERED" color={V4.greenDeep} progress={.8+p*.2} style={{position:'absolute',right:92,bottom:150,background:'rgba(245,242,233,.94)',color:V4.black}}/>
  </Stage></FrameFade>;
};

const SystemScene: React.FC<{duration:number;vertical?:boolean}> = ({duration,vertical=false}) => {
  const frame=useCurrentFrame(); const p=ease(frame,10,duration-35);
  const cards=vertical?[
    {a:'dashboard-vertical-ar.png',x:82,y:360,w:916,h:880,r:-2},
    {a:'orders-vertical-fr.png',x:110,y:1010,w:860,h:760,r:2},
  ]:[
    {a:'dashboard-fr.png',x:80,y:200,w:800,h:500,r:-3},
    {a:'orders-fr.png',x:1010,y:100,w:820,h:490,r:3},
    {a:'inbox-ar.png',x:170,y:610,w:790,h:420,r:2},
    {a:'automations-en.png',x:1040,y:580,w:760,h:410,r:-2},
  ];
  return <FrameFade duration={duration}><Stage accent={V4.green}>
    <div style={{position:'absolute',left:vertical?60:100,top:vertical?70:75,right:vertical?60:100,textAlign:'center'}}><BigCopy compact={vertical} align="center" eyebrow="ONE OPERATING FLOW" headline={vertical?'Not more tools.\nOne system.':'Not more tools. One operating flow.'} body={vertical?undefined:'Conversation, order, stock, delivery, automation, and decisions move together.'}/></div>
    {cards.map((c)=><ProductShot key={c.a} asset={c.a} chrome={false} style={{position:'absolute',left:c.x,top:c.y,width:c.w,height:c.h}} rotate={c.r} scale={.9+p*.1}/>) }
    <div style={{position:'absolute',left:vertical?440:250,top:vertical?430:390,width:vertical?200:1400,height:vertical?1000:260}}><SignalLine progress={p} vertical={vertical}/></div>
  </Stage></FrameFade>;
};

const Finale: React.FC<{duration:number;vertical?:boolean}> = ({duration,vertical=false}) => {
  const frame=useCurrentFrame(); const p=enter(frame,30,4,17);
  return <FrameFade duration={duration}><Stage accent={V4.green} grain={false}>
    <div style={{position:'absolute',inset:0,display:'grid',placeItems:'center',textAlign:'center',padding:vertical?70:0}}><div style={{transform:`scale(${.87+p*.13})`,opacity:p}}><div style={{display:'flex',justifyContent:'center'}}><Wordmark size={vertical?72:66}/></div><div style={{fontSize:vertical?82:94,lineHeight:.92,letterSpacing:vertical?-5:-6.5,fontWeight:900,marginTop:36}}>EVERY ORDER.<br/><span style={{color:V4.green}}>ONE VISIBLE FLOW.</span></div><div style={{fontSize:vertical?20:22,color:'#AEB8B2',marginTop:25}}>Built around Algerian COD operations.</div></div></div>
  </Stage></FrameFade>;
};

const Score:React.FC<{file:string;volume?:number}>=({file,volume=.78})=><Audio src={staticFile(`audio/${file}`)} volume={volume}/>;

export const V4_HERO=1440;
export const V4_SOCIAL=600;
export const V4_VERTICAL=360;
export const V4_DEMO=2250;
export const V4_LOOP=240;

export const V4Hero48:React.FC=()=> <AbsoluteFill><Score file="v4-hero-48.wav"/>
  <Sequence from={0} durationInFrames={105}><ChaosScene duration={105}/></Sequence>
  <Sequence from={86} durationInFrames={125}><ThesisScene duration={125}/></Sequence>
  <Sequence from={190} durationInFrames={220}><ConversationScene duration={220}/></Sequence>
  <Sequence from={385} durationInFrames={230}><OrderScene duration={230}/></Sequence>
  <Sequence from={590} durationInFrames={220}><DeliveryScene duration={220}/></Sequence>
  <Sequence from={785} durationInFrames={220}><CashScene duration={220}/></Sequence>
  <Sequence from={980} durationInFrames={300}><SystemScene duration={300}/></Sequence>
  <Sequence from={1245} durationInFrames={195}><Finale duration={195}/></Sequence>
</AbsoluteFill>;

export const V4Social20:React.FC=()=> <AbsoluteFill><Score file="v4-social-20.wav" volume={.82}/>
  <Sequence from={0} durationInFrames={72}><ChaosScene duration={72}/></Sequence>
  <Sequence from={58} durationInFrames={130}><ConversationScene duration={130}/></Sequence>
  <Sequence from={165} durationInFrames={135}><OrderScene duration={135}/></Sequence>
  <Sequence from={275} durationInFrames={135}><DeliveryScene duration={135}/></Sequence>
  <Sequence from={385} durationInFrames={130}><SystemScene duration={130}/></Sequence>
  <Sequence from={490} durationInFrames={110}><Finale duration={110}/></Sequence>
</AbsoluteFill>;

export const V4Vertical12:React.FC=()=> <AbsoluteFill><Score file="v4-vertical-12.wav" volume={.84}/>
  <Sequence from={0} durationInFrames={60}><ChaosScene duration={60} vertical/></Sequence>
  <Sequence from={48} durationInFrames={100}><ConversationScene duration={100} vertical/></Sequence>
  <Sequence from={130} durationInFrames={100}><OrderScene duration={100} vertical/></Sequence>
  <Sequence from={212} durationInFrames={88}><SystemScene duration={88} vertical/></Sequence>
  <Sequence from={285} durationInFrames={75}><Finale duration={75} vertical/></Sequence>
</AbsoluteFill>;

export const V4Demo75:React.FC=()=> <AbsoluteFill><Score file="v4-demo-75.wav" volume={.7}/>
  <Sequence from={0} durationInFrames={120}><ChaosScene duration={120}/></Sequence>
  <Sequence from={100} durationInFrames={170}><ThesisScene duration={170}/></Sequence>
  <Sequence from={240} durationInFrames={360}><ConversationScene duration={360}/></Sequence>
  <Sequence from={565} durationInFrames={400}><OrderScene duration={400}/></Sequence>
  <Sequence from={925} durationInFrames={360}><DeliveryScene duration={360}/></Sequence>
  <Sequence from={1245} durationInFrames={360}><CashScene duration={360}/></Sequence>
  <Sequence from={1565} durationInFrames={470}><SystemScene duration={470}/></Sequence>
  <Sequence from={1995} durationInFrames={255}><Finale duration={255}/></Sequence>
</AbsoluteFill>;

export const V4LandingLoop8:React.FC=()=> <AbsoluteFill>
  <Sequence from={0} durationInFrames={120}><SystemScene duration={120}/></Sequence>
  <Sequence from={95} durationInFrames={145}><Finale duration={145}/></Sequence>
</AbsoluteFill>;
