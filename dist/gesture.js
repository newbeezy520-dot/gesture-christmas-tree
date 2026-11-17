/* All camera frames stay on this device. Only local model/runtime assets load. */
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
const neutral=()=>({mode:'neutral',x:.5,y:.5,pinch:1,openness:0});

function jointAngle(a,b,c){
 const u=[a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0)];
 const v=[c.x-b.x,c.y-b.y,(c.z||0)-(b.z||0)];
 const length=Math.hypot(...u)*Math.hypot(...v);
 if(length<1e-9)return 0;
 return Math.acos(clamp((u[0]*v[0]+u[1]*v[1]+u[2]*v[2])/length,-1,1))*180/Math.PI;
}

/**
 * Geometry uses joint angles and relative distances, not finger y ordering, so
 * the same gestures work with either hand, mirrored previews and tilted hands.
 * x/y remain unmirrored camera coordinates; a mirrored UI should use 1 - x.
 */
export function classifyHand(landmarks,previous='tree'){
 if(!Array.isArray(landmarks)||landmarks.length<21||landmarks.slice(0,21).some(p=>
  !p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||(p.z!==undefined&&!Number.isFinite(p.z))))return neutral();
 const h=landmarks;
 const palmWidth=distance(h[5],h[17]);
 const palmHeight=distance(h[0],h[9]);
 const scale=Math.max(palmWidth,palmHeight*.65);
 if(scale<.015)return neutral();
 const center=[0,5,9,13,17].reduce((p,i)=>({x:p.x+h[i].x/5,y:p.y+h[i].y/5}),{x:0,y:0});
 const pinch=distance(h[4],h[8])/scale;
 let extended=0,folded=0,openness=0;
 for(const base of [5,9,13,17]){
  const angle=jointAngle(h[base],h[base+1],h[base+3]);
  const reach=distance(h[base+3],h[0])/Math.max(distance(h[base+1],h[0]),.001);
  const span=distance(h[base+3],h[base])/scale;
  if(angle>145&&reach>1.08&&span>.43)extended++;
  if(angle<125||reach<1.04||span<.34)folded++;
  openness+=clamp((angle-85)/80)*clamp((reach-.92)/.25)/4;
 }
 let mode='neutral';
 // A fist can also put thumb and index very close; never treat that as pinch.
 const tightFist=folded>=3&&extended===0;
 const pinchThreshold=previous==='burst'?.50:.32;
 if(tightFist)mode='tree';
 else if(pinch<pinchThreshold)mode='burst';
 else if(extended>=3&&openness>.70)mode='scatter';
 else if(extended<=1)mode='tree';
 return {mode,x:clamp(center.x),y:clamp(center.y),pinch,openness:clamp(openness)};
}

const distance2=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const validHand=h=>Array.isArray(h)&&h.length>=21&&h.slice(0,21).every(p=>
 p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.z===undefined||Number.isFinite(p.z)));
const palmCenter=h=>[0,5,9,13,17].reduce((p,i)=>({x:p.x+h[i].x/5,y:p.y+h[i].y/5}),{x:0,y:0});
const palmScale=h=>Math.max(distance2(h[5],h[17]),distance2(h[0],h[9])*.65);

/**
 * Recognizes a shared heart made by TWO hands, not two people's identities.
 * Index fingertips meet at the central notch; thumb tips meet below it. Bent
 * index fingers form the two outer lobes, with one palm on each side. Every
 * threshold is normalized by palm size, and the heart supplies its own axes,
 * so mirrored cameras, either hand ordering and camera roll are supported.
 * Inter-hand z is deliberately ignored: MediaPipe z origins differ by wrist.
 * score describes geometric fit, not the probability of a person's intention.
 */
