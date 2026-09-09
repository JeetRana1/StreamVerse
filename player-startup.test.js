const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const html = fs.readFileSync(require('node:path').join(__dirname, 'player.html'), 'utf8');
function extract(name) {
    const match = new RegExp(`        (?:async )?function ${name}\\(`).exec(html);
    assert(match, name);
    const end = html.indexOf('\n        }', match.index) + '\n        }'.length;
    return html.slice(match.index, end);
}
function deferred() {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
}
const netflixId = 'https://hubstream.art/#ucp5r8';
const bonusId = 'https://hubstream.art/#nvxttn';
function harness({ id = netflixId, cached = false, forced = '', archiveActive = false, tmdb = '262838' } = {}) {
    const watch = deferred(), catalog = deferred(), extracting = deferred();
    const events = [], warnings = [], requests = [], timers = [];
    const bonusEpisodes = [
        { episodeId: bonusId, seasonNumber: 0, title: 'Bonus EP1' },
        { episodeId: netflixId, seasonNumber: 0, title: 'Netflix Special' },
    ];
    const url = new URL('https://example.test/player.html?season=0&episode=1&seasonTitle=Bonus&t=245');
    url.searchParams.set('episodeId', id);
    const context = vm.createContext({
        URL, URLSearchParams, AbortSignal, performance,
        console: { log() {}, time() {}, timeEnd() {}, warn(...args) { warnings.push(args.join(' ')); } },
        location: { href: url.href, search: url.search }, window: {},
        MEDIA_TYPE: 'tv', effectiveMediaType: 'tv', currentIsLikelyAnime: false,
        TMDB_ID: tmdb, API_BASE: 'https://api.test/meta/tmdb', FORCED_PROVIDER: forced,
        activeProviders: ['hdstream4u', ...(archiveActive ? ['archive.org'] : [])], ANIME_PROVIDERS: [],
        URL_SEASON: 0, URL_EPISODE: 1, URL_EPISODE_ID: id, URL_SEASON_TITLE: 'Bonus',
        URL_SEASON_KEY: '', URL_ABSOLUTE_EPISODE: 0, URL_AUDIO: '', URL_TIME: 245,
        URL_DISABLE_RESUME: false, ANIME_MODE: false, DIRECT_ONLY: true,
        RESUME_SEASON_FALLBACK: 0, RESUME_EPISODE_FALLBACK: 0, RESUME_TIME_FALLBACK: 0, CONTINUE_ENTRY: null,
        currentMediaInfo: { title: 'Test Series' }, curSeason: 0, curEpisode: 0,
        activeMenuProvider: '', providerSeasonCatalog: new Map(),
        pendingEpisodeSelectionHint: null, activeEpisodeSelectionHint: null,
        pendingEpisodeStartTime: null, inAppEpisodeNavigation: false,
        fetchSourcesRunning: false, fetchSourcesQueued: false,
        watchPartyRole: '', watchPartyRoomCode: '',
        preferredAudioToken: '', preferredSourceLabelMatch: '', currentStreamUrl: '',
        allSources: [], currentIdx: 0, externalSubtitleTracks: [], video: null,
        REMOVED_PROVIDER_MAP: {}, REQ_TIMEOUT: { watch: 9000 },
        epBtn: { style: {} }, customEpisodeBtn: { style: {} }, sourceBtn: { style: {} },
        document: { querySelector: () => null },
        localStorage: { getItem: () => cached ? JSON.stringify({ ts: Date.now(), data: bonusEpisodes }) : null, setItem() {} },
        buildTvSeasonsFromInfo: () => [1, 2].map(seasonNo => ({ seasonNo, name: `Season ${seasonNo}`, episodes: [{ id: `normal-${seasonNo}`, episode: 1 }] })),
        dedupeTvSeasonEntries: seasons => seasons,
        getPreferredMediaYear: () => 2026,
        normalizeAnimeSearchQuery: s => s, normalizeTitleForMatch: s => s.toLowerCase(),
        normalizeSeasonSearchLabel: s => s.toLowerCase(),
        shouldUseContinueWatchingPositionOnBoot: () => false,
        buildEpPanel() { events.push('menu'); },
        saveCurrentEpisodeProgress() { events.push('playTvEp'); },
        resetPlayerSurface() { events.push('reset'); },
        playSource(index, time) { events.push('playSource'); assert.equal(time, 245); },
        setTimeout(callback) { timers.push(callback); return timers.length; },
        fetch: async request => {
            requests.push(request);
            if (request.includes('/search?')) return { ok: true, json: async () => ({ results: [{ type: 'tv', id: 'series' }] }) };
            await catalog.promise;
            return { ok: true, json: async () => ({ episodes: bonusEpisodes }) };
        },
        fetchJsonWithApiFallback: async request => {
            requests.push(request);
            events.push('extract');
            extracting.resolve();
            await watch.promise;
            return { res: { ok: true, json: async () => ({ sources: [{ url: 'https://cdn.test/video.m3u8', isM3U8: true }] }) } };
        },
        getProviderTimeout: () => 9000,
        normalizeProviderSources: async (_, sources) => sources,
        isBrokenEmbedUrl: () => false, isLikelyPlaceholderSource: () => false,
        normalizeQualityLabel: s => s, normalizeStreamReferer: () => null,
        normalizeSubtitleEntries: () => [], mergeSubtitleTrackLists: () => [],
        readCachedProviderSources: () => [], providerLabel: s => s,
        showError(...args) { throw new Error(args.join(': ')); },
    });
    for (const name of ['setLoader', 'updateEpisodeUrlState', 'resetAnimeSkipState', 'updateNextEpisodeButton',
        'updateEpUI', 'updateCurrentEpisodeHeaderText', 'setExternalSubtitleTracks', 'hideError', 'chipState',
        'writeCachedProviderSources', 'buildSourcePanel', 'buildPreferencesMenu', 'setEpisodePanelScrollTop']) context[name] = () => {};
    context.getEpisodePanelScrollTop = () => 0;
    for (const name of ['findEpisodePositionById', 'getInitialTvPositionFromUrl', 'initTv', 'playTvEp', 'fetchSources']) {
        vm.runInContext(extract(name), context, { filename: `player.html:${name}` });
    }
    return { context, watch, catalog, extracting, events, warnings, requests, timers };
}

