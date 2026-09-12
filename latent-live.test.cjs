const { chromium } = require('C:/Users/Jeet/Videos/fewfwewfd/api.consumet.org/node_modules/playwright');
const { test } = require('node:test');
const assert = require('node:assert/strict');
test('live Latent source startup and next-episode playback', {skip:process.env.LATENT_LIVE !== '1',timeout:240000}, async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ permissions: ['local-network-access'] });
    const page = await context.newPage();
    page.on('pageerror', e=>console.log('PAGEERROR',e.message));
    const started = Date.now();
    page.on('console', m => {
      const text = m.text();
      if (/selected episode context|watch request|first frame|HLS Error|watchCandidates|playTvEp|fetchSources|provider|Archive/i.test(text)) console.log(Date.now()-started, text.slice(0,600));
    });
    page.on('response', async r => {
      const u = new URL(r.url());
      if (u.pathname.includes('/watch') || (u.pathname.includes('/proxy/') && r.status() >= 400)) console.log('response',Date.now()-started,r.status(),u.pathname.slice(0,150));
    });
    const episode = process.env.LATENT_EPISODE || '5';
    await page.goto('http://localhost:3005/player?'+new URLSearchParams({id:'262838',type:'tv',...(process.env.LATENT_FORCED ? {provider:process.env.LATENT_FORCED} : {}),apiSource:'local',season:'2',episode,resume:'0',t:'0'}), {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => { const v=document.querySelector('video'); return v && v.videoWidth>0 && v.currentTime>1; },null,{timeout:150000});
    console.log('PLAYING',Date.now()-started,await page.locator('video').first().evaluate(v=>({time:v.currentTime,width:v.videoWidth})));
    console.log('SOURCE',await page.evaluate(()=>({provider:allSources[currentIdx]?.provider,host:new URL(allSources[currentIdx].url).hostname,season:tvSeasons[curSeason]?.seasonNo,episode:curEpisode+1})));
    if (process.env.LATENT_NEXT === '1') {
      const t = Date.now();
      const previousSrc = await page.locator('video').first().evaluate(v=>v.currentSrc);
      const watch = page.waitForResponse(r=>r.url().includes('/watch') && r.request().method()==='GET', {timeout:45000});
      await page.evaluate(()=>goToNextEpisode());
      await watch;
      await page.waitForFunction(old=>document.querySelector('video')?.currentSrc && document.querySelector('video')?.currentSrc !== old,previousSrc,{timeout:150000});
      await page.waitForFunction(expected=>curEpisode+1===expected && document.querySelector('video')?.videoWidth>0 && document.querySelector('video')?.currentTime>1,Number(episode)+1,{timeout:150000});
      console.log('NEXT_PLAYING',Date.now()-t);
      console.log('NEXT_SOURCE',await page.evaluate(()=>({provider:allSources[currentIdx]?.provider,host:new URL(allSources[currentIdx].url).hostname,episode:curEpisode+1})));
      assert.equal(await page.evaluate(()=>curEpisode+1),Number(episode)+1);
    }
    if (process.env.LATENT_SPECIAL === '1') {
      await page.evaluate(()=>toggleEpPanel());
      await page.locator('#ep-panel .ep-item[data-episode-id*="ucp5r8"]').evaluate(row=>row.click());
      await page.waitForFunction(()=>String(allSources[currentIdx]?.url||'').length>0 && document.querySelector('video')?.videoWidth>0 && document.querySelector('video')?.currentTime>1,null,{timeout:150000});
      console.log('SPECIAL_PLAYING',await page.evaluate(()=>({season:tvSeasons[curSeason]?.seasonNo,episodeId:tvSeasons[curSeason]?.episodes[curEpisode]?.id})));
    }
  } finally { await browser.close(); }
});