export function classifyHeartPair(hands){
 const absent={isHeart:false,score:0,x:.5,y:.5};
 if(!Array.isArray(hands)||hands.length<2||!validHand(hands[0])||!validHand(hands[1]))return absent;
 const [a,b]=hands,sa=palmScale(a),sb=palmScale(b),scale=(sa+sb)/2;
 if(Math.min(sa,sb)<.015||Math.max(sa,sb)/Math.min(sa,sb)>2.5)return absent;
 const index=midpoint(a[8],b[8]),thumb=midpoint(a[4],b[4]),center=midpoint(index,thumb);
 const height=distance2(index,thumb),normalizedHeight=height/scale;
 if(height<1e-6)return {...absent,x:clamp(center.x),y:clamp(center.y)};
 const up={x:(index.x-thumb.x)/height,y:(index.y-thumb.y)/height};
 const across={x:-up.y,y:up.x};
 const project=(p,origin,axis)=>((p.x-origin.x)*axis.x+(p.y-origin.y)*axis.y)/scale;
 const pa=palmCenter(a),pb=palmCenter(b);
 const sideA=project(pa,center,across),sideB=project(pb,center,across);
 const palmSpan=Math.abs(sideA-sideB),palmOffset=Math.abs(project(pa,pb,up));
 const indexGap=distance2(a[8],b[8])/scale,thumbGap=distance2(a[4],b[4])/scale;
 const bends=[jointAngle(a[5],a[6],a[8]),jointAngle(b[5],b[6],b[8])];
 const lobes=[project(a[6],index,up),project(b[6],index,up)];
 const wings=[Math.abs(project(a[6],index,across)),Math.abs(project(b[6],index,across))];
 const thumbReach=[distance2(a[2],a[4])/scale,distance2(b[2],b[4])/scale];
 const joined=indexGap<.53&&thumbGap<.58;
 const openCenter=normalizedHeight>.46&&normalizedHeight<2.35;
 const separated=sideA*sideB<0&&Math.min(Math.abs(sideA),Math.abs(sideB))>.18&&palmSpan>.80&&palmOffset<1.35;
 const curved=bends.every(angle=>angle>35&&angle<168)&&lobes.every(v=>v>-.16)&&
  (lobes[0]+lobes[1])/2>.035&&wings.every(v=>v>.24)&&thumbReach.every(v=>v>.28);
 const balanced=palmSpan/normalizedHeight>.48&&palmSpan/normalizedHeight<4.5;
 const isHeart=joined&&openCenter&&separated&&curved&&balanced;
 const contactFit=clamp(1-Math.max(indexGap/.70,thumbGap/.75));
 const arcFit=Math.min(...bends.map(angle=>clamp(Math.min((angle-35)/45,(168-angle)/45))));
 const symmetry=clamp(1-Math.abs(Math.abs(sideA)-Math.abs(sideB))/Math.max(palmSpan,.01));
 const sizeFit=clamp(1-Math.abs(normalizedHeight-1.15)/1.6);
 const score=clamp(contactFit*.4+arcFit*.3+symmetry*.15+sizeFit*.15)*(isHeart?1:.5);
 return {isHeart,score,x:clamp(center.x),y:clamp(center.y)};
}

/** Deterministic hold/release gate; call update for every inference result. */
export function createHeartHold({holdMs=1100,releaseMs=750,cooldownMs=6000,toleranceMs=160}={}){
 let beganAt=null,lastSeenAt=null,releasedAt=null,lastCompleteAt=-Infinity,latched=false,x=.5,y=.5;
 const value=(phase,progress,isHeart=false)=>({phase,progress:clamp(progress),x,y,isHeart,latched});
 function update(detection,now=globalThis.performance?.now?.()??Date.now()){
  if(!Number.isFinite(now))return value('idle',0);
  const matches=detection?.isHeart===true;
  if(matches){
   if(Number.isFinite(detection.x))x=clamp(detection.x);
   if(Number.isFinite(detection.y))y=clamp(detection.y);
   if(releasedAt!==null&&now-releasedAt>=releaseMs)latched=false;
   releasedAt=null;lastSeenAt=now;
   if(latched)return value('progress',1,true);
   if(now-lastCompleteAt<cooldownMs){beganAt=null;return value('idle',0,true);}
   if(beganAt===null)beganAt=now;
   const progress=(now-beganAt)/holdMs;
   if(progress>=1){latched=true;lastCompleteAt=now;beganAt=null;return value('complete',1,true);}
   return value('progress',progress,true);
  }
  if(releasedAt===null)releasedAt=now;
  if(latched&&now-releasedAt>=releaseMs)latched=false;
  if(!latched&&beganAt!==null&&lastSeenAt!==null&&now-lastSeenAt<=toleranceMs)
   return value('progress',(lastSeenAt-beganAt)/holdMs);
  beganAt=null;return value('idle',0);
 }
 function reset({clearCooldown=false}={}){
  beganAt=null;lastSeenAt=null;releasedAt=null;latched=false;x=.5;y=.5;
  if(clearCooldown)lastCompleteAt=-Infinity;
  return value('idle',0);
 }
 return {update,reset};
}

