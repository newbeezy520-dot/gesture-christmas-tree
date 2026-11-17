/** A keepsake revealed by two hands. This module never requests a camera. */
export function createCentenary({onOpen=()=>{},onClose=()=>{}}={}){
 const dialog=document.querySelector('#centenary');
 const canvas=document.querySelector('#centenaryCanvas');
 const ctx=canvas.getContext('2d');
 const progress=document.querySelector('#heartProgress');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const colors=['#ecd39b','#e8be8b','#d18b7a','#f4ecd2'];
 let animation=null,started=0,points=[],width=0,height=0,cx=0,cy=0,heartSize=0,previousFocus=null;
 function setProgress(value=0){
  const p=Math.max(0,Math.min(1,Number(value)||0));
  progress.hidden=p===0||dialog.open;
  progress.style.setProperty('--heart-progress',p);
  progress.querySelector('[role=progressbar]').setAttribute('aria-valuenow',String(Math.round(p*100)));
 }
 function resize(){
  width=dialog.clientWidth;height=dialog.clientHeight;
  const dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  const seal=document.querySelector('#centenarySeal').getBoundingClientRect(),rect=dialog.getBoundingClientRect();
  cx=seal.left+seal.width/2-rect.left;cy=seal.top+seal.height/2-rect.top;
  heartSize=Math.min(width*.41,height*.25,240);
 }
 function draw(now){
  if(!dialog.open){animation=null;return;}
  animation=requestAnimationFrame(draw);
  if(document.hidden)return;
  ctx.clearRect(0,0,width,height);
  const seconds=(now-started)/1000;
  for(const p of points){
   const t=p.t;
   const heartX=cx+Math.pow(Math.sin(t),3)*heartSize;
   const heartY=cy-(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))/17*heartSize;
   let x,y,alpha;
   if(seconds<1.1&&!reduced){const u=Math.min(1,seconds/1.1),e=1-Math.pow(1-u,3);x=cx+(heartX-cx)*e;y=cy+(heartY-cy)*e;alpha=u;}
   else{x=heartX;y=heartY;alpha=.55;}
   if(!reduced){x+=Math.sin(seconds*.7+p.phase)*p.drift;y+=Math.cos(seconds*.5+p.phase)*p.drift;alpha*=.6+.4*Math.sin(seconds*1.5+p.phase)**2;}
   ctx.fillStyle=p.color;ctx.globalAlpha=alpha;ctx.beginPath();ctx.arc(x,y,p.radius,0,Math.PI*2);ctx.fill();
   if(!reduced&&seconds<5){
    const s=Math.max(0,seconds-.45),speed=p.speed;
    const sx=cx+Math.cos(t)*s*speed,sy=cy+Math.sin(t)*s*speed+s*s*13;
    ctx.globalAlpha=Math.max(0,1-s/4)*.62;ctx.beginPath();ctx.arc(sx,sy,p.radius*.7,0,Math.PI*2);ctx.fill();
   }
  }
  ctx.globalAlpha=1;
 }
 function show(source='gesture'){
  if(dialog.open)return false;
  previousFocus=document.activeElement;
  document.querySelector('#centenaryOrigin').textContent=source==='gesture'?'LE CŒUR À DEUX · 双人爱心达成':'LE CŒUR À DEUX · 触屏预览';
  setProgress(0);dialog.showModal();
  points=Array.from({length:innerWidth<740?260:420},(_,i)=>({t:i/(innerWidth<740?260:420)*Math.PI*2,phase:Math.random()*Math.PI*2,drift:2+Math.random()*10,radius:.55+Math.random()*1.15,speed:45+Math.random()*140,color:colors[i%colors.length]}));
  resize();started=performance.now();
  dialog.classList.remove('is-arriving');void dialog.offsetWidth;dialog.classList.add('is-arriving');
  animation=requestAnimationFrame(draw);onOpen(source);
  document.querySelector('#continuePhotos').focus({preventScroll:true});
  return true;
 }
 function close(){if(dialog.open)dialog.close();}
 dialog.addEventListener('close',()=>{if(animation!==null)cancelAnimationFrame(animation);animation=null;ctx.clearRect(0,0,width,height);setProgress(0);onClose();previousFocus?.focus?.({preventScroll:true});});
 document.querySelector('#closeCentenary').addEventListener('click',close);
 document.querySelector('#continuePhotos').addEventListener('click',close);
 addEventListener('resize',()=>{if(dialog.open)resize();});
 return {show,close,setProgress,get isOpen(){return dialog.open;}};
}
