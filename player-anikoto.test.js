const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, 'player.html'), 'utf8');

function snippet(startText, endText, from = 0) {
    const start = html.indexOf(startText, from);
    const end = html.indexOf(endText, start);
    assert.ok(start >= 0 && end > start, startText);
    return html.slice(start, end);
}

function playerFunction(name) {
    return snippet(`        function ${name}(`, '\n        }') + '\n        }';
}

function episodeNavigationHarness() {
    const seasons = [
        { seasonNo: 1, providerAnimeId: 'spy-x-family-6zlbz', episodes: [1, 2].map(episode => ({ id: `spy-x-family-6zlbz$episode$${episode}`, episode })) },
        { seasonNo: 2, providerAnimeId: 'spy-x-family-season-2', episodes: [{ id: 'spy-x-family-season-2$episode$1', episode: 1 }] },
    ];
    const requests = [];
    const context = vm.createContext({
        tvSeasons: seasons, providerSeasonCatalog: new Map([['anikoto', seasons]]),
        curSeason: 0, curEpisode: 0, inAppEpisodeNavigation: false,
        pendingEpisodeSelectionHint: null, activeEpisodeSelectionHint: null,
        fetchSourcesRunning: false, FORCED_PROVIDER: 'anikoto', currentIsLikelyAnime: true,
        activeProviders: ['anikoto'], activeMenuProvider: 'anikoto', CONTINUE_ENTRY: null,
        URL_EPISODE_ID: seasons[0].episodes[0].id, URL_SEASON: 1, URL_EPISODE: 1,
        URL_SEASON_KEY: '', URL_SEASON_TITLE: '', URL_ABSOLUTE_EPISODE: 0,
        shouldUseContinueWatchingPositionOnBoot: () => false,
        watchPartyRole: '', watchPartyRoomCode: '', console: { log() {} },
        saveCurrentEpisodeProgress() {}, updateEpisodeUrlState() {}, resetAnimeSkipState() {},
        updateNextEpisodeButton() {}, updateEpUI() {}, updateCurrentEpisodeHeaderText() {}, setLoader() {},
        getNextEpisodeRef: () => ({ seasonIndex: 1, episodeIndex: 0 }),
        record: request => requests.push(JSON.parse(JSON.stringify(request))),
    });
    for (const name of ['playTvEp', 'goToNextEpisode']) {
        vm.runInContext(snippet(`        async function ${name}(`, '\n        }') + '\n        }', context);
    }
    // Execute the real source-selection prelude and AniKoto outgoing ID mapping.
    vm.runInContext(`async function fetchSources() {
        ${snippet('            const selectedSeason = tvSeasons?.[curSeason];', '            // Define which providers to search', html.indexOf('        async function fetchSources('))}
        const provider = 'anikoto';
        let provEpisodeId = '';
        ${snippet("                            if (provider === 'anikoto' && selectedEpisodeId", "                            if (provider === 'nineanime' && selectedEpisodeId")}
        record({ selectedEpisodeId, selectedSeasonNo, selectedEpisodeNo, selectedAbsoluteEpisodeNo,
            provEpisodeId, providerAnimeId: selectionHint?.providerAnimeId });
    }`, context);
    return { context, requests, seasons };
}

test('AniKoto explicit startup preserves the deep link even when the initial row differs', async () => {
    const { context, requests, seasons } = episodeNavigationHarness();
    context.URL_EPISODE_ID = seasons[1].episodes[0].id;
    context.initialPos = { seasonIndex: 0, episodeIndex: 0 };
    await vm.runInContext(`(async () => { ${snippet('            await playTvEp(initialPos.', '\n')} })()`, context);
    assert.equal(context.inAppEpisodeNavigation, false);
    assert.equal(requests[0].provEpisodeId, seasons[1].episodes[0].id);
    assert.equal(requests[0].selectedSeasonNo, 2);
    assert.equal(requests[0].selectedEpisodeNo, 1);
});

