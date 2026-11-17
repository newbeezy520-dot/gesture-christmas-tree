import {chromium,devices} from 'playwright';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/wave.json',import.meta.url),'utf8'));
const base=process.env.NOEL_QA_BASE||'http://127.0.0.1:4173';
const production=base.startsWith('https://');
const out=fileURLToPath(new URL('../test-results/',import.meta.url));await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
try{
 const context=await browser.newContext({...devices['iPhone 13'],viewport:{width:390,height:844}});
 await context.grantPermissions(['camera'],{origin:new URL(base).origin});
 await context.addInitScript(({hand})=>{window._waveBase=hand;window._waveOffset=0;},{hand:fixture.hand});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/vendor/vision_bundle.mjs',route=>route.fulfill({contentType:'application/javascript',body:`
 export class FilesetResolver{static async forVisionTasks(){return {};}}
 export class HandLandmarker{static async createFromOptions(){return {detectForVideo(){return {landmarks:[window._waveBase.map(p=>({...p,x:p.x+window._waveOffset}))]};},close(){}};}}
 `}));
 const response=await page.goto(base+'/',{waitUntil:'networkidle',timeout:60000});assert.equal(response.status(),200);
 await page.locator('[data-action=burst]').click();await page.locator('#cameraButton').click();
 await page.waitForFunction(()=>!document.querySelector('#cameraButton').disabled);
 assert.ok(await page.locator('#cameraPreview').isVisible());
 await page.waitForTimeout(450);
 const counter=()=>page.locator('#photoCounter').innerText();
 const move=offset=>page.evaluate(async offset=>{
  const from=window._waveOffset,start=performance.now();
  await new Promise(resolve=>{function tick(now){const u=Math.min(1,(now-start)/420);window._waveOffset=from+(offset-from)*u;if(u<1)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});
 },offset);
 assert.equal(await counter(),'01 / 05');
 await move(.25);await page.waitForTimeout(180);assert.equal(await counter(),'02 / 05');
 await move(0);await page.waitForTimeout(1400);assert.equal(await counter(),'02 / 05');
 await move(-.25);await page.waitForTimeout(180);assert.equal(await counter(),'01 / 05');
 await move(0);await page.waitForTimeout(1400);
 await move(-.25);await page.waitForTimeout(180);assert.equal(await counter(),'05 / 05');
 await move(0);await page.waitForTimeout(1400);
 await page.locator('#heartButton').click();await page.waitForFunction(()=>document.querySelector('#centenary').open);
 await move(.25);await page.waitForTimeout(200);assert.equal(await counter(),'05 / 05');
 assert.equal(await page.locator('#centenaryTitle').innerText(),'恭喜解锁100天成就');
 await page.screenshot({path:out+(production?'/production-title.png':'/new-title.png')});
 await page.locator('#continuePhotos').click();await page.locator('#stopCamera').click();
 assert.equal(await page.locator('#camera').evaluate(v=>v.srcObject),null);
 assert.equal(errors.length,0);
 const report={passed:true,url:base,input:'synthetic open palm moving over time through the camera controller',leftWaveNext:true,rightWavePrevious:true,returnMotionIgnored:true,wrapAround:true,achievementBlocksWave:true,newTitle:'恭喜解锁100天成就',errors,realPhoneTested:false};
 await fs.writeFile(out+(production?'/production-wave-report.json':'/wave-browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
