const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(`${__dirname}/player.html`, 'utf8');
function extract(name) {
    const start = html.indexOf(`        function ${name}(`);
    assert.ok(start >= 0, name);
    return html.slice(start, html.indexOf('\n        }', start) + 10);
}
test('episode readiness rejects stale media and hide timers, reveals decoded current frame, surfaces errors', () => {
    const timers = [];
    const elements = {};
    const c = vm.createContext({ pendingEpisodeMedia: null, loaderRevision: 0, isFirstLoad: false,
        iosArchiveLoaderHold: false, loader: { style: {} }, errorBox: { style: {} }, errorNextEpisodeBtn: null,
        document: { getElementById: id => elements[id] ||= {} },
        setTimeout: fn => timers.push(fn), video: null });
    for (const name of ['waitForEpisodeFrame', 'showLoader', 'hideLoader', 'setLoader', 'showError']) vm.runInContext(extract(name), c);
    const media = () => ({ readyState: 1, videoWidth: 0, seeking: false, events: {},
        addEventListener(event, fn) { this.events[event] = fn; } });
    c.hideLoader();
    c.pendingEpisodeMedia = { media: null };
    c.setLoader('Fetching AniKoto...', 'Episode 3');
    timers.shift()();
    assert.equal(c.loader.style.display, 'flex');
    const old = c.video = media();
    c.waitForEpisodeFrame(old);
    c.pendingEpisodeMedia = { media: null };
    const current = c.video = media();
    c.waitForEpisodeFrame(current);
    old.readyState = 4; old.videoWidth = 1920;
    old.events.playing(); c.hideLoader(); current.events.canplay();
    assert.equal(c.loader.style.opacity, '1');
    current.readyState = 2; current.videoWidth = 1920;
    current.events.loadeddata();
    assert.equal(c.loader.style.opacity, '0');
    c.pendingEpisodeMedia = { media: null }; c.showLoader();
    c.showError('Unavailable', 'All renditions failed');
    assert.equal(c.errorBox.style.display, 'block');
    assert.equal(c.loader.style.opacity, '0');
});
test('AniKoto seeks and temporary recovery preserve selected good/manual rendition and seek anchor', () => {
    for (const level of [0, 1, 2]) {
        const hls = { levels: [{}, {}, {}], currentLevel: level, loadLevel: level, nextLevel: level,
            stopLoad() {}, startLoad(time) { this.anchor = time; } };
        const c = vm.createContext({ hlsInst: hls, video: {}, currentStreamProvider: 'anikoto',
            isCurrentAniKotoStream: () => true, isCurrentFlixHqStream: () => false });
        for (const name of ['tuneHlsForJump', 'setTemporaryRecoveryQuality']) vm.runInContext(extract(name), c);
        c.tuneHlsForJump(90, 88, 'skip'); c.setTemporaryRecoveryQuality();
        assert.equal(hls.currentLevel, level); assert.equal(hls.loadLevel, level);
        assert.equal(hls.nextLevel, level); assert.equal(hls.anchor, 89.8);
    }
});

