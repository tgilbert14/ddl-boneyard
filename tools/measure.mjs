#!/usr/bin/env node
/* Local lab, not field metrics. Uses the configured workstation browser runtime.
 * node tools/measure.mjs [http://127.0.0.1:4186/]
 * No user inputs, telemetry or external services. Fourfold CPU slowdown, localhost transport. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {browserRuntime} from './browser-runtime.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=process.argv[2]||'http://127.0.0.1:4186/';
if (!['127.0.0.1','localhost'].includes(new URL(base).hostname)) throw new Error('This lab only measures a local preview.');
const {chromium}=browserRuntime();
const browser=await chromium.launch();
const results=[];
try {
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]) {
    const context=await browser.newContext({viewport,deviceScaleFactor:1,colorScheme:'dark'});
    const page=await context.newPage();
    const errors=[], offsite=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{const u=new URL(r.url());if(u.origin!==new URL(base).origin&&u.protocol!=='data:'&&u.protocol!=='blob:')offsite.push(r.url());});
    await page.addInitScript(()=>{
      window.__localLab={lcpMs:null,cls:0,blockingMs:0,longTasks:0};
      for(const [type,consume] of [
        ['largest-contentful-paint',e=>window.__localLab.lcpMs=e.startTime],
        ['layout-shift',e=>{if(!e.hadRecentInput)window.__localLab.cls+=e.value;}],
        ['longtask',e=>{window.__localLab.longTasks++;window.__localLab.blockingMs+=Math.max(0,e.duration-50);}]
      ]) {try {new PerformanceObserver(list=>list.getEntries().forEach(consume)).observe({type,buffered:true});}catch(_) {}}
    });
    const cdp=await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    await page.goto(base,{waitUntil:'networkidle'});
    await page.waitForTimeout(3000);
    const sample=await page.evaluate(()=>({
      ...window.__localLab,viewport:[innerWidth,innerHeight],
      overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,
      resources:performance.getEntriesByType('resource').map(e=>({name:e.name,encodedBodySize:e.encodedBodySize,transferSize:e.transferSize})),
      motion:document.documentElement.dataset.dial,
      canvasBacking:[...document.querySelectorAll('canvas')].map(c=>({id:c.id,width:c.width,height:c.height})),
      ticker:typeof BONEYARD !== 'undefined' ? {...BONEYARD.Ticker.stats,tasks:BONEYARD.Ticker.size} : null
    }));
    results.push({...sample,errors,offsite});
    await context.close();
  }
} finally {await browser.close();}
const html=await fs.readFile(path.join(root,'index.html'));
const report={date:new Date().toISOString(),conditions:'Local Chromium, deviceScaleFactor 1, CPU slowdown 4x, localhost transport, no network throttle. Observe navigation through network idle plus 3 seconds. blockingMs is a fixed-window long-task proxy, not field INP or Lighthouse TBT.',sourceBytes:html.length,gzipBytes:gzipSync(html).length,results};
await fs.mkdir(path.join(root,'docs/revamp'),{recursive:true});
await fs.writeFile(path.join(root,'docs/revamp/lab.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,results:results.map(({resources,canvasBacking,...r})=>({...r,resourceCount:resources.length}))},null,2));
if(results.some(r=>r.errors.length||r.offsite.length||r.overflow)) process.exitCode=1;
