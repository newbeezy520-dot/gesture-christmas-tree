import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const source=await fs.readFile(new URL('../dist/gesture.js',import.meta.url),'utf8');
const {classifyHand,classifyHeartPair,createHeartHold,createHandController}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

const point=(x,y,z=0)=>({x,y,z});
function openHand(){
 return [point(.5,.85),point(.39,.79),point(.32,.72),point(.22,.64),point(.15,.55),
  point(.36,.58),point(.35,.43),point(.33,.30),point(.32,.20),
  point(.48,.55),point(.48,.37),point(.48,.22),point(.48,.10),
  point(.60,.58),point(.61,.43),point(.62,.30),point(.62,.20),
  point(.70,.63),point(.74,.52),point(.76,.43),point(.78,.35)];
}
function fist(){
 const h=openHand();
 for(const b of [5,9,13,17]){
  const x=h[b].x,y=h[b].y;
  h[b+1]=point(x,y-.12);h[b+2]=point(x+.02,y-.03);h[b+3]=point(x+.02,y+.08);
 }
 h[4]=point(h[8].x-.01,h[8].y+.01);return h;
}
function pinch(){
 const h=openHand();h[7]=point(.32,.39);h[8]=point(.31,.40);h[4]=point(.31,.405);return h;
}
test('a folded hand restores the tree even when thumb and index touch',()=>{
 const result=classifyHand(fist(),'burst');assert.equal(result.mode,'tree');
});
test('an open palm scatters the particles',()=>{
 const result=classifyHand(openHand());assert.equal(result.mode,'scatter');assert.ok(result.openness>.7);
});
test('thumb/index pinch reveals the photos',()=>assert.equal(classifyHand(pinch()).mode,'burst'));
test('pinch has separate entry and release thresholds',()=>{
 const h=pinch(),width=Math.hypot(h[5].x-h[17].x,h[5].y-h[17].y);
 h[4]=point(h[8].x+width*.4,h[8].y);
 assert.equal(classifyHand(h,'burst').mode,'burst');
 assert.notEqual(classifyHand(h,'tree').mode,'burst');
 h[4]=point(h[8].x+width*.65,h[8].y);
 assert.notEqual(classifyHand(h,'burst').mode,'burst');
});
test('classification survives hand scale and mirrored cameras',()=>{
 const h=pinch(),small=h.map(p=>point(.75+(p.x-.5)*.3,.6+(p.y-.5)*.3));
 assert.equal(classifyHand(small).mode,'burst');
 assert.equal(classifyHand(h.map(p=>point(1-p.x,p.y,p.z))).mode,'burst');
});
test('classification does not assume fingers point up',()=>{
 const h=openHand().map(p=>point(.5-(p.y-.5),.5+(p.x-.5)));
 assert.equal(classifyHand(h).mode,'scatter');
});
test('invalid or collapsed landmarks stay neutral with finite coordinates',()=>{
 const invalid=[null,[],Array(21).fill(point(.5,.5)),openHand().map((p,i)=>i===8?point(NaN,.5):p)];
 for(const h of invalid){const r=classifyHand(h);assert.equal(r.mode,'neutral');assert.ok(Number.isFinite(r.x)&&Number.isFinite(r.y));}
});

