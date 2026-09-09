const { test } = require('node:test');
const assert = require('node:assert/strict');

// Opt-in: requires the local site/API and reachable AniKoto media servers.
test('live AniKoto skip buttons follow initial playback, sub/dub switches and next episode',
    { skip: process.env.ANIKOTO_LIVE !== '1', timeout: 240000 }, async () => {
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Jeet/Videos/fewfwewfd/api.consumet.org/node_modules/playwright');
    const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    try {
        const context = await browser.newContext({ permissions: ['local-network-access'] });
        await context.route('**/config.js', route => route.fulfill({ contentType: 'application/javascript',
            body: 'window.__STREAMVERSE_CONFIG__ = ' + JSON.stringify({
                LOCAL_META_API_BASE: 'http://127.0.0.1:3000/meta/tmdb', META_API_BASE: 'http://127.0.0.1:3000/meta/tmdb',
                LOCAL_MEDIA_PROXY_BASE: 'http://127.0.0.1:3000', MEDIA_PROXY_BASE: 'http://127.0.0.1:3000',
            }) }));
        const page = await context.newPage();
        const errors = [], externalSkipRequests = [], watches = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => {
            if (/aniskip\.com|\/utils\/anilist/.test(request.url())) externalSkipRequests.push(request.url());
            if (/\/anime\/anikoto\/watch\//.test(request.url())) watches.push(decodeURIComponent(request.url()));
        });
        const open = async (id, title, slug, db = 'anilist') => {
            const query = new URLSearchParams({ id, title, db, anime: '1', type: 'tv', provider: 'anikoto',
                season: '1', episode: '1', episodeId: `${slug}$episode$1`, audio: 'subbed', resume: '0', apiSource: 'local' });
            await page.goto(`http://127.0.0.1:3005/player.html?${query}`, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => hasProviderSkipSegments && video.readyState >= 2 && video.currentTime > 0, undefined, { timeout: 60000 });
            await page.evaluate(() => { video.pause(); autoEpisodeEnabled = false; });
        };
        const state = () => page.evaluate(() => ({ segments: animeSkipSegments, source: allSources[currentIdx],
            duration: video.duration, provider: hasProviderSkipSegments }));
        const seek = async time => {
            await page.evaluate(time => { video.pause(); video.currentTime = time; }, time);
            await page.waitForFunction(time => Math.abs(video.currentTime - time) < 1, time);
            await page.evaluate(() => { updateSkipSegmentButton(); updateNextEpisodeButton(); });
        };
        await open('120089', 'Spy x Family', 'spy-x-family-6zlbz', 'tmdb');
        let current = await state();
        assert.equal(current.segments.intro, null, 'upstream 0,0 is not an opening');
        assert.deepEqual(current.segments.outro, { start: 1315, end: 1357 });
        assert.equal(await page.locator('#skipSegmentBtn').isVisible(), false);
        await seek(1320);
        assert.match(await page.locator('#skipSegmentBtn').innerText(), /Skip Outro/);
        for (const isDub of [true, false]) {
            await page.evaluate(isDub => selectSource(allSources.findIndex(s => s.isDub === isDub), 1320), isDub);
            await page.waitForFunction(isDub => allSources[currentIdx].isDub === isDub && video.readyState >= 2 && Math.abs(video.currentTime - 1320) < 5, isDub, { timeout: 60000 });
            await page.evaluate(() => video.pause());
            current = await state();
            assert.deepEqual(current.segments.outro, current.source.outro);
            assert.match(await page.locator('#skipSegmentBtn').innerText(), /Skip Outro/);
        }
        await page.locator('#skipSegmentBtn').click();
        await page.waitForFunction(() => video.currentTime >= 1357);
        await seek(current.duration - 20);
        await page.locator('#nextEpisodeBtn').click();
        await page.waitForFunction(() => curEpisode === 1 && hasProviderSkipSegments && animeSkipSegments.intro?.end === 90 && video.readyState >= 2 && video.currentTime < 90, undefined, { timeout: 60000 });
        await page.evaluate(() => video.pause());
        current = await state();
        assert.deepEqual(current.segments, { intro: { start: 0, end: 90 }, outro: null });
        assert.match(await page.locator('#skipSegmentBtn').innerText(), /Skip Intro/);
        assert.ok(watches.some(url => url.includes('spy-x-family-6zlbz$episode$2')));
        await page.locator('#skipSegmentBtn').click();
        await page.waitForFunction(() => video.currentTime >= 90);
        console.log('Live Spy x Family: initial outro, sub/dub switches, next-episode intro and skip jumps passed');

        await page.setViewportSize({ width: 390, height: 844 });
        await open('108553', 'Val x Love', 'val-x-love-vsayw');
        current = await state();
        assert.deepEqual(current.segments, { intro: { start: 0, end: 101 }, outro: { start: 1295, end: 1385 } });
        assert.match(await page.locator('#skipSegmentBtn').innerText(), /Skip Intro/);
        await page.locator('#skipSegmentBtn').click();
        await page.waitForFunction(() => video.currentTime >= 101);
        await seek(1300);
        assert.match(await page.locator('#skipSegmentBtn').innerText(), /Skip Outro/);
        assert.equal(await page.locator('.skip-marker').count(), 2);
        assert.deepEqual(externalSkipRequests, [], 'provider timings must not launch external lookup');
        assert.deepEqual(errors, []);
        console.log('Live mobile Val x Love: intro/outro buttons, seekbar markers and intro jump passed; no AniSkip requests');
    } finally { await browser.close(); }
});