test('live Bleach automatic next keeps branded loader until current episode frames',
    { skip: process.env.BLEACH_LIVE !== '1', timeout: 180000 }, async () => {
    const { chromium } = require('C:/Users/Jeet/Videos/fewfwewfd/api.consumet.org/node_modules/playwright');
    const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    try {
        const page = await browser.newPage({ permissions: ['local-network-access'] });
        const start = Date.now(), watches = [], logs = [];
        page.on('console', msg => { if (/Rendition|first frame|Manifest parsed/.test(msg.text())) logs.push([Date.now() - start, msg.text()]); });
        page.on('request', req => { if (/anikoto\/watch/.test(req.url())) watches.push(decodeURIComponent(req.url())); });
        await page.route('**/config.js', route => route.fulfill({ contentType: 'application/javascript', body:
            'window.__STREAMVERSE_CONFIG__=' + JSON.stringify({ LOCAL_META_API_BASE: 'http://127.0.0.1:3000/meta/tmdb', META_API_BASE: 'http://127.0.0.1:3000/meta/tmdb', LOCAL_MEDIA_PROXY_BASE: 'http://127.0.0.1:3000', MEDIA_PROXY_BASE: 'http://127.0.0.1:3000' }) }));
        await page.goto('http://127.0.0.1:3005/player.html?' + new URLSearchParams({ db: 'anilist', id: '269', title: 'Bleach', anime: '1', type: 'tv', provider: 'anikoto', season: '1', seasonKey: 'bleach-yaa9n', episode: '2', episodeId: 'bleach-yaa9n$episode$2', apiSource: 'local', t: '2' }));
        await page.waitForFunction(() => video.readyState >= 2 && video.currentTime > 0, null, { timeout: 65000 });
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        let blocked = 0;
        let onBlocked;
        const firstBlocked = new Promise(resolve => { onBlocked = resolve; });
        await page.route('**/*', async route => {
            const url = decodeURIComponent(route.request().url());
            if (/[?&]segment=1(?:&|$)|\.ts(?:[?&]|$)|\.m4s(?:[?&]|$)/.test(url)) { blocked++; onBlocked(); await gate; }
            await route.continue();
        });
        const nextAt = Date.now();
        await page.evaluate(() => { window.__oldBleachVideo = video; void goToNextEpisode(); });
        try {
            await page.waitForFunction(() => pendingEpisodeMedia?.media && hlsInst?.levels?.length > 0, null, { timeout: 60000 });
            let blockedTimeout;
            try { await Promise.race([firstBlocked, new Promise((_, reject) => { blockedTimeout = setTimeout(() => reject(new Error('No media request intercepted')), 20000); })]); }
            finally { clearTimeout(blockedTimeout); }
            await page.waitForTimeout(1500);
            const state = await page.evaluate(() => {
                window.__oldBleachVideo.dispatchEvent(new Event('canplay'));
                window.__oldBleachVideo.dispatchEvent(new Event('playing'));
                return { ready: video.readyState, width: video.videoWidth, opacity: loader.style.opacity,
                    display: loader.style.display, episode: new URL(location.href).searchParams.get('episodeId') };
            });
            console.log('Bleach gated state', state, 'blocked', blocked, 'elapsed', Date.now() - nextAt);
            assert.ok(blocked > 0); assert.ok(state.ready < 2); assert.equal(state.opacity, '1'); assert.equal(state.display, 'flex');
            assert.match(state.episode, /\$episode\$3$/);
            await page.screenshot({ path: 'C:/Users/Jeet/AppData/Local/Temp/opencode/bleach-next-loading.png' });
        } finally { release(); }
        await page.waitForFunction(() => video.readyState >= 2 && video.videoWidth > 0 && loader.style.display === 'none', null, { timeout: 60000 });
        await page.waitForFunction(() => hlsInst.currentLevel >= 0, null, { timeout: 10000 });
        const frame = await page.evaluate(() => new Promise(resolve => video.requestVideoFrameCallback((now, metadata) => resolve({ mediaTime: metadata.mediaTime, width: metadata.width }))));
        assert.ok(frame.width > 0);
        console.log('Bleach next frame elapsed', Date.now() - nextAt, 'watch requests', watches, 'timings', logs);
        const good = await page.evaluate(() => hlsInst.currentLevel);
        const failuresBeforeSeek = logs.filter(([, text]) => /Rendition/.test(text)).length;
        for (const target of [90, 200]) {
            await page.evaluate(target => { tuneHlsForJump(target, 90, 'skip'); forceVideoSeek(target); setTemporaryRecoveryQuality(); }, target);
            await page.waitForFunction(target => video.readyState >= 2 && Math.abs(video.currentTime - target) < 10, target, { timeout: 30000 });
            assert.equal(await page.evaluate(() => hlsInst.currentLevel), good);
        }
        assert.equal(logs.filter(([, text]) => /Rendition/.test(text)).length, failuresBeforeSeek);
        console.log('Bleach skips/seeks retained level', good, logs);
    } finally { await browser.close(); }
});