test('AniKoto direct selections, cross-season next and retries never reuse the boot episode', async () => {
    const { context, requests, seasons } = episodeNavigationHarness();
    await context.playTvEp(0, 0, null, { initial: true });
    assert.equal(requests[0].provEpisodeId, context.URL_EPISODE_ID);
    for (const [si, ei, next] of [[0, 1, false], [1, 0, true], [0, 1, false], [1, 0, false]]) {
        if (next) await context.goToNextEpisode();
        else await context.playTvEp(si, ei);
        await context.fetchSources();
        const expected = seasons[si].episodes[ei];
        for (const request of requests.slice(-2)) {
            assert.equal(request.selectedEpisodeId, expected.id);
            assert.equal(request.provEpisodeId, expected.id);
            assert.notEqual(request.provEpisodeId, context.URL_EPISODE_ID);
            assert.equal(request.selectedSeasonNo, si + 1);
            assert.equal(request.selectedEpisodeNo, ei + 1);
            assert.equal(request.selectedAbsoluteEpisodeNo, si === 1 ? 3 : 2);
            assert.equal(request.providerAnimeId, seasons[si].providerAnimeId);
        }
    }
});

test('AniKoto provider-row identity survives global-index differences and source retries', async () => {
    const { context, requests, seasons } = episodeNavigationHarness();
    context.pendingEpisodeSelectionHint = { provider: 'anikoto', episodeId: seasons[1].episodes[0].id,
        seasonNo: 2, episodeNo: 1, absoluteEpisodeNo: 3, providerAnimeId: seasons[1].providerAnimeId };
    await context.playTvEp(0, 1);
    await context.fetchSources();
    for (const request of requests) {
        assert.equal(request.provEpisodeId, seasons[1].episodes[0].id);
        assert.equal(request.selectedSeasonNo, 2);
        assert.equal(request.selectedEpisodeNo, 1);
        assert.equal(request.selectedAbsoluteEpisodeNo, 3);
    }
});

test('AniKoto actual episode-row clicks reload with the selected identity, not the boot URL', async () => {
    for (const [si, ei] of [[0, 1], [1, 0]]) {
        const { context, requests, seasons } = episodeNavigationHarness();
        const s = seasons[si], ep = s.episodes[ei];
        Object.assign(context, {
            URL, window: { location: { href: `https://example.test/player.html?season=1&episode=1&episodeId=${encodeURIComponent(context.URL_EPISODE_ID)}` } },
            item: { dataset: {} }, s, ep, si, ei, menuSeasons: seasons,
            epTitle: 'Episode', epNo: ep.episode, displayEpNo: ep.episode, isBonusSeason: false,
            getActiveEpisodeMenuProvider: () => 'anikoto',
            resolveGlobalEpisodeIndices: () => ({ seasonIndex: si, episodeIndex: ei }),
            getAbsoluteAnimeEpisodeNo: () => si === 1 ? 3 : 2,
            buildSeasonDisplayNameForMenu: () => `Season ${s.seasonNo}`, applySeasonFilter() {},
            getResumeTimeFromEpisodeProgress: () => 0, progressInfo: null,
            epPanel: { classList: { remove() {} } },
        });
        vm.runInContext(`${snippet('                    item.onclick = () => {', '                    scrollRoot.appendChild(item);')} item.onclick();`, context);
        const url = new URL(context.window.location.href);
        assert.equal(url.searchParams.get('episodeId'), ep.id);
        assert.equal(url.searchParams.get('season'), String(s.seasonNo));
        assert.equal(url.searchParams.get('episode'), String(ep.episode));
        context.URL_EPISODE_ID = url.searchParams.get('episodeId');
        context.URL_SEASON = Number(url.searchParams.get('season'));
        context.URL_EPISODE = Number(url.searchParams.get('episode'));
        context.pendingEpisodeSelectionHint = null;
        context.activeEpisodeSelectionHint = null;
        await context.playTvEp(si, ei, null, { initial: true });
        assert.equal(requests[0].provEpisodeId, ep.id);
        assert.equal(requests[0].selectedSeasonNo, s.seasonNo);
    }
});

