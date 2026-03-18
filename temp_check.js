
// -----------------------------------------------------------------------
//  CONFIG
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const RUNTIME_CONFIG = window.__STREAMVERSE_CONFIG__ || {};
const LOCAL_META_API = String(
    RUNTIME_CONFIG.LOCAL_META_API_BASE ||
    RUNTIME_CONFIG.LOCAL_API_BASE ||
    'http://localhost:3000/meta/tmdb'
);
const PROD_META_API = String(
    RUNTIME_CONFIG.PROD_META_API_BASE ||
    RUNTIME_CONFIG.PROXY_META_API_BASE ||
    RUNTIME_CONFIG.META_API_BASE ||
    'http://localhost:3000/meta/tmdb'
);
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
    DEFAULT_META_API,
    'http://localhost:3000/meta/tmdb',
    'http://127.0.0.1:3000/meta/tmdb',
    'http://localhost:3000/meta/tmdb',
    'http://127.0.0.1:10000/meta/tmdb',
    'http://localhost:10000/meta/tmdb',
].filter(Boolean);
const API_BASE = API_BASE_CANDIDATES[0] || DEFAULT_META_API;
let activeApiBase = API_BASE;
let preferredSourceLabelMatch = null; // Memory for Sub/Dub preference
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
            /* Skip Vercel check removed */
            try {
                const out = await attemptFetch(base, 2);
                activeApiBase = base;
                return out;
            } catch (_) {
            }
        }
        throw err;
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
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let plyr = null;
    let hlsInst = null;
    let dashInst = null;
    let allSources = [];   // [{label, url, isM3U8, referer, provider}]
    let externalSubtitleTracks = []; // [{label, srclang, src, provider}]
    const animeSubtitleCache = new Map();
    let subtitleBlobUrls = [];
    let subtitleApplyVersion = 0;
    let activeSubtitleTrackIndex = -1;
    let _iosNativePlayerActive = false;
    let _suppressNativeTrackChange = false;
    const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    let currentIdx = 0;
    let currentMediaInfo = null;
    let tvSeasons = [];
    let curSeason = 0;
    let curEpisode = 0;
    let curEpisodeId = null;
    let currentIsLikelyAnime = false;
    let activeProviders = [...MOVIE_PROVIDERS]; // Initialize with movie providers; refined in init() later
    let preferredAudioToken = URL_AUDIO || '';
    let headerTimer;
    let controlsHideTimer;
    let isUiLocked = false;
    let animeSkipSegments = { intro: null, outro: null };
    let skippedSegments = { intro: false, outro: false };
    let hasApiSkipSegments = false;
    let lastSuccessfulProvider = '';
    let satoruAudioSources = []; // background-fetched satoru sources used as virtual audio tracks
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
    let episodeFillerStatus = new Map(); // episodeNo -> 'manga' | 'mixed' | 'filler'
    let fillerLookupState = 'idle'; // idle | loading | ready | not_found | fetch_failed
    let animeFillerIndexCache = null;
    let fitIndex = 0;
    let volumeSliderEl = null;
    let volumeToggleEl = null;
    let volumeBoost = 100; // 100% to 200%
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
    // ———————————————————————————————————————————————————————————————————————
}
function setLoader(title, sub) {
    document.getElementById('loader-title').textContent = title;
    document.getElementById('loader-sub').textContent = sub;
    loader.style.display = 'flex';
    loader.style.opacity = '1';
}
function hideLoader() {
    loader.style.opacity = '0';
    setTimeout(() => loader.style.display = 'none', 500);
}
function showError(title, msg) {
    hideLoader();
    document.getElementById('err-title').textContent = title;
    document.getElementById('err-msg').textContent = msg;
    errorBox.style.display = 'block';
}
function hideError() {
    errorBox.style.display = 'none';
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
    FORCED_PROVIDER = providerName || ''; // update in-memory so next episode uses it
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
    const seasonNo = Number.isFinite(seasonNoRaw) && seasonNoRaw > 0
        ? seasonNoRaw
        : Number(seasonIndex || 0) + 1;
    const epRef = seasonRef?.episodes?.[Number(episodeIndex || 0)];
    const epNoRaw = Number(epRef?.episode || epRef?.number || epRef?.episodeNum);
    const episodeNo = Number.isFinite(epNoRaw) && epNoRaw > 0
        ? epNoRaw
        : Number(episodeIndex || 0) + 1;
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
        if (bySeasonNo >= 0) {
            si = bySeasonNo;
        } else {
            si = Math.max(0, Math.min(safeSeasons.length - 1, URL_SEASON - 1));
        }
        const eps = safeSeasons[si]?.episodes || [];
        if (Number.isFinite(URL_EPISODE) && URL_EPISODE > 0) {
            const byEpisodeNo = eps.findIndex((ep) => {
                const n = Number(ep?.episode || ep?.number || ep?.episodeNum || 0);
                return Number.isFinite(n) && n === URL_EPISODE;
            });
            if (byEpisodeNo >= 0) {
                ei = byEpisodeNo;
            } else {
                ei = Math.max(0, Math.min(eps.length - 1, URL_EPISODE - 1));
            }
            return { seasonIndex: si, episodeIndex: ei };
        }
    }
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
    if (fromSeasonBuckets.length > 0) {
        return fromSeasonBuckets;
    }
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
    const cleaned = raw
        .replace(/\b(tv|season|part|cour|movie|ona|ova)\b/g, ' ')
        .replace(/[^\w\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const tokens = cleaned.split(' ').filter(Boolean);
    if (!tokens.length) return [];
    const full = tokens.join('-');
    const first3 = tokens.slice(0, 3).join('-');
    const first2 = tokens.slice(0, 2).join('-');
    const candidates = [full, first3, first2].filter(Boolean);
    return [...new Set(candidates)];
}
function parseEpisodeRangeToken(token) {
    const t = String(token || '')
        .replace(/[â€“â€”âˆ’]/g, '-')
        .replace(/\bto\b/gi, '-')
        .replace(/[^\d,\-\s]/g, '')
        .trim();
    if (!t) return [];
    const m = t.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
        const start = Number(m[1]);
        const end = Number(m[2]);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
        const out = [];
        for (let i = start; i <= end; i += 1) out.push(i);
        return out;
    }
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? [n] : [];
}
function parseEpisodeListFromLine(line) {
    if (!line) return [];
    return line
        .replace(/\.\s*$/, '')
        .replace(/[â€“â€”âˆ’]/g, '-')
        .split(/[,;|]/)
        .flatMap(parseEpisodeRangeToken);
}
function parseAnimeFillerMapFromText(text) {
    const out = new Map();
    const body = String(text || '').replace(/[â€“â€”âˆ’]/g, '-');
    const capture = (re) => {
        const m = body.match(re);
        return m?.[1] ? String(m[1]).trim() : '';
    };
    const mangaRaw = capture(/manga\s*canon\s*episodes?\s*:?\s*([0-9,\-\s]+)/i);
    const mixedRaw = capture(/mixed\s*canon\s*\/\s*filler\s*episodes?\s*:?\s*([0-9,\-\s]+)/i);
    const fillerRaw = capture(/filler\s*episodes?\s*:?\s*([0-9,\-\s]+)/i);
    const mark = (eps, status) => {
        eps.forEach((epNo) => {
            if (!Number.isFinite(epNo)) return;
            if (status === 'filler') {
                out.set(epNo, status);
                return;
            }
            if (status === 'mixed') {
                if (out.get(epNo) !== 'filler') out.set(epNo, status);
                return;
            }
            if (!out.has(epNo)) out.set(epNo, status);
        });
    };
    if (mangaRaw) mark(parseEpisodeListFromLine(mangaRaw), 'manga');
    if (mixedRaw) mark(parseEpisodeListFromLine(mixedRaw), 'mixed');
    if (fillerRaw) mark(parseEpisodeListFromLine(fillerRaw), 'filler');
    // Fallback parser for markdown/html table rows containing per-episode labels.
    if (out.size === 0) {
        const rowRe = /(?:episode|ep)\s*#?\s*(\d+)[^\n\r]{0,120}?(manga canon|mixed canon\/filler|mixed canon filler|filler)/ig;
        let m;
        while ((m = rowRe.exec(body)) !== null) {
            const epNo = Number(m[1]);
            const rawType = String(m[2] || '').toLowerCase();
            if (!Number.isFinite(epNo)) continue;
            if (rawType.includes('mixed')) {
                if (out.get(epNo) !== 'filler') out.set(epNo, 'mixed');
            } else if (rawType.includes('manga canon')) {
                if (!out.has(epNo)) out.set(epNo, 'manga');
            } else if (rawType.includes('filler')) {
                out.set(epNo, 'filler');
            }
        }
    }
    return out;
}

function parseEpisodeValueToList(value) {
    if (Array.isArray(value)) {
        return value.flatMap((v) => parseEpisodeValueToList(v));
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? [value] : [];
    }
    if (typeof value === 'string') {
        return parseEpisodeListFromLine(value);
    }
    return [];
}
function parseFillerMapFromJsonPayload(payload) {
    const out = new Map();
    const mark = (episodes, status) => {
        episodes.forEach((epNo) => {
            if (!Number.isFinite(epNo)) return;
            if (status === 'filler') {
                out.set(epNo, status);
            } else if (status === 'mixed') {
                if (out.get(epNo) !== 'filler') out.set(epNo, status);
            } else if (!out.has(epNo)) {
                out.set(epNo, status);
            }
        });
    };
    const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            node.forEach(visit);
            return;
        }
        Object.entries(node).forEach(([k, v]) => {
            const key = String(k || '').toLowerCase();
            if (key.includes('mixed')) {
                mark(parseEpisodeValueToList(v), 'mixed');
            } else if (key.includes('manga') || key.includes('canon')) {
                mark(parseEpisodeValueToList(v), 'manga');
            } else if (key.includes('filler')) {
                mark(parseEpisodeValueToList(v), 'filler');
            } else if (typeof v === 'object') {
                visit(v);
            }
        });
    };
    visit(payload);
    return out;
}

