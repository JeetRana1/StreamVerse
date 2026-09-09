const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

test('live missing-rendition startup and next episode present actual frames',
    { skip: process.env.ANIKOTO_MISSING_LIVE !== '1', timeout: 360000 }, async () => {
    const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    try {
        for (const [id, title, slug, episode, db] of [
            ['269', 'Bleach', 'bleach-yaa9n', 5, 'anilist'],
            ['120089', 'Spy x Family', 'spy-x-family-6zlbz', 1, 'tmdb'],
        ]) {
            const context = await browser.newContext({ permissions: ['local-network-access'] });
            await context.route('**/config.js', route => route.fulfill({ contentType: 'application/javascript',
                body: 'window.__STREAMVERSE_CONFIG__ = ' + JSON.stringify({
                    LOCAL_META_API_BASE: 'http://127.0.0.1:3000/meta/tmdb', META_API_BASE: 'http://127.0.0.1:3000/meta/tmdb',
                    LOCAL_MEDIA_PROXY_BASE: 'http://127.0.0.1:3000', MEDIA_PROXY_BASE: 'http://127.0.0.1:3000',
                }) }));
            if (process.env.ANIKOTO_BASELINE === '1') {
                await context.route('**/player.html?*', route => route.fulfill({ contentType: 'text/html',
                    body: fs.readFileSync('player.html', 'utf8')
                        .replace("[404, 410].includes(Number(d.response?.code))", "Number(d.response?.code) >= 400")
                        .replace('if (anikotoLevelFailures.get(level) !== Infinity)',
                            'const failures = (anikotoLevelFailures.get(level) || 0) + 1; anikotoLevelFailures.set(level, failures); if (d.fatal || failures >= 2)') }));
            }
            const page = await context.newPage();
            page.on('requestfailed', request => console.log('request failed', new URL(request.url()).pathname, request.failure()?.errorText));
            await page.addInitScript(() => {
                window.__frames = [];
                document.addEventListener('loadeddata', event => {
                    if (event.target instanceof HTMLVideoElement) event.target.requestVideoFrameCallback((now, metadata) =>
                        window.__frames.push({ now, mediaTime: metadata.mediaTime }));
                }, true);
            });
            const failures = [], errors = [], media = [];
            let watchStartedAt = 0;
            page.on('request', request => {
                if (/\/anikoto\/watch\//.test(request.url())) watchStartedAt = Date.now();
            });
            page.on('requestfinished', request => {
                if (/\/proxy\/hls\//.test(request.url())) media.push({ asset: new URL(request.url()).pathname.split('/').pop(),
                    at: request.timing().startTime - start, ms: request.timing().responseEnd });
            });
            page.on('console', message => {
                if (message.type() === 'error' || /\[anikoto\]|first.frame|Rendition|fatal|Failed to fetch/i.test(message.text())) console.log(message.text().slice(0, 400));
            });
            page.on('pageerror', error => errors.push(error.message));
            page.on('response', response => {
                if (response.status() >= 400 && /\/proxy\/hls\//.test(response.url())) failures.push({ status: response.status(),
                    asset: new URL(response.url()).pathname.split('/').pop() });
            });
            const query = new URLSearchParams({ id, title, db, episodeId: `${slug}$episode$${episode}`, episode: String(episode),
                anime: '1', provider: 'anikoto', type: 'tv', apiSource: 'local', season: '1', audio: 'subbed', resume: '0' });
            let start = Date.now();
            await page.goto(`http://127.0.0.1:3005/player.html?${query}`, { waitUntil: 'domcontentloaded' });
            for (const phase of ['initial', 'next']) {
                try {
                    await page.waitForFunction(() => window.__frames.length > 0, undefined, { timeout: 90000 });
                } catch (error) {
                    console.log(JSON.stringify({ title, phase, failures, errors, state: await page.evaluate(() => ({
                        ready: video.readyState, time: video.currentTime, source: allSources[currentIdx]?.provider,
                        frames: window.__frames, text: document.body.innerText.slice(-2000),
                    })) }));
                    throw error;
                }
                const elapsed = Date.now() - start;
                const state = await page.evaluate(() => ({ frame: window.__frames[0], episode: curEpisode,
                    level: hlsInst?.currentLevel, isDub: allSources[currentIdx]?.isDub }));
                console.log(JSON.stringify({ title, phase, firstFrameMs: elapsed, watchToFrameMs: Date.now() - watchStartedAt,
                    state, failures: [...failures], media: [...media] }));
                assert.equal(state.isDub, false);
                assert.equal(state.episode, episode - 1 + (phase === 'next' ? 1 : 0));
                assert.ok(state.frame);
                if (process.env.ANIKOTO_BASELINE !== '1') {
                    assert.equal(new Set(failures.map(f => f.asset)).size, failures.length, 'no duplicate missing-asset retries');
                    assert.ok(failures.every(f => [404, 410].includes(f.status)));
                }
                await page.screenshot({ path: `C:/Users/Jeet/AppData/Local/Temp/opencode/anikoto-${process.env.ANIKOTO_BASELINE === '1' ? 'before' : 'after'}-${id}-${phase}.png` });
                // Opening frames can be black. Capture visible playback separately from the timing sample.
                await page.waitForFunction(() => video.currentTime >= 3 && video.readyState >= 2);
                await page.screenshot({ path: `C:/Users/Jeet/AppData/Local/Temp/opencode/anikoto-playback-${id}-${phase}.png` });
                if (phase === 'initial') {
                    await page.evaluate(() => { autoEpisodeEnabled = false; video.pause(); window.__frames = []; });
                    failures.length = 0;
                    media.length = 0;
                    start = Date.now();
                    await page.evaluate(() => { void goToNextEpisode(); });
                }
            }
            assert.deepEqual(errors, []);
            await context.close();
        }
    } finally { await browser.close(); }
});