/**
 * One open palm can turn album pages with a deliberate horizontal wave.
 * Input x/y are raw camera coordinates; default output directions and x are
 * mirrored to match the selfie preview. Motion needs multiple timely samples,
 * then latches until both the cooldown and a still/released pause have passed.
 * A returning hand therefore cannot immediately undo its previous page turn.
 */
export function createWaveTracker({mirror=true,threshold=.20,minDurationMs=160,maxDurationMs=650,
 cooldownMs=1100,settleMs=260,releaseMs=250,maxVertical=.10,maxStep=.14,maxGapMs=180}={}){
 let points=[],lastPoint=null,lastAt=null,lastFiredAt=-Infinity,latched=false;
 let quietAnchor=null,quietAt=null,releasedAt=null;
 const clearMotion=()=>{points=[];lastPoint=null;quietAnchor=null;quietAt=null;};
 function reset(){clearMotion();lastAt=null;lastFiredAt=-Infinity;latched=false;releasedAt=null;}
 function update(sample,now=globalThis.performance?.now?.()??Date.now()){
  if(!Number.isFinite(now)){reset();return null;}
  if(lastAt!==null&&now<=lastAt){reset();lastAt=now;return null;}
  const gap=lastAt===null?0:now-lastAt;lastAt=now;
  if(sample?.isHeart||sample?.hasHand===false||(sample?.handCount??1)!==1){reset();return null;}
  const open=sample?.mode==='scatter'&&sample.hasHand!==false&&
   (sample.handCount??1)===1&&!sample.isHeart&&Number.isFinite(sample.x)&&Number.isFinite(sample.y)&&
   sample.x>=0&&sample.x<=1&&sample.y>=0&&sample.y<=1;
  if(!open){
   clearMotion();
   if(releasedAt===null)releasedAt=now;
   if(latched&&now-releasedAt>=releaseMs&&now-lastFiredAt>=cooldownMs)latched=false;
   return null;
  }
  const p={x:mirror?1-sample.x:sample.x,y:sample.y,t:now};
  if(releasedAt!==null){
   if(now-releasedAt>=releaseMs&&now-lastFiredAt>=cooldownMs)latched=false;
   releasedAt=null;clearMotion();
  }
  if(gap>maxGapMs)clearMotion();
  if(lastPoint){
   const dt=now-lastPoint.t,step=Math.hypot(p.x-lastPoint.x,p.y-lastPoint.y);
   // Reject a new track jumping across the frame, rather than treating it as a wave.
   if(step>maxStep||step/Math.max(dt,1)>.002){
    clearMotion();lastPoint=p;quietAnchor=p;quietAt=now;
    if(!latched)points=[p];return null;
   }
  }
  lastPoint=p;
  if(latched){
   if(!quietAnchor||Math.hypot(p.x-quietAnchor.x,p.y-quietAnchor.y)>.025){quietAnchor=p;quietAt=now;}
   if(now-lastFiredAt>=cooldownMs&&quietAt!==null&&now-quietAt>=settleMs){
    latched=false;points=[p];quietAnchor=null;quietAt=null;
   }
   return null;
  }
  points.push(p);points=points.filter(v=>now-v.t<=maxDurationMs);
  if(points.length<3)return null;
  for(let i=points.length-3;i>=0;i--){
   const first=points[i],durationMs=now-first.t,dx=p.x-first.x,dy=p.y-first.y;
   if(durationMs<minDurationMs||durationMs>maxDurationMs||Math.abs(dx)<threshold)continue;
   const segment=points.slice(i);
   const verticalRange=Math.max(...segment.map(v=>v.y))-Math.min(...segment.map(v=>v.y));
   if(verticalRange>maxVertical||Math.abs(dy)>Math.abs(dx)*.5)continue;
   let path=0;
   for(let j=1;j<segment.length;j++){
    const step=segment[j].x-segment[j-1].x;
    if(Math.abs(step)>.008)path+=Math.abs(step);
   }
   if(Math.abs(dx)/Math.max(path,Math.abs(dx))<.78)continue;
   latched=true;lastFiredAt=now;points=[];quietAnchor=p;quietAt=now;
   return {direction:dx<0?'left':'right',x:p.x,y:p.y,fromX:first.x,
    distance:Math.abs(dx),durationMs,mirrored:mirror};
  }
  return null;
 }
 return {update,reset};
}

