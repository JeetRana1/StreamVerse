
// -----------------------------------------------------------------------
//  CONFIG
// -----------------------------------------------------------------------
const RUNTIME_CONFIG = window.__STREAMVERSE_CONFIG__ || {};
const LOCAL_META_API = String(
    RUNTIME_CONFIG.LOCAL_META_API_BASE ||
    RUNTIME_CONFIG.LOCAL_API_BASE ||
    'http://localhost:3000/meta/tmdb'
);
const PROD_META_API = 'http://34.132.4.102:3000/meta/tmdb';
const DEFAULT_META_API = PROD_META_API;
const PARAMS_BOOT = new URLSearchParams(location.search);
const requestedApiSource = String(PARAMS_BOOT.get('apiSource') || '').toLowerCase();
const storedApiSource = String(localStorage.getItem('api_source') || '').toLowerCase();

const effectiveApiSource =
    requestedApiSource === 'local' || requestedApiSource === 'prod'
        ? requestedApiSource
        : (storedApiSource === 'local' || storedApiSource === 'prod' ? storedApiSource : 'prod');

const selectedMetaApi = effectiveApiSource === 'local' ? LOCAL_META_API : PROD_META_API;

const API_BASE_CANDIDATES = [
    String(new URLSearchParams(location.search).get('api') || '').trim(),
    selectedMetaApi,
    effectiveApiSource === 'prod' ? 'http://34.132.4.102:3000/meta/tmdb' : null,
    effectiveApiSource === 'local' ? 'http://localhost:3000/meta/tmdb' : null,
].filter(Boolean);

const API_BASE = API_BASE_CANDIDATES[0] || DEFAULT_META_API;
let activeApiBase = API_BASE;
let preferredSourceLabelMatch = null;

console.log('API source:', effectiveApiSource, 'API_BASE set to:', API_BASE);

function withApiBase(url, base = activeApiBase) {
    return String(url || '').replace(API_BASE, base);
}

async function fetchJsonWithApiFallback(url, options = {}) {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const shouldRetryStatus = (status) => status === 404 || status === 429 || status >= 500;
    const isRetriableError = (err) => {
        const msg = String(err?.message || err || '').toLowerCase();
        return (
            msg.includes('failed to fetch') ||
            msg.includes('networkerror') ||
            msg.includes('load failed') ||
            msg.includes('timed out') ||
            msg.includes('timeout') ||
            msg.includes('aborted')
        );
    };

    const attemptFetch = async (base, attempts = 3) => {
        let lastErr = null;
        for (let i = 0; i < attempts; i += 1) {
            const reqUrl = (String(url || '').replace(API_BASE, base));
            try {
                const res = await fetch(reqUrl, options);
                if (shouldRetryStatus(res.status) && i < attempts - 1) {
                    await sleep(1000 + i * 1200);
                    continue;
                }
                return { res, usedBase: base };
            } catch (err) {
                lastErr = err;
                if (isRetriableError(err) && i < attempts - 1) {
                    await sleep(1000 + i * 1200);
                    continue;
                }
            }
        }
        throw lastErr || new Error('Request failed');
    };

    try {
        return await attemptFetch(activeApiBase, 3);
    } catch (err) {
        for (const base of API_BASE_CANDIDATES) {
            if (base === activeApiBase) continue;
            try {
                const out = await attemptFetch(base, 2);
                activeApiBase = base;
                return out;
            } catch (_) { }
        }
        throw err;
    }
}


async function fetchJsonWithRetry(url, timeoutMs = 10000, retryTimeoutMs = 15000) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        if (retryTimeoutMs > timeoutMs) {
            const res = await fetch(url, { signal: AbortSignal.timeout(retryTimeoutMs) });
            return await res.json();
        }
        throw err;
    }
}

// Provider pools
const MOVIE_PROVIDERS = ['flixhq', 'goku', 'sflix', 'himovies', 'dramacool'];
const ANIME_PROVIDERS = ['justanime', 'satoru', 'hianime', 'animesaturn'];
const ANIME_SUBTITLE_FALLBACK_PROVIDERS = ['justanime', 'hianime', 'animesaturn'];

const params = new URLSearchParams(location.search);
const TMDB_ID = params.get('id');
const MEDIA_TYPE = (params.get('type') || 'movie').toLowerCase();
let FORCED_PROVIDER = params.get('provider') || '';
const DIRECT_ONLY = (params.get('directOnly') || 'true').toLowerCase() !== 'false';

const URL_SEASON = Number(params.get('season') || 0);
const URL_EPISODE = Number(params.get('episode') || params.get('ep') || 0);
const URL_AUDIO = String(params.get('audio') || '').trim().toLowerCase();

