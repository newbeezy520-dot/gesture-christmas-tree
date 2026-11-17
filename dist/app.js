import { createHandController } from './gesture.js?v=wave-gallery';
import { createNoelMusic } from './music.js';
import { createCentenary } from './centenary.js';

const $ = (s) => document.querySelector(s);
const root=$('#experience'), canvas=$('#particles'), ctx=canvas.getContext('2d',{alpha:true});
const mobile=matchMedia('(max-width: 740px)').matches;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const count=mobile?1050:1850, TAU=Math.PI*2;
let width=innerWidth,height=innerHeight,dpr=1,mode='tree',elapsed=0,previousTime=0,lastDraw=0;
let hand={x:.5,y:.5},activePhoto=0,cameraRunning=false,cameraStarting=false,manualUntil=0,modeSince=0;
let achievement;
const particles=[], snow=[], sprites=[];
const palette=['#ead6a2','#b18c42','#d7b970','#95b99b','#537b51','#be5949'];
function sprite(color){const s=document.createElement('canvas');s.width=s.height=40;const c=s.getContext('2d');let g=c.createRadialGradient(20,20,0,20,20,20);g.addColorStop(0,'#fff8e3');g.addColorStop(.12,color);g.addColorStop(.32,color+'90');g.addColorStop(1,color+'00');c.fillStyle=g;c.fillRect(0,0,40,40);return s;}
palette.forEach(c=>sprites.push(sprite(c)));
function seedParticles(){
 for(let i=0;i<count;i++){
  let x,y,z,type='branch',t=Math.random(),angle=Math.random()*TAU;
  const garland=i%7===0;
  let radius=2.06*(1-t)*(garland?1.035:(.64+Math.random()*.36));
  if(garland)angle=t*TAU*5.2+Math.random()*.12;
  x=Math.cos(angle)*radius;y=t*5.12-2.34;z=Math.sin(angle)*radius;
  let color=garland?0:(Math.random()<.08?5:Math.random()<.4?3:Math.random()<.5?1:2);
  let size=.8+Math.random()*1.3;
  if(i<65){const v=i/65*10,j=Math.floor(v),k=v-j,a=j*TAU/10-Math.PI/2,b=(j+1)*TAU/10-Math.PI/2,ra=j%2?.13:.31,rb=j%2?.31:.13;x=Math.cos(a)*ra*(1-k)+Math.cos(b)*rb*k;y=2.99-(Math.sin(a)*ra*(1-k)+Math.sin(b)*rb*k);z=0;color=0;size=1.5;type='star';}
  if(i>=65&&i<110){x=(Math.random()-.5)*.23;y=-2.34-Math.random()*.38;z=(Math.random()-.5)*.23;color=1;type='trunk';}
  const theta=Math.random()*TAU,phi=Math.acos(2*Math.random()-1),r=2.5+Math.random()*2.2;
  const cloud={x:r*Math.sin(phi)*Math.cos(theta),y:r*Math.cos(phi)*.8,z:r*Math.sin(phi)*Math.sin(theta)};
  particles.push({base:{x,y,z},x,y,z,cloud,seed:Math.random()*100,speed:.12+Math.random()*.32,color,size,type});
 }
 for(let i=0;i<(mobile?35:65);i++)snow.push({x:Math.random(),y:Math.random(),size:.3+Math.random()*.8,speed:.01+Math.random()*.025,phase:Math.random()*10});
}
function resize(){width=root.clientWidth;height=root.clientHeight;dpr=Math.min(devicePixelRatio||1,mobile?1.5:2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
function project(x,y,z){const perspective=6/(6+z);const scale=Math.min(width*.278,height*.128)*perspective;return{x:width*.5+x*scale,y:height*.465-y*scale,scale:perspective};}
function draw(now){
 requestAnimationFrame(draw);
 if(document.hidden||achievement?.isOpen)return;
 if(now-lastDraw<(mobile?31:15))return;
 const dt=Math.min((now-(previousTime||now))/1000,.05);previousTime=now;lastDraw=now;elapsed+=dt;
 ctx.clearRect(0,0,width,height);
 const transition=1-Math.exp(-dt*(reduced?10:mode==='tree'?2.8:2.2));
 const spin=reduced?0:elapsed*.16,cs=Math.cos(spin),sn=Math.sin(spin);
 const since=(now-modeSince)/1000;
 ctx.globalCompositeOperation='source-over';ctx.fillStyle='#e9e1bb';
 if(!reduced)for(const s of snow){s.y+=dt*s.speed;if(s.y>1.02){s.y=-.02;s.x=Math.random();}const xx=s.x*width+Math.sin(elapsed*.3+s.phase)*12;ctx.globalAlpha=.22;ctx.beginPath();ctx.arc(xx,s.y*height,s.size,0,TAU);ctx.fill();}
 ctx.globalAlpha=1;
 if(mode==='tree'){const ground=project(0,-2.7,0);const g=ctx.createRadialGradient(ground.x,ground.y,0,ground.x,ground.y,width*.25);g.addColorStop(0,'#b8a05c13');g.addColorStop(1,'#b8a05c00');ctx.save();ctx.translate(ground.x,ground.y);ctx.scale(1,.17);ctx.fillStyle=g;ctx.fillRect(-width*.35,-height,width*.7,height*2);ctx.restore();}
 ctx.globalCompositeOperation='lighter';
 for(const p of particles){
  let tx,ty,tz;
  if(mode==='tree'){
   tx=p.base.x*cs+p.base.z*sn;ty=p.base.y;tz=-p.base.x*sn+p.base.z*cs;
  }else{
   const orbit=reduced?0:elapsed*p.speed*.17,co=Math.cos(orbit),si=Math.sin(orbit);
   tx=p.cloud.x*co-p.cloud.z*si;ty=p.cloud.y;tz=p.cloud.x*si+p.cloud.z*co;
   if(mode==='scatter'){tx+=(hand.x-.5)*6.4;ty+=(.5-hand.y)*5.3;tx*=1.1;ty*=1.1;}
   else{tx*=.92;ty=ty*.9+.25;tz*=.6;}
   if(!reduced){tx+=Math.sin(elapsed*.6+p.seed)*.13;ty+=Math.cos(elapsed*.5+p.seed)*.14;}
  }
  p.x+=(tx-p.x)*transition;p.y+=(ty-p.y)*transition;p.z+=(tz-p.z)*transition;
  const q=project(p.x,p.y,p.z);
  if(q.x< -20||q.x>width+20||q.y< -20||q.y>height+20)continue;
  const pulse=reduced?1:(.78+Math.sin(elapsed*1.1+p.seed)*.22);
  const size=(p.size*q.scale)*(mobile?3.1:3.6)*(mode==='tree'&&p.type==='star'?1.22:1);
  const central=mode!=='tree'&&q.x>width*.22&&q.x<width*.78&&q.y>height*.27&&q.y<height*.69;
  ctx.globalAlpha=(central?.24:.73)*pulse;
  ctx.drawImage(sprites[p.color],q.x-size/2,q.y-size/2,size,size);
 }
 ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
}
function setMode(next,origin='manual'){
 if(!['tree','burst','scatter'].includes(next))return;
 if(origin==='manual'){manualUntil=performance.now()+4500;}
 if(next===mode)return;
 mode=next;modeSince=performance.now();root.dataset.mode=mode;
 $('#revelation').setAttribute('aria-hidden',String(mode==='tree'));
 for(const b of document.querySelectorAll('[data-action]'))b.setAttribute('aria-pressed',String(b.dataset.action===mode));
 const statuses={tree:'手轻轻收拢，想念又聚成一棵树。',burst:'Joyeux Noël. 这一份惊喜，送给你。',scatter:'轻轻移动手掌，让星光跟着你走。'};
 $('#status').textContent=statuses[mode];
 if(next==='burst'&&!reduced){for(const p of particles){const r=Math.hypot(p.x,p.y,p.z)||1;p.x+=p.x/r*.28;p.y+=p.y/r*.28;p.z+=p.z/r*.28;}}
}
const albumPhotos=[...document.querySelectorAll('.photo')];
function switchPhoto(delta){
 const total=albumPhotos.length;
 if(!total)return;
 activePhoto=(activePhoto+delta+total)%total;
 albumPhotos.forEach((p,i)=>{
  const role=i===activePhoto?'photo-active':i===(activePhoto+1)%total?'photo-next':i===(activePhoto-1+total)%total?'photo-previous':'photo-parked';
  p.classList.remove('photo-active','photo-next','photo-previous','photo-parked');
  p.classList.add(role);p.hidden=role==='photo-parked';
  p.setAttribute('aria-hidden',String(i!==activePhoto));
 });
 $('#photoCounter').textContent=`${String(activePhoto+1).padStart(2,'0')} / ${String(total).padStart(2,'0')}`;
}
$('#previousPhoto').addEventListener('click',()=>switchPhoto(-1));$('#nextPhoto').addEventListener('click',()=>switchPhoto(1));
let touchStart=null;
$('#album').addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;touchStart=e.clientX;});
$('#album').addEventListener('pointerup',e=>{if(touchStart===null)return;const d=e.clientX-touchStart;if(Math.abs(d)>35)switchPhoto(d<0?1:-1);touchStart=null;});
document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.action)));
const music=createNoelMusic({onChange:enabled=>{
 document.querySelectorAll('[data-music-toggle]').forEach(button=>{
  button.setAttribute('aria-pressed',String(enabled));
  button.setAttribute('aria-label',enabled?'关闭背景音乐':'开启背景音乐');
  button.querySelector('[data-music-label]').textContent=enabled?'关闭音乐':'开启音乐';
 });
}});
document.querySelectorAll('[data-music-toggle]').forEach(button=>button.addEventListener('click',async()=>{
 try{const wasEnabled=music.enabled;const enabled=await music.toggle();if(!wasEnabled&&!enabled)$('#status').textContent='音乐暂时没有开启，再点一次试试。';}catch{$('#status').textContent='音乐暂时没有开启，再点一次试试。';}
}));
achievement=createCentenary({onOpen:()=>{setMode('burst','camera');music.celebrate();},onClose:()=>{manualUntil=performance.now()+2500;}});
$('#heartButton').addEventListener('click',()=>achievement.show('preview'));
$('.signature').addEventListener('click',e=>{e.preventDefault();setMode('tree');});
canvas.addEventListener('pointermove',e=>{if(mode==='scatter'&&!cameraRunning){const r=canvas.getBoundingClientRect();hand={x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};}});
function setHelp(open){$('#instructions').hidden=!open;$('#helpButton').setAttribute('aria-expanded',String(open));if(open)$('#helpDone').focus();else $('#helpButton').focus();}
$('#helpButton').addEventListener('click',()=>setHelp($('#instructions').hidden));$('#closeHelp').addEventListener('click',()=>setHelp(false));$('#helpDone').addEventListener('click',()=>setHelp(false));
document.addEventListener('keydown',e=>{if(e.key==='Escape')setHelp(false);if(e.target.closest('button,a'))return;if(e.key==='1')setMode('tree');if(e.key==='2')setMode('burst');if(e.key==='3')setMode('scatter');if(e.key==='ArrowLeft'&&mode!=='tree')switchPhoto(-1);if(e.key==='ArrowRight'&&mode!=='tree')switchPhoto(1);});

