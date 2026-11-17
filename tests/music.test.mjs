import test from 'node:test';
import assert from 'node:assert/strict';
import {createNoelMusic} from '../dist/music.js';

class Events {
 constructor(){this.listeners=new Map();this.hidden=false;}
 addEventListener(type,fn){const list=this.listeners.get(type)||new Set();list.add(fn);this.listeners.set(type,list);}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
 emit(type){for(const fn of this.listeners.get(type)||[])fn();}
}
class Param {
 constructor(value=0){this.value=value;this.events=[];}
 cancelScheduledValues(time){this.events.push(['cancel',time]);}
 setValueAtTime(value,time){this.value=value;this.events.push(['value',value,time]);}
 linearRampToValueAtTime(value,time){this.value=value;this.events.push(['linear',value,time]);}
 exponentialRampToValueAtTime(value,time){this.value=value;this.events.push(['exponential',value,time]);}
}
class Node {
 constructor(){this.gain=new Param();this.frequency=new Param();this.Q=new Param();this.threshold=new Param();this.knee=new Param();this.ratio=new Param();this.attack=new Param();this.release=new Param();this.connections=[];}
 connect(target){this.connections.push(target);return target;}
 disconnect(){this.connections=[];this.disconnected=true;}
}
class FakeAudioContext {
 static instances=[];
 constructor(){this.currentTime=0;this.sampleRate=1000;this.state='suspended';this.destination=new Node();this.oscillators=[];this.gains=[];this.resumeCalls=0;this.suspendCalls=0;this.closeCalls=0;FakeAudioContext.instances.push(this);}
 createGain(){const n=new Node();this.gains.push(n);return n;}
 createBiquadFilter(){return new Node();}
 createDynamicsCompressor(){return new Node();}
 createConvolver(){return new Node();}
 createBuffer(channels,length){const arrays=Array.from({length:channels},()=>new Float32Array(length));return {getChannelData:i=>arrays[i]};}
 createOscillator(){const n=new Node();n.stops=[];n.start=time=>{n.startTime=time;n.started=true;};n.stop=time=>{n.stops.push(time);};this.oscillators.push(n);return n;}
 async resume(){this.resumeCalls++;if(this.resumeError)throw new Error('Gesture required');this.state='running';}
 async suspend(){this.suspendCalls++;this.state='suspended';}
 async close(){this.closeCalls++;this.state='closed';}
}

function environment(Context=FakeAudioContext){
 const saved={AudioContext:globalThis.AudioContext,document:globalThis.document,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout,addEventListener:globalThis.addEventListener,removeEventListener:globalThis.removeEventListener};
 const doc=new Events(),window=new Events(),intervals=new Map(),timeouts=new Map();let id=0;
 FakeAudioContext.instances=[];
 globalThis.AudioContext=Context;globalThis.document=doc;
 globalThis.setInterval=fn=>{const key=++id;intervals.set(key,fn);return key;};globalThis.clearInterval=key=>intervals.delete(key);
 globalThis.setTimeout=fn=>{const key=++id;timeouts.set(key,fn);return key;};globalThis.clearTimeout=key=>timeouts.delete(key);
 globalThis.addEventListener=window.addEventListener.bind(window);globalThis.removeEventListener=window.removeEventListener.bind(window);
 return {doc,window,intervals,timeouts,flush:()=>{const fns=[...timeouts.values()];timeouts.clear();fns.forEach(fn=>fn());},restore:()=>{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}};
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};