// -----------------------------------------------------------------------
//  DOM
// -----------------------------------------------------------------------
let video = document.getElementById('player-video');
const loader = document.getElementById('loader');
const playerHeader = document.getElementById('player-header');
const backBtn = document.getElementById('back-btn');
const errorBox = document.getElementById('error-box');
const sourceBtn = document.getElementById('source-btn');
const sourcePanel = document.getElementById('source-panel');
const epBtn = document.getElementById('ep-btn');
const epPanel = document.getElementById('ep-panel');
const progress = document.getElementById('provider-progress');
const controlSurface = document.getElementById('controlSurface');
const playerWrap = document.querySelector('.player-wrap');
const playPauseBtn = document.getElementById('playPauseBtn');
const skipBackBtn = document.getElementById('skipBackBtn');
const skipFwdBtn = document.getElementById('skipFwdBtn');
const customServerBtn = document.getElementById('customServerBtn');
const customEpisodeBtn = document.getElementById('customEpisodeBtn');
const customAudioBtn = document.getElementById('custom-audio-btn');
const captionsBtn = document.getElementById('captionsBtn');
const qualityBtn = document.getElementById('qualityBtn');
const settingsBtn = document.getElementById('settingsBtn');
const fitBtn = document.getElementById('fitBtn');
const muteBtn = document.getElementById('muteBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const uiLockBtn = document.getElementById('uiLockBtn');
const skipSegmentBtn = document.getElementById('skipSegmentBtn');
const nextEpisodeBtn = document.getElementById('nextEpisodeBtn');
const seekBar = document.getElementById('seekBar');
const currentTimeEl = document.getElementById('currentTime');
const durationTimeEl = document.getElementById('durationTime');
const qualityMenu = document.getElementById('qualityMenu');
const captionsMenu = document.getElementById('captionsMenu');
const settingsMenu = document.getElementById('settingsMenu');
const volumeMenu = document.getElementById('volumeMenu');

// -----------------------------------------------------------------------
//  STATE
// -----------------------------------------------------------------------
let plyr = null;
let hlsInst = null;
let dashInst = null;
let allSources = [];
let externalSubtitleTracks = [];
const animeSubtitleCache = new Map();
let subtitleBlobUrls = [];
let subtitleApplyVersion = 0;
let activeSubtitleTrackIndex = -1;
let currentIdx = 0;
let currentMediaInfo = null;
let tvSeasons = [];
let curSeason = 0;
let curEpisode = 0;
let curEpisodeId = null;
let currentIsLikelyAnime = false;
let activeProviders = [...MOVIE_PROVIDERS];
let preferredAudioToken = URL_AUDIO || '';
let headerTimer;
let controlsHideTimer;
let isUiLocked = false;
let animeSkipSegments = { intro: null, outro: null };
let skippedSegments = { intro: false, outro: false };
let hasApiSkipSegments = false;
let lastSuccessfulProvider = '';
let satoruAudioSources = [];

const ANIME_PROVIDER_INFO_CACHE_TTL_MS = 30 * 60 * 1000;
const animeProviderInfoCache = new Map();
const REQ_TIMEOUT = {
    animeSearch: 5000,
    animeInfo: 5000,
    metaInfo: 7000,
    watch: 7000,
    directWatch: 6000,
    subtitleFallback: 15000,
};
const ANIME_WATCH_TIMEOUT_MS = 20000;
const ANIME_INFO_TIMEOUT_MS = 12000;

const PROVIDER_TIMEOUT_OVERRIDES = {
    satoru: { animeSearch: 8000, animeInfo: 12000, watch: 35000, watchRetry: 45000 },
    justanime: { subtitleFallback: 20000 },
    hianime: { subtitleFallback: 18000 },
    dramacool: { watch: 12000, directWatch: 10000 }
};

const getProviderTimeout = (provider, key, fallbackMs) => {
    const raw = PROVIDER_TIMEOUT_OVERRIDES?.[provider]?.[key];
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : fallbackMs;
};

const isTimeoutLikeError = (err) => {
    const msg = String(err?.message || err || '').toLowerCase();
    return msg.includes('timed out') || msg.includes('timeout') || msg.includes('aborted');
};

const MEDIA_INFO_CACHE_PREFIX = 'sv_media_info_v1';
const MEDIA_INFO_CACHE_TTL_MS = 10 * 60 * 1000;

const USE_HEURISTIC_SKIP_FALLBACK = false;
const animeSkipCache = new Map();
const animeFillerCache = new Map();
let episodeFillerStatus = new Map();
let fillerLookupState = 'idle';
let animeFillerIndexCache = null;
let fitIndex = 0;

let volumeSliderEl = null;
let volumeToggleEl = null;
let volumeBoost = 100;
let audioCtx = null;
let gainNode = null;
let sourceNode = null;

window.addEventListener('beforeunload', () => { subtitleBlobUrls = []; });

const fitModes = [
    { value: 'contain', label: 'Contain', icon: 'fa-up-right-and-down-left-from-center' },
    { value: 'cover', label: 'Fill', icon: 'fa-up-right-and-down-left-from-center' },
    { value: 'fill', label: 'Stretch', icon: 'fa-arrows-up-down-left-right' }
];

// -----------------------------------------------------------------------
//  LOADER / ERROR HELPERS
// -----------------------------------------------------------------------
function setLoader(title, sub) {
    if (!loader) return;
    document.getElementById('loader-title').textContent = title;
    document.getElementById('loader-sub').textContent = sub;
    loader.style.display = 'flex';
    loader.style.opacity = '1';
}

function hideLoader() {
    if (!loader) return;
    loader.style.opacity = '0';
    setTimeout(() => { if (loader) loader.style.display = 'none'; }, 500);
}

function showError(title, msg) {
    hideLoader();
    if (!errorBox) return;
    document.getElementById('err-title').textContent = title;
    document.getElementById('err-msg').textContent = msg;
    errorBox.style.display = 'block';
}

function hideError() {
    if (errorBox) errorBox.style.display = 'none';
}

function normalizeAudioToken(v) {
    return String(v || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .trim();
}

function getTrackAudioTokens(track) {
    const lang = String(track?.lang || '').toLowerCase();
    const langToken = normalizeAudioToken(lang);
    const nameToken = normalizeAudioToken(track?.name || '');
    return [lang, langToken, nameToken].filter(Boolean);
}

function rememberAudioPreference(track) {
    if (!track) return;
    const tokens = getTrackAudioTokens(track);
    preferredAudioToken = tokens[0] || tokens[1] || tokens[2] || '';
    if (MEDIA_TYPE === 'tv') updateEpisodeUrlState(curSeason, curEpisode);
}

function rememberProviderPreference(providerName) {
    FORCED_PROVIDER = providerName || '';
    const u = new URL(location.href);
    if (providerName) u.searchParams.set('provider', providerName);
    else u.searchParams.delete('provider');
    const audioVal = preferredAudioToken || preferredSourceLabelMatch;
    if (audioVal) u.searchParams.set('audio', audioVal);
    else u.searchParams.delete('audio');
    history.replaceState(null, '', u.toString());
}

function updateEpisodeUrlState(seasonIndex, episodeIndex) {
    if (MEDIA_TYPE !== 'tv') return;
    const u = new URL(location.href);
    const seasonRef = tvSeasons?.[Number(seasonIndex || 0)];
    const seasonNoRaw = Number(seasonRef?.seasonNo);
    const seasonNo = Number.isFinite(seasonNoRaw) && seasonNoRaw > 0 ? seasonNoRaw : Number(seasonIndex || 0) + 1;
    const epRef = seasonRef?.episodes?.[Number(episodeIndex || 0)];
    const epNoRaw = Number(epRef?.episode || epRef?.number || epRef?.episodeNum);
    const episodeNo = Number.isFinite(epNoRaw) && epNoRaw > 0 ? epNoRaw : Number(episodeIndex || 0) + 1;
    u.searchParams.set('season', String(seasonNo));
    u.searchParams.set('episode', String(episodeNo));
    if (preferredAudioToken) u.searchParams.set('audio', preferredAudioToken);
    else u.searchParams.delete('audio');
    history.replaceState(null, '', u.toString());
}

function getInitialTvPositionFromUrl(seasons) {
    const safeSeasons = Array.isArray(seasons) ? seasons : [];
    let si = 0;
    let ei = 0;
    if (Number.isFinite(URL_SEASON) && URL_SEASON > 0) {
        const bySeasonNo = safeSeasons.findIndex((s) => Number(s?.seasonNo || 0) === URL_SEASON);
        if (bySeasonNo >= 0) si = bySeasonNo;
        else si = Math.max(0, Math.min(safeSeasons.length - 1, URL_SEASON - 1));
        const eps = safeSeasons[si]?.episodes || [];
        if (Number.isFinite(URL_EPISODE) && URL_EPISODE > 0) {
            const byEpisodeNo = eps.findIndex((ep) => {
                const n = Number(ep?.episode || ep?.number || ep?.episodeNum || 0);
                return n === URL_EPISODE;
            });
            if (byEpisodeNo >= 0) ei = byEpisodeNo;
            else ei = Math.max(0, Math.min(eps.length - 1, URL_EPISODE - 1));
        }
    }
    return { seasonIndex: si, episodeIndex: ei };
}

function buildTvSeasonsFromInfo(info) {
    const rawSeasons = Array.isArray(info?.seasons) ? info.seasons : [];
    const rawEpisodes = Array.isArray(info?.episodes) ? info.episodes : [];
    const mapSeasonNo = (v, fallback) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : fallback;
    };
    const fromSeasonBuckets = rawSeasons
        .map((s, idx) => ({
            seasonNo: mapSeasonNo(s?.season || s?.seasonNumber || s?.number, idx + 1),
            name: String(s?.name || `Season ${idx + 1}`),
            episodes: Array.isArray(s?.episodes) ? s.episodes : []
        }))
        .filter((s) => s.episodes.length > 0);
    if (fromSeasonBuckets.length > 0) return fromSeasonBuckets;
    if (rawEpisodes.length > 0) {
        const grouped = new Map();
        rawEpisodes.forEach((ep) => {
            const sNo = mapSeasonNo(ep?.season || ep?.seasonNumber || ep?.seasonNum, 1);
            if (!grouped.has(sNo)) grouped.set(sNo, []);
            grouped.get(sNo).push(ep);
        });
        return [...grouped.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([seasonNo, episodes]) => ({
                seasonNo,
                name: `Season ${seasonNo}`,
                episodes
            }));
    }
    return [];
}

function buildAnimeFillerSlugCandidates(title) {
    const raw = normalizeTitleForMatch(title);
    if (!raw) return [];
    const cleaned = raw.replace(/\b(tv|season|part|cour|movie|ona|ova)\b/g, ' ').replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
    const tokens = cleaned.split(' ').filter(Boolean);
    if (!tokens.length) return [];
    const candidates = [tokens.join('-'), tokens.slice(0, 3).join('-'), tokens.slice(0, 2).join('-')].filter(Boolean);
    return [...new Set(candidates)];
}

function parseEpisodeRangeToken(token) {
    const t = String(token || '').replace(/[Ã¢â‚¬â€œÃ¢â‚¬â€Ã¢Ë†â€™]/g, '-').replace(/\bto\b/gi, '-').replace(/[^\d,\-\s]/g, '').trim();
    if (!t) return [];
    const m = t.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
        const start = Number(m[1]), end = Number(m[2]);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? [n] : [];
}

function parseEpisodeListFromLine(line) {
    if (!line) return [];
    return line.replace(/\.\s*$/, '').replace(/[Ã¢â‚¬â€œÃ¢â‚¬â€Ã¢Ë†â€™]/g, '-').split(/[,;|]/).flatMap(parseEpisodeRangeToken);
}

function parseAnimeFillerMapFromText(text) {
    const out = new Map();
    const body = String(text || '').replace(/[Ã¢â‚¬â€œÃ¢â‚¬â€Ã¢Ë†â€™]/g, '-');
    const capture = (re) => (body.match(re)?.[1] || '').trim();
    const mark = (eps, status) => eps.forEach(epNo => {
        if (!Number.isFinite(epNo)) return;
        if (status === 'filler') out.set(epNo, status);
        else if (status === 'mixed') { if (out.get(epNo) !== 'filler') out.set(epNo, status); }
        else if (!out.has(epNo)) out.set(epNo, status);
    });
    mark(parseEpisodeListFromLine(capture(/manga\s*canon\s*episodes?\s*:?\s*([0-9,\-\s]+)/i)), 'manga');
    mark(parseEpisodeListFromLine(capture(/mixed\s*canon\s*\/\s*filler\s*episodes?\s*:?\s*([0-9,\-\s]+)/i)), 'mixed');
    mark(parseEpisodeListFromLine(capture(/filler\s*episodes?\s*:?\s*([0-9,\-\s]+)/i)), 'filler');
    if (out.size === 0) {
        const rowRe = /(?:episode|ep)\s*#?\s*(\d+)[^\n\r]{0,120}?(manga canon|mixed canon\/filler|mixed canon filler|filler)/ig;
        let m;
        while ((m = rowRe.exec(body)) !== null) {
            const epNo = Number(m[1]), rawType = m[2].toLowerCase();
            if (rawType.includes('mixed')) { if (out.get(epNo) !== 'filler') out.set(epNo, 'mixed'); }
            else if (rawType.includes('manga canon')) { if (!out.has(epNo)) out.set(epNo, 'manga'); }
            else if (rawType.includes('filler')) out.set(epNo, 'filler');
        }
    }
    return out;
}

function parseEpisodeValueToList(value) {
    if (Array.isArray(value)) return value.flatMap(parseEpisodeValueToList);
    if (typeof value === 'number') return [value];
    if (typeof value === 'string') return parseEpisodeListFromLine(value);
    return [];
}

function parseFillerMapFromJsonPayload(payload) {
    const out = new Map();
    const mark = (eps, status) => eps.forEach(epNo => {
        if (status === 'filler') out.set(epNo, status);
        else if (status === 'mixed') { if (out.get(epNo) !== 'filler') out.set(epNo, status); }
        else if (!out.has(epNo)) out.set(epNo, status);
    });
    const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(visit); return; }
        Object.entries(node).forEach(([k, v]) => {
            const key = k.toLowerCase();
            if (key.includes('mixed')) mark(parseEpisodeValueToList(v), 'mixed');
            else if (key.includes('manga') || key.includes('canon')) mark(parseEpisodeValueToList(v), 'manga');
            else if (key.includes('filler')) mark(parseEpisodeValueToList(v), 'filler');
            else if (typeof v === 'object') visit(v);
        });
    };
    visit(payload);
    return out;
}

