import fs from 'node:fs';
import path from 'node:path';

const sampleRate=48000;
const outDir=path.resolve('public/audio');
fs.mkdirSync(outDir,{recursive:true});

function rng(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
function writeWav(name,duration,seed,bpm=116){
  const n=Math.floor(duration*sampleRate), channels=2, data=Buffer.alloc(n*channels*2), r=rng(seed);
  const beat=60/bpm;
  const boundaries=[0,2.5,6.2,13,20,27,34,41,46];
  for(let i=0;i<n;i++){
    const t=i/sampleRate;
    let s=0;
    const kickPhase=(t%beat);
    const kick=Math.exp(-kickPhase*18)*Math.sin(2*Math.PI*(48+55*Math.exp(-kickPhase*14))*kickPhase);
    s+=kick*.32;
    const chord=[55,65.41,73.42,82.41][Math.floor(t/(beat*4))%4];
    s+=(Math.sin(2*Math.PI*chord*t)+.45*Math.sin(2*Math.PI*chord*2*t))*.055;
    const eighth=(t%(beat/2));
    if(eighth<.018)s+=(r()-.5)*Math.exp(-eighth*110)*.16;
    const b=Math.floor(t/beat)%4;
    const within=t%beat;
    if((b===1||b===3)&&within<.07)s+=(r()-.5)*Math.exp(-within*32)*.22;
    for(const x of boundaries){const d=t-x;if(d>=0&&d<.32)s+=Math.sin(2*Math.PI*(90+180*d)*d)*Math.exp(-d*10)*.28; const pre=x-t;if(pre>0&&pre<.7)s+=(r()-.5)*(1-pre/.7)*.055;}
    const env=Math.min(1,t/.5)*Math.min(1,(duration-t)/.8);
    s*=env;
    const pan=.5+.18*Math.sin(t*.34);
    const L=Math.max(-1,Math.min(1,s*(1.08-pan*.12)));
    const R=Math.max(-1,Math.min(1,s*(.98+pan*.12)));
    data.writeInt16LE(Math.round(L*32767),i*4);
    data.writeInt16LE(Math.round(R*32767),i*4+2);
  }
  const h=Buffer.alloc(44); h.write('RIFF',0); h.writeUInt32LE(36+data.length,4); h.write('WAVE',8); h.write('fmt ',12); h.writeUInt32LE(16,16); h.writeUInt16LE(1,20); h.writeUInt16LE(channels,22); h.writeUInt32LE(sampleRate,24); h.writeUInt32LE(sampleRate*channels*2,28); h.writeUInt16LE(channels*2,32); h.writeUInt16LE(16,34); h.write('data',36); h.writeUInt32LE(data.length,40);
  fs.writeFileSync(path.join(outDir,name),Buffer.concat([h,data]));
}
writeWav('v4-hero-48.wav',48,4048,118);
writeWav('v4-social-20.wav',20,4020,122);
writeWav('v4-vertical-12.wav',12,4012,126);
writeWav('v4-demo-75.wav',75,4075,112);
