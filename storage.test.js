const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function storage() {
    const data = new Map();
    return { get length() { return data.size; }, key: (i) => [...data.keys()][i],
        getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) };
}
function harness() {
    const listeners = {};
    const context = vm.createContext({ localStorage: storage(), sessionStorage: storage(), console, URL, URLSearchParams, AbortSignal,
        fetch: async () => ({ ok: true, json: async () => [] }),
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
        document: { addEventListener() {} }, location: { reload() {} } });
    context.window = context;
    context.addEventListener = (type, fn) => (listeners[type] ||= []).push(fn);
    context.dispatchEvent = (event) => listeners[event.type]?.forEach((fn) => fn(event));
    for (const file of ['streamverse-storage.js', 'streamverse-auth.js']) {
        const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
        vm.runInContext(source.replace('window.StreamVerseAuth = {', 'window.testDispatchCloudItems = dispatchCloudItems; window.StreamVerseAuth = {'), context);
    }
    return context;
}
const title = { id: '262838', type: 'tv', currentTime: 245, lastUpdated: 10 };
const other = { id: '2628380', type: 'tv', currentTime: 100, lastUpdated: 10 };

test('title reset deletes all seasons/provider aliases, mapped IDs and pending history, with exact isolation', () => {
    const h = harness();
    const alias = { id: 'provider-show', tmdbId: title.id, type: 'tv', lastUpdated: 10 };
    const movie = { ...title, type: 'movie' };
    h.localStorage.setItem('sv_continue_watching', JSON.stringify([title, alias, other, movie]));
    h.localStorage.setItem('sv_pending_merge_local_guest', JSON.stringify([alias, other]));
    for (const item of [title, alias, other, movie]) {
        h.localStorage.setItem(`sv_watched_episodes:${item.type}:${item.id}`, JSON.stringify(['local:s1:e1', 'local:s0:e2', 'provider:anikoto:series:season2:abs:99']));
        h.localStorage.setItem(`sv_episode_progress:${item.type}:${item.id}`, JSON.stringify({ 'local:s2:e9': { time: 200 }, 'provider:hdstream4u:id:https://hubstream.art/#nvxttn': { time: 245 } }));
    }
    h.StreamVerseStorage.removeTitles([title]);
    assert.deepEqual(JSON.parse(h.localStorage.getItem('sv_continue_watching')), [other, movie]);
    assert.deepEqual(JSON.parse(h.localStorage.getItem('sv_pending_merge_local_guest')), [other]);
    for (const item of [title, alias]) for (const prefix of ['sv_watched_episodes', 'sv_episode_progress']) {
        assert.equal(h.localStorage.getItem(`${prefix}:${item.type}:${item.id}`), null);
    }
    for (const item of [other, movie]) assert(h.localStorage.getItem(`sv_episode_progress:${item.type}:${item.id}`));
    assert(h.StreamVerseStorage.isDeleted(alias));
    assert(!h.StreamVerseStorage.isDeleted({ ...title, lastUpdated: Date.now() + 1000 }));
});

test('cloud reset retries offline deletion, removes mapped documents and rejects stale uploads without touching favorites', async () => {
    const h = harness();
    h.StreamVerseAuth.state.user = { uid: 'test-user' };
    let offline = true;
    const deleted = [], written = [];
    const docs = [title, { id: 'provider-show', mapping: { tmdb: title.id }, type: 'tv' }, other];
    h.firebaseDb = { collection(name) {
        assert.equal(name, 'users');
        return { doc(uid) { assert.equal(uid, 'test-user'); return { collection(name) {
            assert.equal(name, 'continueWatching');
            return { get: async () => {
                if (offline) throw new Error('offline');
                return { docs: docs.map((item) => ({ data: () => item, ref: { delete: async () => deleted.push(item.id) } })) };
            }, doc: (id) => ({ set: async () => written.push(id) }) };
        } }; } };
    } };
    h.localStorage.setItem('sv_continue_watching', JSON.stringify([title, other]));
    // Exercise the explicit retry below without displaying a DOM notification.
    h.StreamVerseAuth.notify = () => {};
    h.StreamVerseStorage.removeTitles([title]);
    await new Promise(setImmediate);
    offline = false;
    await h.StreamVerseAuth.flushPlaybackResets();
    assert.deepEqual(deleted.sort(), ['262838', 'provider-show']);
    await h.StreamVerseAuth.saveItem(title);
    assert.deepEqual(written, []);
    h.testDispatchCloudItems([title, other]);
    assert.deepEqual(JSON.parse(h.localStorage.getItem('sv_continue_watching')), [other], 'stale realtime snapshots must not restore deleted history');
    h.StreamVerseAuth.state.user = { uid: 'other-account' };
    assert.equal(h.StreamVerseStorage.isDeleted(title), false);
});