async function fetchGithubFillerMap(title, slugCandidates) {
    try {
        const meta = await fetchJsonWithFallbacks('https://data.jsdelivr.com/v1/package/gh/xsunzukz/anime-filler-episodes-api', 22000);
        const root = meta?.data;
        if (!root) return new Map();
        const files = [];
        const walk = (nodes, prefix = '') => {
            if (!Array.isArray(nodes)) return;
            nodes.forEach(n => {
                const name = n.name || '', type = n.type || '', path = prefix ? `${prefix}/${name}` : name;
                if (type === 'file' && name.toLowerCase().endsWith('.json')) files.push(path);
                if (type === 'directory') walk(n.files, path);
            });
        };
        walk(root.files);
        const normTitle = normalizeTitleForMatch(title);
        const titleTokens = new Set(normTitle.split(' ').filter(Boolean));
        const wanted = new Set((slugCandidates || []).map(s => String(s || '').toLowerCase()));
        let ranked = files.map(f => {
            const lf = f.toLowerCase(), base = lf.split('/').pop(), stem = base.replace(/\.json$/i, ''), normStem = normalizeTitleForMatch(stem);
            let score = 0;
            if (wanted.has(stem) || wanted.has(lf.replace(/\.json$/i, ''))) score += 60;
            if (normStem === normTitle) score += 120;
            if (normStem.includes(normTitle) || normTitle.includes(normStem)) score += 25;
            normStem.split(' ').forEach(t => { if (titleTokens.has(t)) score += 8; });
            return { file: f, score };
        }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
        for (const candidate of ranked) {
            const payload = await fetchJsonWithFallbacks(`https://cdn.jsdelivr.net/gh/xsunzukz/anime-filler-episodes-api@main/${candidate.file}`, 22000);
            const parsed = parseFillerMapFromJsonPayload(payload?.data);
            if (parsed.size > 0) return parsed;
        }
    } catch (_) { }
    return new Map();
}

function normalizeTitleForMatch(v) {
    return String(v || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\(([^)]*)\)/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchTextWithFallbacks(targetUrl, timeoutMs = 20000) {
    try {
        const res = await fetch(targetUrl, { signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) return { text: '', networkFailed: false };
        const text = await res.text();
        return { text, networkFailed: false };
    } catch (_) { return { text: '', networkFailed: true }; }
}

async function fetchJsonWithFallbacks(targetUrl, timeoutMs = 20000) {
    const { text, networkFailed } = await fetchTextWithFallbacks(targetUrl, timeoutMs);
    if (!text) return { data: null, networkFailed };
    try { return { data: JSON.parse(text), networkFailed: false }; }
    catch (_) { return { data: null, networkFailed }; }
}

async function fetchAnimeFillerIndexEntries() {
    if (Array.isArray(animeFillerIndexCache)) return animeFillerIndexCache;
    try {
        const { text } = await fetchTextWithFallbacks('https://www.animefillerlist.com/shows', 22000);
        if (!text) return [];
        const entries = [];
        const re = /\[([^\]]+)\]\(.*?\/shows\/([a-z0-9-]+)\/?\)/ig;
        let m;
        while ((m = re.exec(text)) !== null) entries.push({ name: m[1].trim(), slug: m[2].trim(), norm: normalizeTitleForMatch(m[1]) });
        if (!entries.length) {
            const htmlRe = /<a[^>]+href="\/shows\/([a-z0-9-]+)\/?"[^>]*>([^<]+)<\/a>/ig;
            while ((m = htmlRe.exec(text)) !== null) entries.push({ slug: m[1].trim(), name: m[2].trim(), norm: normalizeTitleForMatch(m[2]) });
        }
        animeFillerIndexCache = entries;
        return entries;
    } catch (_) { return []; }
}

function pickBestFillerIndexSlug(title, entries) {
    const norm = normalizeTitleForMatch(title);
    if (!norm || !entries?.length) return '';
    const titleTokens = new Set(norm.split(' ').filter(Boolean));
    let best = { score: 0, slug: '' };
    entries.forEach(entry => {
        const entryNorm = entry.norm || '';
        let score = (entryNorm === norm) ? 100 : (entryNorm.includes(norm) || norm.includes(entryNorm) ? 35 : 0);
        entryNorm.split(' ').forEach(t => { if (titleTokens.has(t)) score += 8; });
        if (score > best.score) best = { score, slug: entry.slug };
    });
    return best.score >= 16 ? best.slug : '';
}

function toArrayPayload(payload) {
    if (Array.isArray(payload)) return payload;
    return payload?.results || payload?.data || [];
}

function pickBestMalSearchResult(title, results) {
    const norm = normalizeTitleForMatch(title);
    if (!norm) return null;
    const titleTokens = new Set(norm.split(' ').filter(Boolean));
    let best = { score: 0, item: null };
    for (const item of results || []) {
        const itemNorm = normalizeTitleForMatch(item.title || item.name || item.titleEnglish);
        let score = (itemNorm === norm) ? 120 : (itemNorm.includes(norm) || norm.includes(itemNorm) ? 30 : 0);
        itemNorm.split(' ').forEach(t => { if (titleTokens.has(t)) score += 8; });
        if (score > best.score) best = { score, item };
    }
    return best.score > 0 ? best.item : null;
}

async function fetchAnimeFillerStatusMap(title) {
    const key = title.toLowerCase().trim();
    if (!key) return new Map();
    if (animeFillerCache.has(key)) return animeFillerCache.get(key);
    try {
        const utilsBase = API_BASE.replace('/meta/tmdb', '/utils');
        const payload = await fetchJsonWithRetry(`${utilsBase}/filler?title=${encodeURIComponent(title)}`, 9000, 15000);
        const map = new Map();
        if (payload?.episodes) {
            Object.entries(payload.episodes).forEach(([k, v]) => {
                const epNo = Number(k), status = String(v).toLowerCase();
                if (['filler', 'mixed', 'manga'].includes(status)) map.set(epNo, status);
            });
        }
        animeFillerCache.set(key, map);
        return map;
    } catch (_) { animeFillerCache.set(key, new Map()); return new Map(); }
}

function getAnimeProviderBase(provider) {
    return activeApiBase.replace('/meta/tmdb', `/anime/${provider}`);
}

function buildAnimeInfoUrl(provider, animeId) {
    const base = getAnimeProviderBase(provider);
    if (provider === 'satoru') return `${base}/info/${encodeURIComponent(animeId)}`;
    return `${base}/info?id=${encodeURIComponent(animeId)}`;
}

function buildAnimeWatchUrl(provider, episodeId) {
    const base = getAnimeProviderBase(provider);
    const url = new URL(`${base}/watch/${encodeURIComponent(episodeId)}`);
    if (provider === 'hianime') url.searchParams.set('category', 'both');
    return url.toString();
}

function getAnimeSearchResults(searchData) {
    return searchData?.results || searchData?.data?.results || searchData?.data || (Array.isArray(searchData) ? searchData : []);
}

function getPreferredMediaYear() {
    const raw = currentMediaInfo?.releaseDate || currentMediaInfo?.release_date || currentMediaInfo?.first_air_date || currentMediaInfo?.startDate || '';
    const y = Number(String(raw).slice(0, 4));
    return (y > 1900) ? y : null;
}

function getAnimeSearchTerms(title, preferredYear = null) {
    const base = normalizeTitleForMatch(title);
    if (!base) return [];
    let terms = [base];
    if (preferredAudioToken && preferredAudioToken !== 'sub' && preferredAudioToken !== 'dub') {
        terms.unshift(`${base} ${preferredAudioToken}`);
    }
    if (preferredYear) {
        const withYear = `${base} ${preferredYear}`;
        terms.unshift(withYear);
        if (preferredAudioToken) terms.unshift(`${withYear} ${preferredAudioToken}`);
    }
    return [...new Set(terms)];
}

function pickAnimeResultByTitle(results, title, preferredYear = null) {
    if (!results?.length) return null;
    const normTitle = normalizeTitleForMatch(title);
    const prefAudio = String(preferredAudioToken || '').toLowerCase();
    let best = { score: 0, item: null };
    results.forEach(item => {
        const rawName = String(item.title || item.name || '');
        const normName = normalizeTitleForMatch(rawName);
        const year = Number(String(item.releaseDate || item.release_date || item.year || '').slice(0, 4));
        let score = (normName === normTitle) ? 100 : (normName.includes(normTitle) ? 50 : 0);
        if (preferredYear && year === preferredYear) score += 20;
        if (prefAudio && rawName.toLowerCase().includes(prefAudio)) score += 80;
        if (score > best.score) best = { score, item };
    });
    return best.item || results[0];
}

async function fetchAnimeSourcesByProvider(provider, title, episodeNo) {
    try {
        const year = getPreferredMediaYear();
        const terms = getAnimeSearchTerms(title, year);
        const base = getAnimeProviderBase(provider);
        let results = [];
        for (const q of terms) {
            const searchData = await fetchJsonWithRetry(`${base}/${encodeURIComponent(q)}`, REQ_TIMEOUT.animeSearch, REQ_TIMEOUT.animeSearch + 5000);
            results = getAnimeSearchResults(searchData);
            if (results.length) break;
        }
        const best = pickAnimeResultByTitle(results, title, year);
        if (!best?.id) return null;
        const info = await fetchJsonWithRetry(buildAnimeInfoUrl(provider, best.id), REQ_TIMEOUT.animeInfo, REQ_TIMEOUT.animeInfo + 5000);
        const eps = info?.episodes || info?.data?.episodes || [];
        const target = eps.find(ep => ep.number === episodeNo || ep.episode === episodeNo) || eps[episodeNo - 1];
        if (!target?.id) return null;
        return await fetchJsonWithRetry(buildAnimeWatchUrl(provider, target.id), REQ_TIMEOUT.watch, getProviderTimeout(provider, 'watchRetry', REQ_TIMEOUT.watch + 10000));
    } catch (_) { return null; }
}

async function fetchSourcesFromGoku(tmdbId, type) {
    try {
        const base = activeApiBase.replace('/meta/tmdb', '/movies/goku');
        const watchData = await fetchJsonWithRetry(`${base}/watch?id=${tmdbId}&type=${type}${MEDIA_TYPE === 'tv' ? `&s=${URL_SEASON}&e=${URL_EPISODE}` : ''}`, REQ_TIMEOUT.watch, REQ_TIMEOUT.watch + 5000);
        return watchData;
    } catch (_) { return null; }
}

async function fetchSources() {
    setLoader('Searching', 'Finding best streams...');
    hideError();
    const title = currentMediaInfo?.title || currentMediaInfo?.name || '';
    if (!title) { showError('Error', 'Media title not found'); return; }

    let watchData = null;
    const provider = FORCED_PROVIDER || activeProviders[0];

    if (ANIME_PROVIDERS.includes(provider)) {
        watchData = await fetchAnimeSourcesByProvider(provider, title, curEpisode + 1);
    } else if (provider === 'goku') {
        watchData = await fetchSourcesFromGoku(TMDB_ID, MEDIA_TYPE);
    } else {
        const url = `${activeApiBase}/watch?id=${TMDB_ID}&type=${MEDIA_TYPE}${MEDIA_TYPE === 'tv' ? `&s=${curSeason + 1}&e=${curEpisode + 1}` : ''}&provider=${provider}`;
        watchData = await fetchJsonWithRetry(url, REQ_TIMEOUT.watch, REQ_TIMEOUT.watch + 10000);
    }

    if (!watchData?.sources?.length) {
        showError('No Sources', 'Try switching provider or quality.');
        return;
    }

    allSources = watchData.sources.map(s => ({
        label: s.quality || 'Auto',
        url: s.url,
        isM3U8: s.isM3U8 || s.url.includes('.m3u8'),
        referer: watchData.headers?.Referer || watchData.headers?.referer || '',
        provider: provider
    }));

    externalSubtitleTracks = watchData.subtitles || [];
    playSource(0);
}

function playSource(idx) {
    currentIdx = idx;
    const s = allSources[idx];
    if (!s) return;
    loadStream(s.url, s.isM3U8, false, s.referer, idx);
}

function proxiedStreamUrl(url, referer) {
    if (!url) return '';
    const proxyBase = activeApiBase.replace('/meta/tmdb', '/utils/proxy/stream');
    const u = new URL(proxyBase);
    u.searchParams.set('url', url);
    if (referer) u.searchParams.set('referer', referer);
    return u.toString();
}

async function loadStream(url, isM3U8, isEmbed, referer, srcIdx, startTime = 0) {
    setLoader('Loading', 'Preparing player...');
    const wrap = document.querySelector('.player-wrap');
    if (plyr) { plyr.destroy(); plyr = null; }
    if (hlsInst) { hlsInst.destroy(); hlsInst = null; }

    // START FIX: Satoru background fetch for JustAnime (Multi-Language)
    const currentProvider = allSources[srcIdx]?.provider || FORCED_PROVIDER;
    // We only reset and fetch if we are on JustAnime (to find dubs) OR if we are on Satoru but haven't loaded them yet.
    if (currentProvider === 'justanime' || (currentProvider === 'satoru' && satoruAudioSources.length === 0)) {
        if (currentProvider === 'justanime') satoruAudioSources = [];
        const title = currentMediaInfo?.title || currentMediaInfo?.name || '';
        if (title) {
            (async () => {
                try {
                    const year = getPreferredMediaYear();
                    const base = getAnimeProviderBase('satoru');

                    // Search with specific language if we have one preferred, plus general search
                    const languageTerms = preferredAudioToken && !['sub', 'dub'].includes(preferredAudioToken)
                        ? [`${title} ${preferredAudioToken}`]
                        : [];
                    const allTerms = [...new Set([...languageTerms, ...getAnimeSearchTerms(title, year)])];

                    let searchResults = [];
                    for (const q of allTerms) {
                        try {
                            const searchData = await fetchJsonWithRetry(`${base}/${encodeURIComponent(q)}`, 5000, 8000);
                            const res = getAnimeSearchResults(searchData);
                            if (res.length) {
                                searchResults.push(...res);
                                // If we searched for a specific language and found it, prioritize it
                                if (q.includes(preferredAudioToken)) break;
                            }
                        } catch (_) { }
                    }

                    if (searchResults.length === 0) return;

                    const normTitle = normalizeTitleForMatch(title);
                    const dubKeywords = ['hindi', 'tamil', 'telugu', 'malayalam', 'kannada', 'marathi', 'bengali', 'english', 'multi', 'dub'];
                    const languageMap = new Map(); // dubType -> best item

                    for (const item of searchResults) {
                        const rawTitle = (item.title || item.name || '').toLowerCase();
                        const normItemTitle = normalizeTitleForMatch(rawTitle);
                        if (!normItemTitle.includes(normTitle) && !normTitle.includes(normItemTitle)) continue;

                        // Find all languages mentioned in this title
                        const languagesFound = dubKeywords.filter(k => rawTitle.includes(k));

                        languagesFound.forEach(lang => {
                            const dubType = lang.charAt(0).toUpperCase() + lang.slice(1);

                            // Heuristic: If title is EXACTLY "Anime [Lang]" or "(Lang)", it's better than "[Multi]"
                            let score = 50;
                            const isSpecificLangMatch = rawTitle === `${normTitle} ${lang}` || rawTitle.includes(`(${lang})`) || rawTitle.includes(`[${lang}]`);
                            if (isSpecificLangMatch) score += 100;
                            if (lang === preferredAudioToken) score += 80;
                            if (!rawTitle.includes('multi')) score += 30;
                            if (rawTitle.includes('dub')) score += 10;

                            const existing = languageMap.get(dubType);
                            if (!existing || score > existing.score) {
                                languageMap.set(dubType, { item, score });
                            }
                        });

                        // If no keywords found but it's a good title match, add as Default
                        if (languagesFound.length === 0 && !languageMap.has('Default')) {
                            languageMap.set('Default', { item, score: 30 });
                        }
                    }

                    const candidates = Array.from(languageMap.entries())
                        .map(([dubType, data]) => ({ item: data.item, dubType }))
                        .sort((a, b) => {
                            // Prioritize the preferred audio token if it matches
                            const aMatch = a.dubType.toLowerCase() === preferredAudioToken;
                            const bMatch = b.dubType.toLowerCase() === preferredAudioToken;
                            if (aMatch && !bMatch) return -1;
                            if (!aMatch && bMatch) return 1;
                            return 0;
                        })
                        .slice(0, 6);

                    // Fetch watch links for each candidate
                    for (const cand of candidates) {
                        try {
                            const info = await fetchJsonWithRetry(buildAnimeInfoUrl('satoru', cand.item.id), 5000, 8000);
                            const eps = info?.episodes || info?.data?.episodes || [];
                            const target = eps.find(ep => ep.number === curEpisode + 1 || ep.episode === curEpisode + 1) || eps[curEpisode];
                            if (target?.id) {
                                const watch = await fetchJsonWithRetry(buildAnimeWatchUrl('satoru', target.id), 8000, 15000);
                                if (watch?.sources?.length) {
                                    const sources = watch.sources.map(s => ({
                                        label: s.quality || 'Auto',
                                        url: s.url,
                                        isM3U8: true,
                                        referer: watch.headers?.Referer || watch.headers?.referer || '',
                                        provider: 'satoru',
                                        dubType: cand.dubType,
                                        animeId: cand.item.id // track which item produced this
                                    }));
                                    satoruAudioSources.push(...sources);
                                    updateAudioTracks();
                                }
                            }
                        } catch (_) { }
                    }
                } catch (err) {
                    console.error('[satoru-background-fetch] Error:', err);
                }
            })();
        }
    }
    // END FIX

    if (isM3U8) {
        if (Hls.isSupported()) {
            wrap.innerHTML = '<video id="player-video" playsinline></video>';
            video = document.getElementById('player-video');
            hlsInst = new Hls({
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
                startLevel: -1,
                capLevelToPlayerSize: true
            });
            hlsInst.loadSource(proxiedStreamUrl(url, referer));
            hlsInst.attachMedia(video);
            hlsInst.on(Hls.Events.MANIFEST_PARSED, () => {
                initPLYR();
                updateAudioTracks();
                if (startTime > 0) video.currentTime = startTime;
                video.play().catch(() => hideLoader());
            });
            hlsInst.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            hlsInst.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            hlsInst.recoverMediaError();
                            break;
                        default:
                            showError('Stream Error', 'Failed to recover stream.');
                            break;
                    }
                }
            });
        }
    } else {
        wrap.innerHTML = `<video id="player-video" src="${proxiedStreamUrl(url, referer)}" playsinline></video>`;
        video = document.getElementById('player-video');
        initPLYR();
        video.play().catch(() => hideLoader());
    }
}