test('construction is silent, and celebration cannot bypass the visitor music choice',async()=>{
 const e=environment();try{const m=createNoelMusic();assert.equal(m.enabled,false);assert.equal(m.celebrate(),false);assert.equal(FakeAudioContext.instances.length,0);assert.equal(e.intervals.size,0);m.dispose();assert.equal(await m.toggle(),false);}finally{e.restore();}
});
test('one explicit activation creates a single audio context and one running scheduler',async()=>{
 const e=environment(),changes=[];try{const m=createNoelMusic({onChange:x=>changes.push(x)});assert.equal(await m.toggle(),true);const c=FakeAudioContext.instances[0];assert.equal(c.state,'running');assert.equal(FakeAudioContext.instances.length,1);assert.equal(e.intervals.size,1);assert.ok(c.oscillators.length>0);assert.ok(c.oscillators.every(o=>Number.isFinite(o.frequency.value)&&o.frequency.value>0&&o.startTime>=0));assert.deepEqual(changes,[true]);const notes=c.oscillators.length;assert.equal(await m.setEnabled(true),true);assert.equal(FakeAudioContext.instances.length,1);assert.equal(e.intervals.size,1);assert.equal(c.oscillators.length,notes,'already-enabled music must not replay the opening');assert.deepEqual(changes,[true]);m.dispose();}finally{e.restore();}
});
test('manual off fades output, stops all scheduled voices and suspends the context',async()=>{
 const e=environment(),changes=[];try{const m=createNoelMusic({onChange:x=>changes.push(x)});await m.setEnabled(true);const c=FakeAudioContext.instances[0],notes=c.oscillators.length;await m.setEnabled(false);assert.equal(m.enabled,false);assert.equal(e.intervals.size,0);assert.ok(c.oscillators.every(o=>o.stops.length>=2));assert.ok(c.gains[0].gain.events.some(x=>x[0]==='linear'&&x[1]===0));assert.equal(m.celebrate(),false);assert.equal(c.oscillators.length,notes);e.flush();await settle();assert.equal(c.state,'suspended');assert.deepEqual(changes,[true,false]);m.dispose();}finally{e.restore();}
});
test('rapid off/on cancels the old pause and never duplicates a loop',async()=>{
 const e=environment();try{const m=createNoelMusic();await m.setEnabled(true);await m.setEnabled(false);assert.equal(e.timeouts.size,1);await m.setEnabled(true);e.flush();await settle();assert.equal(FakeAudioContext.instances[0].state,'running');assert.equal(e.intervals.size,1);assert.equal(m.enabled,true);m.dispose();}finally{e.restore();}
});
test('a background tab pauses quietly and restores only an enabled visitor choice',async()=>{
 const e=environment();try{const m=createNoelMusic();await m.setEnabled(true);e.doc.hidden=true;e.doc.emit('visibilitychange');assert.equal(m.enabled,true);assert.equal(e.intervals.size,0);e.flush();await settle();assert.equal(FakeAudioContext.instances[0].state,'suspended');e.doc.hidden=false;e.doc.emit('visibilitychange');await settle();assert.equal(FakeAudioContext.instances[0].state,'running');assert.equal(e.intervals.size,1);await m.setEnabled(false);e.doc.hidden=true;e.doc.emit('visibilitychange');e.flush();e.doc.hidden=false;e.doc.emit('visibilitychange');await settle();assert.equal(e.intervals.size,0);assert.equal(m.enabled,false);m.dispose();}finally{e.restore();}
});
test('blocked audio and blocked foreground resume both fail closed without rejection',async()=>{
 const e=environment(),changes=[];try{const m=createNoelMusic({onChange:x=>changes.push(x)});await m.setEnabled(true);const c=FakeAudioContext.instances[0];e.doc.hidden=true;e.doc.emit('visibilitychange');e.flush();await settle();c.resumeError=true;e.doc.hidden=false;e.doc.emit('visibilitychange');await settle();assert.equal(m.enabled,false);assert.equal(e.intervals.size,0);assert.deepEqual(changes,[true,false]);assert.equal(await m.setEnabled(true),false);m.dispose();}finally{e.restore();}
});
test('achievement chord respects mute and has a short anti-stacking cooldown',async()=>{
 const e=environment();try{const m=createNoelMusic();await m.setEnabled(true);const c=FakeAudioContext.instances[0],before=c.oscillators.length;assert.equal(m.celebrate(),true);assert.equal(c.oscillators.length,before+8);assert.equal(m.celebrate(),false);c.currentTime=3;assert.equal(m.celebrate(),true);await m.setEnabled(false);assert.equal(m.celebrate(),false);m.dispose();}finally{e.restore();}
});
test('disposing cancels timers, closes audio and unregisters lifecycle listeners',async()=>{
 const e=environment(),changes=[];try{const m=createNoelMusic({onChange:x=>changes.push(x)});await m.setEnabled(true);const c=FakeAudioContext.instances[0];m.dispose();await settle();assert.equal(c.closeCalls,1);assert.equal(c.state,'closed');assert.equal(e.intervals.size,0);assert.equal(e.timeouts.size,0);assert.equal(e.doc.listeners.get('visibilitychange').size,0);assert.equal(e.window.listeners.get('pagehide').size,0);assert.equal(e.window.listeners.get('pageshow').size,0);assert.equal(await m.setEnabled(true),false);assert.equal(m.celebrate(),false);assert.deepEqual(changes,[true,false]);m.dispose();assert.equal(c.closeCalls,1);}finally{e.restore();}
});
test('an unavailable Web Audio API leaves the page usable and silent',async()=>{
 const e=environment(undefined);delete globalThis.AudioContext;try{const m=createNoelMusic();assert.equal(await m.toggle(),false);assert.equal(m.enabled,false);assert.equal(e.intervals.size,0);m.dispose();}finally{e.restore();}
});
test('a busy foreground does not replay missed notes in one loud cluster',async()=>{
 const e=environment();try{const m=createNoelMusic();await m.setEnabled(true);const c=FakeAudioContext.instances[0],before=c.oscillators.length;c.currentTime=20;[...e.intervals.values()][0]();const added=c.oscillators.slice(before);assert.ok(added.length<=8,'skip late notes instead of stacking twenty seconds of music');assert.ok(added.every(o=>o.startTime>=20));m.dispose();}finally{e.restore();}
});