const identityFunctions = ['getAnikotoAudioMode', 'getAnikotoSourceIdentity'].map(playerFunction).join('\n');
const source = (url, isDub = true, extra = {}) => ({ provider: 'anikoto', url, isDub, isSub: !isDub, ...extra });

test('AniKoto generic modes select English/Japanese in HLS and native multi-audio without changing other providers', () => {
    const code = ['normalizeAudioToken', 'getTrackAudioTokens', 'svApplyPreferredAudioToHls'].map(playerFunction).join('\n');
    for (const native of [false, true]) {
        for (const [provider, preference, expected] of [['anikoto', 'Dubbed', 1], ['anikoto', 'Subbed', 0], ['anikoto', 'Hindi', 2], ['animekai', 'Dubbed', 0]]) {
            const tracks = [{ lang: 'ja', enabled: false }, { lang: 'en-US', enabled: false }, { name: 'Hindi', enabled: false }];
            const hls = { audioTracks: tracks, audioTrack: -1 };
            vm.runInNewContext(`${identityFunctions}\n${code}\nsvApplyPreferredAudioToHls(hls);`, {
                allSources: [source('a', true, { provider })], currentIdx: 0, preferredAudioToken: preference,
                preferredSourceLabelMatch: '', URL_AUDIO: '', currentAudioSource: '', currentStreamProvider: provider,
                video: { audioTracks: tracks }, hls: native ? null : hls,
                isVegamoviesPlaybackProvider: () => false, flushAudioBufferForTrackSwitch() {},
            });
            assert.equal(native ? tracks.findIndex(t => t.enabled) : hls.audioTrack, expected);
        }
    }
    const hls = { audioTracks: [{ lang: 'ja' }, { lang: 'hi' }], audioTrack: 1 };
    vm.runInNewContext(`${identityFunctions}\n${code}\nsvApplyPreferredAudioToHls(hls);`, {
        allSources: [source('a')], currentIdx: 0, preferredAudioToken: 'dubbed', preferredSourceLabelMatch: '',
        URL_AUDIO: '', currentAudioSource: '', hls, isVegamoviesPlaybackProvider: () => false,
    });
    assert.equal(hls.audioTrack, 1, 'missing English must not force Japanese');
});

test('AniKoto nested and dub-only watch groups retain mode and per-group request headers', async () => {
    const payload = { headers: { Referer: 'root', Origin: 'root-origin' }, data: {
        sub: { sources: [], headers: { Referer: 'sub' } },
        dub: { headers: { referer: 'dub', Cookie: 'dub-cookie' }, sources: [
            { url: 'a' }, { url: 'a', headers: { Referer: 'mirror', Origin: 'mirror-origin' } },
        ] },
    } };
    const rows = vm.runInNewContext(`${playerFunction('getAnikotoWatchSources')}\ngetAnikotoWatchSources(payload);`, { payload });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].isDub, true);
    assert.equal(rows[0].isSub, false);
    assert.equal(rows[0].referer, 'dub');
    assert.equal(rows[0].origin, 'root-origin');
    assert.equal(rows[1].referer, 'mirror');
    assert.equal(rows[1].origin, 'mirror-origin');
    assert.equal(rows[1].cookieHeader, 'dub-cookie');
    const merged = await vm.runInNewContext(`${playerFunction('getAnikotoWatchSources')}\n(async () => {
        ${snippet('                    const getWatchSources = (payload)', 'window.__animeWatchFetchStartAt')}
        if (!getWatchSources(data).length) throw new Error('No sources');
        ${snippet('                    // AniKoto returns the Consumet', '                    const providerSources =')}
        return normalizedWatchSources;
    })()`, { data: payload, provider: 'anikoto', animekaiDubData: null, normalizeProviderSources: async (_provider, sources) => sources });
    assert.equal(merged.length, 2);
    assert.equal(merged[1].isDub, true);
    assert.equal(merged[1].cookieHeader, 'dub-cookie');
});

