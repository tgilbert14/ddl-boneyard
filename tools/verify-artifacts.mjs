#!/usr/bin/env node
/* Artifact/contract gate. Reads the workbench export API, lifts the exact resulting HTML into an
 * isolated directory with local assets, and renders it. No GUI automation or external services. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {browserRuntime} from './browser-runtime.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fontLicenses=await Promise.all(['OFL-michroma.txt','OFL-ibmplexmono.txt'].map(async file=>(await fs.readFile(path.join(root,'assets/fonts',file),'utf8')).replace(/\r\n?/g,'\n').replace(/[ \t]+$/gm,'').trim()));
const base=process.argv[2]||'http://127.0.0.1:4186/';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname)) throw new Error('Use a local preview.');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'boneyard-lift-'));
await fs.cp(path.join(root,'assets'),path.join(temp,'assets'),{recursive:true});
const server=http.createServer(async(req,res)=>{
  const p=decodeURIComponent(new URL(req.url,'http://x').pathname);
  const f=path.resolve(temp,'.'+p);
  if(!f.startsWith(temp+path.sep)){res.writeHead(403);res.end();return;}
  try {const data=await fs.readFile(f);res.setHeader('Content-Type',f.endsWith('.html')?'text/html':f.endsWith('.json')?'application/json':f.endsWith('.webp')?'image/webp':f.endsWith('.png')?'image/png':'application/octet-stream');res.end(data);}catch(_){res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const liftBase='http://127.0.0.1:'+server.address().port+'/';
const {chromium}=browserRuntime();
const browser=await chromium.launch();
const results=[],failures=[],offsite=[];
try {
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,reducedMotion:'reduce'});
  const page=await context.newPage();
  let errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{const u=new URL(r.url());if(!['127.0.0.1','localhost',''].includes(u.hostname)&&!['data:','blob:'].includes(u.protocol))offsite.push(r.url());});
  const slugs=(await fs.readdir(path.join(root,'parts'))).filter(f=>f.endsWith('.html')&&f!=='index.html').map(f=>f.slice(0,-5));
  for(const slug of slugs){
    errors=[];
    await page.goto(base+'parts/'+slug+'.html?motion=still',{waitUntil:'networkidle'});
    const state=await page.evaluate(()=>({mounted:!!window.BONEYARD_PART?.handle,tasks:typeof BONEYARD!=='undefined'?BONEYARD.Ticker.size:null,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,stage:[document.getElementById('stage').clientWidth,document.getElementById('stage').clientHeight],canvas:[document.getElementById('part').width,document.getElementById('part').height]}));
    results.push({slug,...state,errors:[...errors]});
    if(!state.mounted||state.overflow||errors.length||state.tasks!==0)failures.push(slug+': invalid Still/mount state');
  }
  for(const [slug,query] of [['range','p.ve=3'],['gate','p.gain=2'],['yard-scene','p.consoleScale=1.2'],['scope','p.fftSize=300']]) {
    errors=[];
    await page.goto(base+'parts/'+slug+'.html?motion=still&'+query,{waitUntil:'networkidle'});
    await page.waitForTimeout(350);
    const source=await page.evaluate(()=>window.BONEYARD_PART.exportSource());
    assert(source.includes('id="boneyard-part-config"'),slug+' has embedded config');
    for(const license of fontLicenses)assert(source.includes(license),slug+' exported font notice and license');
    await fs.writeFile(path.join(temp,slug+'.html'),source);
    const before=await page.evaluate(()=>({...window.BONEYARD_PART.params}));
    const png=await page.evaluate(()=>document.getElementById('part').toDataURL('image/png').split(',')[1]);
    await fs.mkdir(path.join(root,'docs/revamp/artifacts'),{recursive:true});
    await fs.writeFile(path.join(root,'docs/revamp/artifacts',slug+'-verified-frame.png'),Buffer.from(png,'base64'));
    await page.goto(liftBase+slug+'.html',{waitUntil:'networkidle'});
    const after=await page.evaluate(()=>({...window.BONEYARD_PART.params}));
    assert.deepEqual(after,before,slug+' export round trip');
    if(slug==='range')assert.equal(after.ve,3);
    if(slug==='scope')assert.equal(Math.log2(after.fftSize)%1,0,'fft size power of two');
    if(errors.length)failures.push(slug+': lifted page errors '+errors.join(' | '));
    results.push({slug,lift:true,parameters:after,htmlBytes:Buffer.byteLength(source),errors:[...errors]});
  }
  await context.close();
  const staticContext=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,javaScriptEnabled:false});
  const staticPage=await staticContext.newPage();
  for(const route of ['', 'parts/index.html', 'parts/range.html']) {
    await staticPage.goto(base+route,{waitUntil:'networkidle'});
    const state=await staticPage.evaluate(()=>({overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,staticFrames:[...document.querySelectorAll('.static-frame')].map(e=>({complete:e.complete,width:e.naturalWidth,display:getComputedStyle(e).display})),visibleExportButtons:[...document.querySelectorAll('.actions button')].filter(e=>e.getClientRects().length).length}));
    assert.equal(state.overflow,false,'noJS overflow '+route);
    assert.equal(state.visibleExportButtons,0,'noJS export controls hidden');
    if(route==='parts/range.html')assert(state.staticFrames[0]?.width>0,'noJS designed frame decoded');
    await staticPage.screenshot({path:path.join(root,'docs/revamp',route==='parts/range.html'?'workbench-no-js-phone.png':route==='parts/index.html'?'shelf-no-js-phone.png':'ride-no-js-phone.png')});
    results.push({route,noJavaScript:true,...state});
  }
  await staticContext.close();
} finally {await browser.close();server.close();await fs.rm(temp,{recursive:true,force:true});}
const report={date:new Date().toISOString(),conditions:'Local Chromium, DPR 1, reduced motion, 17 standalone pages plus four exact export API artifacts lifted with adjacent assets. User download buttons are exercised separately in the visible browser.',results,offsite,failures};
await fs.writeFile(path.join(root,'docs/revamp/artifact-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pages:results.filter(r=>r.slug&&!r.lift).length,noJavaScript:results.filter(r=>r.noJavaScript).length,lifts:results.filter(r=>r.lift).length,offsite,failures},null,2));
if(failures.length||offsite.length)process.exitCode=1;