const gestureLabels={tree:'收拢 · 圣诞树',burst:'捏合 · 打开回忆',scatter:'张掌 · 星光跟随'};

function cameraError(error){
 if(error?.name==='NotAllowedError'||error?.name==='SecurityError')return '摄像头未获授权。可以允许摄像头后重试，也可以使用触屏体验。';
 if(error?.name==='NotFoundError'||error?.name==='DevicesNotFoundError')return '没有找到摄像头。你仍然可以使用触屏体验。';
 if(error?.name==='NotReadableError'||error?.name==='TrackStartError')return '摄像头正在被其他应用使用。关闭其他相机后重试，或使用触屏体验。';
 return '手势识别暂时无法启动，请重试；也可以直接使用触屏体验。';
}

/**
 * onStatus receives {state,message,delegate?}; it only fires on actual changes.
 * onGesture receives stable {mode,x,y,pinch,openness,hasHand,rawMode} at <=15fps.
 * onHeart receives {phase:'progress'|'complete'|'idle',progress,x,y}. A shared
 * heart must be held for 1.1s, releases for .75s, and has a 6s cooldown. Its
 * completion callback fires once per held pose. x/y are still unmirrored.
 * onSwipe receives {direction:'left'|'right',x,y,fromX,distance,durationMs};
 * its direction/x are mirrored screen coordinates, unlike onGesture/onHeart.
 * Creating this controller does not request a camera. start() does, returning a
 * boolean. stop() also cancels any in-flight start and releases late streams.
 */