test('AniKoto same-URL switches reload rather than taking the seek-only shortcut', () => {
    const condition = snippet("            if (sourceProvider !== 'anikoto' && hlsInst && url === currentStreamUrl", ' {');
    for (const provider of ['anikoto', 'other']) {
        const reused = vm.runInNewContext(`(() => { ${condition} return true; return false; })()`, {
            sourceProvider: provider, hlsInst: {}, url: 'a', currentStreamUrl: 'a', isM3U8: true,
            Hls: { isSupported: () => true }, video: { duration: 100 }, effectiveStartTime: 45,
        });
        assert.equal(reused, provider !== 'anikoto');
    }
});

test('AniKoto audio rows and source-list resync distinguish mode and headers on the same URL', () => {
    const sources = [source('a', false), source('a'), source('a', true, { cookieHeader: 'other' })];
    const items = [], selected = [];
    const context = vm.createContext({ allSources: sources, currentIdx: 1, activePlaybackSourceUrl: 'a', video: {}, plyr: {},
        lastKnownPlaybackTime: 0, providerLabel: p => p, useProviderPrefixedAudioLabels: false,
        addItem: (label, active, click, meta) => items.push({ active, click, meta }),
        rememberProviderPreference() {}, selectSource: idx => selected.push(idx),
    });
    vm.runInContext(`${identityFunctions}\n${snippet('            const renderProviderAudioSources =', "            renderProviderAudioSources('animesalt'")} renderProviderAudioSources('anikoto', allSources);`, context);
    assert.deepEqual(items.map(item => item.active), [false, true, false]);
    items[2].click();
    assert.deepEqual(selected, [2]);
    assert.equal(items[2].meta.sourceIndex, 2);
    Object.assign(context, { allSources: [sources[2], sources[0], sources[1]], activeProviderBefore: 'anikoto', activeSourceBefore: sources[1] });
    const index = vm.runInContext(`${snippet('                        const syncedIdx = allSources.findIndex', '                        if (syncedIdx >= 0)')} syncedIdx;`, context);
    assert.equal(index, 2);
});

test('AniKoto failover wraps to earlier same-mode mirrors, survives reordering, terminates and resets only on explicit selection', () => {
    const sources = [source('a'), source('b', false), source('c'), source('a', true, { referer: 'alternate' })];
    const context = vm.createContext({ allSources: sources, currentIdx: 2, failedAnikotoSources: new Set(),
        video: { currentTime: 45 }, plyr: {}, lastKnownPlaybackTime: 0, pendingJumpTarget: null,
        lastRequestedPlaybackTarget: 45, startT: 0, preferredAudioToken: 'hindi', preferredSourceLabelMatch: 'dubbed',
        providerSeasonCatalog: new Map(), MEDIA_TYPE: 'movie',
        updateSourceUI() {}, playSource() {}, syncUrlState() {},
        isBrokenEmbedUrl: () => false, isLikelyPlaceholderSource: () => false,
    });
    const failover = snippet('            let nextSourceFallbackUsed = false;', '            const tryAlternateFlixhqServer');
    vm.runInContext(`${identityFunctions}\n${playerFunction('selectSource')}\nfunction makeFailover(srcIdx) {
        const sourceProvider = 'anikoto', originalStreamUrl = allSources[srcIdx].url, startTime = 0;
        ${failover}
        return failoverToNextSource;
    }`, context);
    assert.equal(vm.runInContext('makeFailover(currentIdx)()', context), true);
    assert.equal(context.currentIdx, 0);
    assert.equal(context.preferredAudioToken, 'hindi');
    assert.equal(context.startT, 45);
    assert.equal(vm.runInContext('makeFailover(currentIdx)()', context), true);
    assert.equal(context.currentIdx, 3, 'header-distinct earlier URL remains eligible');
    vm.runInContext('var lastFailover = makeFailover(currentIdx); allSources.reverse(); currentIdx = 0;', context);
    assert.equal(vm.runInContext('lastFailover()', context), false);
    assert.equal(vm.runInContext('lastFailover()', context), false);
    assert.equal(context.failedAnikotoSources.size, 3);
    vm.runInContext('selectSource(0, 45)', context);
    assert.equal(context.failedAnikotoSources.size, 0);
    assert.equal(vm.runInContext('makeFailover(currentIdx)()', context), true);
});