function initPLYR() {
    if (!video) return;
    plyr = new Plyr(video, {
        controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'],
        settings: ['quality', 'speed'],
        quality: { default: 0, options: [0], forced: true, onChange: changeQuality }
    });
    bindVideoEvents();
    hideLoader();
}

function updateAudioTracks() {
    if (!customAudioBtn) return;
    const menu = document.getElementById('audioMenu');
    if (!menu) return;
    menu.innerHTML = '';

    // Add original sources
    allSources.forEach((s, i) => {
        const item = document.createElement('div');
        item.className = `menu-item ${i === currentIdx ? 'selected' : ''}`;
        item.textContent = s.label;
        item.onclick = () => { playSource(i); toggleAudioPanel(false); };
        menu.appendChild(item);
    });

    // Add satoru virtual audio tracks
    satoruAudioSources.forEach(s => {
        const item = document.createElement('div');
        item.className = 'menu-item';
        item.textContent = `${s.dubType} (Satoru) - ${s.label}`;
        item.onclick = () => {
            preferredAudioToken = s.dubType.toLowerCase();
            updateEpisodeUrlState(curSeason, curEpisode);
            loadStream(s.url, s.isM3U8, false, s.referer, currentIdx);
            toggleAudioPanel(false);
        };
        menu.appendChild(item);
    });
}

