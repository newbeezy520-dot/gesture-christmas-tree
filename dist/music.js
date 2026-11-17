/*
 * An original forty-second winter miniature.
 * D major · 72 BPM · 3/4. No recordings, remote audio or autoplay.
 */
const BEAT = 60 / 72;
const BAR = BEAT * 3;
const LOOP = BAR * 16;
const MIDI = (note) => 440 * 2 ** ((note - 69) / 12);
const CHORDS = [
 [38,57,61,66], [35,54,57,62], [43,55,59,66], [45,57,59,64],
 [38,57,61,66], [35,54,57,62], [40,55,59,64], [45,57,61,64],
 [43,55,59,66], [42,57,62,66], [40,55,59,64], [45,57,59,64],
 [35,54,57,62], [43,55,59,66], [45,57,62,64], [38,57,59,66],
];
const MELODY = [
 [[0,66,1.4],[1.5,69,.5],[2,68,.7]],
 [[0,66,1],[1.25,64,.5],[2,62,.7]],
 [[.5,67,.7],[1.5,66,.8]],
 [[0,64,1],[1.5,61,1]],
 [[0,62,1.5],[2,66,.7]],
 [[.5,64,1],[2,66,.6]],
 [[0,67,.8],[1.5,71,.8]],
 [[.5,69,.8],[2,64,.8]],
 [[0,67,1],[1.5,66,.5],[2,64,.8]],
 [[0,66,1.5],[2,62,.7]],
 [[.5,64,1],[2,67,.7]],
 [[0,66,.8],[1.5,64,.8]],
 [[0,66,1],[1.5,69,.75]],
 [[.5,67,1],[2,66,.75]],
 [[0,64,1.5],[2,61,.6]],
 [[0,62,1.5],[2,64,.65]],
];
const SCORE = [];
CHORDS.forEach((chord, bar) => {
 SCORE.push({at:bar*BAR,note:chord[0],duration:BAR*.92,kind:'bass',velocity:.55});
 [0,1,2].forEach((beat) => {
  SCORE.push({at:bar*BAR+(beat+.08)*BEAT,note:chord[1+(beat+bar)%3],duration:1.6,kind:'piano',velocity:beat===0?.42:.33});
 });
 MELODY[bar].forEach(([beat,note,length],i) => {
  SCORE.push({at:bar*BAR+beat*BEAT,note,duration:Math.max(1.7,length*BEAT+1.3),kind:'bell',velocity:i===0?.42:.32});
 });
});
SCORE.sort((a,b)=>a.at-b.at);

/**
 * Creating the controller is silent: AudioContext is created only by an explicit
 * setEnabled(true)/toggle() call. enabled records the user's current choice;
 * background suspension preserves that choice. A blocked resume returns false.
 */
