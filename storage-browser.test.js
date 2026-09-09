const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Jeet/Videos/fewfwewfd/api.consumet.org/node_modules/playwright');
const origin = 'http://127.0.0.1:3005';

test('homepage merges verified anime history and resumes AniList without treating its ID as TMDB', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext();
        const metadataRequests = [];
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.hostname === 's4.anilist.co') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="45"><rect width="30" height="45" fill="red"/></svg>' });
            if (url.pathname.endsWith('/anime-list-mini.json')) return route.fulfill({ json: [{ anilist_id: 7, themoviedb_id: { tv: 40 } }] });
            if (url.pathname.includes('/meta/anilist/data/7')) {
                metadataRequests.push('anilist');
                return route.fulfill({ json: { id: 7, title: { english: 'Mapped Anime' }, type: 'TV', totalEpisodes: 12 } });
            }
            if (url.pathname.includes('/meta/tmdb')) {
                if (url.searchParams.get('id') === '7') metadataRequests.push('wrong-tmdb');
                return route.fulfill({ json: { results: [] } });
            }
            return url.origin === origin ? route.continue() : route.abort();
        });
        const page = await context.newPage();
        await page.goto(`${origin}/index.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof loadContinueWatching === 'function');
        await page.evaluate(async () => {
            localStorage.setItem('sv_continue_watching', JSON.stringify([
                { id: '40', namespace: 'tmdb', type: 'tv', title: 'Mapped Anime', currentTime: 30, duration: 900, lastUpdated: 1 },
                { id: '7', namespace: 'anilist', anime: true, type: 'tv', title: 'Mapped Anime', poster: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx7-test.jpg', provider: 'anikoto', currentTime: 75, duration: 900, lastUpdated: 2, episodeId: 'mapped$episode$3', episodeNo: 3 },
            ]));
            await StreamVerseStorage.refreshHistory();
            loadContinueWatching();
        });
        assert.equal(await page.locator('#continue-watching-grid .continue-card').count(), 1);
        await page.locator('.continue-card-poster').scrollIntoViewIfNeeded();
        await page.waitForFunction(() => {
            const image = document.querySelector('.continue-card-poster');
            return image?.src.includes('s4.anilist.co') && image.complete && image.naturalWidth > 0;
        });
        await page.locator('#continue-watching-grid .continue-card').click();
        await page.waitForURL(url => url.pathname === '/player');
        const params = new URL(page.url()).searchParams;
        assert.equal(params.get('db'), 'anilist');
        assert.equal(params.get('id'), '7');
        assert.equal(params.get('episodeId'), 'mapped$episode$3');
        assert.equal(params.get('t'), '75');
        await page.waitForFunction(() => typeof MEDIA_NAMESPACE !== 'undefined' && MEDIA_NAMESPACE === 'anilist');
        await page.waitForTimeout(1000);
        assert.ok(metadataRequests.includes('anilist'));
        assert.ok(!metadataRequests.includes('wrong-tmdb'));
    } finally { await browser.close(); }
});

test('live desktop/mobile removal controls, active player reset and cache button preserve account/history', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const [file, viewport] of [['index.html', { width: 1440, height: 900 }], ['anime.html', { width: 390, height: 844 }]]) {
            const context = await browser.newContext({ viewport });
            // No production APIs, Firebase SDKs, media, or real profiles are used.
            await context.route('**/*', (route) => {
                const url = new URL(route.request().url());
                if (url.pathname.includes('/meta/tmdb')) return route.fulfill({ json: {
                    id: '262838', title: 'Test Catalog', type: 'tv', seasons: [],
                    results: [{ id: '262838', title: 'Test Catalog', type: 'tv', vote_average: 8, poster_path: '/test.jpg' }],
                } });
                return url.origin === origin ? route.continue() : route.abort();
            });
            const page = await context.newPage();
            await page.goto(`${origin}/index.html`, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => typeof loadContinueWatching === 'function');
            await page.evaluate(() => {
                const items = [
                    { id: '262838', type: 'tv', title: 'Reset Test', currentTime: 245, duration: 900, lastUpdated: 1 },
                    { id: '2628380', type: 'tv', title: 'Keep Test', currentTime: 145, duration: 900, lastUpdated: 1 },
                ];
                localStorage.setItem('sv_continue_watching', JSON.stringify(items));
                for (const item of items) {
                    localStorage.setItem(`sv_episode_progress:tv:${item.id}`, JSON.stringify({ 'local:s1:e2': { time: 245 }, 'provider:hdstream4u:id:bonus': { time: 60 } }));
                    localStorage.setItem(`sv_watched_episodes:tv:${item.id}`, '["local:s2:e3","provider:anikoto:series:s2:abs:9"]');
                }
                loadContinueWatching();
            });
            const player = await context.newPage();
            await player.goto(`${origin}/player.html?id=262838&type=tv&season=2&episode=3&t=245`, { waitUntil: 'domcontentloaded' });
            await player.waitForFunction(() => typeof playbackWasReset === 'function');
            await page.bringToFront();
            await page.locator('#continue-clear-toggle').click();
            await page.locator('.continue-select-toggle').first().click();
            await page.locator('#continue-clear-confirm').click();
            await player.waitForURL((url) => url.searchParams.get('resume') === '0' && !url.searchParams.has('t'));
            await player.waitForLoadState('domcontentloaded');
            assert.equal(await player.evaluate(() => RESUME_TIME_FALLBACK), 0);
            assert.equal(await player.evaluate(() => watchedEpisodeKeys.size + episodeProgressMap.size), 0);
            await player.close();
            const after = await page.evaluate(() => ({
                history: JSON.parse(localStorage.getItem('sv_continue_watching')),
                progress: localStorage.getItem('sv_episode_progress:tv:262838'),
                watched: localStorage.getItem('sv_watched_episodes:tv:262838'),
                other: localStorage.getItem('sv_episode_progress:tv:2628380'),
            }));
            assert.deepEqual(after.history.map((item) => item.id), ['2628380']);
            assert.equal(after.progress, null);
            assert.equal(after.watched, null);
            assert(after.other);

            // The existing responsive header hides Clear Cache on narrow screens.
            await page.setViewportSize({ width: 1440, height: 900 });
            if (file === 'anime.html') await page.goto(`${origin}/anime.html`, { waitUntil: 'domcontentloaded' });
            await page.evaluate(async () => {
                localStorage.setItem('firebase:authUser:test', 'account-sentinel');
                localStorage.setItem('streamverse_watchlist', '[{"id":"favorite"}]');
                localStorage.setItem('pref_autoEpisode', 'false');
                localStorage.setItem('streamverse:v2:hds4u:tv:262838:latent', '{"ts":1,"data":["stale"]}');
                localStorage.setItem('sv_anime_catalog_v3:old', '{"rows":["stale"]}');
                localStorage.setItem('sv_stream_source_v1:old', 'stale');
                sessionStorage.setItem('sv_hdstream_quality:old', 'stale');
                sessionStorage.setItem('wpUserId', 'session-sentinel');
                await (await caches.open('legacy-unnamed-cache')).put('/old-test', new Response('stale'));
                await new Promise((resolve, reject) => {
                    const request = indexedDB.open('firebaseLocalStorageDb', 1);
                    request.onupgradeneeded = () => request.result.createObjectStore('firebaseLocalStorage');
                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => {
                        const db = request.result;
                        const tx = db.transaction('firebaseLocalStorage', 'readwrite');
                        tx.objectStore('firebaseLocalStorage').put('credential', 'test');
                        tx.oncomplete = () => { db.close(); resolve(); };
                    };
                });
            });
            await Promise.all([
                page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame()),
                page.locator('#cache-clear-btn').click(),
            ]);
            await page.waitForLoadState('domcontentloaded');
            const cacheResult = await page.evaluate(async () => ({
                stale: ['streamverse:v2:hds4u:tv:262838:latent', 'sv_anime_catalog_v3:old', 'sv_stream_source_v1:old'].map((key) => localStorage.getItem(key)),
                account: localStorage.getItem('firebase:authUser:test'), favorite: localStorage.getItem('streamverse_watchlist'),
                preference: localStorage.getItem('pref_autoEpisode'), history: JSON.parse(localStorage.getItem('sv_continue_watching')),
                session: sessionStorage.getItem('wpUserId'), quality: sessionStorage.getItem('sv_hdstream_quality:old'), caches: await caches.keys(),
                credential: await new Promise((resolve) => {
                    const request = indexedDB.open('firebaseLocalStorageDb');
                    request.onsuccess = () => {
                        const db = request.result;
                        const get = db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').get('test');
                        get.onsuccess = () => { resolve(get.result); db.close(); };
                    };
                }),
            }));
            assert.deepEqual(cacheResult.stale, [null, null, null]);
            assert.equal(cacheResult.account, 'account-sentinel');
            assert.equal(cacheResult.credential, 'credential');
            assert.equal(cacheResult.favorite, '[{"id":"favorite"}]');
            assert.equal(cacheResult.preference, 'false');
            assert.deepEqual(cacheResult.history.map((item) => item.id), ['2628380']);
            assert.equal(cacheResult.session, 'session-sentinel');
            assert.equal(cacheResult.quality, null);
            assert.deepEqual(cacheResult.caches, []);
            await context.close();
        }
    } finally { await browser.close(); }
});