let controller;
async function startCamera(){
 if(cameraStarting)return;
 if(cameraRunning){stopCamera();return;}
 cameraStarting=true;$('#cameraButton').disabled=true;$('#cameraButtonText').textContent='正在唤醒魔法…';
 try{
  controller=await createHandController({video:$('#camera'),onGesture:g=>{
   if(g.hasHand){hand={x:1-g.x,y:g.y};$('#cameraTag').textContent=g.mode==='burst'?'捏合 · 揭晓':g.mode==='scatter'?'张掌 · 飞散':'收拢 · 成树';}
   if(performance.now()>manualUntil&&!achievement.isOpen)setMode(g.mode,'camera');
  },onSwipe:event=>{
   if(mode==='tree'||achievement.isOpen)return;
   switchPhoto(event.direction==='left'?1:-1);
   $('#status').textContent=`${event.direction==='left'?'左挥':'右挥'} · ${$('#photoCounter').textContent}`;
  },onHeart:event=>{
   if(event.phase==='complete'){achievement.setProgress(0);achievement.show('gesture');}
   else achievement.setProgress(event.phase==='progress'?event.progress:0);
  },onStatus:s=>{
   $('#status').textContent=s.message;
   if(s.state==='lost'||s.state==='no-hand')$('#cameraTag').textContent='让手出现在镜头里';
   if(s.state==='error'||s.state==='stopped'){cameraRunning=false;$('#cameraPreview').hidden=true;$('#cameraButtonText').textContent='重新开启手势';}
  }});
  const ok=await controller.start();
  if(!ok){cameraRunning=false;$('#cameraPreview').hidden=true;$('#cameraButtonText').textContent='重新开启手势';return;}
  cameraRunning=true;$('#cameraPreview').hidden=false;$('#cameraButtonText').textContent='关闭手势 · 用触屏体验';$('#privacy').textContent='识别在本机进行，画面不会被录制或上传。';
 }catch(error){
  controller?.stop();cameraRunning=false;$('#cameraPreview').hidden=true;$('#cameraButtonText').textContent='重新开启手势';
  $('#status').textContent=error?.name==='NotAllowedError'?'摄像头没有开启。也可以直接点下方按钮体验。':(error?.message?.includes('secure')?'请在安全的浏览器页面中打开；下方按钮仍可体验。':'暂时没能开启手势，先用下方按钮体验吧。');
 }finally{cameraStarting=false;$('#cameraButton').disabled=false;}
}
function stopCamera(){controller?.stop();cameraRunning=false;$('#cameraPreview').hidden=true;$('#cameraButtonText').textContent='开启手势魔法';$('#privacy').textContent='摄像头已关闭。下方按钮仍可继续体验。';$('#status').textContent='现在，用手指也能把惊喜打开。';}
$('#cameraButton').addEventListener('click',startCamera);$('#stopCamera').addEventListener('click',stopCamera);
addEventListener('pagehide',()=>controller?.stop());
seedParticles();resize();addEventListener('resize',resize);new ResizeObserver(resize).observe(root);switchPhoto(0);requestAnimationFrame(draw);