export function createNoelMusic({onChange=()=>{}}={}) {
 let context=null,bus=null,master=null,wet=null,convolver=null,filter=null,compressor=null;
 let wanted=false,playing=false,disposed=false,operation=0,interval=null,pauseTimer=null;
 let loopStart=0,eventIndex=0,lastCelebration=-Infinity;
 let notified=false;
 const voices=new Set();
 const doc=globalThis.document;

 function notify() {
  if(notified===wanted)return;
  notified=wanted;
  try{onChange(wanted);}catch{/* UI callbacks cannot interrupt audio cleanup. */}
 }
 function isHidden(){return !!doc?.hidden;}
 function clearPause(){if(pauseTimer!==null){clearTimeout(pauseTimer);pauseTimer=null;}}
 function clearSchedule(){if(interval!==null){clearInterval(interval);interval=null;}playing=false;}
 function moveGain(param,value,now,duration=.12){
  param.cancelScheduledValues(now);
  param.setValueAtTime(Math.max(0,param.value),now);
  param.linearRampToValueAtTime(value,now+duration);
 }
 function initialize(){
  if(context)return;
  const Constructor=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!Constructor)throw new Error('Web Audio is unavailable.');
  // This constructor is intentionally reached only from the visitor's click.
  context=new Constructor({latencyHint:'playback'});
  master=context.createGain();master.gain.value=0;
  bus=context.createGain();bus.gain.value=1;
  filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=2850;filter.Q.value=.35;
  compressor=context.createDynamicsCompressor();compressor.threshold.value=-22;compressor.knee.value=14;compressor.ratio.value=3;compressor.attack.value=.015;compressor.release.value=.28;
  bus.connect(filter);filter.connect(master);master.connect(compressor);compressor.connect(context.destination);
  // A quiet local room tail softens the bells and bridges the loop seam.
  convolver=context.createConvolver();wet=context.createGain();wet.gain.value=.18;
  const length=Math.floor(context.sampleRate*1.65);
  const impulse=context.createBuffer(2,length,context.sampleRate);
  let random=13979;
  for(let channel=0;channel<2;channel++){
   const data=impulse.getChannelData(channel);
   for(let i=0;i<length;i++){
    random=(random*16807)%2147483647;
    const time=i/context.sampleRate;
    data[i]=(random/1073741823.5-1)*Math.exp(-time*4.8)*.24;
   }
  }
  convolver.buffer=impulse;filter.connect(convolver);convolver.connect(wet);wet.connect(master);
 }
 function note(event,time){
  if(!context||!playing||!wanted||disposed)return;
  const start=Math.max(time,context.currentTime+.006);
  const duration=event.duration;
  const gain=context.createGain();gain.gain.value=0;gain.connect(bus);
  const volume=event.velocity*(event.kind==='bass'?.16:event.kind==='piano'?.11:.105);
  const attack=event.kind==='bass'?.055:event.kind==='piano'?.015:.012;
  gain.gain.setValueAtTime(0,start);
  gain.gain.linearRampToValueAtTime(volume,start+attack);
  gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
  const partials=event.kind==='bell'?[[1,1],[2.756,.12]]:event.kind==='piano'?[[1,1],[2,.17]]:[[1,1],[2,.24]];
  const voice={gain,oscillators:[],partialGains:[],ended:0,cleaned:false};
  function clean(){
   if(voice.cleaned)return;voice.cleaned=true;voices.delete(voice);
   try{gain.disconnect();}catch{}
   for(const part of voice.partialGains)try{part.disconnect();}catch{}
   for(const oscillator of voice.oscillators)try{oscillator.disconnect();}catch{}
  }
  for(const [ratio,strength] of partials){
   const oscillator=context.createOscillator(),part=context.createGain();
   oscillator.type='sine';oscillator.frequency.value=MIDI(event.note)*ratio;
   part.gain.value=strength;
   oscillator.connect(part);part.connect(gain);
   oscillator.onended=()=>{voice.ended++;if(voice.ended===partials.length)clean();};
   voice.oscillators.push(oscillator);voice.partialGains.push(part);
  }
  voices.add(voice);
  for(const oscillator of voice.oscillators){oscillator.start(start);oscillator.stop(start+duration+.035);}
 }
 function silenceVoices(now,release=.09){
  for(const voice of voices){
   try{moveGain(voice.gain.gain,0,now,release);}catch{}
   for(const oscillator of voice.oscillators)try{oscillator.stop(now+release+.025);}catch{}
  }
 }
 function tick(){
  if(!playing||!wanted||disposed||!context)return;
  const now=context.currentTime,horizon=now+.24;
  // Re-anchor after an interrupted audio clock, rather than queueing old notes.
  if(loopStart+LOOP<context.currentTime-.5){loopStart=context.currentTime+.05;eventIndex=0;}
  while(loopStart+SCORE[eventIndex].at<=horizon){
   const event=SCORE[eventIndex],time=loopStart+event.at;
   // A slow camera frame must not turn missed music into a loud catch-up chord.
   if(time>=now-.03)note(event,time);
   if(++eventIndex===SCORE.length){eventIndex=0;loopStart+=LOOP;}
  }
 }
 function startSchedule(){
  clearSchedule();clearPause();playing=true;loopStart=context.currentTime+.07;eventIndex=0;
  moveGain(master.gain,.32,context.currentTime,.22);
  tick();interval=setInterval(tick,100);
 }
 function pauseAudio(token){
  clearSchedule();clearPause();
  if(!context)return;
  const now=context.currentTime;silenceVoices(now);moveGain(master.gain,0,now,.10);
  pauseTimer=setTimeout(()=>{
   pauseTimer=null;
   if(token!==operation||playing||disposed||context?.state==='closed')return;
   try{Promise.resolve(context.suspend()).catch(()=>{});}catch{}
  },135);
 }
 async function setEnabled(value){
  if(disposed)return false;
  if(value&&wanted&&playing&&context?.state==='running'&&!isHidden())return true;
  const token=++operation;wanted=!!value;clearPause();
  if(!wanted){pauseAudio(token);notify();return false;}
  try{
   initialize();
   // Call resume while still in the original user interaction, before awaiting.
   await context.resume();
   if(token!==operation||disposed||!wanted)return false;
   if(context.state!=='running')throw new Error('Audio playback is still suspended.');
   if(isHidden()){pauseAudio(token);notify();return true;}
   startSchedule();notify();return true;
  }catch{
   if(token===operation){wanted=false;pauseAudio(token);notify();}
   return false;
  }
 }
 async function suspend(){
  if(disposed)return false;
  const token=++operation;pauseAudio(token);return wanted;
 }
 async function resumeChoice(){
  if(!wanted||disposed||isHidden())return;
  await setEnabled(true); // setEnabled catches browser resume restrictions.
 }
 function visibilityChanged(){if(isHidden())void suspend();else void resumeChoice();}
 function pageHidden(){void suspend();}
 function pageShown(){void resumeChoice();}
 function celebrate(){
  if(!wanted||!playing||disposed||!context||context.state!=='running')return false;
  const now=context.currentTime;
  if(now-lastCelebration<2)return false;
  lastCelebration=now;
  [62,66,69,74].forEach((pitch,i)=>note({note:pitch,duration:2.1,kind:'bell',velocity:i===3?.27:.38},now+.03+i*.15));
  return true;
 }
 function dispose(){
  if(disposed)return;
  disposed=true;wanted=false;operation++;clearSchedule();clearPause();
  doc?.removeEventListener('visibilitychange',visibilityChanged);
  globalThis.removeEventListener?.('pagehide',pageHidden);
  globalThis.removeEventListener?.('pageshow',pageShown);
  if(context){
   silenceVoices(context.currentTime,.005);
   try{master.gain.value=0;}catch{}
   try{Promise.resolve(context.close()).catch(()=>{});}catch{}
  }
  voices.clear();notify();
 }
 doc?.addEventListener('visibilitychange',visibilityChanged);
 globalThis.addEventListener?.('pagehide',pageHidden);
 globalThis.addEventListener?.('pageshow',pageShown);
 return {toggle:()=>setEnabled(!wanted),setEnabled,get enabled(){return wanted;},celebrate,suspend,dispose};
}
