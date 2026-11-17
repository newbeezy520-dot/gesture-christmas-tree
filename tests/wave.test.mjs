import test from 'node:test';
import assert from 'node:assert/strict';
import {createWaveTracker} from '../dist/gesture.js';

// Tests describe mirrored screen movement; input landmarks remain raw camera x.
const palm=(screenX,y=.5,extra={})=>({mode:'scatter',x:1-screenX,y,hasHand:true,handCount:1,...extra});
const left=[.72,.67,.61,.53,.47];
const right=[.28,.33,.39,.47,.53];
function feed(tracker,positions,{start=0,step=80,y=.5,extra={}}={}){
 const events=[];
 positions.forEach((x,i)=>{
  const event=tracker.update(palm(x,Array.isArray(y)?y[i]:y,extra),start+i*step);
  if(event)events.push(event);
 });
 return events;
}

test('one deliberate left wave maps increasing raw camera x to the next-photo screen direction',()=>{
 const events=feed(createWaveTracker(),left);
 assert.equal(events.length,1);assert.equal(events[0].direction,'left');
 assert.ok(events[0].distance>=.20);assert.ok(events[0].durationMs>=160&&events[0].durationMs<=650);
 assert.equal(events[0].mirrored,true);assert.ok(events[0].x<events[0].fromX);
});
test('a deliberate right wave maps decreasing raw camera x to the previous-photo screen direction',()=>{
 const events=feed(createWaveTracker(),right);
 assert.equal(events.length,1);assert.equal(events[0].direction,'right');assert.ok(events[0].x>events[0].fromX);
});
test('mirroring is explicit and can be disabled for an unmirrored preview',()=>{
 const tracker=createWaveTracker({mirror:false}),events=[];
 for(let i=0;i<right.length;i++){
  const event=tracker.update({mode:'scatter',x:right[i],y:.5},i*80);if(event)events.push(event);
 }
 assert.equal(events.length,1);assert.equal(events[0].direction,'right');assert.equal(events[0].mirrored,false);
});
test('a clear 160ms movement needs at least three samples',()=>{
 const events=feed(createWaveTracker(),[.72,.61,.50],{step:80});
 assert.equal(events.length,1);assert.equal(events[0].durationMs,160);
 assert.equal(feed(createWaveTracker(),[.72,.50],{step:160}).length,0);
});
test('holding a palm still and small horizontal jitter never turn pages',()=>{
 const tracker=createWaveTracker();const positions=Array.from({length:60},(_,i)=>.5+Math.sin(i*2)*.018);
 assert.equal(feed(tracker,positions).length,0);
 assert.equal(feed(createWaveTracker(),Array(60).fill(.5)).length,0);
});
test('vertical movement and a large diagonal drift do not count as horizontal waves',()=>{
 assert.equal(feed(createWaveTracker(),[.5,.5,.49,.5,.5],{y:[.2,.3,.4,.5,.6]}).length,0);
 assert.equal(feed(createWaveTracker(),left,{y:[.3,.34,.38,.42,.46]}).length,0);
});
test('a natural small vertical drift is allowed',()=>{
 assert.equal(feed(createWaveTracker(),left,{y:[.48,.49,.50,.50,.51]}).length,1);
});
test('slow movement, overly quick movement and sparse tracking samples do not count',()=>{
 const slow=Array.from({length:12},(_,i)=>.75-i*.025);
 assert.equal(feed(createWaveTracker(),slow,{step:125}).length,0);
 assert.equal(feed(createWaveTracker(),left,{step:20}).length,0);
 assert.equal(feed(createWaveTracker(),left,{step:250}).length,0);
});
test('a single tracking jump and a jump immediately back cannot trigger a wave',()=>{
 const tracker=createWaveTracker();
 assert.equal(feed(tracker,[.75,.44,.44,.75,.75,.75],{step:80}).length,0);
});
test('oscillating back and forth without a consistent direction does not trigger',()=>{
 const positions=[.7,.62,.68,.59,.65,.56,.62,.53,.59,.50,.56,.47];
 assert.equal(feed(createWaveTracker(),positions).length,0);
});
test('pinched, folded and neutral hands do not turn pages',()=>{
 for(const mode of ['burst','tree','neutral'])assert.equal(feed(createWaveTracker(),left,{extra:{mode}}).length,0);
});
test('loss, a second visible hand and shared-heart progress clear the current motion',()=>{
 for(const interruption of [{hasHand:false},{handCount:2},{isHeart:true}]){
  const tracker=createWaveTracker();
  assert.equal(feed(tracker,[.75,.68,.61]).length,0);
  assert.equal(tracker.update(palm(.58,.5,interruption),240),null);
  // This endpoint must not join the pre-interruption beginning into a wave.
  assert.equal(tracker.update(palm(.50),320),null);
  assert.equal(tracker.update(palm(.50),400),null);
  assert.equal(tracker.update(palm(.50),480),null);
 }
});
test('invalid coordinates and a non-monotonic clock safely clear a partial wave',()=>{
 for(const interruption of [{x:NaN},{y:Infinity},{x:2}]){
  const tracker=createWaveTracker();feed(tracker,[.75,.68]);
  assert.equal(tracker.update(palm(.61,.5,interruption),160),null);
  assert.equal(feed(tracker,[.50,.50,.50],{start:240}).length,0);
 }
 const tracker=createWaveTracker();feed(tracker,[.75,.68,.61]);
 assert.equal(tracker.update(palm(.55),150),null);
 assert.equal(feed(tracker,[.50,.50,.50],{start:240}).length,0);
});
test('the immediate return movement does not undo a page turn',()=>{
 const tracker=createWaveTracker();assert.equal(feed(tracker,left).length,1);
 assert.equal(feed(tracker,[.52,.58,.65,.72],{start:400}).length,0);
 assert.equal(feed(tracker,Array(10).fill(.72),{start:720}).length,0);
 // The return has settled; a later distinct wave can turn another page.
 const events=feed(tracker,left,{start:1600});assert.equal(events.length,1);assert.equal(events[0].direction,'left');
});
test('remaining in motion after cooldown is not enough to rearm',()=>{
 const tracker=createWaveTracker();assert.equal(feed(tracker,left).length,1);
 const wandering=Array.from({length:30},(_,i)=>.47+Math.sin(i*.7)*.15);
 assert.equal(feed(tracker,wandering,{start:400}).length,0);
});
test('a stationary palm rearms only after cooldown and then accepts the opposite wave',()=>{
 const tracker=createWaveTracker();assert.equal(feed(tracker,left).length,1);
 assert.equal(feed(tracker,Array(15).fill(.47),{start:400}).length,0);
 const events=feed(tracker,[.47,.53,.60,.68,.73],{start:1700});
 assert.equal(events.length,1);assert.equal(events[0].direction,'right');
});
test('releasing the hand rearms after cooldown without requiring a stationary open palm',()=>{
 const tracker=createWaveTracker();assert.equal(feed(tracker,left).length,1);
 feed(tracker,Array(13).fill(.47),{start:400,step:100,extra:{mode:'tree'}});
 const events=feed(tracker,right,{start:1800});assert.equal(events.length,1);assert.equal(events[0].direction,'right');
});
test('an explicit lifecycle reset prevents an old trajectory from completing after restart',()=>{
 const tracker=createWaveTracker();feed(tracker,[.75,.68,.61]);tracker.reset();
 assert.equal(feed(tracker,[.50,.50,.50],{start:300}).length,0);
 assert.equal(feed(tracker,[.50,.56,.63,.70,.75],{start:600}).length,1);
});