test('AniKoto searches are bounded, deduplicated and tolerate a failed variant', async () => {
    const start = html.indexOf('let anikotoCatalogIncomplete = false;');
    const end = html.indexOf('if (!anikotoCandidates.size)', start);
    assert.ok(start > 0 && end > start);
    let active = 0, peak = 0, requests = 0;
    const context = {
        anikotoTerms: ['bad', 'first', 'second', 'first', 'third'],
        anikotoCandidates: new Map(), API_BASE: '/meta/tmdb', timeoutMs: 5000,
        animeSeriesTitle: 'Example', ANIME_MODE: false, AbortSignal,
        normalizeTitleForMatch: value => value.toLowerCase(),
        getAnimeSearchResults: data => data.results,
        fetchJsonWithApiFallback: async url => {
            requests++;
            peak = Math.max(peak, ++active);
            await new Promise(resolve => setTimeout(resolve, 10));
            active--;
            if (url.endsWith('/bad')) throw new Error('upstream timeout');
            return { res: { ok: true, json: async () => ({ results: [{ id: url, title: 'Example Season 2', type: 'TV' }] }) } };
        },
    };
    const incomplete = await vm.runInNewContext(`(async () => { ${html.slice(start, end)} return anikotoCatalogIncomplete; })()`, context);
    assert.equal(incomplete, true);
    assert.equal(requests, 4);
    assert.equal(peak, 3);
    assert.equal(context.anikotoCandidates.size, 3);
});

test('AniKoto missing segments try remaining renditions without changing language or looping', () => {
    const selected = [], resumed = [], fallbacks = [];
    const hls = { levels: [{}, {}, {}], stopLoad() {}, startLoad(time) { resumed.push(time); },
        set currentLevel(value) { selected.push(value); } };
    const context = vm.createContext({ hls, anikotoLevelFailures: new Map(), isThumbnail: false,
        isCurrentAniKotoStream: () => true, isFragLoad: true, pendingJumpTarget: { time: 200 },
        video: { currentTime: 0 }, startTime: 0, console: { warn() {} },
        onErrorFallback: reason => fallbacks.push(reason) });
    vm.runInContext(`function handle(d) { ${snippet('                // Some AniKoto masters advertise renditions', '                const isFlixHqStream =')} }`, context);
    for (const level of [0, 0, 1, 1, 2, 2]) {
        context.error = { frag: { level, type: 'main' }, response: { code: 502 }, fatal: false };
        vm.runInContext('handle(error)', context);
    }
    assert.deepEqual(selected, [1, 2]);
    assert.deepEqual(resumed, [200, 200]);
    assert.deepEqual(fallbacks, ['renditions_exhausted']);
    context.error = { frag: { level: 0, type: 'audio' }, response: { code: 502 }, fatal: true };
    vm.runInContext('handle(error)', context);
    assert.equal(fallbacks.length, 1, 'audio-track errors must not change video rendition');
});

test('upstream audio labels are rendered as text, not HTML', () => {
    const start = html.indexOf('const addItem = (label, isActive, onClick, syncMeta = {}) =>');
    const end = html.indexOf('// Decide whether to show', start);
    assert.ok(start > 0 && end > start);
    const rows = [];
    const context = {
        renderedLabels: new Set(),
        document: {
            createElement: () => ({ dataset: {}, children: [], appendChild(node) { this.children.push(node); } }),
            createTextNode: text => ({ text }),
        },
        audioPanel: { appendChild: row => rows.push(row) },
    };
    const label = '<img src=x onerror=alert(1)>';
    context.label = label;
    vm.runInNewContext(`${html.slice(start, end)} addItem(label, false, () => {});`, context);
    assert.equal(rows[0].innerHTML, '<span class="src-dot"></span>');
    assert.equal(rows[0].children[0].text, label);
});