test('cache invalidation includes Latent, catalogs, sources, session caches and every CacheStorage name, preserving user data', async () => {
    const h = harness();
    const cached = ['sv_cache_v1:detail:x', 'sv_anime_catalog_v3:popular', 'sv_media_info_v1:prod:x',
        'sv_media_info:old', 'sv_stream_source_v1:prod:x', 'sv_anime_canonical_x', 'anime_search_v2_x',
        'anime_provider_seasons_v2_x', 'anime_filler_x', 'filler_x', 'tmdb_detail_x', 'streamverse:v2:hds4u:tv:262838:latent'];
    const kept = ['firebase:authUser:key', 'streamverse_watchlist', 'sv_continue_watching', 'sv_episode_progress:tv:262838',
        'sv_watched_episodes:tv:262838', 'pref_autoEpisode', 'streamverse_local_profile_photo', 'api_source', 'sv_pending_merge_local_test'];
    for (const key of [...cached, ...kept]) h.localStorage.setItem(key, 'sentinel');
    h.sessionStorage.setItem('sv_hdstream_quality:show', 'old');
    h.sessionStorage.setItem('wpUserId', 'credential');
    const deleted = [];
    h.caches = { keys: async () => ['old-unrecognized-site-cache', 'streamverse-v1'], delete: async (name) => deleted.push(name) };
    h.indexedDB = { deleteDatabase() { assert.fail('Firebase databases must not be deleted'); } };
    await h.StreamVerseStorage.clearCache();
    for (const key of cached) assert.equal(h.localStorage.getItem(key), null, key);
    for (const key of kept) assert.equal(h.localStorage.getItem(key), 'sentinel', key);
    assert.equal(h.sessionStorage.getItem('sv_hdstream_quality:show'), null);
    assert.equal(h.sessionStorage.getItem('wpUserId'), 'credential');
    assert.equal(deleted.length, 2);
});

test('removal during auth restoration is retained for the restored account', () => {
    const h = harness();
    h.firebaseAuth = { currentUser: null };
    h.StreamVerseStorage.removeTitles([title]);
    h.StreamVerseAuth.state.user = { uid: 'restored-user' };
    h.StreamVerseAuth.state.ready = true;
    h.dispatchEvent(new h.CustomEvent('streamverse-auth-changed'));
    assert(h.StreamVerseStorage.isDeleted(title));
});

test('player cannot write old in-memory history or episode maps after a reset', () => {
    const html = fs.readFileSync(path.join(__dirname, 'player.html'), 'utf8');
    const context = vm.createContext({ playbackWasReset: () => true });
    for (const name of ['saveProgress', 'persistWatchedEpisodeKeys', 'persistEpisodeProgress']) {
        const start = html.indexOf(`        function ${name}(`);
        const end = html.indexOf('\n        }', start) + '\n        }'.length;
        vm.runInContext(html.slice(start, end), context);
        assert.doesNotThrow(() => context[name](), `${name} must return before accessing stale state`);
    }
});

test('every Firebase sync page loads the reset filter before auth', () => {
    for (const file of ['index.html', 'anime.html', 'player.html', 'login.html', 'settings.html', 'add-to-list.html']) {
        const html = fs.readFileSync(path.join(__dirname, file), 'utf8');
        const storageIndex = html.indexOf('src="/streamverse-storage.js"');
        assert(storageIndex > 0 && storageIndex < html.indexOf('src="/streamverse-auth.js"'), file);
    }
});

