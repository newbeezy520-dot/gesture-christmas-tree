import { chromium, devices } from 'playwright';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const out=fileURLToPath(new URL('../test-results/',import.meta.url));await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--enable-unsafe-swiftshader']});
const base=process.env.NOEL_QA_BASE||'http://127.0.0.1:4173';
const report={pages:[],externalRequests:[],blockedExternalRequests:[],errors:[],camera:{},model:{}};
for(const [name,options] of [
 ['desktop',{viewport:{width:1440,height:900}}],
 ['mobile',{...devices['iPhone 13'],viewport:{width:390,height:844}}],
 ['small-mobile',{...devices['iPhone SE'],viewport:{width:375,height:667}}],
 ['landscape',{viewport:{width:844,height:390},isMobile:true,hasTouch:true}]
].filter(([name])=>!process.env.NOEL_QA_VIEWPORT||process.env.NOEL_QA_VIEWPORT===name)){
 const context=await browser.newContext(options);const page=await context.newPage();
 page.on('pageerror',error=>report.errors.push({page:name,message:error.message}));
 const external=r=>!r.url().startsWith(base+'/')&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'+base+'/');
 page.on('requestfinished',r=>{if(external(r))report.externalRequests.push(r.url());});
 page.on('requestfailed',r=>{if(external(r))report.blockedExternalRequests.push({url:r.url(),failure:r.failure()});});
 await page.goto(base+'/',{waitUntil:'networkidle'});
 await page.waitForTimeout(1600);
 assert.equal(await page.locator('#experience').getAttribute('data-mode'),'tree');
 await page.screenshot({path:`${out}/${name}-tree.png`});
 await page.locator('[data-action=burst]').click();await page.waitForTimeout(1500);
 assert.equal(await page.locator('#revelation').getAttribute('aria-hidden'),'false');
 await page.screenshot({path:`${out}/${name}-burst.png`});
 assert.equal(await page.locator('.photo').count(),5);
 const visited=[];
 for(let i=1;i<=5;i++){
  const number=String(i).padStart(2,'0');
  assert.equal(await page.locator('#photoCounter').innerText(),`${number} / 05`);
  assert.equal(await page.locator('.photo-active img').getAttribute('src'),`./samples/card-${number}.svg`);
  await page.locator('.photo-active img').evaluate(image=>image.decode());
  assert.equal(await page.locator('.photo-active img').evaluate(image=>getComputedStyle(image).objectFit),'contain');
  assert.equal(await page.locator('.photo:not([hidden])').count(),3);
  visited.push(number);
  if(name==='mobile'&&[7,8,9,11,13].includes(i)){await page.waitForTimeout(750);await page.screenshot({path:`${out}/${name}-photo-${number}.png`});}
  await page.locator('#nextPhoto').click();
 }
 assert.equal(await page.locator('#photoCounter').innerText(),'01 / 05');
 await page.locator('#previousPhoto').click();assert.equal(await page.locator('#photoCounter').innerText(),'05 / 05');
 await page.locator('#nextPhoto').click();assert.equal(await page.locator('#photoCounter').innerText(),'01 / 05');
 assert.equal(await page.locator('.masthead [data-music-toggle]').getAttribute('aria-pressed'),'false');
 await page.locator('.masthead [data-music-toggle]').click();
 await page.waitForFunction(()=>document.querySelector('.masthead [data-music-toggle]').getAttribute('aria-pressed')==='true');
 await page.locator('#heartButton').click();
 await page.waitForFunction(()=>document.querySelector('#centenary').open);
 assert.match(await page.locator('#centenaryOrigin').innerText(),/触屏预览/);
 assert.equal(await page.locator('#centenaryTitle').innerText(),'恭喜解锁100天成就');
 assert.equal(await page.locator('.centenary-dates').innerText(),'OUR STORY · DAY 001 — 100');
 assert.equal(await page.locator('.centenary-music').getAttribute('aria-pressed'),'true');
 await page.locator('.centenary-music').click();
 assert.equal(await page.locator('.masthead [data-music-toggle]').getAttribute('aria-pressed'),'false');
 await page.waitForTimeout(1200);
 const card=await page.locator('.centenary-card').boundingBox();
 assert.ok(card.x>=0&&card.y>=0&&card.x+card.width<=options.viewport.width+1&&card.y+card.height<=options.viewport.height+1,name+' centenary fits screen');
 assert.ok(await page.locator('.centenary-card').evaluate(el=>el.scrollWidth<=el.clientWidth+1),name+' centenary text fits card');
 await page.screenshot({path:`${out}/${name}-centenary.png`});
 await page.locator('#continuePhotos').click();assert.equal(await page.locator('#centenary').evaluate(d=>d.open),false);
 await page.locator('[data-action=scatter]').click();assert.equal(await page.locator('#experience').getAttribute('data-mode'),'scatter');
 await page.locator('[data-action=tree]').click();assert.equal(await page.locator('#revelation').getAttribute('aria-hidden'),'true');
 await page.locator('#helpButton').click();await page.locator('#helpDone').click();assert.equal(await page.locator('#instructions').isVisible(),false);
 const metrics=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,images:[...document.images].every(x=>x.complete&&x.naturalWidth>0)}));
 assert.ok(metrics.images,name+' photos load');assert.ok(metrics.scrollWidth<=metrics.width,name+' no horizontal overflow');assert.ok(metrics.scrollHeight<=metrics.height,name+' controls fit screen');
 if(name==='mobile'){
  await context.grantPermissions(['camera'],{origin:new URL(base).origin});
  await page.locator('#cameraButton').click();await page.waitForFunction(()=>!document.querySelector('#cameraButton').disabled,null,{timeout:90000});
  const cameraActive=await page.locator('#cameraPreview').isVisible();
  report.camera={fakeDevice:true,started:cameraActive,status:await page.locator('#status').innerText()};assert.ok(cameraActive,'real runtime starts on fake video');
  await page.locator('#stopCamera').click();assert.equal(await page.locator('#cameraPreview').isVisible(),false);
  assert.equal(await page.locator('#camera').evaluate(v=>v.srcObject),null);
  report.model=await page.evaluate(async()=>{
   const {FilesetResolver,HandLandmarker}=await import(new URL('./vendor/vision_bundle.mjs',location.href).href);
   const files=await FilesetResolver.forVisionTasks(new URL('./vendor/wasm',location.href).href);
   const detector=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./vendor/hand_landmarker.task',location.href).href,delegate:'CPU'},runningMode:'IMAGE',numHands:2});
   detector.close();return {initialized:true};
  });
 }
 report.pages.push({name,...metrics,allThreeStates:true,albumNavigation:true,allPhotosVisited:visited,wrapAround:true,musicToggle:true,centenaryPreview:true,centenaryDates:'OUR STORY · DAY 001 — 100',centenaryFits:true,help:true});
 await context.close();
}
await browser.close();
await fs.writeFile(out+'/browser-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
assert.equal(report.errors.length,0);assert.equal(report.externalRequests.length,0);