function changeQuality(q) {
    if (!hlsInst) return;
    const levels = hlsInst.levels;
    const idx = levels.findIndex(l => l.height === q);
    hlsInst.currentLevel = idx;
}

function toggleAudioPanel(show) {
    const p = document.getElementById('audio-panel');
    if (p) p.classList.toggle('active', show);
}

function initCustomControls() {
    customAudioBtn?.addEventListener('click', () => toggleAudioPanel());
    sourceBtn?.addEventListener('click', () => { sourcePanel.classList.toggle('active'); });
    epBtn?.addEventListener('click', () => { epPanel.classList.toggle('active'); });
}

function bindVideoEvents() {
    if (!video) return;
    video.addEventListener('play', () => setPlayIcon(true));
    video.addEventListener('pause', () => setPlayIcon(false));
    video.addEventListener('volumechange', updateMuteIcon);
}

async function init() {
    setLoader('Initializing', 'Loading media metadata...');
    const metaUrl = `${activeApiBase}/info?id=${TMDB_ID}&type=${MEDIA_TYPE}`;
    try {
        const res = await fetchJsonWithRetry(metaUrl, REQ_TIMEOUT.metaInfo);
        currentMediaInfo = res;
        if (MEDIA_TYPE === 'tv') {
            tvSeasons = buildTvSeasonsFromInfo(res);
            const pos = getInitialTvPositionFromUrl(tvSeasons);
            curSeason = pos.seasonIndex;
            curEpisode = pos.episodeIndex;
            buildEpPanel();
        }
        currentIsLikelyAnime = ANIME_PROVIDERS.includes(FORCED_PROVIDER) || res.genres?.some(g => g.name === 'Animation');
        activeProviders = currentIsLikelyAnime ? ANIME_PROVIDERS : MOVIE_PROVIDERS;
        fetchSources();
    } catch (err) {
        showError('Initialization Failed', err.message);
    }
}

function buildEpPanel() {
    if (!epPanel) return;
    epPanel.innerHTML = '';
    const s = tvSeasons[curSeason];
    if (!s) return;
    s.episodes.forEach((ep, i) => {
        const btn = document.createElement('div');
        btn.className = `ep-item ${i === curEpisode ? 'active' : ''}`;
        btn.textContent = `E${ep.episode || i + 1}`;
        btn.onclick = () => {
            curEpisode = i;
            updateEpisodeUrlState(curSeason, curEpisode);
            buildEpPanel();
            fetchSources();
        };
        epPanel.appendChild(btn);
    });
}

// Global UI state
function toggleSourcePanel() { sourcePanel.classList.toggle('active'); }
function toggleEpPanel() { epPanel.classList.toggle('active'); }

// -----------------------------------------------------------------------
//  START
// -----------------------------------------------------------------------
initCustomControls();
init();