async function fetchGithubFillerMap(title, slugCandidates) {
    try {
        const meta = await fetchJsonWithFallbacks('https://data.jsdelivr.com/v1/package/gh/xsunzukz/anime-filler-episodes-api', 22000);
        const root = meta?.data;
        if (!root || typeof root !== 'object') return new Map();
        const files = [];
        const walk = (nodes, prefix = '') => {
            if (!Array.isArray(nodes)) return;
            nodes.forEach((n) => {
                const name = String(n?.name || '');
                const type = String(n?.type || '');
                const path = prefix ? `${prefix}/${name}` : name;
                if (type === 'file' && name.toLowerCase().endsWith('.json')) files.push(path);
                if (type === 'directory') walk(n.files || [], path);
            });
        };
        walk(root.files || []);
        if (!files.length) return new Map();
        const normTitle = normalizeTitleForMatch(title);
        const titleTokens = new Set(normTitle.split(' ').filter(Boolean));
        const wanted = new Set((slugCandidates || []).map((s) => String(s || '').toLowerCase()));
        let ranked = files.map((f) => {
            const lf = f.toLowerCase();
            const base = lf.split('/').pop() || lf;
            const stem = base.replace(/\.json$/i, '');
            const normStem = normalizeTitleForMatch(stem);
            const stemTokens = normStem.split(' ').filter(Boolean);
            let score = 0;
            if (wanted.has(stem) || wanted.has(lf.replace(/\.json$/i, ''))) score += 60;
            if (normStem === normTitle) score += 120;
            if (normStem.includes(normTitle) || normTitle.includes(normStem)) score += 25;
            let overlap = 0;
            stemTokens.forEach((t) => { if (titleTokens.has(t)) overlap += 1; });
            score += overlap * 8;
            if (lf.includes('filler')) score += 5;
            return { file: f, score };
        });
        ranked = ranked.filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
        if (!ranked.length) return new Map();
        for (const candidate of ranked) {
            const rawUrl = `https://cdn.jsdelivr.net/gh/xsunzukz/anime-filler-episodes-api@main/${candidate.file}`;
            const payload = await fetchJsonWithFallbacks(rawUrl, 22000);
            const data = payload?.data;
            if (!data) continue;
            const parsed = parseFillerMapFromJsonPayload(data);
            if (parsed.size > 0) {
                console.log('[filler] github matched file=', candidate.file, 'episodes=', parsed.size);
                return parsed;
            }
        }
    } catch (_) {
    }
    return new Map();
}
function normalizeTitleForMatch(v) {
    return String(v || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\(([^)]*)\)/g, ' ')
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
async function fetchTextWithFallbacks(targetUrl, timeoutMs = 20000) {
    const candidates = [
        targetUrl
    ];
    let hadNetworkFailure = false;
    for (const url of candidates) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
            if (!res.ok) continue;
            const text = await res.text();
            if (String(text || '').trim().length < 20) continue;
            return { text, networkFailed: false };
        } catch (_) {
            hadNetworkFailure = true;
        }
        return { text: '', networkFailed: hadNetworkFailure };
    }
}
async function fetchJsonWithFallbacks(targetUrl, timeoutMs = 20000) {
    const { text, networkFailed } = await fetchTextWithFallbacks(targetUrl, timeoutMs);
    if (!text) return { data: null, networkFailed };
    try {
        return { data: JSON.parse(text), networkFailed: false };
    } catch (_) {
        return { data: null, networkFailed };
    }
}
async function fetchAnimeFillerIndexEntries() {
    if (Array.isArray(animeFillerIndexCache)) return animeFillerIndexCache;
    try {
        const { text } = await fetchTextWithFallbacks('https://www.animefillerlist.com/shows', 22000);
        if (!text) return [];
        const entries = [];
        const re = /\[([^\]]+)\]\((?:https?:\/\/www\.animefillerlist\.com)?\/shows\/([a-z0-9-]+)\/?\)/ig;
        let m;
        while ((m = re.exec(text)) !== null) {
            const name = String(m[1] || '').trim();
            const slug = String(m[2] || '').trim();
            if (!name || !slug) continue;
            entries.push({ name, slug, norm: normalizeTitleForMatch(name) });
        }
        if (entries.length === 0) {
            const htmlRe = /<a[^>]+href="\/shows\/([a-z0-9-]+)\/?"[^>]*>([^<]+)<\/a>/ig;
            while ((m = htmlRe.exec(text)) !== null) {
                const slug = String(m[1] || '').trim();
                const name = String(m[2] || '').trim();
                if (!name || !slug) continue;
                entries.push({ name, slug, norm: normalizeTitleForMatch(name) });
            }
        }
        animeFillerIndexCache = entries;
        return entries;
    } catch (_) {
        return [];
    }
}
function pickBestFillerIndexSlug(title, entries) {
    const norm = normalizeTitleForMatch(title);
    if (!norm || !Array.isArray(entries) || !entries.length) return '';
    const titleTokens = new Set(norm.split(' ').filter(Boolean));
    let best = { score: 0, slug: '' };
    entries.forEach((entry) => {
        const entryNorm = entry.norm || '';
        if (!entryNorm) return;
        let score = 0;
        if (entryNorm === norm) score += 100;
        if (entryNorm.includes(norm) || norm.includes(entryNorm)) score += 35;
        const entryTokens = entryNorm.split(' ').filter(Boolean);
        let overlap = 0;
        entryTokens.forEach((t) => { if (titleTokens.has(t)) overlap += 1; });
        score += overlap * 8;
        if (score > best.score) best = { score, slug: entry.slug };
    });
    return best.score >= 16 ? best.slug : '';
}
function toArrayPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.results)) return payload.results;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
}

function pickBestMalSearchResult(title, results) {
    const norm = normalizeTitleForMatch(title);
    if (!norm) return null;
    const titleTokens = new Set(norm.split(' ').filter(Boolean));
    let best = { score: 0, item: null };
    for (const item of results || []) {
        const name = String(item?.title || item?.name || item?.title_english || item?.titleEnglish || '').trim();
        const itemNorm = normalizeTitleForMatch(name);
        if (!itemNorm) continue;
        let score = 0;
        if (itemNorm === norm) score += 120;
        else if (itemNorm.includes(norm) || norm.includes(itemNorm)) score += 30;
        const tokens = itemNorm.split(' ').filter(Boolean);
        let overlap = 0;
        tokens.forEach((t) => { if (titleTokens.has(t)) overlap += 1; });
        score += overlap * 8;
        if (score > best.score) best = { score, item };
    }
    return best.score > 0 ? best.item : null;
}