test('catalog IDs never collide; legacy recovery requires concrete provenance, not anime provider or digits', () => {
    const h = harness(), s = h.StreamVerseStorage;
    const ani = { ...title, namespace: 'anilist', provider: 'anikoto', anime: true };
    const tm = { ...title, namespace: 'tmdb', provider: 'anikoto', anime: true };
    assert.equal(s.mergeHistory([ani, tm, title]).length, 3);
    assert.equal(s.namespace({ ...title, provider: 'anikoto' }), 'legacy');
    assert.equal(s.namespace({ ...title, playbackUrl: `/player?id=${title.id}&anime=1` }), 'anilist');
    h.localStorage.setItem('sv_anime_catalog_v3:trending', JSON.stringify({ rows: [{ id: title.id, image: 'https://s4.anilist.co/test.jpg' }] }));
    assert.equal(s.namespace({ ...title, poster: 'https://s4.anilist.co/test.jpg' }), 'anilist');
    assert.equal(s.namespace({ ...title, poster: 'different.jpg' }), 'legacy');
    assert.equal(s.namespace({ ...title, poster: 'https://image.tmdb.org/t/p/w500/example.jpg' }), 'tmdb');
    assert.equal(s.namespace({ ...title, id: '269', poster: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx269-example.png' }), 'anilist');
    assert.equal(s.namespace({ ...title, id: '270', poster: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx269-example.png' }), 'legacy');
    h.localStorage.setItem('sv_continue_watching', JSON.stringify([ani, tm]));
    s.removeTitles([ani]);
    assert.deepEqual(JSON.parse(h.localStorage.getItem('sv_continue_watching')), [tm]);
    assert(!s.isDeleted(tm));
});

test('verified one-to-one mapping keeps the complete newest playback tuple; shared seasons and fuzzy matches stay separate', async () => {
    const h = harness(), s = h.StreamVerseStorage;
    h.fetch = async () => ({ ok: true, json: async () => [
        { anilist_id: 7, themoviedb_id: { tv: 40 } },
        { anilist_id: 8, themoviedb_id: { tv: 50 } },
        { anilist_id: 9, themoviedb_id: { tv: 50 } },
    ] });
    const old = { ...title, namespace: 'tmdb', id: '40', seasonNo: 8, episodeNo: 20, episodeId: 'old', provider: 'animekai', currentTime: 300 };
    const latest = { ...title, namespace: 'anilist', id: '7', title: 'Exact Work', anime: true, lastUpdated: 20,
        provider: 'anikoto', seasonNo: 0, seasonKey: 'CaseSensitive', seasonTitle: 'Specials', episodeNo: 2,
        episodeId: '7$episode$2', absoluteEpisodeNo: 14, currentTime: 55, audio: 'jpn' };
    const result = await s.enrichHistory([old, latest]);
    assert.equal(result.length, 1);
    const winner = JSON.parse(JSON.stringify(result[0]));
    const mapping = winner.workMapping;
    delete winner.workMapping;
    assert.deepEqual(winner, latest);
    assert.deepEqual(mapping, { type: 'tv', tmdb: '40', anilist: '7', source: 'fribb-one-to-one-v1' });
    const p = new URL(s.replayUrl(result[0], 'test'), 'https://test').searchParams;
    for (const [key, value] of Object.entries({ db: 'anilist', id: '7', anime: '1', title: 'Exact Work', provider: 'anikoto',
        season: '0', seasonKey: 'CaseSensitive', episode: '2', episodeId: '7$episode$2', t: '55', absoluteEpisode: '14', audio: 'jpn' })) assert.equal(p.get(key), value, key);
    const ambiguous = await s.enrichHistory([
        { ...old, id: '50', anilistId: '8' }, { ...latest, id: '8' }, { ...latest, id: '9' },
    ]);
    assert.equal(ambiguous.length, 3, 'backend fuzzy anilistId and shared TMDB series must not merge parts');
    h.localStorage.setItem('sv_continue_watching', JSON.stringify(result));
    s.removeTitles(result);
    assert(s.isDeleted(old));
    assert(s.isDeleted(latest));
});

test('cloud migration writes latest mapped progress before deleting persisted type_id docs; realtime and tombstones retain identity', async () => {
    const h = harness(), s = h.StreamVerseStorage;
    h.StreamVerseAuth.state.user = { uid: 'mock-only' };
    h.firebase = { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } };
    const mapping = { source: 'fribb-one-to-one-v1', type: 'tv', tmdb: '40', anilist: '7' };
    const older = { ...title, id: '40', namespace: 'tmdb', workMapping: mapping, episodeId: 'old', seasonNo: 5 };
    const newer = { ...title, id: '7', namespace: 'anilist', workMapping: mapping, lastUpdated: 20, currentTime: 75,
        episodeId: '7$episode$3', seasonNo: 1, episodeNo: 3, provider: 'anikoto', anime: true };
    const unrelated = { ...title, id: '7', namespace: 'tmdb', title: 'Different database' };
    const docs = new Map([['tv_40', older], ['tv_7', newer], ['tv%3Atmdb%3A7', unrelated]]), events = [];
    const ref = { get: async () => ({ docs: [...docs].map(([id, item]) => ({ id, data: () => item, ref: {
        delete: async () => { events.push(`delete:${id}`); docs.delete(id); },
    } })) }), doc: (id) => ({ set: async (item) => { events.push(`set:${id}`); docs.set(id, item); } }) };
    h.firebaseDb = { collection: () => ({ doc: () => ({ collection: () => ref }) }) };
    h.testDispatchCloudItems([older, unrelated, newer]);
    assert.equal(JSON.parse(h.localStorage.getItem('sv_continue_watching')).length, 2);
    await h.StreamVerseAuth.saveItem(older);
    assert.equal(docs.size, 2);
    assert(events[0].startsWith('set:'), 'migration must not delete the old document first');
    const saved = docs.get('tv%3Aanilist%3A7');
    assert.equal(saved.episodeId, newer.episodeId);
    assert.equal(saved.currentTime, 75);
    assert.equal(saved.seasonNo, 1);
    assert.equal(saved.provider, 'anikoto');
    s.removeTitles([saved]);
    await h.StreamVerseAuth.flushPlaybackResets();
    assert.equal(docs.size, 1);
    assert(docs.has('tv%3Atmdb%3A7'));
    await h.StreamVerseAuth.saveItem(older);
    assert.equal(docs.size, 1, 'stale clients cannot restore a migrated deleted work');
});