function sharedHeart(){
 const left=[point(.24,.79),point(.25,.73),point(.32,.69),point(.41,.67),point(.49,.65),
  point(.31,.53),point(.30,.34),point(.40,.34),point(.49,.40),
  point(.27,.56),point(.28,.43),point(.30,.49),point(.31,.56),
  point(.23,.59),point(.23,.47),point(.25,.53),point(.26,.61),
  point(.19,.62),point(.18,.52),point(.20,.58),point(.22,.64)];
 return [left,left.map(p=>point(1-p.x,p.y,p.z))];
}
function transformPair(pair,{scale=1,angle=0,mirror=false,x=.5,y=.5}={}){
 const c=Math.cos(angle),s=Math.sin(angle);
 return pair.map(h=>h.map(p=>{
  const px=(p.x-.5)*scale*(mirror?-1:1),py=(p.y-.5)*scale;
  return point(x+px*c-py*s,y+px*s+py*c,p.z*scale);
 }));
}
test('two curved hands with joined index and thumb tips form one shared heart',()=>{
 const result=classifyHeartPair(sharedHeart());
 assert.equal(result.isHeart,true);assert.ok(result.score>.7);assert.ok(Math.abs(result.x-.5)<1e-6);
});
test('heart geometry survives hand order, translation, uniform scale, mirroring and camera roll',()=>{
 const pair=sharedHeart();
 for(const angle of [0,Math.PI/6,-Math.PI/4,Math.PI/2,Math.PI]){
  for(const scale of [.35,.65,1.2])for(const mirror of [false,true]){
   const transformed=transformPair(pair,{angle,scale,mirror,x:.52,y:.44});
   assert.equal(classifyHeartPair(transformed).isHeart,true,JSON.stringify({angle,scale,mirror}));
   assert.equal(classifyHeartPair(transformed.toReversed()).isHeart,true);
  }
 }
});
test('one hand, duplicate hand tracks, open palms, fists and two pinches do not unlock the heart',()=>{
 const h=sharedHeart();
 const doublePinch=h.map(hand=>hand.map((p,i)=>i===4?{...hand[8]}:{...p}));
 const straight=h.map(hand=>hand.map((p,i)=>i===6?midpointForTest(hand[5],hand[8]):{...p}));
 const cases=[[],[h[0]],[h[0],h[0]],[openHand(),openHand().map(p=>point(1-p.x,p.y))],
  [fist(),fist().map(p=>point(1-p.x,p.y))],[pinch(),pinch().map(p=>point(1-p.x,p.y))],doublePinch,straight];
 for(const pair of cases)assert.equal(classifyHeartPair(pair).isHeart,false);
});
const midpointForTest=(a,b)=>point((a.x+b.x)/2,(a.y+b.y)/2);
test('separated contact tips, malformed tracks and very different hand scales are rejected',()=>{
 const loose=sharedHeart();loose[1][4].x+=.17;
 assert.equal(classifyHeartPair(loose).isHeart,false);
 const invalid=sharedHeart();invalid[0][8].x=NaN;assert.equal(classifyHeartPair(invalid).isHeart,false);
 const mismatched=sharedHeart();mismatched[0]=mismatched[0].map(p=>point(.3+(p.x-.3)*.2,.5+(p.y-.5)*.2));
 assert.equal(classifyHeartPair(mismatched).isHeart,false);
 for(const pair of [null,[Array(21).fill(point(.5,.5)),Array(21).fill(point(.5,.5))]]){
  const result=classifyHeartPair(pair);assert.equal(result.isHeart,false);assert.ok(Number.isFinite(result.score));
 }
});
test('shared heart needs a stable hold and only completes once while held',()=>{
 const gate=createHeartHold(),match=classifyHeartPair(sharedHeart());
 assert.equal(gate.update(match,0).phase,'progress');
 assert.equal(gate.update(match,550).progress,.5);
 assert.equal(gate.update(match,1099).phase,'progress');
 assert.equal(gate.update(match,1100).phase,'complete');
 for(const time of [1200,4000,8000,16000]){
  const result=gate.update(match,time);assert.notEqual(result.phase,'complete');assert.equal(result.latched,true);
 }
});
test('brief landmark loss tolerates jitter, longer loss cancels an unfinished hold',()=>{
 const match=classifyHeartPair(sharedHeart()),miss={isHeart:false},gate=createHeartHold();
 gate.update(match,0);gate.update(match,400);
 assert.equal(gate.update(miss,500).phase,'progress');
 gate.update(match,550);assert.equal(gate.update(match,1100).phase,'complete');
 gate.reset({clearCooldown:true});gate.update(match,2000);gate.update(match,2400);
 assert.equal(gate.update(miss,2600).phase,'idle');
 assert.equal(gate.update(match,2800).progress,0);
 assert.equal(gate.update(match,3500).phase,'progress');
 assert.equal(gate.update(match,3900).phase,'complete');
});
test('a held heart must release for 750ms and pass the 6s cooldown before another completion',()=>{
 const match=classifyHeartPair(sharedHeart()),miss={isHeart:false},gate=createHeartHold();
 gate.update(match,0);assert.equal(gate.update(match,1100).phase,'complete');
 gate.update(miss,1200);assert.equal(gate.update(match,1800).latched,true,'short release stays latched');
 gate.update(miss,2000);gate.update(miss,2800);
 assert.equal(gate.update(match,3000).phase,'idle','cooldown is still active after release');
 assert.equal(gate.update(match,7100).progress,0,'a new stable hold begins only after cooldown');
 assert.equal(gate.update(match,8200).phase,'complete');
});
test('reset clears pending progress while preserving a completed cooldown by default',()=>{
 const match=classifyHeartPair(sharedHeart()),gate=createHeartHold();
 gate.update(match,0);gate.update(match,500);assert.equal(gate.reset().phase,'idle');
 assert.equal(gate.update(match,700).progress,0);
 assert.equal(gate.update(match,1800).phase,'complete');
 gate.reset();assert.equal(gate.update(match,2000).phase,'idle');
 gate.reset({clearCooldown:true});assert.equal(gate.update(match,2100).phase,'progress');
});

