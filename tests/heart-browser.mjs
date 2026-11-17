import {chromium,devices} from 'playwright';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const base=process.env.NOEL_QA_BASE||'http://127.0.0.1:4173';
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/heart.json',import.meta.url),'utf8'));
const out=fileURLToPath(new URL('../test-results/',import.meta.url));
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
try{
 const context=await browser.newContext({...devices['iPhone 13'],viewport:{width:390,height:844}});
 await context.grantPermissions(['camera'],{origin:new URL(base).origin});
 await context.addInitScript(({hands})=>{window._heartFixture=hands;window._activeHands=hands;},{hands:fixture.landmarks});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/vendor/vision_bundle.mjs',route=>route.fulfill({contentType:'application/javascript',body:`
 export class FilesetResolver {static async forVisionTasks(){return {};}}
 export class HandLandmarker {static async createFromOptions(files,options){window._configuredHands=options.numHands;return {detectForVideo(){return {landmarks:window._activeHands};},close(){window._testDetectorClosed=true;}};}}
 `}));
 await page.goto(base+'/',{waitUntil:'networkidle'});
 assert.equal(await page.locator('#centenary').evaluate(d=>d.open),false);
 await page.locator('#cameraButton').click();
 await page.waitForFunction(()=>!document.querySelector('#heartProgress').hidden,null,{timeout:10000});
 await page.waitForFunction(()=>document.querySelector('#centenary').open,null,{timeout:10000});
 assert.equal(await page.evaluate(()=>window._configuredHands),2);
 assert.match(await page.locator('#centenaryOrigin').innerText(),/双人爱心达成/);
 assert.equal(await page.locator('.centenary-dates').innerText(),'OUR STORY · DAY 001 — 100');
 assert.equal(await page.locator('.centenary-music').getAttribute('aria-pressed'),'false');
 await page.waitForTimeout(1200);await page.screenshot({path:out+'/recognized-heart.png'});
 await page.locator('#continuePhotos').click();
 await page.waitForTimeout(1600);assert.equal(await page.locator('#centenary').evaluate(d=>d.open),false);
 await page.evaluate(()=>{window._activeHands=[];});await page.waitForTimeout(1000);
 assert.equal(await page.locator('#heartProgress').isVisible(),false);
 await page.locator('#stopCamera').click();
 assert.equal(await page.locator('#camera').evaluate(v=>v.srcObject),null);
 assert.equal(errors.length,0);
 const report={passed:true,source:'synthetic dual-hand landmarks routed through controller',numHands:2,holdTriggersDialog:true,recognizedLabel:true,datesExact:true,heldPoseDoesNotRetrigger:true,noAutomaticMusic:true,releaseClearsProgress:true,stopReleasesCamera:true,errors,realDeviceTested:false};
 await fs.writeFile(out+'/heart-browser-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
