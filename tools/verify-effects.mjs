#!/usr/bin/env node
/* Real rendered effect/control checks. CPU samples exclude GPU/raster; phones are emulated. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {browserRuntime} from './browser-runtime.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] || 'http://127.0.0.1:4186/';
const out = process.argv[3] || path.join(root, 'docs/revamp/effects');
const {chromium} = browserRuntime();
const browser = await chromium.launch();
const results = [], errors = [], external = [];
let passed = false;
const mutations = {jump:'stillWarp',gate:'gain',range:'haze',wash:'contours',relief:'scan',
  terminator:'atmosphere',scope:'bezelAlpha',mark:'apertureAlpha',row:'pylonH',sky:'bandAlpha',
  'yard-scene':'consoleScale',rings:'radius',hyperspace:'streakLen',placeholder:'probeAlpha'};
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
await fs.mkdir(out, {recursive:true});
const slugs = (await fs.readdir(path.join(root, 'parts'))).filter(f=>f.endsWith('.html')&&f!=='index.html').map(f=>f.slice(0,-5));
try {
  for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
    const context = await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:viewport.width<500,isMobile:viewport.width<500});
    context.on('page', page => {
      page.on('pageerror', e=>errors.push({url:page.url(),message:e.message}));
      page.on('request', request=>{const u=request.url();if(!u.startsWith(base)&&!u.startsWith('data:')&&!u.startsWith('blob:'))external.push(u);});
    });
    const page = await context.newPage();
    for (const slug of slugs) {
      await page.goto(base+'parts/'+slug+'.html?motion=still', {waitUntil:'networkidle'});
      await page.waitForTimeout(250);
      const state = await page.evaluate(()=>({mounted:!!BONEYARD_PART.handle,tasks:BONEYARD.Ticker.size,
        overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,
        canvas:[document.getElementById('part').width,document.getElementById('part').height],
        readout:document.getElementById('part-readout').textContent}));
      assert(state.mounted && !state.overflow && state.tasks===0, slug+' Still state');
      const stage = page.locator('#stage');
      const before = await stage.screenshot();
      await fs.writeFile(path.join(out,slug+'-'+viewport.width+'-stage-still.png'),before);
      let mutation = null;
      const key = mutations[slug];
      if (key) {
        if(!await page.locator('.params-disclosure').evaluate(e=>e.open))
          await page.locator('.params-disclosure > summary').click();
        const slider = page.locator('input[data-param="'+key+'"]');
        const old = await slider.inputValue();
        for(let step=0;step<12;step++) await slider.press('ArrowRight');
        await page.waitForTimeout(200);
        const value = await slider.inputValue();
        const after = await stage.screenshot();
        assert.notEqual(value,old,slug+' parameter changed');
        assert.notEqual(hash(after),hash(before),slug+' parameter changes rendered Still');
        mutation = {key,from:old,to:value,renderChanged:true};
        await page.getByRole('button',{name:'Reset',exact:true}).click();
      }
      if (slug==='wash') {
        await page.getByRole('button',{name:'Rain burst',exact:true}).click();
        assert.equal(await page.evaluate(()=>BONEYARD.Ticker.size),0,'Still rain does not start ticker');
        const rain = await stage.screenshot();
        assert.notEqual(hash(rain),hash(before),'Rain changes the settled frame');
        const downloadPromise = page.waitForEvent('download');
        const savedPose = await page.evaluate(()=>document.getElementById('part').toDataURL('image/png'));
        await page.getByRole('button',{name:'Save PNG',exact:true}).click();
        const download = await downloadPromise;
        const actual = await fs.readFile(await download.path());
        const pngPixels = await page.evaluate(async ({before,after})=>{
          const decode=async src=>{const im=new Image();im.src=src;await im.decode();
            const c=document.createElement('canvas');c.width=im.width;c.height=im.height;
            const g=c.getContext('2d');g.drawImage(im,0,0);return {w:c.width,h:c.height,data:g.getImageData(0,0,c.width,c.height).data};};
          const a=await decode(before),b=await decode(after);
          let changes=0;if(a.w===b.w&&a.h===b.h){for(let i=0;i<a.data.length;i++)if(a.data[i]!==b.data[i])changes++;}
          else changes=-1;
          return {before:[a.w,a.h],after:[b.w,b.h],changes};
        },{before:savedPose,after:'data:image/png;base64,'+actual.toString('base64')});
        assert.equal(pngPixels.changes,0,'PNG pixels preserve the chosen rain frame');
        await fs.writeFile(path.join(out,'wash-'+viewport.width+'-burst.png'),rain);
      }
      if (['relief','terminator','mark','range'].includes(slug)) {
        const old = await stage.screenshot();
        await page.getByRole('button',{name:'Turn right',exact:true}).click();
        assert.notEqual(hash(await stage.screenshot()),hash(old),slug+' Still turn response');
      }
      await page.getByLabel('Designed still',{exact:true}).uncheck();
      await page.evaluate(()=>{
        const handle=BONEYARD_PART.handle, tick=handle.tick;
        window.__effectCpu=[];
        if(tick)handle.tick=function(...args){const t=performance.now();const result=tick.apply(this,args);window.__effectCpu.push(performance.now()-t);return result;};
      });
      await page.waitForTimeout(1000);
      const sample = await page.evaluate(()=>{
        const a=window.__effectCpu||[],sum=a.reduce((s,v)=>s+v,0);a.sort((a,b)=>a-b);
        return {ticks:a.length,meanCpuMs:a.length?sum/a.length:null,p95CpuMs:a.length?a[Math.floor((a.length-1)*.95)]:null,
          tasks:BONEYARD.Ticker.size,backing:[document.getElementById('part').width,document.getElementById('part').height]};
      });
      await page.screenshot({path:path.join(out,slug+'-'+viewport.width+'-workbench.png')});
      await page.getByLabel('Designed still',{exact:true}).check();
      assert.equal(await page.evaluate(()=>BONEYARD.Ticker.size),0,slug+' stops in Still');
      results.push({slug,viewport,still:state,mutation,full:sample});
    }
    await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);passed=true;
} finally {
  await browser.close();
  await fs.writeFile(path.join(out,'effect-checks.json'),JSON.stringify({passed,observedAt:new Date().toISOString(),base,
    conditions:'Installed Chromium, DPR 1, normal autoplay policy. 1440x900 and 390x844 touch emulation. One-second live module CPU samples after first frame; excludes GPU/raster, field performance and hardware-phone certification.',results,errors,external},null,2)+'\n');
}
console.log(JSON.stringify({passed,parts:slugs.length,views:results.length,errors,external}));