function videoStub(){return {srcObject:null,readyState:0,setAttribute(){},async play(){},pause(){}};}
function environment(mediaDevices){
 const names=['navigator','isSecureContext','document'];
 const before=Object.fromEntries(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices}});
 Object.defineProperty(globalThis,'isSecureContext',{configurable:true,value:true});
 Object.defineProperty(globalThis,'document',{configurable:true,value:{hidden:false,addEventListener(){},removeEventListener(){}}});
 return ()=>names.forEach(n=>before[n]?Object.defineProperty(globalThis,n,before[n]):delete globalThis[n]);
}
test('camera permission is requested only by start and denial offers touch fallback',async()=>{
 let calls=0;const statuses=[],hearts=[];
 const restore=environment({async getUserMedia(){calls++;const e=new Error('denied');e.name='NotAllowedError';throw e;}});
 try{
  const c=await createHandController({video:videoStub(),onGesture(){},onStatus:s=>statuses.push(s),onHeart:h=>hearts.push(h)});
  assert.equal(calls,0);assert.equal(await c.start(),false);assert.equal(calls,1);
  assert.equal(statuses.at(-1).state,'error');assert.match(statuses.at(-1).message,/触屏/);assert.equal(hearts.at(-1).phase,'idle');c.stop();
 }finally{restore();}
});
test('a video startup failure releases every camera track',async()=>{
 let stopped=0;const stream={getTracks:()=>[{stop(){stopped++;}},{stop(){stopped++;}}]};
 const restore=environment({async getUserMedia(){return stream;}});
 try{
  const video=videoStub();video.play=async()=>{throw new Error('video unavailable');};
  const c=await createHandController({video,onGesture(){},onStatus(){}});
  assert.equal(await c.start(),false);assert.equal(stopped,2);assert.equal(video.srcObject,null);
 }finally{restore();}
});
test('stopping during camera permission cancels startup and releases the late stream',async()=>{
 let resolveCamera,stopped=0;const hearts=[];
 const restore=environment({getUserMedia(){return new Promise(resolve=>{resolveCamera=resolve;});}});
 try{
  const video=videoStub();const c=await createHandController({video,onGesture(){},onStatus(){},onHeart:h=>hearts.push(h)});
  const starting=c.start();await Promise.resolve();c.stop();
  assert.equal(typeof resolveCamera,'function');
  resolveCamera({getTracks:()=>[{stop(){stopped++;}}]});
  assert.equal(await starting,false);assert.equal(stopped,1);assert.equal(video.srcObject,null);assert.equal(hearts.at(-1).phase,'idle');
 }finally{restore();}
});
test('a failed startup can be retried after camera availability changes',async()=>{
 let calls=0;const restore=environment(undefined);
 try{
  const c=await createHandController({video:videoStub(),onGesture(){},onStatus(){}});
  assert.equal(await c.start(),false);
  navigator.mediaDevices={getUserMedia(){calls++;throw new Error('temporary camera issue');}};
  assert.equal(await c.start(),false);assert.equal(calls,1);
 }finally{restore();}
});