function normalizeSubtitleEntries(watchData, provider, referer = null) {
    const toArray = (v) => Array.isArray(v) ? v : [];
    const all = [
        ...toArray(watchData?.subtitles),
        ...toArray(watchData?.captions),
        ...toArray(watchData?.tracks)
    ];
    const out = [];
    all.forEach((item, idx) => {
        const kind = String(item?.kind || '').toLowerCase();
        if (kind && kind !== 'captions' && kind !== 'subtitles') return;
        const src = item?.url || item?.file || item?.src;
        if (!src || typeof src !== 'string') return;
        const rawLang = String(item?.lang || item?.language || item?.label || `Track ${idx + 1}`).trim();
        const langLower = rawLang.toLowerCase();
        let srclang = 'en';
        if (langLower === 'ja' || langLower === 'jpn' || langLower.includes('japanese')) srclang = 'ja';
        else if (langLower === 'en' || langLower === 'eng' || langLower.includes('english')) srclang = 'en';
        else if (/^[a-z]{2,3}$/i.test(rawLang)) srclang = rawLang.toLowerCase();
        out.push({
            label: item?.label || item?.language || rawLang,
            srclang,
            src,
            provider,
            referer
        });
    });
    const seen = new Set();
    return out.filter((t) => {
        const key = `${t.src}|${t.srclang}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

async function resolveSubtitleTrackSrc(sub) {
    const rawSrc = String(sub?.src || '').trim();
    if (!rawSrc) return '';
    const proxied = proxiedStreamUrl(rawSrc, sub?.referer || null);
    const toVttBlobUrl = (text) => {
        const vttText = String(text || '');
        const blob = new Blob([vttText], { type: 'text/vtt' });
        const url = URL.createObjectURL(blob);
        subtitleBlobUrls.push(url);
        return url;
    };
    const sanitizeText = (text) => String(text || '').replace(/\r+/g, '').replace(/^\uFEFF/, '');
    const srtToVtt = (srtText) => {
        const clean = sanitizeText(srtText);
        return `WEBVTT\n\n${clean.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`;
    };
    const assTimeToVtt = (t) => {
        const m = String(t || '').trim().match(/^(\d+):(\d{1,2}):(\d{1,2})[.](\d{1,2})$/);
        if (!m) return '';
        const hh = String(Number(m[1] || 0)).padStart(2, '0');
        const mm = String(Number(m[2] || 0)).padStart(2, '0');
        const ss = String(Number(m[3] || 0)).padStart(2, '0');
        const ms = String(Math.round(Number(`0.${m[4] || '0'}`) * 1000)).padStart(3, '0');
        return `${hh}:${mm}:${ss}.${ms}`;
    };
    const assToVtt = (assText) => {
        const lines = sanitizeText(assText).split('\n');
        const cues = [];
        let idx = 1;
        for (const line of lines) {
            const m = line.match(/^Dialogue:\s*[^,]*,([^,]+),([^,]+),[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,(.*)$/i);
            if (!m) continue;
            const start = assTimeToVtt(m[1]);
            const end = assTimeToVtt(m[2]);
            if (!start || !end) continue;
            const text = String(m[3] || '')
                .replace(/\{[^}]*\}/g, '')
                .replace(/\\N/gi, '\n')
                .replace(/\\n/g, '\n')
                .trim();
            if (!text) continue;
            cues.push(`${idx++}\n${start} --> ${end}\n${text}`);
        }
        if (!cues.length) return '';
        return `WEBVTT\n\n${cues.join('\n\n')}`;
    };
    try {
        const looksLikeSrt = /\.srt(\?|$)/i.test(rawSrc);
        const looksLikeAss = /\.ass(\?|$)/i.test(rawSrc) || /\.ssa(\?|$)/i.test(rawSrc);
        const txtRes = await fetch(proxied, { signal: AbortSignal.timeout(12000) });
        if (txtRes.ok) {
            const txt = await txtRes.text();
            const lower = txt.trim().toLowerCase();
            const hasCueArrow = txt.includes('-->');
            const hasSrtTimestamp = /\d{2}:\d{2}:\d{2},\d{3}/.test(txt);
            const looksAssBody = /^\s*\[script info\]/i.test(txt) || /^\s*\[events\]/im.test(txt) || /dialogue:\s*[^,]*,\d+:\d{1,2}:\d{1,2}\.\d{1,2}/i.test(txt);
            if (!lower.startsWith('<!doctype html') && !lower.startsWith('<html')) {
                if (looksLikeSrt || (hasCueArrow && hasSrtTimestamp)) return toVttBlobUrl(srtToVtt(txt));
                if (looksLikeAss || looksAssBody) {
                    const converted = assToVtt(txt);
                    if (converted) return toVttBlobUrl(converted);
                }
                if (lower.startsWith('webvtt') || hasCueArrow) return toVttBlobUrl(sanitizeText(txt));
            }
        }
    } catch (_) { }
    try {
        const testRes = await fetch(proxied, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
        if (testRes.ok) return proxied;
    } catch (_) { }
    return '';
}

async function applyExternalSubtitlesToVideo(videoEl) {
    if (!videoEl) return;
    const applyVersion = ++subtitleApplyVersion;
    // subtitleBlobUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch (_) { } });
    // subtitleBlobUrls = [];
    if (!Array.isArray(externalSubtitleTracks) || externalSubtitleTracks.length === 0) {
        updateCaptionsButtonVisibility();
        buildCaptionsMenu();
        return;
    }
    const prepared = await Promise.all(
        externalSubtitleTracks.map(async (sub) => ({
            ...sub,
            resolvedSrc: await resolveSubtitleTrackSrc(sub),
        })),
    );
    if (applyVersion !== subtitleApplyVersion) return;
    const resolved = prepared.filter((sub) => !!sub.resolvedSrc);
    if (!resolved.length) {
        updateCaptionsButtonVisibility();
        buildCaptionsMenu();
        return;
    }
    videoEl.querySelectorAll('track[data-ext-sub="1"]').forEach((t) => t.remove());
    resolved.forEach((sub, i) => {
        const track = document.createElement('track');
        track.kind = 'captions'; // captions work more reliably in native iOS menu
        track.label = sub.label || `Subtitle ${i + 1}`;
        track.srclang = sub.srclang || 'en';
        track.src = sub.resolvedSrc || '';
        track.dataset.extSub = '1';
        
        // On iOS, the 'default' attribute is the most reliable way to ensure the track 
        // is auto-selected in the native system menu when entering fullscreen.
        if (activeSubtitleTrackIndex >= 0 && i === activeSubtitleTrackIndex) {
            track.default = true;
        }
        
        // track.crossOrigin is not a valid property; handled by video element
        track.addEventListener('load', () => {
            updateCaptionsButtonVisibility();
            buildCaptionsMenu();
        });
        videoEl.appendChild(track);
    });
    setTimeout(() => {
        bindSubtitleCueListeners();
        bindNativeTrackChangeListener();
        const preferredLabel = localStorage.getItem('preferredSubtitleLabel');
        const tracks = Array.from(videoEl.textTracks || []);
        let bestIdx = -1;
        if (preferredLabel && tracks.length) bestIdx = tracks.findIndex(t => t.label === preferredLabel);
        if (bestIdx === -1) bestIdx = getDefaultEnglishSubtitleIndex();
        selectSubtitleTrack(bestIdx);
        updateCaptionsButtonVisibility();
        buildCaptionsMenu();
    }, 200);
}

function mergeSubtitleTrackLists(primary, secondary) {
    const p = Array.isArray(primary) ? primary : [];
    const s = Array.isArray(secondary) ? secondary : [];
    const merged = [...p, ...s].filter((t) => t && (t.src || t.url));
    const seen = new Set();
    return merged.filter((t) => {
        const key = `${String(t.src || t.url)}| ${String(t.srclang || '').toLowerCase()} `;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
async function fetchAnimeSubtitleFallback() {
    if (!currentIsLikelyAnime) return [];
    const mediaTitle = normalizeAnimeSearchQuery(currentMediaInfo?.title || currentMediaInfo?.name || '');
    const preferredYear = getPreferredMediaYear();
    if (!mediaTitle) return [];
    const absoluteEpisodeNo = Number(
        tvSeasons
            .slice(0, Math.max(0, curSeason))
            .reduce((sum, season) => sum + (Array.isArray(season?.episodes) ? season.episodes.length : 0), 0),
    ) + (curEpisode + 1);
    const subtitleCacheKey = `${mediaTitle.toLowerCase()}::${preferredYear || ''}::ep${absoluteEpisodeNo} `;
    if (animeSubtitleCache.has(subtitleCacheKey)) {
        return animeSubtitleCache.get(subtitleCacheKey) || [];
    }
    animeSubtitleCache.set(subtitleCacheKey, []);
    return [];
}
function closeCustomMenus() {
    qualityMenu.classList.remove('active');
    captionsMenu.classList.remove('active');
    settingsMenu.classList.remove('active');
    volumeMenu.classList.remove('active');
}
function updateCaptionsButtonVisibility() {
    if (!captionsBtn || !video) return;
    const hasTracks = (video.querySelectorAll('track').length > 0)
        || (video.textTracks && video.textTracks.length > 0);
    const showForAnime = currentIsLikelyAnime === true;
    captionsBtn.style.display = (hasTracks || showForAnime) ? 'inline-flex' : 'none';
    if (!hasTracks && !showForAnime) captionsMenu.classList.remove('active');
}
function ensureSubtitleOverlay() {
    let overlay = document.getElementById('subtitleOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'subtitleOverlay';
        overlay.style.position = 'fixed';
        overlay.style.left = '8%';
        overlay.style.right = '8%';
        overlay.style.bottom = '12%';
        overlay.style.zIndex = '240';
        overlay.style.textAlign = 'center';
        overlay.style.pointerEvents = 'none';
        overlay.style.color = '#fff';
        overlay.style.fontSize = 'clamp(16px, 2.2vw, 30px)';
        overlay.style.fontWeight = '700';
        overlay.style.textShadow = '0 2px 6px rgba(0,0,0,.95), 0 0 12px rgba(0,0,0,.8)';
        overlay.style.lineHeight = '1.35';
        overlay.style.whiteSpace = 'pre-line';
        overlay.style.display = 'none';
        overlay.style.userSelect = 'none';
        document.body.appendChild(overlay);
    }
    return overlay;
}
function renderSubtitleOverlayFromTrack(track) {
    const overlay = ensureSubtitleOverlay();
    if (!track) {
        overlay.innerHTML = '';
        overlay.style.display = 'none';
        return;
    }
    const cues = track.activeCues ? Array.from(track.activeCues) : [];
    const text = cues.map((c) => c.text || '').filter(Boolean).join('\n');
    // Use innerHTML to allow basic formatting tags like <i>, <b> provided by VTT
    overlay.innerHTML = text;
    overlay.style.display = text ? 'block' : 'none';
}
function bindSubtitleCueListeners() {
    if (!video || !video.textTracks) return;
    const tracks = Array.from(video.textTracks);
    tracks.forEach((track) => {
        if (track.__overlayBound) return;
        track.addEventListener('cuechange', () => {
            const activeTrack = activeSubtitleTrackIndex >= 0
                ? (video.textTracks[activeSubtitleTrackIndex] || null)
                : null;
            renderSubtitleOverlayFromTrack(activeTrack);
        });
        track.__overlayBound = true;
    });
}
// Tracks whether iOS native player is currently in fullscreen
let _suppressNativeTrackChange = false; // New flag to prevent infinite loops

function silenceNativeTracks() {
    if (_iosNativePlayerActive) return;
    if (!video || !video.textTracks) return;
    _suppressNativeTrackChange = true;
    const tracks = Array.from(video.textTracks);
    tracks.forEach((t, i) => {
        const shouldBeActive = activeSubtitleTrackIndex >= 0 && i === activeSubtitleTrackIndex;
        if (shouldBeActive) {
            if (t.mode !== 'hidden') t.mode = 'hidden';
        } else {
            if (t.mode !== 'hidden') t.mode = 'hidden';
        }
    });
    setTimeout(() => { _suppressNativeTrackChange = false; }, 50);
}

function activateTracksForIOSNativePlayer() {
    if (!video || !video.textTracks) return;
    const tracks = Array.from(video.textTracks);
    console.log(`[sub] iOS Native Handoff: ${tracks.length} tracks, activeIdx=${activeSubtitleTrackIndex}`);

    const runActivation = () => {
        tracks.forEach((t, i) => {
            const shouldBeActive = activeSubtitleTrackIndex >= 0 && i === activeSubtitleTrackIndex;
            if (shouldBeActive) {
                // Force a 'kick' by flipping mode to trigger Safari internal redraw
                t.mode = 'disabled';
                setTimeout(() => { if (t) t.mode = 'showing'; }, 5);
            } else {
                if (t.mode !== 'disabled') t.mode = 'disabled';
            }
        });
    };

    runActivation();
    setTimeout(runActivation, 300);
    setTimeout(runActivation, 850);
    setTimeout(runActivation, 1600);
}

function deactivateTracksFromIOSNativePlayer() {
    _iosNativePlayerActive = false;
    silenceNativeTracks();
    bindSubtitleCueListeners();
    if (activeSubtitleTrackIndex >= 0 && video && video.textTracks) {
        renderSubtitleOverlayFromTrack(video.textTracks[activeSubtitleTrackIndex]);
    }
}

function selectSubtitleTrack(index) {
    if (!video || !video.textTracks) return;
    const tracks = Array.from(video.textTracks);
    activeSubtitleTrackIndex = (index >= 0 && index < tracks.length) ? index : -1;
    silenceNativeTracks();
    const activeTrack = activeSubtitleTrackIndex >= 0 ? tracks[activeSubtitleTrackIndex] : null;
    renderSubtitleOverlayFromTrack(activeTrack);
    buildCaptionsMenu();
    if (activeSubtitleTrackIndex >= 0) {
        localStorage.setItem('preferredSubtitleLabel', tracks[activeSubtitleTrackIndex].label);
    } else {
        localStorage.removeItem('preferredSubtitleLabel');
    }
}

function getDefaultEnglishSubtitleIndex() {
    if (!video || !video.textTracks) return -1;
    const tracks = Array.from(video.textTracks);
    const idx = tracks.findIndex((track) => {
        const label = String(track.label || '').toLowerCase();
        const language = String(track.language || '').toLowerCase();
        return (
            language === 'en' ||
            language === 'eng' ||
            language.startsWith('en-') ||
            label === 'en' ||
            label.includes('english')
        );
    });
    return idx >= 0 ? idx : (tracks.length > 0 ? 0 : -1);
}

function bindNativeTrackChangeListener() {
    if (!video || !video.textTracks) return;
    if (video.textTracks.__nativeChangeBound) return;
    video.textTracks.__nativeChangeBound = true;
    video.textTracks.addEventListener('change', () => {
        if (_suppressNativeTrackChange) return;
        const tracks = Array.from(video.textTracks);
        // Find if a track was set to 'showing' in the native menu
        const nativeShowingIdx = tracks.findIndex(t => t.mode === 'showing');
        if (nativeShowingIdx >= 0) {
            activeSubtitleTrackIndex = nativeShowingIdx;
            localStorage.setItem('preferredSubtitleLabel', tracks[nativeShowingIdx].label);
            // If in-page, immediately apply our overlay for consistency
            if (!_iosNativePlayerActive) {
                silenceNativeTracks();
                renderSubtitleOverlayFromTrack(tracks[nativeShowingIdx]);
            }
        } else if (!_iosNativePlayerActive) {
            // User selected 'Off' in native menu (while in-page)
            activeSubtitleTrackIndex = -1;
            localStorage.removeItem('preferredSubtitleLabel');
            renderSubtitleOverlayFromTrack(null);
        }
        buildCaptionsMenu();
    });
}

function buildCaptionsMenu() {
    if (!captionsMenu || !video) return;
    captionsMenu.innerHTML = '';
    const tracks = video.textTracks ? Array.from(video.textTracks) : [];
    const activeIdx = (activeSubtitleTrackIndex >= 0 && activeSubtitleTrackIndex < tracks.length) ? activeSubtitleTrackIndex : -1;
    if (tracks.length === 0 && currentIsLikelyAnime) {
        const emptyItem = document.createElement('div');
        emptyItem.className = 'menu-item';
        emptyItem.textContent = 'No subtitles loaded';
        emptyItem.style.opacity = '0.8';
        captionsMenu.appendChild(emptyItem);
        const retryItem = document.createElement('div');
        retryItem.className = 'menu-item';
        retryItem.textContent = 'Retry subtitle fetch';
        retryItem.onclick = async () => {
            try {
                const subs = await fetchAnimeSubtitleFallback();
                if (Array.isArray(subs) && subs.length) {
                    externalSubtitleTracks = mergeSubtitleTrackLists(externalSubtitleTracks, subs);
                    if (video) await applyExternalSubtitlesToVideo(video);
                }
            } catch (_) { }
            buildCaptionsMenu();
            updateCaptionsButtonVisibility();
        };
        captionsMenu.appendChild(retryItem);
        return;
    }
    const offItem = document.createElement('div');
    offItem.className = `menu - item ${activeIdx === -1 ? 'selected' : ''} `;
    offItem.textContent = 'Off';
    offItem.onclick = () => {
        selectSubtitleTrack(-1);
    };
    captionsMenu.appendChild(offItem);
    tracks.forEach((track, idx) => {
        const label = track.label || track.language || `Subtitle ${idx + 1} `;
        const item = document.createElement('div');
        item.className = `menu - item ${idx === activeIdx ? 'selected' : ''} `;
        item.textContent = label;
        item.onclick = () => {
            selectSubtitleTrack(idx);
        };
        captionsMenu.appendChild(item);
    });
}
function setVolumeBoost(level) {
    if (!video) return;
    volumeBoost = Math.max(0, Math.min(200, level));
    if (volumeBoost !== 100 || IS_IOS) {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (!sourceNode || sourceNode.mediaElement !== video) {
            try {
                if (sourceNode) sourceNode.disconnect();
                sourceNode = audioCtx.createMediaElementSource(video);
                if (!gainNode) gainNode = audioCtx.createGain();
                sourceNode.connect(gainNode);
                gainNode.connect(audioCtx.destination);
            } catch (e) {
                console.warn('AudioContext boost failed:', e);
                return;
            }
        }
    }
    syncGain();
    const boostValEl = document.querySelector('.boost-value');
    if (boostValEl) {
        boostValEl.textContent = volumeBoost > 100 ? `${volumeBoost}%` : 'Off';
    }
    const boostSlider = document.querySelector('.boost-slider');
    if (boostSlider) {
        boostSlider.value = String(volumeBoost);
        const percent = (volumeBoost - 100) + '%';
        boostSlider.style.setProperty('--boost-percent', percent);
    }
    const ticks = document.querySelectorAll('.tick');
    const activeCount = Math.round(((volumeBoost - 100) / 100) * (ticks.length - 1));
    ticks.forEach((t, i) => {
        t.classList.toggle('active', i <= activeCount && volumeBoost > 100);
    });
}

function syncGain() {
    if (!audioCtx || !gainNode) return;
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => { });
    }
    const elementVol = video.muted ? 0 : video.volume;
    const boostFactor = volumeBoost / 100;
    gainNode.gain.value = elementVol * boostFactor;
}

function formatTime(seconds) {
    if (!isFinite(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function setPlayIcon(isPlaying) {
    if (!playPauseBtn) return;
    playPauseBtn.innerHTML = isPlaying
        ? '<i class="fa-solid fa-pause"></i>'
        : '<i class="fa-solid fa-play"></i>';
}

function updateMuteIcon() {
    if (!muteBtn || !video) return;
    if (video.muted || video.volume === 0) muteBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
    else if (video.volume < 0.5) muteBtn.innerHTML = '<i class="fa-solid fa-volume-low"></i>';
    else muteBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
}

function updateVolumeFromClientX(clientX, slider) {
    if (!slider || !Number.isFinite(clientX) || !video) return;
    const rect = slider.getBoundingClientRect();
    if (!rect || !Number.isFinite(rect.width) || rect.width <= 0) return;
    const clamped = Math.min(rect.right, Math.max(rect.left, clientX));
    const percent = ((clamped - rect.left) / rect.width) * 100;
    const val = Math.max(0, Math.min(100, percent));
    slider.value = String(Math.round(val));
    slider.style.setProperty('--vol-percent', `${val}%`);
    video.volume = val / 100;
    video.muted = val === 0;
    updateMuteIcon();
}

function buildVolumeMenu() {
    if (!volumeMenu || !video) return;
    volumeMenu.innerHTML = '';
    volumeSliderEl = null;
    volumeToggleEl = null;
    const row = document.createElement('div');
    row.className = 'volume-row';
    const toggle = document.createElement('button');
    toggle.className = 'volume-toggle';
    toggle.type = 'button';
    toggle.innerHTML = video.muted || video.volume === 0
        ? '<i class="fa-solid fa-volume-xmark"></i>'
        : '<i class="fa-solid fa-volume-high"></i>';
    toggle.onclick = (e) => {
        e.stopPropagation();
        video.muted = !video.muted;
        if (!video.muted && video.volume === 0) video.volume = 0.5;
        updateMuteIcon();
        if (volumeSliderEl) {
            const next = Math.round((video.muted ? 0 : video.volume) * 100);
            volumeSliderEl.value = String(next);
            volumeSliderEl.style.setProperty('--vol-percent', `${next}%`);
        }
        if (volumeToggleEl) {
            volumeToggleEl.innerHTML = video.muted || video.volume === 0
                ? '<i class="fa-solid fa-volume-xmark"></i>'
                : '<i class="fa-solid fa-volume-high"></i>';
        }
    };
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '1';
    slider.className = 'volume-slider';
    slider.value = String(Math.round((video.muted ? 0 : video.volume) * 100));
    slider.style.setProperty('--vol-percent', `${slider.value}%`);
    slider.addEventListener('input', (e) => {
        const val = Math.max(0, Math.min(100, Number.parseInt(e.target.value || '0', 10)));
        video.volume = val / 100;
        video.muted = val === 0;
        slider.style.setProperty('--vol-percent', `${val}%`);
        updateMuteIcon();
        if (val < 100 && volumeBoost > 100) setVolumeBoost(100);
    });
    slider.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        slider.setPointerCapture?.(e.pointerId);
        updateVolumeFromClientX(e.clientX, slider);
    });
    slider.addEventListener('pointermove', (e) => {
        if (!slider.hasPointerCapture?.(e.pointerId)) return;
        updateVolumeFromClientX(e.clientX, slider);
    });
    slider.addEventListener('pointerup', (e) => {
        if (slider.hasPointerCapture?.(e.pointerId)) slider.releasePointerCapture?.(e.pointerId);
    });
    volumeSliderEl = slider;
    volumeToggleEl = toggle;
    row.appendChild(toggle);
    row.appendChild(slider);
    volumeMenu.appendChild(row);
    const boostRow = document.createElement('div');
    boostRow.className = 'volume-boost-row';
    const boostHeader = document.createElement('div');
    boostHeader.className = 'boost-header';
    const boostLabel = document.createElement('span');
    boostLabel.className = 'boost-label';
    boostLabel.textContent = 'Extra Volume';
    const boostValue = document.createElement('span');
    boostValue.className = 'boost-value';
    boostValue.textContent = volumeBoost > 100 ? `${volumeBoost}%` : 'Off';
    boostHeader.appendChild(boostLabel);
    boostHeader.appendChild(boostValue);
    boostRow.appendChild(boostHeader);
    const sliderCont = document.createElement('div');
    sliderCont.className = 'boost-slider-container';
    const ticksCont = document.createElement('div');
    ticksCont.className = 'boost-ticks';
    for (let i = 0; i < 6; i++) {
        const t = document.createElement('div');
        t.className = 'tick';
        ticksCont.appendChild(t);
    }
    sliderCont.appendChild(ticksCont);
    const bSlider = document.createElement('input');
    bSlider.type = 'range';
    bSlider.min = '100';
    bSlider.max = '200';
    bSlider.step = '2';
    bSlider.className = 'boost-slider';
    bSlider.value = String(volumeBoost);
    bSlider.oninput = (e) => {
        const val = parseInt(e.target.value, 10);
        if (video.volume < 1.0 && val > 100) {
            video.volume = 1.0;
            if (volumeSliderEl) {
                volumeSliderEl.value = '100';
                volumeSliderEl.style.setProperty('--vol-percent', '100%');
            }
        }
        setVolumeBoost(val);
    };
    sliderCont.appendChild(bSlider);
    boostRow.appendChild(sliderCont);
    volumeMenu.appendChild(boostRow);
    setTimeout(() => setVolumeBoost(volumeBoost), 0);
}

function syncTimeUI() {
    if (!video) return;
    durationTimeEl.textContent = formatTime(video.duration);
    if (isSeekDragging && Number.isFinite(pendingSeekPercent) && isFinite(video.duration) && video.duration > 0) {
        const previewTimeSec = (pendingSeekPercent / 100) * video.duration;
        currentTimeEl.textContent = formatTime(previewTimeSec);
        seekBar.style.setProperty('--seek-percent', `${pendingSeekPercent}%`);
        return;
    }
    currentTimeEl.textContent = formatTime(video.currentTime);
    if (isFinite(video.duration) && video.duration > 0) {
        const p = (video.currentTime / video.duration) * 100;
        seekBar.value = String(p);
        seekBar.style.setProperty('--seek-percent', p + '%');
    }
}

function updateSkipSegmentButton() {
    if (!video || !currentIsLikelyAnime || !hasApiSkipSegments) {
        if (skipSegmentBtn) skipSegmentBtn.style.display = 'none';
        return;
    }
    const nowSec = Number(video.currentTime || 0);
    const active = getActiveSkipSegment(nowSec);
    if (!active || skippedSegments[active.type]) {
        if (skipSegmentBtn) skipSegmentBtn.style.display = 'none';
        return;
    }
    if (skipSegmentBtn) {
        skipSegmentBtn.textContent = active.type === 'intro' ? 'Skip Intro' : 'Skip Outro';
        skipSegmentBtn.style.display = 'inline-flex';
        skipSegmentBtn.onclick = (e) => {
            e.stopPropagation();
            video.currentTime = active.end;
            skippedSegments[active.type] = true;
            skipSegmentBtn.style.display = 'none';
        };
    }
}

function showControlSurface() {
    if (isUiLocked || !video) return;
    controlSurface.classList.add('visible');
    playerHeader.classList.remove('hidden');
    clearTimeout(controlsHideTimer);
    controlsHideTimer = setTimeout(() => {
        if (!video.paused && !document.querySelector('.control-menu.active')) {
            controlSurface.classList.remove('visible');
            playerHeader.classList.add('hidden');
            closeCustomMenus();
        }
    }, 3000);
}

function hideControlSurfaceNow() {
    clearTimeout(controlsHideTimer);
    controlSurface.classList.remove('visible');
    playerHeader.classList.add('hidden');
    closeCustomMenus();
}

function applyFitMode() {
    const mode = fitModes[fitIndex];
    document.documentElement.style.setProperty('--video-fit', mode.value);
    fitBtn.title = mode.label;
    fitBtn.setAttribute('aria-label', `Screen Fit: ${mode.label}`);
    fitBtn.innerHTML = `<i class="fa-solid ${mode.icon}"></i>`;
}

function updateLockUi() {
    document.body.classList.toggle('ui-locked', isUiLocked);
    uiLockBtn.classList.toggle('locked', isUiLocked);
    uiLockBtn.innerHTML = isUiLocked ? '<i class="fa-solid fa-lock"></i>' : '<i class="fa-solid fa-lock-open"></i>';
    if (isUiLocked) hideControlSurfaceNow();
}

function buildQualityMenuItems() {
    qualityMenu.innerHTML = '';
    const isAuto = !hlsInst || hlsInst.autoLevelEnabled !== false;
    const autoItem = document.createElement('div');
    autoItem.className = `menu-item ${isAuto ? 'selected' : ''}`;
    autoItem.textContent = 'Auto';
    autoItem.onclick = () => { changeQuality(0); buildQualityMenuItems(); };
    qualityMenu.appendChild(autoItem);
    if (hlsInst && Array.isArray(hlsInst.levels)) {
        const heights = [...new Set(hlsInst.levels.map(l => l.height).filter(Boolean))].sort((a, b) => b - a);
        heights.forEach(h => {
            const isSelected = !isAuto && hlsInst.levels[hlsInst.currentLevel]?.height === h;
            const item = document.createElement('div');
            item.className = `menu-item ${isSelected ? 'selected' : ''}`;
            item.textContent = h + 'p';
            item.onclick = () => { changeQuality(h); buildQualityMenuItems(); };
            qualityMenu.appendChild(item);
        });
    }
}

function buildSettingsMenu() {
    settingsMenu.innerHTML = '';
    const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
    speeds.forEach((rate) => {
        const item = document.createElement('div');
        item.className = `menu-item ${(video && video.playbackRate === rate) ? 'selected' : ''}`;
        item.textContent = `${rate}x`;
        item.onclick = () => {
            if (video) video.playbackRate = rate;
            buildSettingsMenu();
        };
        settingsMenu.appendChild(item);
    });
}

function bindVideoEvents() {
    if (!video || video.dataset.customBound === '1') return;
    video.dataset.customBound = '1';
    video.addEventListener('timeupdate', () => {
        syncTimeUI();
        updateSkipSegmentButton();
        updateNextEpisodeButton(false);
    });
    video.addEventListener('loadedmetadata', () => {
        syncTimeUI();
        detectAnimeSkipSegments();
        updateSkipSegmentButton();
        updateNextEpisodeButton(false);
        updateCaptionsButtonVisibility();
        
        // On iOS, source changes often clear tracks. Re-apply them.
        if (IS_IOS && (externalSubtitleTracks || []).length > 0) {
            // Check if we already have ext tracks to avoid duplication
            if (video.querySelectorAll('track[data-ext-sub="1"]').length === 0) {
                console.log('[sub] iOS reload → re-applying external tracks');
                applyExternalSubtitlesToVideo(video);
            }
        }
        
        bindSubtitleCueListeners();
        buildCaptionsMenu();
    });
    if (video.textTracks && typeof video.textTracks.addEventListener === 'function') {
        video.textTracks.addEventListener('addtrack', (e) => {
            const t = e.track;
            // If iOS native player is active, new tracks must be set correctly
            if (_iosNativePlayerActive) {
                // New tracks start 'disabled' unless we decide to activate
                if (t) t.mode = 'disabled';
                // Re-run iOS activation to respect current activeSubtitleTrackIndex
                activateTracksForIOSNativePlayer();
            } else {
                if (t) t.mode = 'disabled';
                silenceNativeTracks();
            }
            bindSubtitleCueListeners();
            updateCaptionsButtonVisibility();
            buildCaptionsMenu();
        });
    }
    // Only silence native tracks when NOT handing off to iOS native player
    video.addEventListener('play', () => { if (!_iosNativePlayerActive) silenceNativeTracks(); });
    video.addEventListener('playing', () => { if (!_iosNativePlayerActive) silenceNativeTracks(); });

    // ── iOS Native Player subtitle bridge ─────────────────────────────────
    video.addEventListener('webkitbeginfullscreen', () => {
        _iosNativePlayerActive = true;
        document.body.classList.add('ios-native-player');
        // Small delay ensures the native player UI is ready before we shove track modes
        setTimeout(() => {
            activateTracksForIOSNativePlayer();
        }, 150);
        // Hide our custom overlay
        const overlay = document.getElementById('subtitleOverlay');
        if (overlay) overlay.style.display = 'none';
        // Ensure audio context resumes for volume control
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    });

    video.addEventListener('webkitendfullscreen', () => {
        _iosNativePlayerActive = false;
        document.body.classList.remove('ios-native-player');
        deactivateTracksFromIOSNativePlayer();
        // Sync track index one last time from native selection
        const tracks = Array.from(video.textTracks);
        const currentActive = tracks.findIndex(t => t.mode === 'showing' || t.mode === 'hidden');
        if (currentActive >= 0) activeSubtitleTrackIndex = currentActive;

        bindSubtitleCueListeners();
        if (activeSubtitleTrackIndex >= 0) {
            const activeTrack = video.textTracks[activeSubtitleTrackIndex] || null;
            renderSubtitleOverlayFromTrack(activeTrack);
        }
    });

    bindNativeTrackChangeListener();
    video.addEventListener('volumechange', () => {
        updateMuteIcon();
        syncGain(); // Crucial for iOS volume control bypass
        if (volumeSliderEl) {
            const val = Math.round((video.muted ? 0 : video.volume) * 100);
            volumeSliderEl.value = String(val);
            volumeSliderEl.style.setProperty('--vol-percent', `${val}%`);
        }
        if (volumeToggleEl) {
            volumeToggleEl.innerHTML = video.muted || video.volume === 0
                ? '<i class="fa-solid fa-volume-xmark"></i>'
                : '<i class="fa-solid fa-volume-high"></i>';
        }
    });
    video.addEventListener('play', () => {
        setPlayIcon(true);
        showControlSurface();
        updateSkipSegmentButton();
        updateNextEpisodeButton(false);
    });
    video.addEventListener('pause', () => {
        setPlayIcon(false);
        controlSurface.classList.add('visible');
        updateSkipSegmentButton();
        updateNextEpisodeButton(false);
    });
    video.addEventListener('ended', () => {
        updateSkipSegmentButton();
        updateNextEpisodeButton(true);
    });
}
// -----------------------------------------------------------------------
//  PROVIDER PROGRESS CHIPS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildChips() {
    progress.innerHTML = '';
    activeProviders.forEach(p => {
        const chip = document.createElement('span');
        chip.className = 'prov-chip';
        chip.id = `chip-${p}`;
        chip.textContent = providerLabel(p);
        progress.appendChild(chip);
    });
}
function chipState(provider, state) {
    const el = document.getElementById(`chip-${provider}`);
    if (el) el.className = `prov-chip ${state}`;
}
// -----------------------------------------------------------------------
//  HEADER AUTO-HIDE
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function resetHeaderTimer() {
    if (isUiLocked) {
        playerHeader.classList.add('hidden');
        return;
    }
    playerHeader.classList.remove('hidden');
    clearTimeout(headerTimer);
    headerTimer = setTimeout(() => {
        if (plyr && plyr.playing) playerHeader.classList.add('hidden');
    }, 3000);
}
document.addEventListener('mousemove', resetHeaderTimer);
document.addEventListener('touchstart', resetHeaderTimer);
// -----------------------------------------------------------------------
//  PANEL TOGGLES
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function positionMenuAbove(menu, button) {
    if (!menu || !button) return;
    // Set display to inline-flex/flex temporarily to get accurate dimensions
    const isControlMenu = menu.classList.contains('control-menu');
    const isOpenPanel = menu.id.includes('-panel');
    menu.style.display = isControlMenu ? 'flex' : (isOpenPanel ? 'flex' : 'block');
    menu.style.visibility = 'hidden';
    const rect = button.getBoundingClientRect();
    const menuWidth = menu.offsetWidth;
    const screenWidth = window.innerWidth;
    let left = rect.left + (rect.width / 2) - (menuWidth / 2);
    // Constraint within screen
    left = Math.max(12, Math.min(left, screenWidth - menuWidth - 12));
    menu.style.left = `${left}px`;
    menu.style.bottom = `${window.innerHeight - rect.top + 12}px`;
    menu.style.display = ''; // Reset display
    menu.style.visibility = '';
}
function toggleSourcePanel(btn = customServerBtn) {
    const willOpen = !sourcePanel.classList.contains('open');
    closeAllPopups();
    if (willOpen) {
        positionMenuAbove(sourcePanel, btn);
        sourcePanel.classList.add('open');
    }
}
function toggleEpPanel(btn = customEpisodeBtn) {
    const willOpen = !epPanel.classList.contains('open');
    closeAllPopups();
    if (willOpen) {
        positionMenuAbove(epPanel, btn);
        epPanel.classList.add('open');
    }
}
function toggleAudioPanel(btn = customAudioBtn) {
    updateAudioTracks();
    const hlsTracks = (hlsInst && hlsInst.audioTracks) || [];
    if (hlsTracks.length <= 1 && satoruAudioSources.length === 0) {
        showToast('No alternative audio tracks found.');
    }
    const willOpen = !audioPanel.classList.contains('open');
    closeAllPopups();
    if (willOpen) {
        positionMenuAbove(audioPanel, btn);
        audioPanel.classList.add('open');
    }
}
function closeAllPopups() {
    sourcePanel.classList.remove('open');
    epPanel.classList.remove('open');
    audioPanel.classList.remove('open');
    closeCustomMenus();
}
document.addEventListener('click', e => {
    if (!sourcePanel.contains(e.target) && e.target !== sourceBtn && e.target !== customServerBtn && !customServerBtn?.contains(e.target)) sourcePanel.classList.remove('open');
    if (!epPanel.contains(e.target) && e.target !== epBtn && e.target !== customEpisodeBtn && !customEpisodeBtn?.contains(e.target)) epPanel.classList.remove('open');
    if (
        !audioPanel.contains(e.target) &&
        e.target !== audioBtn &&
        e.target !== customAudioBtn &&
        !customAudioBtn?.contains(e.target)
    ) audioPanel.classList.remove('open');
});
// Audio track selector elements
const audioBtn = document.getElementById('audio-btn');
const audioPanel = document.getElementById('audio-panel');
// Update audio track selector UI
function updateAudioTracks() {
    if (!audioPanel || !audioBtn) return;
    const hlsTracks = (hlsInst && Array.isArray(hlsInst.audioTracks)) ? hlsInst.audioTracks : [];
    const hasSatoruSources = satoruAudioSources.length > 0;
    const hasAnyTracks = hlsTracks.length > 0 || hasSatoruSources;
    audioBtn.style.display = 'flex';
    if (!hasAnyTracks) {
        audioPanel.innerHTML = `
        <div class="panel-label">Audio Track</div>
        <div class="audio-item">No audio tracks available</div>
        `;
        return;
    }
    const currentHlsTrack = hlsInst ? hlsInst.audioTrack : -1;
    // Determine if the current active stream is a satoru source
    const currentSrc = video?.currentSrc || '';
    const isPlayingSatoru = satoruAudioSources.some((s) => currentSrc.includes(s.url.split('?')[0].slice(-40)));
    audioPanel.innerHTML = '<div class="panel-label">Audio Track</div>';
    // Render native HLS tracks (e.g. Japanese from JustAnime)
    hlsTracks.forEach((track) => {
        const isActive = !isPlayingSatoru && track.id === currentHlsTrack;
        const item = document.createElement('div');
        item.className = 'audio-item' + (isActive ? ' active' : '');
        item.innerHTML = `<span class="src-dot"></span>${track.name || track.lang || 'Default'}`;
        item.onclick = () => {
            if (isPlayingSatoru) {
                // Switch back to JustAnime stream (allSources[0] is always justanime first)
                const jaSource = allSources.find((s) => s.provider === 'justanime');
                if (jaSource) {
                    const savedTime = video ? video.currentTime : 0;
                    rememberProviderPreference(null); // clear forced provider - back to justanime
                    loadStream(jaSource.url, jaSource.isM3U8, false, jaSource.referer, 0);
                    hlsInst && hlsInst.once(Hls.Events.MANIFEST_PARSED, () => {
                        if (video) video.currentTime = savedTime;
                        hlsInst.audioTrack = track.id;
                        rememberAudioPreference(track);
                        updateAudioTracks();
                    });
                    return;
                }
                if (hlsInst) {
                    hlsInst.audioTrack = track.id;
                    rememberAudioPreference(track);
                    updateAudioTracks();
                }
            }
        };
        audioPanel.appendChild(item);
    });
    // Render virtual satoru audio tracks
    if (hasSatoruSources) {
        const sep = document.createElement('div');
        sep.style.cssText = 'font-size:0.72rem;color:rgba(255,255,255,0.4);padding:4px 12px 2px;';
        sep.textContent = '— via Satoru —';
        audioPanel.appendChild(sep);
        satoruAudioSources.forEach((src) => {
            const srcUrlShort = src.url.split('?')[0].slice(-40);
            const isActive = isPlayingSatoru && currentSrc.includes(srcUrlShort);
            const item = document.createElement('div');
            item.className = 'audio-item' + (isActive ? ' active' : '');
            item.innerHTML = `<span class="src-dot"></span>${src.label}`;
            item.onclick = () => {
                const savedTime = video ? video.currentTime : 0;
                rememberProviderPreference('satoru'); // persist satoru preference for reload
                preferredAudioToken = String(src.hlsTrackName || src.label || '').toLowerCase();
                if (preferredSourceLabelMatch) preferredSourceLabelMatch = preferredAudioToken;
                loadStream(src.url, src.isM3U8, false, src.referer, 0);
                // After switching, restore timestamp
                const onParsed = () => {
                    if (video) video.currentTime = savedTime;
                    hlsInst && hlsInst.off(Hls.Events.MANIFEST_PARSED, onParsed);
                    updateAudioTracks();
                };
                hlsInst && hlsInst.once(Hls.Events.MANIFEST_PARSED, onParsed);
            };
            audioPanel.appendChild(item);
        });
    }
}
function initCustomControls() {
    applyFitMode();
    updateLockUi();
    setPlayIcon(false);
    updateMuteIcon();
    captionsBtn.style.display = 'none';
    playPauseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!video) return;
        if (video.paused) video.play();
        else video.pause();
    });
    skipBackBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!video) return;
        video.currentTime = Math.max(0, video.currentTime - 10);
    });
    skipFwdBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!video) return;
        if (isFinite(video.duration)) video.currentTime = Math.min(video.duration, video.currentTime + 10);
        else video.currentTime += 10;
    });
    customAudioBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleAudioPanel(customAudioBtn);
    });
    captionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!video) return;
        const wasOpen = captionsMenu.classList.contains('active');
        closeAllPopups();
        if (wasOpen) return;
        buildCaptionsMenu();
        positionMenuAbove(captionsMenu, captionsBtn);
        captionsMenu.classList.add('active');
    });
    customServerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSourcePanel(customServerBtn);
    });
    customEpisodeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleEpPanel(customEpisodeBtn);
    });
    qualityBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!hlsInst) return;
        const wasOpen = qualityMenu.classList.contains('active');
        closeAllPopups();
        if (wasOpen) return;
        buildQualityMenuItems();
        positionMenuAbove(qualityMenu, qualityBtn);
        qualityMenu.classList.add('active');
    });
    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasOpen = settingsMenu.classList.contains('active');
        closeAllPopups();
        if (wasOpen) return;
        buildSettingsMenu();
        positionMenuAbove(settingsMenu, settingsBtn);
        settingsMenu.classList.add('active');
    });
    fitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fitIndex = (fitIndex + 1) % fitModes.length;
        applyFitMode();
        showControlSurface();
    });
    muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!video) return;
        const wasOpen = volumeMenu.classList.contains('active');
        closeAllPopups();
        if (wasOpen) return;
        buildVolumeMenu();
        positionMenuAbove(volumeMenu, muteBtn);
        volumeMenu.classList.add('active');
    });
    fullscreenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = document.documentElement;
        if (!document.fullscreenElement) target.requestFullscreen?.();
        else document.exitFullscreen?.();
    });
    uiLockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        isUiLocked = !isUiLocked;
        updateLockUi();
        if (!isUiLocked) showControlSurface();
        updateSkipSegmentButton();
    });
    skipSegmentBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!video) return;
        const active = getActiveSkipSegment(Number(video.currentTime || 0));
        if (!active) return;
        const wasPaused = video.paused;
        video.currentTime = Math.max(0, active.end + 0.2);
        if (!wasPaused) {
            Promise.resolve(video.play()).catch(() => { });
        }
        if (active.type === 'intro') skippedSegments.intro = true;
        if (active.type === 'outro') skippedSegments.outro = true;
        updateSkipSegmentButton();
        showControlSurface();
    });
    nextEpisodeBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await goToNextEpisode();
    });
    seekBar.addEventListener('input', (e) => {
        if (!video || !isFinite(video.duration)) return;
        const percent = parseFloat(e.target.value || '0');
        const wasPaused = video.paused;
        video.currentTime = (percent / 100) * video.duration;
        if (!wasPaused) {
            Promise.resolve(video.play()).catch(() => { });
        }
    });
    const seekPreview = document.getElementById('seek-preview');
    const previewTime = document.getElementById('previewTime');
    const previewCanvas = document.getElementById('previewCanvas');
    const previewCtx = previewCanvas.getContext('2d');
    let lastCaptureTime = 0;
    seekBar.addEventListener('mousemove', (e) => {
        if (!video || !isFinite(video.duration)) return;
        const rect = seekBar.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
        const seekTime = (percent / 100) * video.duration;
        // Position preview box relative to its container
        const containerRect = seekPreview.offsetParent.getBoundingClientRect();
        seekPreview.style.left = `${e.clientX - containerRect.left}px`;
        seekPreview.classList.add('visible');
        previewTime.textContent = formatPlayTime(seekTime);
        // Capture thumbnail frame (if current frame is somewhat relevant or just for visual feedback)
        // Note: True frame-accurate previews require a second video or a thumbnail sprite.
        // Here we show the current main video frame as a placeholder or when moving near current time.
        if (Date.now() - lastCaptureTime > 100) {
            if (video.readyState >= 2) {
                previewCanvas.width = 180;
                previewCanvas.height = 101.25; // 16:9
                previewCtx.drawImage(video, 0, 0, 180, 101.25);
                lastCaptureTime = Date.now();
            }
        }
    });
    seekBar.addEventListener('mouseleave', () => {
        seekPreview.classList.remove('visible');
    });
    document.addEventListener('mousemove', showControlSurface);
    document.addEventListener('touchstart', () => {
        if (controlSurface.classList.contains('visible')) showControlSurface();
    });
    document.addEventListener('click', (e) => {
        if (!qualityMenu.contains(e.target) && !qualityBtn.contains(e.target)) qualityMenu.classList.remove('active');
        if (!captionsMenu.contains(e.target) && !captionsBtn.contains(e.target)) captionsMenu.classList.remove('active');
        if (!settingsMenu.contains(e.target) && !settingsBtn.contains(e.target)) settingsMenu.classList.remove('active');
        if (!volumeMenu.contains(e.target) && !muteBtn.contains(e.target)) volumeMenu.classList.remove('active');
    });
}
// -----------------------------------------------------------------------
//  MAIN INIT
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function init() {
    if (!TMDB_ID) {
        showError('Missing ID', 'No media ID was provided.'); return;
    }
    setLoader('Fetching media info...', 'Connecting to TMDB');
    buildChips();
    // Safety timeout
    const safetyTimer = setTimeout(() => {
        if (loader.style.display !== 'none') {
            showError('Timeout', 'Loading took too long. Please try again.');
        }
    }, 60000);
    try {
        const isAnimeOnlyProvider = ['satoru', 'justanime', 'hianime', 'animesaturn'].includes(FORCED_PROVIDER);
        const infoUrl = (FORCED_PROVIDER && !isAnimeOnlyProvider)
            ? `${API_BASE.replace('/meta/tmdb', '/movies/' + FORCED_PROVIDER)}/info?id=${encodeURIComponent(TMDB_ID)}&type=${encodeURIComponent(MEDIA_TYPE)}`
            : `${API_BASE}/info/${TMDB_ID}?type=${MEDIA_TYPE}`;
        let info = readCachedMediaInfo();
        if (info) {
            setLoader('Fetching media info...', 'Loaded from local cache');
            fetchJsonWithRetry(infoUrl, 10000, 18000)
                .then((fresh) => {
                    const payload = fresh?.data || fresh;
                    if (payload && typeof payload === 'object') writeCachedMediaInfo(payload);
                })
                .catch(() => { });
        } else {
            const parsed = await fetchJsonWithRetry(infoUrl, 12000, 30000);
            info = parsed?.data || parsed;
            writeCachedMediaInfo(info);
        }
        currentMediaInfo = info;
        clearTimeout(safetyTimer);
        const title = info.title || info.name || 'Unknown Title';
        document.title = `Watching: ${title} | StreamVerse`;
        document.getElementById('media-title').textContent = title;
        if (info.cover || info.image) {
            loader.style.backgroundImage = `url('${info.cover || info.image}')`;
        }
        const isTv = MEDIA_TYPE === 'tv' ||
            (info.type || '').toLowerCase().includes('tv') ||
            (info.type || '').toLowerCase().includes('series');
        const genreNames = (Array.isArray(info.genres) ? info.genres : [])
            .map(g => (typeof g === 'string' ? g : (g?.name || '')))
            .map(g => String(g).toLowerCase());
        const originalLang = String(info.original_language || info.originalLanguage || '').toLowerCase();
        const animeHint = String(info.title || info.name || '').toLowerCase();
        const isLikelyAnime = (
            genreNames.includes('animation') ||
            originalLang === 'ja' ||
            animeHint.includes('anime')
        );
        currentIsLikelyAnime = isLikelyAnime;
        resetAnimeSkipState();
        // Reset active providers pool based on content type, regardless of FORCED_PROVIDER
        // This allows fallbacks to work even when a specific provider is requested via URL
        if (isLikelyAnime) {
            activeProviders = [...new Set([...ANIME_PROVIDERS, ...MOVIE_PROVIDERS])];
        } else if (MEDIA_TYPE === 'movie') {
            activeProviders = [...new Set([...MOVIE_PROVIDERS, ...ANIME_PROVIDERS])];
        } else {
            activeProviders = [...MOVIE_PROVIDERS];
        }
        // If a forced provider is set but not in the standard list, add it to the pool
        if (FORCED_PROVIDER && !activeProviders.includes(FORCED_PROVIDER)) {
            activeProviders.unshift(FORCED_PROVIDER);
        }
        buildChips();
        if (isTv) {
            await initTv(info);
        } else {
            document.getElementById('media-meta').textContent = 'Movie';
            if (customEpisodeBtn) customEpisodeBtn.style.display = 'none';
            if (nextEpisodeBtn) nextEpisodeBtn.style.display = 'none';
            const epId = info.episodeId || info.id;
            if (!epId) throw new Error('No ID found in API response');
            await fetchSources(epId);
        }
    } catch (err) {
        clearTimeout(safetyTimer);
        console.error('Init error:', err);
    }
}
async function initTv(info) {
    setLoader('Loading series...', 'Building episode list');
    tvSeasons = buildTvSeasonsFromInfo(info);
    episodeFillerStatus = new Map();
    fillerLookupState = 'loading';
    if (!tvSeasons.length) {
        throw new Error('No episodes found for this series');
    }
    buildEpPanel();
    epBtn.style.display = 'flex';
    if (customEpisodeBtn) customEpisodeBtn.style.display = 'inline-flex';
    // Mark episode button for showing in Plyr control bar
    showPlyrEpBtn = true;
    const fillerTitle = info?.title || info?.name || currentMediaInfo?.title || currentMediaInfo?.name || '';
    fetchAnimeFillerStatusMap(fillerTitle)
        .then((map) => {
            episodeFillerStatus = map;
            fillerLookupState = map.size > 0
                ? 'ready'
                : (fillerLookupState === 'fetch_failed' ? 'fetch_failed' : 'not_found');
            buildEpPanel();
            updateEpUI(curSeason, curEpisode);
        })
        .catch(() => {
            fillerLookupState = 'fetch_failed';
            buildEpPanel();
            updateEpUI(curSeason, curEpisode);
        });
    const initialPos = getInitialTvPositionFromUrl(tvSeasons);
    await playTvEp(initialPos.seasonIndex, initialPos.episodeIndex);
}
function buildEpPanel() {
    epPanel.innerHTML = '';
    const legend = document.createElement('div');
    legend.className = 'ep-legend';
    legend.innerHTML = `
    <span class="ep-legend-badge manga">Manga Canon</span>
    <span class="ep-legend-badge mixed">Mixed</span>
    <span class="ep-legend-badge filler">Filler</span>
    <span class="ep-legend-note">${fillerLookupState === 'loading' ? 'checking...' : (fillerLookupState === 'ready' ? 'from animefillerlist' : (fillerLookupState === 'fetch_failed' ? 'fetch blocked' : 'not found'))}</span>
    `;
    epPanel.appendChild(legend);
    tvSeasons.forEach((s, si) => {
        const lbl = document.createElement('div');
        lbl.className = 'ep-season';
        const seasonNo = Number(s?.seasonNo || si + 1);
        lbl.textContent = Number.isFinite(seasonNo) && seasonNo > 0 ? `Season ${seasonNo}` : String(s.name || `Season ${si + 1}`);
        epPanel.appendChild(lbl);
        (s.episodes || []).forEach((ep, ei) => {
            const item = document.createElement('div');
            item.className = 'ep-item';
            const epNo = Number(ep.episode || ep.number || ep.episodeNum || (ei + 1));
            const epTitle = ep.title || `Episode ${epNo}`;
            const fillerStatus = episodeFillerStatus.get(epNo);
            let fillerBadge = '';
            if (fillerStatus === 'manga') {
                item.classList.add('manga-canon');
                fillerBadge = '<span class="filler-badge canon">Canon</span>';
            } else if (fillerStatus === 'mixed') {
                item.classList.add('filler-mixed');
                fillerBadge = '<span class="filler-badge mixed">Mixed</span>';
            } else if (fillerStatus === 'filler') {
                item.classList.add('filler-full');
                fillerBadge = '<span class="filler-badge filler">Filler</span>';
            }
            item.innerHTML = `
<div class="ep-item-info">
<span class="ep-item-num">${epNo}</span>
<span class="ep-item-title">${epTitle}</span>
</div>
${fillerBadge}
`;
            item.dataset.si = si;
            item.dataset.ei = ei;
            item.onclick = () => {
                epPanel.classList.remove('open');
                playTvEp(si, ei);
            };
            epPanel.appendChild(item);
        });
    });
}
function updateEpUI(si, ei) {
    epPanel.querySelectorAll('.ep-item').forEach(el => {
        el.classList.toggle('active', +el.dataset.si === si && +el.dataset.ei === ei);
    });
    const sel = epPanel.querySelector('.ep-item.active');
    if (sel) sel.scrollIntoView({ block: 'center' });
}
function getNextEpisodeRef() {
    if (MEDIA_TYPE !== 'tv' || !Array.isArray(tvSeasons) || tvSeasons.length === 0) return null;
    const season = tvSeasons[curSeason];
    const episodes = season?.episodes || [];
    if (curEpisode + 1 < episodes.length) {
        return { seasonIndex: curSeason, episodeIndex: curEpisode + 1 };
    }
    for (let si = curSeason + 1; si < tvSeasons.length; si += 1) {
        const eps = tvSeasons[si]?.episodes || [];
        if (eps.length > 0) return { seasonIndex: si, episodeIndex: 0 };
    }
    return null;
}
function updateNextEpisodeButton(forceShow = false) {
    if (!nextEpisodeBtn) return;
    const next = getNextEpisodeRef();
    if (!next || isUiLocked || !video) {
        nextEpisodeBtn.style.display = 'none';
        return;
    }
    if (forceShow) {
        nextEpisodeBtn.style.display = 'inline-flex';
        return;
    }
    if (!isFinite(video.duration) || video.duration <= 0) {
        nextEpisodeBtn.style.display = 'none';
        return;
    }
    const remaining = video.duration - (video.currentTime || 0);
    nextEpisodeBtn.style.display = remaining <= 30 ? 'inline-flex' : 'none';
}
async function goToNextEpisode() {
    const next = getNextEpisodeRef();
    if (!next) return;
    await playTvEp(next.seasonIndex, next.episodeIndex);
}
async function playTvEp(si, ei) {
    curSeason = si; curEpisode = ei;
    updateEpisodeUrlState(si, ei);
    const season = tvSeasons[si];
    const ep = (season?.episodes || [])[ei];
    if (!ep) return;
    resetAnimeSkipState();
    updateNextEpisodeButton(false);
    updateEpUI(si, ei);
    const epNo = Number(ep.episode || ep.number || ep.episodeNum || (ei + 1));
    const epTitle = String(ep.title || '').trim();
    const metaText = epTitle
        ? `${season.name} - Episode ${epNo}: ${epTitle}`
        : `${season.name} - Episode ${epNo}`;
    document.getElementById('media-meta').textContent = metaText;
    // Store current season/episode indices for the per-provider fetch
    await fetchSources(null);
}
// -----------------------------------------------------------------------
//  FETCH SOURCES - per-provider: get that provider's own episodeId, then watch
// -----------------------------------------------------------------------
async function fetchSources(forcedEpId) {
    allSources = [];
    try {
        const title = String(currentMediaInfo?.title || currentMediaInfo?.name || '').trim();
        if (!title) {
            if (typeof showLoaderError === 'function') showLoaderError('No media title found.');
            return;
        }

        const isTv = MEDIA_TYPE === 'tv';
        const sNo = curSeason + 1;
        const epNo = curEpisode + 1;
        const providers = activeProviders;

        for (const provider of providers) {
            try {
                setLoader(`Connecting to ${provider}...`, `Searching for ${title}`);
                const base = activeApiBase.replace('/meta/tmdb', isLikelyAnime ? `/anime/${provider}` : `/movies/${provider}`);

                // 1. Search
                const searchUrl = `${base}/${encodeURIComponent(title)}`;
                const { res: searchRes } = await fetchJsonWithApiFallback(searchUrl, { signal: AbortSignal.timeout(15000) });
                if (!searchRes.ok) continue;
                const searchJson = await searchRes.json();
                const results = Array.isArray(searchJson) ? searchJson : (searchJson?.results || []);
                const picked = results[0];
                if (!picked?.id) continue;

                // 2. Info
                const infoUrl = `${base}/info?id=${encodeURIComponent(picked.id)}`;
                const { res: infoRes } = await fetchJsonWithApiFallback(infoUrl, { signal: AbortSignal.timeout(15000) });
                if (!infoRes.ok) continue;
                const infoJson = await infoRes.json();
                const info = infoJson?.data || infoJson;

                // 3. Match Episode
                let episodeId = null;
                if (!isTv) {
                    episodeId = info.episodeId || info.id;
                } else {
                    const episodes = Array.isArray(info.episodes) ? info.episodes : [];
                    const match = episodes.find(e => {
                        const eNo = Number(e.episode || e.number || e.episodeNum);
                        const esNo = Number(e.season || e.seasonNumber || 1);
                        return eNo === epNo && (esNo === sNo || isLikelyAnime);
                    });
                    if (match) episodeId = match.id || match.episodeId;
                    else if (episodes[curEpisode]) episodeId = episodes[curEpisode].id || episodes[curEpisode].episodeId;
                }

                if (!episodeId) continue;

                // 4. Watch
                const watchUrl = `${base}/watch?episodeId=${encodeURIComponent(episodeId)}${isTv ? `&id=${encodeURIComponent(picked.id)}` : ''}`;
                const { res: watchRes } = await fetchJsonWithApiFallback(watchUrl, { signal: AbortSignal.timeout(20000) });
                if (!watchRes.ok) continue;
                const watchJson = await watchRes.json();
                const watchData = watchJson?.data || watchJson;

                const sources = Array.isArray(watchData?.sources) ? watchData.sources : [];
                if (!sources.length) continue;

                allSources = sources.map((src, idx) => ({
                    url: src.url || src.file || '',
                    isM3U8: Boolean(src.isM3U8) || /\.m3u8(\?|$)/i.test(src.url || src.file || ''),
                    isEmbed: Boolean(src.isEmbed),
                    quality: src.quality || src.label || `Source ${idx + 1}`,
                    provider,
                    referer: watchData.headers?.Referer || watchData.headers?.referer || null,
                })).filter(s => s.url);

                if (allSources.length) {
                    playSource(0, 0);
                    return;
                }
            } catch (e) {
                console.warn(`${provider} failed:`, e);
            }
        }
        if (typeof showLoaderError === 'function') showLoaderError('No working source found.');
    } catch (err) {
        console.error('fetchSources failed', err);
        if (typeof showLoaderError === 'function') showLoaderError('Failed to fetch sources.');
    }
}
// ----------------------------------------------------------------------------------------------------
//  PLAY SOURCE
// ----------------------------------------------------------------------------------------------------
async function playSource(idx, startTime = 0) {
    const src = allSources[idx];
    if (!src) return;
    const statusLabel = startTime > 0 ? 'Switching Server...' : 'Buffering...';
    setLoader(statusLabel, src.label);
    loadStream(src.url, src.isM3U8, src.isEmbed, src.referer, idx, startTime);
}
function proxiedStreamUrl(url, referer) {
    const rawUrl = String(url || '').trim();
    // Cinezo already returns proxy-wrapped HLS links; avoid double-proxying those.
    if (/\/m3u8-proxy\?/i.test(rawUrl)) {
        return rawUrl;
    }
    // StreamRuby HLS often rejects server-side proxy requests (403) even with referer,
    // but plays directly in browser context.
    if (/https?:\/\/[^/]*streamruby\.net\//i.test(rawUrl)) {
        return rawUrl;
    }
    const apiBaseUrl = new URL(activeApiBase || API_BASE, location.href);
    let apiOrigin = `${apiBaseUrl.protocol}//${apiBaseUrl.host}`;
    const ref = referer ? `&referer=${encodeURIComponent(referer)}` : '';
    return `${apiOrigin}/utils/proxy?url=${encodeURIComponent(rawUrl)}${ref}`;
}
async function loadStream(url, isM3U8, isEmbed, referer, srcIdx, startTime = 0) {
    console.log('loadStream:', { url, isM3U8, isEmbed, srcIdx, startTime });
    // Tear down previous
    if (hlsInst) {
        try { hlsInst.stopLoad(); hlsInst.detachMedia(); hlsInst.destroy(); } catch (_) {
        } hlsInst = null;
    }
    if (dashInst) {
        try { dashInst.reset(); } catch (_) {
        } dashInst = null;
    }
    if (plyr) {
        try { plyr.destroy(); } catch (_) {
        } plyr = null;
    }
    const wrap = document.querySelector('.player-wrap');
    // Hard reset video element to clear any hanging buffers from previous episode
    wrap.innerHTML = '<video id="player-video" playsinline crossorigin="anonymous"></video>';
    video = document.getElementById('player-video');
    setVolumeBoost(volumeBoost);
    const initPlyr = () => {
        console.log('Initializing Plyr...');
        applyExternalSubtitlesToVideo(video);
        const qualities = hlsInst
            ? [...new Set(hlsInst.levels.map(l => l.height).filter(Boolean))]
            : [];
        const maxH = qualities.length ? Math.max(...qualities) : 720;
        plyr = new Plyr(video, {
            controls: [
                'play-large',
                'play',
                'rewind',
                'fast-forward',
                'progress',
                'current-time',
                'duration',
                'mute',
                'volume',
                'settings',
                'pip',
                'airplay',
                'fullscreen'
            ],
            captions: { active: false, update: false, language: 'auto' },
            quality: qualities.length
                ? { default: maxH, options: [0, ...qualities], forced: true, onChange: changeQuality }
                : {},
            speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
        });
        bindVideoEvents();
        syncTimeUI();
        updateMuteIcon();
        updateCaptionsButtonVisibility();
        showControlSurface();
        const hide = () => hideLoader();
        plyr.on('ready', hide);
        plyr.on('playing', hide);
        plyr.on('canplay', hide);
        plyr.on('play', () => {
            setPlayIcon(true);
            showControlSurface();
        });
        plyr.on('pause', () => {
            setPlayIcon(false);
            controlSurface.classList.add('visible');
        });
    };
    const tryNextSource = () => {
        const next = srcIdx + 1;
        if (next < allSources.length) {
            console.log(`Falling back to source ${next}`);
            updateSourceUI(next);
            currentIdx = next;
            const s = allSources[next];
            loadStream(s.url, s.isM3U8, s.isEmbed, s.referer, next);
        } else {
            showError('All Sources Failed', 'Every available stream source failed to load. Please check your internet connection or try again later.');
        }
    };
    const isMPD = String(url || '').toLowerCase().includes('.mpd');
    // 1. HLS with hls.js
    if (isM3U8 && Hls.isSupported()) {
        console.log('Branch: HLS.js');
        wrap.innerHTML = '<video id="player-video" playsinline crossorigin="anonymous"></video>';
        video = document.getElementById('player-video');
        const streamUrl = proxiedStreamUrl(url, referer);
        hlsInst = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 90,
            maxBufferLength: 20,
            maxMaxBufferLength: 50,
            maxBufferSize: 50 * 1000 * 1000,
            manifestLoadingTimeOut: 50000,
            manifestLoadingMaxRetry: 6,
            levelLoadingTimeOut: 50000,
            levelLoadingMaxRetry: 6,
            fragLoadingTimeOut: 60000,
            fragLoadingMaxRetry: 10,
            fragLoadingRetryDelay: 800,
            startLevel: -1,
            maxInitialBitrate: 0, // Start as low as possible for faster initial load on slow servers
            maxBufferLength: 40,
            maxMaxBufferLength: 80,
            abrEwmaFastVOD: 4.0,
            abrEwmaSlowVOD: 12.0,
            testBandwidth: true,
            capLevelToPlayerSize: true,
            ignoreDevicePixelRatio: true
        });
        hlsInst.loadSource(streamUrl);
        hlsInst.attachMedia(video);
        const currentProvider = allSources[srcIdx]?.provider;
        if (currentProvider === 'justanime' || (!currentProvider && FORCED_PROVIDER === 'justanime')) {
            const titleText = document.getElementById('media-title').textContent;
            const satoruUrl = activeApiBase.replace('/meta/tmdb', `/anime/satoru/${encodeURIComponent(titleText)}?satoru-bg=1`);
            fetchJsonWithApiFallback(satoruUrl, { signal: AbortSignal.timeout(15000) })
                .then(({ res }) => res.json())
                .then(data => {
                    const results = Array.isArray(data) ? data : (data?.results || []);
                    if (results.length) {
                        const satoruInfoUrl = activeApiBase.replace('/meta/tmdb', `/anime/satoru/info?id=${encodeURIComponent(results[0].id)}`);
                        return fetchJsonWithApiFallback(satoruInfoUrl);
                    }
                })
                .then(resObj => resObj ? resObj.res.json() : null)
                .then(info => {
                    if (info && Array.isArray(info.episodes)) {
                        const epNo = curEpisode + 1;
                        const match = info.episodes.find(e => Number(e.number) === epNo);
                        if (match) {
                            const satoruWatchUrl = activeApiBase.replace('/meta/tmdb', `/anime/satoru/watch?episodeId=${encodeURIComponent(match.id)}`);
                            return fetchJsonWithApiFallback(satoruWatchUrl);
                        }
                    }
                })
                .then(resObj => resObj ? resObj.res.json() : null)
                .then(watchData => {
                    if (watchData && Array.isArray(watchData.sources)) {
                        satoruAudioSources = watchData.sources.map(s => ({
                            ...s,
                            label: s.quality || 'Audio',
                            hlsTrackName: normalizeAudioToken(s.quality || ''),
                            referer: watchData.headers?.Referer || watchData.headers?.referer || null
                        }));
                        updateAudioTracks();
                    }
                }).catch(e => console.warn('Satoru background fetch failed:', e));
        }
        video.preload = 'auto';
        let preferredAudioApplied = false;
        const selectPreferredAudioTrack = () => {
            if (!hlsInst || !Array.isArray(hlsInst.audioTracks) || hlsInst.audioTracks.length === 0) return;
            if (preferredAudioApplied) return;
            const tracks = hlsInst.audioTracks;
            const preferredTrack = preferredAudioToken
                ? tracks.find((t) => getTrackAudioTokens(t).some((tok) => tok === preferredAudioToken || normalizeAudioToken(tok) === normalizeAudioToken(preferredAudioToken)))
                : null;
            const jpTrack = tracks.find((t) => {
                const lang = String(t?.lang || '').toLowerCase();
                const name = String(t?.name || '').toLowerCase();
                return (
                    lang === 'ja' ||
                    lang === 'jpn' ||
                    name.includes('japanese') ||
                    name.includes('japan') ||
                    name.includes('nihongo') ||
                    name.includes('jp')
                );
            });
            const fallbackTrack = tracks.find((t) => t.default) || tracks[0];
            const targetTrack = preferredTrack || jpTrack || fallbackTrack;
            if (!targetTrack) return;
            try {
                hlsInst.audioTrack = targetTrack.id;
                rememberAudioPreference(targetTrack);
                preferredAudioApplied = true;
                console.log(`Preferred audio selected: ${targetTrack.name || targetTrack.lang || targetTrack.id}`);
            } catch (e) {
                console.warn('Failed selecting preferred audio track:', e);
            }
        };
        // Audio tracks updated event - update the UI when tracks are detected
        hlsInst.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
            console.log('AUDIO_TRACKS_UPDATED event fired');
            console.log('Available audio tracks:', hlsInst.audioTracks?.map(t => ({ id: t.id, name: t.name, lang: t.lang, default: t.default })));
            selectPreferredAudioTrack();
            updateAudioTracks();
        });
        // Audio track switched event - update the UI when user changes track
        hlsInst.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => {
            console.log('AUDIO_TRACK_SWITCHED event fired');
            const selected = (hlsInst.audioTracks || []).find((t) => t.id === hlsInst.audioTrack);
            if (selected) rememberAudioPreference(selected);
            updateAudioTracks();
        });
        hlsInst.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
            try {
                const tracks = hlsInst.subtitleTracks || [];
                console.log('SUBTITLE_TRACKS_UPDATED:', tracks.map((t) => ({ id: t.id, name: t.name, lang: t.lang, default: t.default })));
                if (tracks.length && hlsInst.subtitleTrack === -1) {
                    const preferred = tracks.find((t) => /en|eng|english/i.test(String(t?.lang || '') + ' ' + String(t?.name || '')));
                    hlsInst.subtitleTrack = (preferred || tracks[0]).id;
                }
                setTimeout(() => {
                    updateCaptionsButtonVisibility();
                    buildCaptionsMenu();
                }, 200);
            } catch (_) {
            }
        });
        hlsInst.on(Hls.Events.MANIFEST_PARSED, () => {
            // Log available audio tracks for debugging
            console.log('MANIFEST_PARSED - audio tracks:', hlsInst.audioTracks?.length || 0);
            if (hlsInst.audioTracks && hlsInst.audioTracks.length > 0) {
                console.log('Available audio tracks:', hlsInst.audioTracks.map(t => ({ id: t.id, name: t.name, lang: t.lang, default: t.default })));
                selectPreferredAudioTrack();
            }
            if (startTime > 0) {
                video.currentTime = startTime;
            }
            // Update audio track selector UI
            updateAudioTracks();
            initPlyr();
            video.play().catch(() => { video.muted = true; video.play().catch(() => hideLoader()); });
        });
        let networkErrCount = 0;
        hlsInst.on(Hls.Events.ERROR, (_, d) => {
            console.log('HLS Error:', d);
            if (!d.fatal) return;
            if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
                const code = d.response ? d.response.code : 0;
                if (code === 404 || code === 403 || code >= 500) {
                    console.warn(`Network ${code}, trying next source`);
                    tryNextSource();
                    return;
                }
                networkErrCount++;
                if (networkErrCount >= 3) {
                    console.warn('Too many network errors, trying next source');
                    tryNextSource();
                    return;
                }
                hlsInst.startLoad();
                return;
            }
            if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
                hlsInst.recoverMediaError();
                return;
            }
            tryNextSource();
        });
    } else if (isM3U8 && video?.canPlayType?.('application/vnd.apple.mpegurl')) {
        console.log('Branch: Native Safari HLS');
        wrap.innerHTML = '<video id="player-video" playsinline crossorigin="anonymous"></video>';
        video = document.getElementById('player-video');
        if (startTime > 0) {
            video.addEventListener('loadedmetadata', () => {
                video.currentTime = startTime;
            }, { once: true });
        }
        video.src = proxiedStreamUrl(url, referer);
        initPlyr();
        video.play().catch(() => hideLoader());
    } else if (isMPD && window.dashjs?.MediaPlayer) {
        console.log('Branch: DASH.js');
        wrap.innerHTML = '<video id="player-video" playsinline crossorigin="anonymous"></video>';
        video = document.getElementById('player-video');
        const mpdUrl = proxiedStreamUrl(url, referer);
        dashInst = window.dashjs.MediaPlayer().create();
        dashInst.initialize(video, mpdUrl, true);
        let dashErrCount = 0;
        let dashTriedNext = false;
        const dashEvents = window.dashjs.MediaPlayer.events;
        dashInst.on(dashEvents.ERROR, (evt) => {
            const code = Number(evt?.error?.code || evt?.event?.id || 0);
            const msg = String(evt?.error?.message || evt?.event?.message || '').toLowerCase();
            if (msg.includes('403') || msg.includes('forbidden') || code === 27) {
                dashErrCount += 1;
            }
            if (!dashTriedNext && dashErrCount >= 2) {
                dashTriedNext = true;
                console.warn('DASH source appears blocked (403), trying next source');
                tryNextSource();
            }
        });
        initPlyr();
        video.play().catch(() => hideLoader());
    } else if (isEmbed) {
        console.log('Branch: Direct IFRAME Embed');
        wrap.innerHTML = `<iframe src="${url}" style="width:100%;height:100%;border:none;pointer-events:auto;" allowfullscreen allow="autoplay; fullscreen; encrypted-media"></iframe>`;
        video = null;
        hideControlSurfaceNow();
        hideLoader();
        // MegaCloud/iframe sources can fail silently in custom players.
        // Auto-rotate to next source if playback does not visibly start soon.
        setTimeout(() => {
            if (currentIdx === srcIdx) {
                console.warn('Embed source timeout, trying next source');
                tryNextSource();
            }
        }, 9000);
    } else if (!isM3U8) {
        console.log('Branch: Direct MP4');
        wrap.innerHTML = '<video id="player-video" playsinline crossorigin="anonymous"></video>';
        video = document.getElementById('player-video');
        if (startTime > 0) {
            video.addEventListener('loadedmetadata', () => {
                video.currentTime = startTime;
            }, { once: true });
        }
        const proxiedMp4Url = proxiedStreamUrl(url, referer);
        const directMp4Url = url;
        let triedDirectFallback = false;
        const tryDirectMp4Fallback = () => {
            if (triedDirectFallback) return false;
            triedDirectFallback = true;
            console.warn('Proxied MP4 failed, retrying with direct MP4 URL');
            try {
                video.src = directMp4Url;
                video.load();
                video.play().catch(() => { });
                return true;
            } catch (_) {
                return false;
            }
        };
        video.addEventListener('error', () => {
            const switched = tryDirectMp4Fallback();
            if (!switched) {
                console.warn('Direct MP4 failed, trying next source');
                tryNextSource();
            }
        });
        // If proxy starts but never gets metadata, fallback to direct URL.
        const metadataFallbackTimer = setTimeout(() => {
            if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
                tryDirectMp4Fallback();
            }
        }, 4500);
        video.addEventListener('loadedmetadata', () => clearTimeout(metadataFallbackTimer), { once: true });
        video.src = proxiedMp4Url;
        initPlyr();
        video.play().catch(() => hideLoader());
    } else {
        showError('Unsupported Browser', 'Your browser does not support HLS streaming.');
    }
}
function changeQuality(q) {
    if (!hlsInst) return;
    hlsInst.currentLevel = q === 0 ? -1 : hlsInst.levels.findIndex(l => l.height === q);
}
// -----------------------------------------------------------------------
//  INIT
// -----------------------------------------------------------------------
initCustomControls();
bindVideoEvents();
document.addEventListener('fullscreenchange', showControlSurface);
init();