for (const cached of [false, true]) test(`Netflix startup, ${cached ? 'cached' : 'delayed'} catalog, delayed provider`, async () => {
    const h = harness({ cached, archiveActive: true });
    const boot = h.context.initTv(h.context.currentMediaInfo);
    if (!cached) {
        await new Promise(setImmediate);
        assert.equal(h.events.includes('playTvEp'), false, 'catalog merge must not start playback');
        h.catalog.resolve();
    }
    await h.extracting.promise;
    assert(h.events.indexOf('menu') < h.events.indexOf('extract'), 'menu before extraction');
    assert.equal(h.context.epBtn.style.display, 'flex');
    assert.equal(h.context.customEpisodeBtn.style.display, 'inline-flex');
    assert.equal(h.context.tvSeasons[h.context.curSeason].name, 'Netflix Special');
    assert.equal(h.context.curSeason, 3);
    const request = new URL(h.requests.find(r => r.includes('/watch?')));
    assert.equal(request.searchParams.get('episodeId'), netflixId);
    assert.equal(request.searchParams.get('season'), '0');
    // Cross the actual scheduler's two-second grace period before watch completes.
    h.timers.shift()();
    await new Promise(setImmediate);
    assert(!h.requests.some(r => r.includes('archive.org')));
    h.watch.resolve();
    await boot;
    assert.equal(h.events.filter(e => e === 'playTvEp').length, 1);
    assert.equal(h.events.filter(e => e === 'reset').length, 1);
    assert.equal(h.events.filter(e => e === 'playSource').length, 1);
    assert.equal(h.context.fetchSourcesRunning, false);
    assert.equal(h.warnings.length, 0, h.warnings.join('\n'));
});

for (const [id, forced, expected] of [
    [bonusId, '', 'I.G.L-2BE1.mkv'],
    [bonusId, 'archive.org', 'I.G.L-2BE1.mkv'],
    ['normal-2', '', 'I.G.L-2E1.mkv'],
]) test(`applicable archive remains immediate: ${id}, forced=${forced}`, async () => {
    const h = harness({ id, forced, cached: true });
    if (id === 'normal-2') {
        h.context.URL_SEASON = 2;
        h.context.URL_SEASON_TITLE = 'Season 2';
        const url = new URL(h.context.location.href);
        url.searchParams.set('season', '2');
        url.searchParams.set('seasonTitle', 'Season 2');
        h.context.location.href = url.href;
        h.context.location.search = url.search;
    }
    await h.context.initTv(h.context.currentMediaInfo);
    assert.equal(h.events.filter(e => e === 'playSource').length, 1);
    assert(h.context.allSources[0].url.endsWith(expected));
    assert.equal(h.events.includes('extract'), false);
});

for (const tmdb of ['262838', 'unknown-title']) test(`unsupported forced archive skips extraction: ${tmdb}`, async () => {
    const h = harness({ forced: 'archive.org', archiveActive: true, cached: true, tmdb });
    h.context.tvSeasons = [{ seasonNo: 0, name: 'Netflix Special', episodes: [{ id: netflixId, episode: 1 }] }];
    const boot = h.context.playTvEp(0, 0);
    await h.extracting.promise;
    assert.equal(h.requests.length, 1);
    assert.equal(new URL(h.requests[0]).searchParams.get('provider'), 'hdstream4u');
    h.watch.resolve();
    await boot;
    assert(!h.requests.some(r => r.includes('archive.org')));
    assert.equal(h.events.filter(e => e === 'playSource').length, 1);
    assert.equal(h.warnings.length, 0, h.warnings.join('\n'));
});

test('all inline scripts parse', () => {
    let count = 0;
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (/\bsrc\s*=|application\/ld\+json/i.test(match[1]) || !match[2].trim()) continue;
        new vm.Script(match[2]);
        count++;
    }
    assert(count > 0);
});
