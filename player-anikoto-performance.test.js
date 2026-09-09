const { test } = require('node:test');
const assert = require('node:assert/strict');

test('live AniKoto initial and next episode request-to-first-frame',
    { skip: process.env.ANIKOTO_PERF !== '1', timeout: 240000 }, async () => {
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
        await page.addInitScript(() => {
            window.__frames = [];
            document.addEventListener('loadeddata', event => {
                if (event.target instanceof HTMLVideoElement) event.target.requestVideoFrameCallback((now, metadata) =>
                    window.__frames.push({ now, mediaTime: metadata.mediaTime }));
            }, true);
        });
        page.on('console', message => { if (process.env.ANIKOTO_DEBUG === '1') console.log(message.text()); });
        const requests = [], errors = [];
        let start = Date.now();
        page.on('pageerror', error => errors.push(error.message));
        page.on('requestfinished', request => {
            if (!/127\.0\.0\.1:3000/.test(request.url()) || /\/proxy|\/media-proxy/.test(request.url())) return;
            const timing = request.timing();
            requests.push({ url: decodeURIComponent(request.url()), at: timing.startTime - start, ms: timing.responseEnd });
        });
        const query = new URLSearchParams({ id: '120089', db: 'tmdb', anime: '1', provider: 'anikoto',
            episodeId: 'spy-x-family-6zlbz$episode$1', title: 'Spy x Family', type: 'tv', apiSource: 'local',
            season: '1', episode: '1', audio: process.env.ANIKOTO_AUDIO || 'subbed', resume: '0' });
        await page.goto(`http://127.0.0.1:3005/player.html?${query}`, { waitUntil: 'domcontentloaded' });
        const frame = async () => {
            await page.waitForFunction(() => window.__frames.length > 0, undefined, { timeout: 90000 });
            return page.evaluate(() => window.__frames[0]);
        };
        const initialFrame = await frame();
        console.log(JSON.stringify({ phase: 'initial', firstFrameMs: Date.now() - start, requests }));
        assert.ok(initialFrame, 'initial decoded frame');
        await page.evaluate(() => { autoEpisodeEnabled = false; video.pause(); window.__frames = []; });
        requests.length = 0;
        start = Date.now();
        await page.evaluate(() => { void goToNextEpisode(); });
        assert.ok(await frame(), 'next decoded frame');
        console.log(JSON.stringify({ phase: 'next', firstFrameMs: Date.now() - start, requests }));
        const state = await page.evaluate(() => ({ episode: curEpisode, source: allSources[currentIdx], segments: animeSkipSegments }));
        assert.equal(state.episode, 1);
        assert.equal(state.source.isDub, process.env.ANIKOTO_AUDIO === 'dubbed');
        assert.deepEqual(state.segments.intro, state.source.intro);
        assert.equal(requests.filter(r => /\/anime\/anikoto\/watch\//.test(r.url)).length, 1);
        assert.ok(requests.some(r => r.url.includes('spy-x-family-6zlbz$episode$2')));
        assert.equal(requests.filter(r => r.at >= 0 && /\/(anime\/anikoto\/(?!watch\/)|meta\/)/.test(r.url)).length, 0,
            'next episode must not wait for canonical metadata, search or catalogs');
        assert.deepEqual(errors, []);
    } finally { await browser.close(); }
});
