(function () {
    'use strict';
    const HISTORY = 'sv_continue_watching';
    const RESETS = 'sv_playback_resets_v1';
    const CACHE_SIGNAL = 'sv_cache_cleared_at';
    const cachePattern = /^(?:sv_cache_v\d+:|sv_anime_catalog_v\d+:|sv_media_info[:_]|sv_stream_source_v\d+:|sv_anime_canonical_|anime_provider_seasons_|anime_search_|anime_filler_|filler_|tmdb_detail_|streamverse:v\d+:hds4u:|sv_hdstream_quality:|manga_cache[_:])/;
    const read = (key, fallback = []) => {
        try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; }
    };
    const keys = (storage) => Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(Boolean);
    const scope = () => window.StreamVerseAuth?.getUser()?.uid || window.firebaseAuth?.currentUser?.uid ||
        (window.firebaseAuth && !window.StreamVerseAuth?.state.ready ? 'pending-auth' : 'guest');

    function namespace(item) {
        if (item?.namespace) return String(item.namespace);
        if (item?.db) return String(item.db);
        for (const link of [item?.url, item?.playbackUrl]) {
            if (!link) continue;
            try {
                const p = new URL(link, 'https://streamverse.invalid').searchParams;
                if (p.get('id') === String(item?.id) && (p.get('db') || p.get('anime') === '1')) return p.get('db') || 'anilist';
            } catch (_) { }
        }
        if (item?.anime === true || item?.anime === '1' || String(item?.anilistId || '') === String(item?.id)) return 'anilist';
        if ([item?.tmdbId, item?.tmdb, item?.mappings?.tmdb, item?.mapping?.tmdb].some((id) => id != null && String(id) === String(item?.id))) return 'tmdb';
        try {
            const artwork = new URL(item?.poster || item?.image || '');
            if (artwork.hostname === 'image.tmdb.org') return 'tmdb';
            const coverId = artwork.pathname.match(/\/media\/anime\/cover\/[^/]+\/[a-z]*(\d+)(?:-|\.)/i)?.[1];
            if (/(^|\.)anilist\.co$/i.test(artwork.hostname) && coverId === String(item?.id)) return 'anilist';
        } catch (_) { }
        // Old anime cards retained AniList artwork but not the anime flag. Require
        // an exact cached catalog ID AND artwork match, never a title or digits.
        for (const key of keys(localStorage).filter((key) => key.startsWith('sv_anime_catalog_v'))) {
            const rows = read(key, {}).rows || [];
            if (rows.some((row) => String(row.id) === String(item?.id) && item?.poster &&
                [row.image, row.coverImage?.large, row.coverImage?.extraLarge].includes(item.poster))) return 'anilist';
        }
        return 'legacy';
    }
    const key = (item) => `${item?.type || 'movie'}:${namespace(item)}:${item?.id}`;
    function normalize(item) {
        const db = namespace(item);
        return db === 'legacy' ? item : { ...item, namespace: db };
    }
    // Never infer a title from slug tails, episode numbers, or a display name.
    function identities(item) {
        const type = String(item?.type || 'movie').toLowerCase();
        const db = namespace(item);
        const ids = [db === 'legacy' ? `${type}:${item?.id}` : `${type}:${db}:${item?.id}`];
        if (db === 'tmdb') ids.push(`${type}:${item.id}`); // persisted reset/bucket format
        if (db === 'legacy') ids.push(...[item?.tmdbId, item?.tmdb, item?.mappings?.tmdb, item?.mapping?.tmdb]
            .filter((id) => typeof id === 'string' || typeof id === 'number')
            .flatMap((id) => [`${type}:${String(id).trim()}`, `${type}:tmdb:${String(id).trim()}`]));
        if (item?.workMapping?.source === 'fribb-one-to-one-v1') {
            ids.push(`${type}:tmdb:${item.workMapping.tmdb}`, `${type}:${item.workMapping.tmdb}`, `${type}:anilist:${item.workMapping.anilist}`);
        }
        return [...new Set(ids)];
    }
    function sameWork(a, b) {
        // Conflicting catalog IDs must not become connected via a shared series.
        if (namespace(a) === namespace(b)) return key(a) === key(b);
        if ([namespace(a), namespace(b)].includes('legacy')) {
            const legacy = namespace(a) === 'legacy' ? a : b;
            const known = legacy === a ? b : a;
            if (namespace(known) !== 'tmdb' || ![legacy.tmdbId, legacy.tmdb, legacy.mappings?.tmdb, legacy.mapping?.tmdb]
                .some((id) => id != null && String(id) === String(known.id))) return false;
        }
        return identities(a).some((id) => identities(b).includes(id));
    }
    function mergeHistory(items) {
        const result = [];
        for (const item of (Array.isArray(items) ? items : []).filter(Boolean).map(normalize).sort((a, b) => Number(b.lastUpdated || 0) - Number(a.lastUpdated || 0))) {
            const existing = result.find((row) => sameWork(row, item));
            if (!existing) result.push({ ...item });
            else if (!existing.workMapping && item.workMapping) existing.workMapping = item.workMapping;
        }
        return result;
    }
    function replayUrl(item, apiSource) {
        item = normalize(item);
        const p = new URLSearchParams({ id: String(item.id), type: item.type || 'movie', db: namespace(item) });
        if (namespace(item) === 'anilist' || item.anime) p.set('anime', '1');
        const fields = { title: item.title, image: item.poster || item.image, provider: item.provider,
            season: item.seasonNo ?? (Number(item.seasonIndex || 0) + 1), episode: item.episodeNo ?? (Number(item.episodeIndex || 0) + 1),
            seasonTitle: item.seasonTitle, seasonKey: item.seasonKey, episodeId: item.episodeId,
            absoluteEpisode: item.absoluteEpisodeNo ?? item.absoluteEpisode, t: item.currentTime, audio: item.audio, apiSource };
        for (const [name, value] of Object.entries(fields)) if (value != null && value !== '') p.set(name, String(value));
        return `/player?${p}`;
    }
    let mappingPromise;
    let refreshPromise;
    function refreshHistory() {
        if (refreshPromise) return refreshPromise;
        refreshPromise = (async () => {
            const owner = scope();
            const enriched = await enrichHistory(read(HISTORY));
            if (owner !== scope()) return;
            const current = read(HISTORY);
            const merged = mergeHistory(current.map((row) => {
                const mapped = enriched.find((item) => sameWork(item, row));
                return mapped?.workMapping ? { ...normalize(row), workMapping: mapped.workMapping } : normalize(row);
            })).filter((row) => !isDeleted(row));
            if (JSON.stringify(current) !== JSON.stringify(merged)) {
                localStorage.setItem(HISTORY, JSON.stringify(merged));
                window.dispatchEvent(new CustomEvent('streamverse-history-changed'));
                if (window.StreamVerseAuth?.getUser()) await Promise.all(merged.map(window.StreamVerseAuth.saveItem));
            }
        })().finally(() => { refreshPromise = null; });
        return refreshPromise;
    }
    async function enrichHistory(items) {
        const rows = mergeHistory(items);
        if (!rows.some((row) => ['anilist', 'tmdb'].includes(namespace(row)))) return rows;
        // The backend uses this dataset too, but its index overwrites collisions.
        // Reject every many-to-one relation instead of folding seasons/parts.
        mappingPromise ||= fetch('https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-mini.json', { signal: AbortSignal.timeout(10000) })
            .then((response) => { if (!response.ok) throw new Error('Mapping unavailable'); return response.json(); })
            .catch(() => { mappingPromise = null; return []; });
        const data = await mappingPromise;
        const pairs = [];
        for (const row of Array.isArray(data) ? data : []) {
            if (!row.anilist_id) continue;
            for (const type of ['tv', 'movie']) {
                const value = row.themoviedb_id?.[type];
                for (const id of Array.isArray(value) ? value : value != null ? [value] : []) {
                    pairs.push({ type, tmdb: String(id), anilist: String(row.anilist_id), source: 'fribb-one-to-one-v1' });
                }
            }
        }
        const tm = new Map(), ani = new Map();
        for (const pair of pairs) {
            const t = `${pair.type}:${pair.tmdb}`;
            if (!tm.has(t)) tm.set(t, new Set());
            tm.get(t).add(pair.anilist);
            if (!ani.has(pair.anilist)) ani.set(pair.anilist, new Set());
            ani.get(pair.anilist).add(t);
        }
        return mergeHistory(rows.map((row) => {
            const db = namespace(row);
            const mapping = pairs.find((pair) => pair.type === row.type && String(row.id) === pair[db] &&
                tm.get(`${pair.type}:${pair.tmdb}`).size === 1 && ani.get(pair.anilist).size === 1);
            return mapping ? { ...row, workMapping: mapping } : row;
        }));
    }
    function matches(item, reset) {
        return identities(item).some((id) => reset.ids.includes(id));
    }
    function resets() { return read(RESETS).filter((row) => row.scope === scope()); }
    function isDeleted(item) {
        return resets().some((reset) => matches(item, reset) && Number(item.lastUpdated || 0) <= reset.at);
    }
    function resetSince(item, since) {
        return resets().some((reset) => matches(item, reset) && reset.at >= since);
    }
    function removeTitles(items) {
        if (!items.length) return;
        const history = read(HISTORY);
        const pendingKeys = keys(localStorage).filter((key) => key === `sv_pending_merge_local_${scope()}`);
        const candidates = [...history, ...pendingKeys.flatMap((key) => read(key))];
        const ids = new Set(items.flatMap(identities));
        // Explicit mappings can connect provider IDs to the canonical title ID.
        let size;
        do {
            size = ids.size;
            candidates.forEach((item) => {
                if (identities(item).some((id) => ids.has(id))) identities(item).forEach((id) => ids.add(id));
            });
        } while (size !== ids.size);
        const reset = { scope: scope(), ids: [...ids], at: Date.now() };
        localStorage.setItem(RESETS, JSON.stringify([...read(RESETS), reset]));
        for (const key of [HISTORY, ...pendingKeys]) {
            localStorage.setItem(key, JSON.stringify(read(key).filter((item) => !matches(item, reset))));
        }
        for (const id of ids) {
            // Deleting the complete bucket also removes specials, other seasons,
            // absolute-episode keys, and aliases for every playback provider.
            localStorage.removeItem(`sv_watched_episodes:${id}`);
            localStorage.removeItem(`sv_episode_progress:${id}`);
        }
        window.dispatchEvent(new CustomEvent('streamverse-playback-reset', { detail: reset }));
        window.StreamVerseAuth?.flushPlaybackResets?.().catch((error) => {
            console.warn('[auth] playback reset pending:', error);
            window.StreamVerseAuth?.notify?.('Removed on this device. Account removal will retry when connected.', 'error');
        });
    }
    async function clearCache() {
        let removed = 0;
        // CacheStorage is disposable site content. IndexedDB is not: Firebase
        // owns the databases used here, including credentials and offline writes.
        if (window.caches?.keys) {
            const names = await window.caches.keys();
            await Promise.all(names.map((name) => window.caches.delete(name)));
            removed += names.length;
        }
        for (const storage of [localStorage, sessionStorage]) {
            for (const key of keys(storage)) {
                if (!cachePattern.test(key)) continue;
                storage.removeItem(key);
                removed++;
            }
        }
        localStorage.setItem(CACHE_SIGNAL, String(Date.now()));
        return removed;
    }
    window.addEventListener('storage', (event) => {
        if (event.key === RESETS) window.dispatchEvent(new CustomEvent('streamverse-playback-reset'));
        if (event.key === CACHE_SIGNAL) {
            for (const key of keys(sessionStorage)) if (cachePattern.test(key)) sessionStorage.removeItem(key);
            window.location.reload();
        }
    });
    window.addEventListener('streamverse-auth-changed', () => {
        const rows = read(RESETS);
        if (rows.some((row) => row.scope === 'pending-auth')) {
            localStorage.setItem(RESETS, JSON.stringify(rows.map((row) => row.scope === 'pending-auth' ? { ...row, scope: scope() } : row)));
        }
    });
    window.StreamVerseStorage = { removeTitles, clearCache, identities, matches, resets, isDeleted, resetSince,
        namespace, key, normalize, sameWork, mergeHistory, replayUrl, enrichHistory, refreshHistory };
})();