export async function createHandController({video,onGesture=()=>{},onStatus=()=>{},onHeart=()=>{},onSwipe=()=>{}}={}){
 if(!video||typeof video.play!=='function')throw new TypeError('A video element is required.');
 let stream=null,detector=null,delegate='GPU',active=false,generation=0,startPromise=null;
 let animationId=null,lastInferenceAt=0,lastVideoTime=-1,lastSeenAt=0;
 let mode='tree',candidate=null,candidateFrames=0,lossAnnounced=false;
 let smoothX=.5,smoothY=.5,positionReady=false,lastStatus='';
 let brightnessCanvas=null,brightnessContext=null,lastLightCheck=0,lastBrightness=null;
 const heartHold=createHeartHold();let lastHeartPhase='idle';
 const waveTracker=createWaveTracker();

 function emitHeart(sample){
  if(sample.phase==='complete'||(sample.phase==='progress'&&!sample.latched)){
   lastHeartPhase=sample.phase;onHeart({phase:sample.phase,progress:sample.progress,x:sample.x,y:sample.y});
  }else if(sample.phase==='idle'&&lastHeartPhase!=='idle'){
   lastHeartPhase='idle';onHeart({phase:'idle',progress:0,x:sample.x,y:sample.y});
  }
 }
 function resetHeart(force=false){
  waveTracker.reset();
  const sample=heartHold.reset();
  if(force&&lastHeartPhase==='idle')onHeart({phase:'idle',progress:0,x:sample.x,y:sample.y});
  else emitHeart(sample);
  lastHeartPhase='idle';
 }

 function status(state,message,extra={}){
  const key=state+'|'+message+'|'+(extra.delegate||'');
  if(key===lastStatus)return;
  lastStatus=key;onStatus({state,message,...extra});
 }
 function releaseTracks(camera){
  if(camera)for(const track of camera.getTracks())track.stop();
 }
 function disposeDetector(value){try{value?.close();}catch{/* Already released. */}}
 function cancelFrame(){
  if(animationId!==null){globalThis.cancelAnimationFrame?.(animationId);animationId=null;}
 }
 function cleanupCamera(){
  const old=stream;stream=null;
  if(video.srcObject===old){try{video.pause();}catch{/* Browser is closing. */}video.srcObject=null;}
  releaseTracks(old);
 }
 async function loadDetector(preferred='GPU'){
  const {FilesetResolver,HandLandmarker}=await import(new URL('./vendor/vision_bundle.mjs',import.meta.url).href);
  const files=await FilesetResolver.forVisionTasks(new URL('./vendor/wasm',import.meta.url).href);
  const options=backend=>({baseOptions:{modelAssetPath:new URL('./vendor/hand_landmarker.task',import.meta.url).href,delegate:backend},
   runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.5,minTrackingConfidence:.5});
  if(preferred==='GPU'){
   try{return {value:await HandLandmarker.createFromOptions(files,options('GPU')),delegate:'GPU'};}
   catch{status('loading','正在切换兼容识别模式…');}
  }
  return {value:await HandLandmarker.createFromOptions(files,options('CPU')),delegate:'CPU'};
 }
 function brightness(now){
  if(now-lastLightCheck<1500)return lastBrightness;
  lastLightCheck=now;
  try{
   if(!brightnessCanvas){
    brightnessCanvas=document.createElement('canvas');brightnessCanvas.width=16;brightnessCanvas.height=12;
    brightnessContext=brightnessCanvas.getContext('2d',{willReadFrequently:true});
   }
   if(!brightnessContext)return null;
   brightnessContext.drawImage(video,0,0,16,12);
   const pixels=brightnessContext.getImageData(0,0,16,12).data;let sum=0;
   for(let i=0;i<pixels.length;i+=4)sum+=pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;
   lastBrightness=sum/(pixels.length/4);
  }catch{lastBrightness=null;}
  return lastBrightness;
 }
 function handleResults(result,now){
  const hands=result?.landmarks??[];
  if(hands.length!==1)waveTracker.reset();
  const paired=classifyHeartPair(hands);
  const heart=heartHold.update(paired,now);emitHeart(heart);
  if(paired.isHeart||heart.phase==='progress'){
   waveTracker.reset();
   lastSeenAt=now;lossAnnounced=false;candidate=null;candidateFrames=0;
   status('heart',heart.latched?'双手爱心已达成，松开双手后可以继续。':'双手爱心已合拢，保持一下…',{delegate});
   return;
  }
  const landmarks=hands[0];
  if(!landmarks){
   if(now-lastSeenAt>400){
    const light=brightness(now);
    status('lost',light!==null&&light<42?'光线有些暗，请让手掌更明亮；也可以使用触屏体验。':'将一只手放进画面，保持光线充足。');
   }
   if(now-lastSeenAt>=1000&&!lossAnnounced){
    mode='tree';candidate=null;candidateFrames=0;lossAnnounced=true;positionReady=false;
    onGesture({mode:'tree',x:.5,y:.5,pinch:1,openness:0,hasHand:false,rawMode:'neutral'});
   }
   return;
  }
  const raw=classifyHand(landmarks,mode);
  const swipe=waveTracker.update({mode:raw.mode,x:raw.x,y:raw.y,hasHand:true,handCount:hands.length},now);
  if(raw.mode==='neutral'&&raw.pinch===1&&raw.openness===0)return;
  lastSeenAt=now;lossAnnounced=false;
  if(!positionReady){smoothX=raw.x;smoothY=raw.y;positionReady=true;}
  else{smoothX+=(raw.x-smoothX)*.32;smoothY+=(raw.y-smoothY)*.32;}
  if(raw.mode==='neutral'||raw.mode===mode){candidate=null;candidateFrames=0;}
  else{
   if(candidate===raw.mode)candidateFrames++;else{candidate=raw.mode;candidateFrames=1;}
   if(candidateFrames>=(raw.mode==='burst'?2:3)){mode=raw.mode;candidate=null;candidateFrames=0;}
  }
  status('tracking',gestureLabels[mode],{delegate});
  onGesture({...raw,mode,x:smoothX,y:smoothY,rawMode:raw.mode,hasHand:true});
  if(swipe)onSwipe(swipe);
 }
 function schedule(){
  if(active&&!globalThis.document?.hidden&&animationId===null)animationId=globalThis.requestAnimationFrame(frame);
 }
 async function fallBackToCPU(token){
  try{
   const loaded=await loadDetector('CPU');
   if(!active||token!==generation){disposeDetector(loaded.value);return;}
   disposeDetector(detector);detector=loaded.value;delegate='CPU';lastVideoTime=-1;
   status('ready','识别已连接，请把一只手放进画面。',{delegate});schedule();
  }catch(error){
   if(token!==generation)return;
   stop();status('error',cameraError(error));
  }
 }
 function frame(now){
  animationId=null;
  if(!active||globalThis.document?.hidden)return;
  const interval=delegate==='CPU'?1000/12:1000/15;
  if(now-lastInferenceAt>=interval&&video.readyState>=2&&video.currentTime!==lastVideoTime){
   lastInferenceAt=now;lastVideoTime=video.currentTime;
   try{handleResults(detector.detectForVideo(video,now),now);}
   catch(error){
    if(delegate==='GPU'){
     delegate='CPU';resetHeart();status('loading','正在切换兼容识别模式…');void fallBackToCPU(generation);return;
    }
    stop();status('error',cameraError(error));return;
   }
  }
  schedule();
 }
 function visibilityChanged(){
  if(!active)return;
  if(document.hidden){cancelFrame();resetHeart();status('paused','页面已暂停，回来后继续。');}
  else{
   lastInferenceAt=0;lastVideoTime=-1;lastSeenAt=performance.now();
   status('ready','识别已连接，请把一只手放进画面。',{delegate});schedule();
  }
 }
 function stop(){
  generation++;active=false;startPromise=null;cancelFrame();
  globalThis.document?.removeEventListener('visibilitychange',visibilityChanged);
  cleanupCamera();disposeDetector(detector);detector=null;
  resetHeart(true);
  mode='tree';candidate=null;candidateFrames=0;positionReady=false;
  status('stopped','摄像头已关闭，可以使用触屏体验。');
 }
 function start(){
  if(active)return Promise.resolve(true);
  if(startPromise)return startPromise;
  const token=++generation;
  let promise;
  promise=(async()=>{
   let localStream=null;
   try{
    if(!globalThis.navigator?.mediaDevices?.getUserMedia||globalThis.isSecureContext===false){
     resetHeart(true);status('error','当前浏览器无法启用摄像头，请用 Safari 或 Chrome 打开，或使用触屏体验。');return false;
    }
    status('loading','正在开启摄像头并准备手势识别…');
    video.muted=true;video.autoplay=true;video.playsInline=true;
    video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');
    localStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'user'},width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:30}}});
    if(token!==generation){releaseTracks(localStream);return false;}
    stream=localStream;video.srcObject=stream;await video.play();
    if(token!==generation)return false;
    const loaded=await loadDetector();
    if(token!==generation){disposeDetector(loaded.value);return false;}
    detector=loaded.value;delegate=loaded.delegate;active=true;
    lastSeenAt=performance.now();lastVideoTime=-1;lastInferenceAt=0;lastLightCheck=0;
    lossAnnounced=false;positionReady=false;mode='tree';candidate=null;candidateFrames=0;
    resetHeart();
    document.addEventListener('visibilitychange',visibilityChanged);
    status('ready','识别已连接，请把一只手放进画面。',{delegate});schedule();return true;
   }catch(error){
    if(token!==generation)return false;
    active=false;cleanupCamera();disposeDetector(detector);detector=null;
    resetHeart(true);
    status('error',cameraError(error));return false;
   }
  })().finally(()=>{if(startPromise===promise)startPromise=null;});
  startPromise=promise;return promise;
 }
 return {start,stop};
}
