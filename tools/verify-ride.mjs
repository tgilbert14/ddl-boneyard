#!/usr/bin/env node
/* Exercise the real tour and Web Audio intent under the browser's normal autoplay policy. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {browserRuntime} from './browser-runtime.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=process.argv[2]||'http://127.0.0.1:4186/';
const out=process.argv[3]||path.join(root,'docs/revamp/ride-checks.json');
const {chromium}=browserRuntime();const browser=await chromium.launch();const checks=[],errors=[],external=[];
const state=page=>page.evaluate(()=>({motion:document.documentElement.dataset.dial,y:scrollY,
  on:window.BONEYARD_SOUND.on,pending:window.BONEYARD_SOUND.pending,audio:window.BONEYARD_SOUND.context?.state||null,
  playing:window.BONEYARD_SOUND.playing,outputLevel:window.BONEYARD_SOUND.outputLevel,
  flight:window.BONEYARD_RIDE.flight,autofly:window.BONEYARD_RIDE.autofly,
  soundState:document.getElementById('sound').dataset.state,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth}));
const record=(name,details)=>checks.push({name,...details});
let passed=false;
const observe=page=>{page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))external.push(r.url());});};
try{
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});const page=await context.newPage();
  observe(page);
  await page.goto(base,{waitUntil:'networkidle'});let s=await state(page);assert.equal(s.motion,'full');assert.equal(s.on,true);assert.equal(s.audio,null);record('Fresh defaults: Full, sound enabled, silent before intent',s);
  await page.getByRole('button',{name:'Start auto-fly',exact:true}).click();
  await page.waitForFunction(()=>window.BONEYARD_SOUND.context?.state==='running');
  await page.waitForFunction(()=>window.BONEYARD_RIDE.flight?.phase==='travel');
  const samples=[];for(let i=0;i<9;i++){samples.push(await state(page));await page.waitForTimeout(200);}
  assert(samples.at(-1).y>samples[0].y);assert(samples.every((v,i)=>!i||v.y>=samples[i-1].y));
  assert(samples.some(v=>v.playing&&v.outputLevel>0));
  record('Auto-fly starts audio and travels monotonically with real default timing',{samples});
  await page.waitForFunction(()=>window.BONEYARD_RIDE.flight?.phase==='hold'&&window.BONEYARD_RIDE.flight?.target===1);
  s=await state(page);const top=await page.evaluate(()=>document.getElementById('jump').offsetTop);assert(Math.abs(s.y-top)<2);await page.waitForTimeout(500);assert(Math.abs((await state(page)).y-top)<2);record('Exact Jump stop and deliberate dwell',s);
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(120);s=await state(page);assert(Math.abs(s.y-await page.evaluate(()=>document.getElementById('jump').offsetTop))<2);assert.equal(s.flight.target,1);record('Resize during dwell keeps the same scene',s);
  await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(120);
  await page.keyboard.press('Tab');assert.equal((await state(page)).autofly,true);record('Tab navigation does not interrupt tour',await state(page));
  await page.getByRole('button',{name:'Sound on',exact:true}).click();assert.equal((await state(page)).autofly,true);await page.waitForTimeout(250);s=await state(page);assert.equal(s.on,false);assert.equal(s.audio,'suspended');record('Visible mute works without stopping tour',s);
  await page.getByRole('button',{name:'Pause auto-fly',exact:true}).click();s=await state(page);assert.equal(s.autofly,false);const paused=s.y;await page.waitForTimeout(250);assert(Math.abs((await state(page)).y-paused)<2);record('Pause holds current position',s);
  await page.getByRole('button',{name:'Start auto-fly',exact:true}).click();assert.equal((await state(page)).on,false);await page.mouse.wheel(0,130);await page.waitForTimeout(150);assert.equal((await state(page)).autofly,false);assert.equal((await state(page)).on,false);record('Wheel takes over and explicit mute persists',await state(page));
  await page.reload({waitUntil:'networkidle'});assert.equal((await state(page)).on,false);record('Mute survives reload',await state(page));
  await context.close();

  const phoneContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const phone=await phoneContext.newPage();observe(phone);
  await phone.goto(base,{waitUntil:'networkidle'});
  await phone.getByRole('button',{name:'Start auto-fly',exact:true}).tap();await phone.waitForFunction(()=>window.BONEYARD_RIDE.autofly&&window.BONEYARD_SOUND.context?.state==='running');
  await phone.getByRole('button',{name:'Pause auto-fly',exact:true}).tap();assert.equal((await state(phone)).autofly,false);record('Phone tap starts and pauses exactly once',await state(phone));
  await phone.setViewportSize({width:320,height:568});s=await state(phone);assert.equal(s.overflow,false);
  const controls=await phone.locator('#hud .hud-actions').evaluate(el=>{const brand=document.querySelector('.yard-brand').getBoundingClientRect(),box=el.getBoundingClientRect();return {overlap:box.left<brand.right,buttons:[...el.querySelectorAll('button,summary')].map(e=>{const b=e.getBoundingClientRect();return{label:e.getAttribute('aria-label'),width:b.width,height:b.height};})};});
  assert.equal(controls.overlap,false);assert(controls.buttons.every(b=>b.width>=44&&b.height>=44));record('320px phone controls fit with 44px targets',{...s,controls});
  await phone.setViewportSize({width:390,height:844});await phone.screenshot({path:path.join(path.dirname(out),'ride-phone.png')});
  await phone.locator('#ride-settings summary').click();await phone.getByRole('radio',{name:'Still',exact:true}).check();assert.equal((await state(phone)).motion,'still');assert(await phone.getByRole('button',{name:'Start auto-fly',exact:true}).isDisabled());assert.equal((await state(phone)).on,true);record('Still disables flight while keeping sound independent',await state(phone));
  await phoneContext.close();

  const wheelContext=await browser.newContext({viewport:{width:1440,height:900}});const wheel=await wheelContext.newPage();observe(wheel);await wheel.goto(base,{waitUntil:'networkidle'});await wheel.mouse.wheel(0,300);await wheel.waitForTimeout(300);s=await state(wheel);assert.equal(s.on,true);assert(s.audio==='running'||s.pending===true);record('First wheel requests sound or truthfully offers tap fallback',s);
  if(s.pending){await wheel.getByRole('button',{name:/sound/i}).click();await wheel.waitForFunction(()=>window.BONEYARD_SOUND.context?.state==='running');record('Tap unlocks blocked first-wheel audio',await state(wheel));}
  await wheelContext.close();

  const blockedContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await blockedContext.addInitScript(()=>{
    const NativeAudioContext=window.AudioContext;
    window.AudioContext=class extends NativeAudioContext{
      constructor(...args){super(...args);this.policyBlocked=!navigator.userActivation.isActive;}
      get state(){return this.policyBlocked?'suspended':super.state;}
      resume(){if(this.policyBlocked&&!navigator.userActivation.isActive)return new Promise(()=>{});this.policyBlocked=false;return super.resume();}
    };
  });
  const blocked=await blockedContext.newPage();observe(blocked);await blocked.goto(base,{waitUntil:'networkidle'});await blocked.mouse.wheel(0,250);await blocked.waitForTimeout(150);
  s=await state(blocked);assert.equal(s.pending,true);assert.equal(s.playing,false);assert.equal(s.soundState,'pending');
  await blocked.getByRole('button',{name:'Sound pending. Tap to start sound',exact:true}).tap();
  await blocked.waitForFunction(()=>BONEYARD_SOUND.playing);s=await state(blocked);assert.equal(s.on,true);assert.equal(s.pending,false);
  record('Injected wheel-policy denial recovers with one touch, without muting',{...s,method:'AudioContext subclass denies non-activation resume; actual Web Audio nodes and a trusted tap.'});await blockedContext.close();

  const tourContext=await browser.newContext({viewport:{width:1440,height:900}});const tour=await tourContext.newPage();observe(tour);await tour.goto(base,{waitUntil:'networkidle'});
  await tour.evaluate(()=>{BONEYARD_RIDE.CFG.autoflyTravel=.06;BONEYARD_RIDE.CFG.autoflyDwell=.08;BONEYARD_RIDE.CFG.autoflyOpening=.02;});
  await tour.getByRole('button',{name:'Start auto-fly',exact:true}).click();
  await tour.waitForFunction(()=>!BONEYARD_RIDE.autofly&&BONEYARD_RIDE.current===BONEYARD_RIDE.bays.length-1,{},{timeout:25000});
  s=await state(tour);assert(Math.abs(s.y-await tour.evaluate(()=>document.getElementById('shelf').offsetTop))<2);record('Whole nine-leg route reaches shelf and stops (compressed timing)',s);
  await tour.getByRole('button',{name:'Start auto-fly',exact:true}).click();assert.equal((await state(tour)).flight.target,0);await tour.waitForTimeout(100);assert((await state(tour)).y>0);record('Replay returns smoothly instead of jumping to opening',await state(tour));
  await tour.keyboard.press('Escape');assert.equal((await state(tour)).autofly,false);record('Escape stops flight',await state(tour));await tourContext.close();
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);passed=true;
}finally{await browser.close();await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({passed,observed_at:new Date().toISOString(),base,conditions:'Installed Chromium, normal autoplay policy, real first-leg timing; complete-route state test uses compressed configured timing. Phone is emulated Chromium, not hardware Safari.',checks,errors,external},null,2)+'\n');}
console.log(JSON.stringify({checks:checks.length,errors,external,report:out}));
