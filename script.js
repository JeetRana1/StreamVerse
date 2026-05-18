// ------------------ API CONFIGURATION -------------------------------------
const RUNTIME_CONFIG = window.__STREAMVERSE_CONFIG__ || {};

function normalizeMetaApiBase(value, fallback) {
    const raw = String(value || '').trim();
    if (!raw) return String(fallback || '').trim();
    const cleaned = raw.replace(/\/+$/, '');
    if (/\/meta\/tmdb$/i.test(cleaned)) return cleaned;
    return `${cleaned}/meta/tmdb`;
}

const LOCAL_API = String(
    normalizeMetaApiBase(
        RUNTIME_CONFIG.LOCAL_META_API_BASE ||
        RUNTIME_CONFIG.LOCAL_API_BASE,
        'http://localhost:3000/meta/tmdb'
    )
);
const PROD_API = String(
    normalizeMetaApiBase(
        RUNTIME_CONFIG.PROD_META_API_BASE ||
        RUNTIME_CONFIG.PROD_API_BASE ||
        RUNTIME_CONFIG.META_API_BASE ||
        RUNTIME_CONFIG.API_BASE,
        'https://streamverse-api.ddns.net/meta/tmdb'
    )
);
const FALLBACK_API = String(
    normalizeMetaApiBase(
        RUNTIME_CONFIG.FALLBACK_API_BASE,
        'https://consumet-api.vercel.app/meta/tmdb'
    )
);
const YOUTUBE_API_KEY = String(
    RUNTIME_CONFIG.YOUTUBE_API_KEY ||
    RUNTIME_CONFIG.YT_API_KEY ||
    RUNTIME_CONFIG.GOOGLE_API_KEY ||
    ''
).trim();
const PROD_API_HOST = (() => {
    try { return new URL(PROD_API).host; } catch (_) { return ''; }
})();
const FALLBACK_API_HOST = (() => {
    try { return new URL(FALLBACK_API).host; } catch (_) { return ''; }
})();

// Genre mapping for TMDB genre IDs to names
const GENRE_MAP = {
    // Movie genres
    28: 'Action',
    12: 'Adventure',
    16: 'Animation',
    35: 'Comedy',
    80: 'Crime',
    99: 'Documentary',
    18: 'Drama',
    10751: 'Family',
    14: 'Fantasy',
    36: 'History',
    27: 'Horror',
    10402: 'Music',
    9648: 'Mystery',
    10749: 'Romance',
    878: 'Science Fiction',
    10770: 'TV Movie',
    53: 'Thriller',
    10752: 'War',
    37: 'Western',
    // TV genres
    10759: 'Action & Adventure',
    10762: 'Kids',
    10763: 'News',
    10764: 'Reality',
    10765: 'Sci-Fi & Fantasy',
    10766: 'Soap',
    10767: 'Talk',
    10768: 'War & Politics'
};

const TMDB_GENRE_FILTERS = [
    { id: 28, name: 'Action', icon: 'fa-fire', color: '#ff4d4d', movieIds: [28], tvIds: [10759] },
    { id: 12, name: 'Adventure', icon: 'fa-compass', color: '#22c55e', movieIds: [12], tvIds: [10759] },
    { id: 16, name: 'Animation', icon: 'fa-palette', color: '#f472b6', movieIds: [16], tvIds: [16] },
    { id: 35, name: 'Comedy', icon: 'fa-face-laugh', color: '#fbbf24', movieIds: [35], tvIds: [35] },
    { id: 80, name: 'Crime', icon: 'fa-mask', color: '#94a3b8', movieIds: [80], tvIds: [80] },
    { id: 99, name: 'Documentary', icon: 'fa-video', color: '#0ea5e9', movieIds: [99], tvIds: [99] },
    { id: 18, name: 'Drama', icon: 'fa-masks-theater', color: '#a78bfa', movieIds: [18], tvIds: [18] },
    { id: 10751, name: 'Family', icon: 'fa-house-user', color: '#22c55e', movieIds: [10751], tvIds: [10751] },
    { id: 14, name: 'Fantasy', icon: 'fa-wand-sparkles', color: '#f43f5e', movieIds: [14], tvIds: [10765] },
    { id: 36, name: 'History', icon: 'fa-book-atlas', color: '#d97706', movieIds: [36], tvIds: [] },
    { id: 27, name: 'Horror', icon: 'fa-ghost', color: '#e11d48', movieIds: [27], tvIds: [] },
    { id: 10402, name: 'Music', icon: 'fa-music', color: '#c084fc', movieIds: [10402], tvIds: [] },
    { id: 9648, name: 'Mystery', icon: 'fa-magnifying-glass', color: '#6366f1', movieIds: [9648], tvIds: [9648] },
    { id: 10749, name: 'Romance', icon: 'fa-heart', color: '#ec4899', movieIds: [10749], tvIds: [] },
    { id: 878, name: 'Science Fiction', icon: 'fa-shuttle-space', color: '#22d3ee', movieIds: [878], tvIds: [10765] },
    { id: 10770, name: 'TV Movie', icon: 'fa-tv', color: '#60a5fa', movieIds: [10770], tvIds: [] },
    { id: 53, name: 'Thriller', icon: 'fa-bolt', color: '#fb7185', movieIds: [53], tvIds: [] },
    { id: 10752, name: 'War', icon: 'fa-shield-halved', color: '#b91c1c', movieIds: [10752], tvIds: [10768] },
    { id: 37, name: 'Western', icon: 'fa-hat-cowboy', color: '#f59e0b', movieIds: [37], tvIds: [] },
    { id: 10759, name: 'Action & Adventure', icon: 'fa-person-running', color: '#ff4d4d', movieIds: [], tvIds: [10759] },
    { id: 10762, name: 'Kids', icon: 'fa-child', color: '#60a5fa', movieIds: [], tvIds: [10762] },
    { id: 10763, name: 'News', icon: 'fa-newspaper', color: '#ef4444', movieIds: [], tvIds: [10763] },
    { id: 10764, name: 'Reality', icon: 'fa-film', color: '#f97316', movieIds: [], tvIds: [10764] },
    { id: 10765, name: 'Sci-Fi & Fantasy', icon: 'fa-dragon', color: '#22d3ee', movieIds: [], tvIds: [10765] },
    { id: 10766, name: 'Soap', icon: 'fa-heart', color: '#fb7185', movieIds: [], tvIds: [10766] },
    { id: 10767, name: 'Talk', icon: 'fa-microphone', color: '#8b5cf6', movieIds: [], tvIds: [10767] },
    { id: 10768, name: 'War & Politics', icon: 'fa-flag', color: '#b91c1c', movieIds: [], tvIds: [10768] }
];

const TMDB_GENRE_FILTER_BY_ID = new Map(TMDB_GENRE_FILTERS.map((entry) => [entry.id, entry]));

function getGenreNames(genres) {
    if (!genres) return [];
    if (Array.isArray(genres)) {
        return genres.map(g => {
            if (typeof g === 'string') return g.toLowerCase().trim();
            if (typeof g === 'object' && g.name) return g.name.toLowerCase().trim();
            if (typeof g === 'number') return (GENRE_MAP[g] || '').toLowerCase().trim();
            return '';
        }).filter(g => g);
    }
    if (typeof genres === 'string') {
        return genres.split(',').map(g => g.trim().toLowerCase());
    }
    return [];
}

/* --- Watchlist Logic --- */
let currentModalMovie = null;

function getWatchlist() {
    return JSON.parse(localStorage.getItem('streamverse_watchlist') || '[]');
}

function saveWatchlist(list) {
    localStorage.setItem('streamverse_watchlist', JSON.stringify(list));
    window.dispatchEvent(new Event('storage'));
}

function isInWatchlist(id) {
    return getWatchlist().some(item => String(item.id) === String(id));
}

function handleWatchlistToggle(id, type, provider) {
    if (!currentModalMovie) return;
    
    let list = getWatchlist();
    const index = list.findIndex(item => String(item.id) === String(id));
    const btn = document.getElementById('modal-watchlist-btn');

    if (index > -1) {
        list.splice(index, 1);
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-plus"></i> Add to List';
            btn.classList.remove('btn-in-list');
            btn.classList.add('btn-add-list');
        }
    } else {
        const item = {
            id, type, provider,
            title: getTitle(currentModalMovie),
            poster: getPoster(currentModalMovie),
            year: getYear(currentModalMovie),
            rating: getRating(currentModalMovie),
            addedAt: Date.now()
        };
        list.unshift(item); // Change push to unshift, to show newest first
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-check"></i> In Your List';
            btn.classList.add('btn-in-list');
            btn.classList.remove('btn-add-list');
        }
    }
    saveWatchlist(list);
}
const IMG_BASE = 'https://image.tmdb.org/t/p/';
const API_TIMEOUT_MS = 7000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_PREFIX = 'sv_cache_v1:';
const DETAIL_CACHE_TTL_MS = 30 * 60 * 1000;

// ------------------ API SWITCHER ------------------------------------------
function toggleApi(source) {
    const next = String(source || '').toLowerCase() === 'local' ? 'local' : 'prod';
    localStorage.setItem('api_source', next);
    window.location.reload();
}

function getDefaultApiSource() {
    const host = String(window.location.hostname || '').toLowerCase();
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
    return isLocalHost ? 'local' : 'prod';
}

function getCurrentApiSource() {
    const saved = String(localStorage.getItem('api_source') || '').toLowerCase();
    const source = saved === 'local' || saved === 'prod' ? saved : getDefaultApiSource();
    const host = String(window.location.hostname || '').toLowerCase();
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
    if (!isLocalHost && source === 'local') return 'prod';
    return source;
}

let BASE_URL = getCurrentApiSource() === 'local' ? LOCAL_API : PROD_API;
let FALLBACK_DISABLED = false;

function getCacheKey(key) {
    return `${CACHE_PREFIX}${BASE_URL}:${key}`;
}

function readCache(key) {
    try {
        const raw = localStorage.getItem(getCacheKey(key));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if (!parsed.ts || !parsed.data) return null;
        if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
        return parsed.data;
    } catch (_) {
        return null;
    }
}

function writeCache(key, data) {
    try {
        localStorage.setItem(getCacheKey(key), JSON.stringify({ ts: Date.now(), data }));
    } catch (_) {
        // Ignore cache write errors (quota/private mode)
    }
}

async function fetchJson(url, timeoutMs = API_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
            const err = new Error(`HTTP ${res.status}`);
            err.status = res.status;
            throw err;
        }
        const text = await res.text();
        // Sanity check: If we see source code clues (common in misconfigured fallbacks), abort JSON parse
        if (text.trim().startsWith('require(') || text.trim().startsWith('import ') || text.trim().startsWith('module.exports')) {
            const codeErr = new Error('API returned source code instead of JSON');
            codeErr.isSourceLeak = true;
            throw codeErr;
        }
        // Check for HTML responses
        if (text.trim().startsWith('<') || text.includes('<html') || text.includes('<body')) {
            const htmlErr = new Error('API returned HTML instead of JSON');
            htmlErr.isHtmlResponse = true;
            throw htmlErr;
        }
        try {
            return JSON.parse(text);
        } catch (e) {
            console.error('Failed to parse JSON response:', text.slice(0, 100));
            throw new Error(`Invalid JSON response: ${e.message}`);
        }
    } catch (err) {
        if (err?.name === 'AbortError') {
            const timeoutErr = new Error('Request timed out');
            timeoutErr.isTimeout = true;
            throw timeoutErr;
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}
async function fetchJsonWithFallback(urlOrPath, timeoutMs = API_TIMEOUT_MS) {
    let fullUrl = urlOrPath.startsWith('http') ? urlOrPath : `${BASE_URL}${urlOrPath}`;
    try {
        return await fetchJson(fullUrl, timeoutMs);
    } catch (err) {
        if (getCurrentApiSource() === 'prod' && FALLBACK_API) {
            console.warn(`Primary API failed, trying fallback: ${urlOrPath}`);
            let fallbackUrl = urlOrPath;
            if (urlOrPath.startsWith(BASE_URL)) {
                fallbackUrl = urlOrPath.replace(BASE_URL, FALLBACK_API);
            } else if (!urlOrPath.startsWith('http')) {
                fallbackUrl = `${FALLBACK_API}${urlOrPath}`;
            } else {
                // Handle provider-specific absolute URLs without hardcoding a single production host
                fallbackUrl = PROD_API_HOST && FALLBACK_API_HOST
                    ? urlOrPath.replace(PROD_API_HOST, FALLBACK_API_HOST)
                    : urlOrPath;
            }
            try {
                return await fetchJson(fallbackUrl, timeoutMs + 3000);
            } catch (fallbackErr) {
                console.error('Fallback API also failed:', fallbackErr);
                throw err; // Throw original error if fallback also fails
            }
        }
        throw err;
    }
}

// ------------------ DOM ELEMENTS ------------------------------------------
const heroContainer = document.getElementById('hero-info');
const heroSection = document.getElementById('hero-section');
const trendingGrid = document.getElementById('trending-grid');
const popularMoviesGrid = document.getElementById('popular-movies-grid');
const popularTvGrid = document.getElementById('popular-tv-grid');
const topRatedGrid = document.getElementById('top-rated-grid');
const searchInput = document.getElementById('search-input');
const searchContainer = document.getElementById('search-container');
const searchPage = document.getElementById('search-page');
const searchPageGrid = document.getElementById('search-page-grid');
const searchTitle = document.getElementById('search-title');
const contentRows = document.getElementById('content-rows');
const movieModal = document.getElementById('movie-modal');
const modalBody = document.getElementById('modal-body');
const closeModal = document.querySelector('.close-modal');
const header = document.getElementById('main-header');
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const genreFilterBtn = document.getElementById('genre-filter-btn');
const genreFilterPanel = document.getElementById('genre-filter-panel');
// const mobileNav = document.getElementById('mobile-nav'); // Removed
const dramasGrid = document.getElementById('dramas-grid');
const continueWatchingSection = document.getElementById('continue-watching-section');
const continueWatchingGrid = document.getElementById('continue-watching-grid');
const heroDotsEl = document.getElementById('hero-dots');
const errorPage = document.getElementById('error-page');

// ------------------ ERROR HANDLING ----------------------------------------
function showErrorPage() {
    // Hide main content
    if (heroSection) heroSection.style.display = 'none';
    if (contentRows) contentRows.style.display = 'none';
    if (searchPage) searchPage.style.display = 'none';
    // Show error page
    if (errorPage) errorPage.style.display = 'flex';
}
const heroPrevBtn = document.getElementById('hero-prev');
const heroNextBtn = document.getElementById('hero-next');
const heroControls = document.getElementById('hero-controls');


// ------------------ STATE -------------------------------------------------
let heroItems = [];
let heroIndex = 0;
let heroInterval;
const HERO_ROTATION_MS = 8000;
let heroProgressRaf = null;
let heroProgressStartedAt = 0;
let heroProgressPausedAt = 0;
let heroProgressElapsedBeforePause = 0;
const detailsMemoryCache = new Map();
const detailsInFlight = new Map();
const similarMemoryCache = new Map();
const SIMILAR_CACHE_TTL_MS = 10 * 60 * 1000;
let activeModalRequestId = 0;
let searchVersion = 0;
let hydrationObserver = null;
let continueSelectionMode = false;
let continueSelectedKeys = new Set();
let activeGenreFilterId = null;
let activeGenreFilterIds = [];
let activeGenreTypeFilter = 'all';
let activeGenreMatchMode = 'all';
let activeGenreSortBy = 'popularity.desc';
let activeGenreMinVotes = 20;
let genreFilterPanelOpen = false;
let genreFilterRequestVersion = 0;
let genreResultsRequestVersion = 0;
let activeGenreDiscoverState = null;
let genreResultsObserver = null;
const continuePosterCache = new Map();
const continuePosterInFlight = new Map();

const continueClearToggleBtn = document.getElementById('continue-clear-toggle');
const continueClearConfirmBtn = document.getElementById('continue-clear-confirm');
const continueClearAllBtn = document.getElementById('continue-clear-all');
const continueClearCancelBtn = document.getElementById('continue-clear-cancel');

// ------------------ SCROLL HANDLER ----------------------------------------
window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 50);
});
// Initial check
header.classList.toggle('scrolled', window.scrollY > 50);

// ------------------ INIT --------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    renderGenreFilterPanel();
    updateGenreFilterButtonState();

    if (genreFilterBtn) {
        genreFilterBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleGenreFilterPanel();
        });
    }

    if (genreFilterPanel) {
        genreFilterPanel.addEventListener('click', (event) => {
            event.stopPropagation();
        });
    }

    document.addEventListener('click', (event) => {
        if (!genreFilterPanelOpen) return;
        if (genreFilterPanel && genreFilterPanel.contains(event.target)) return;
        if (genreFilterBtn && genreFilterBtn.contains(event.target)) return;
        closeGenreFilterPanel();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && genreFilterPanelOpen) {
            closeGenreFilterPanel();
        }
    });

    updateSwitcherState();
    initHeroManualControls();
    initContinueWatchingControls();
    applyContinueGridLayout();
    loadContinueWatching();

    const promises = [
        fetchTrending(),
        fetchSection('movie', popularMoviesGrid, 'movie'),
        fetchSection('tv', popularTvGrid, 'tv'),
        fetchSection('movie', topRatedGrid, 'movie', 'week')
    ];

    const results = await Promise.allSettled(promises);
    const allFailed = results.every(result => result.status === 'rejected' || result.value === false);

    if (allFailed) {
        showErrorPage();
    }
});

window.addEventListener('resize', () => {
    applyContinueGridLayout();
});

// ------------------ HELPERS -----------------------------------------------
function isTmdbImageUrl(value) {
    try {
        const parsed = new URL(String(value || '').trim(), window.location.href);
        return parsed.hostname === 'image.tmdb.org';
    } catch (_) {
        return false;
    }
}

// Consumet returns full URLs for images already, but sometimes relative paths.
function imgUrl(path, size = 'w500') {
    const raw = String(path || '').trim();
    const isBad = !raw || raw.length < 5 ||
        raw.includes('placehold.co') || raw.includes('dramaool.png') ||
        raw.includes('no-image') || raw.includes('default-poster') ||
        raw.includes('originalnull') || raw.includes('originalundefined');

    if (isBad) {
        return 'https://placehold.co/300x450/1a1a2e/e50914?text=No+Image';
    }

    if (raw.startsWith('http') || raw.startsWith('//')) {
        const url = raw.startsWith('//') ? 'https:' + raw : raw.replace('http:', 'https:');
        return isTmdbImageUrl(url) ? url : 'https://placehold.co/300x450/1a1a2e/e50914?text=No+Image';
    }

    // TMDB relative paths always start with /
    if (raw.startsWith('/')) {
        if (/^\/t\/p\//i.test(raw)) return `https://image.tmdb.org${raw}`;
        return `${IMG_BASE}${size}${raw}`;
    }

    if (raw.length > 0 && !raw.includes('/') && !raw.includes('.')) {
        return `${IMG_BASE}${size}/${raw}`;
    }

    return 'https://placehold.co/300x450/1a1a2e/e50914?text=No+Image';
}

function coverUrl(path) {
    return imgUrl(path, 'w1280');
}

function getTitle(item) {
    if (!item) return 'Unknown';
    const fields = [
        item.title, item.name, item.originalTitle, item.original_title,
        item.originalName, item.original_name, item.romaji, item.english,
        item.altTitles?.[0], item.synonyms?.[0]
    ];
    let t = '';
    for (const f of fields) {
        if (f && typeof f === 'string' && f.trim() && f !== 'Unknown' && f !== 'null' && f !== 'undefined') {
            t = f.trim();
            break;
        }
    }
    if (!t) return 'Unknown';
    // Clean up Dramacool specific titles (remove episode info for the grid)
    if (item.provider === 'dramacool') {
        t = t.replace(/\s*\(.*?\)\s*/g, ' ').replace(/Episode\s+\d+.*/i, '').trim();
    }
    return t;
}
function getYear(item) {
    if (!item) return 'N/A';
    const raw = item.releaseDate || item.release_date || item.first_air_date ||
        item.startDate?.year || item.airDate || item.premiered || item.year || '';
    if (typeof raw === 'object' && raw?.year) return String(raw.year);
    const str = String(raw).trim();
    const y = str.slice(0, 4);
    return (y && /^\d{4}$/.test(y)) ? y : 'N/A';
}
function getRating(item) {
    const r = item.rating || item.vote_average || item.score || item.averageScore;
    const n = parseFloat(r || 0);
    // AniList scores are 0-100, TMDB/Consumet are 0-10
    if (n > 10) return (n / 10).toFixed(1);
    return n.toFixed(1);
}

function hasPositiveRating(item) {
    return Number(getRating(item) || 0) > 0;
}

function getPoster(item) {
    const candidates = [
        item?.poster_path,
        item?.posterPath,
        item?.tmdbPoster,
        item?.tmdbPosterUrl,
        item?.poster,
        item?.posterUrl,
        item?.image,
        item?.img,
        item?.thumbnail,
        item?.coverImage?.large,
        item?.coverImage?.medium,
    ];
    for (const candidate of candidates) {
        const poster = imgUrl(candidate);
        if (!poster.includes('placehold.co')) return poster;
    }
    return imgUrl('');
}
function getCover(item) {
    const candidates = [
        item?.backdrop_path,
        item?.backdropPath,
        item?.tmdbBackdrop,
        item?.cover,
        item?.image,
        item?.poster_path,
        item?.posterPath,
        item?.poster,
        item?.coverImage?.extraLarge,
    ];
    for (const candidate of candidates) {
        const cover = imgUrl(candidate, 'w1280');
        if (!cover.includes('placehold.co')) return cover;
    }
    return imgUrl('', 'w1280');
}
function getType(item) {
    if (!item) return 'movie';
    const t = String(item.type || item.media_type || item.format || '').toLowerCase();

    // Explicit indicators
    if (['tv series', 'tv', 'tv_series', 'show', 'special', 'ova', 'ona', 'tv_short'].includes(t)) {
        return 'tv';
    }
    if (t === 'movie' || t === 'film' || t === 'movie_short') return 'movie';

    // TMDB-style date signals are more reliable than episode counters in mixed payloads.
    const hasFirstAirDate = Boolean(item.first_air_date || item.firstAirDate);
    const hasReleaseDate = Boolean(item.release_date || item.releaseDate);
    if (hasFirstAirDate && !hasReleaseDate) return 'tv';
    if (hasReleaseDate && !hasFirstAirDate) return 'movie';

    // Conservative fallback: infer TV only from clear structural signals.
    const hasSeasons = Array.isArray(item.seasons) && item.seasons.length > 0;
    const hasManyEps = Array.isArray(item.episodes) && item.episodes.length > 1;

    if (hasSeasons || hasManyEps) {
        return 'tv';
    }

    return 'movie';
}

function getItemProvider(item) {
    const explicit = String(item?.provider || item?.source || item?.sourceProvider || '').trim().toLowerCase();
    if (explicit) return explicit;

    const source = String(item?.url || item?.link || item?.sourceUrl || item?.href || item?.id || '').trim().toLowerCase();
    if (!source) return '';

    if (source.includes('dramacool')) return 'dramacool';
    if (source.includes('flixhq')) return 'flixhq';
    if (source.includes('animekai')) return 'animekai';
    if (source.includes('animesalt')) return 'animesalt';
    if (source.includes('justanime')) return 'justanime';
    if (source.includes('satoru')) return 'satoru';

    return '';
}

function getDetailKey(id, type, provider = '') {
    const canonicalId = provider ? id : normalizeTmdbId(id);
    return `trailer-v2:${provider || 'meta'}:${type}:${canonicalId}`;
}

function normalizeTmdbId(id) {
    const raw = String(id || '').trim();
    if (!raw) return raw;
    if (/^\d+$/.test(raw)) return raw;

    // Avoid guessing from slug tails (they can be provider episode IDs, not TMDB IDs).
    // Prefer explicit TMDB mapping fields at call sites when available.
    return raw;
}

function readDetailCache(id, type, provider = '') {
    const key = getDetailKey(id, type, provider);
    const mem = detailsMemoryCache.get(key);
    if (mem && Date.now() - mem.ts < DETAIL_CACHE_TTL_MS) return mem.data;
    try {
        const raw = localStorage.getItem(`${CACHE_PREFIX}detail:${key}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.ts || !parsed?.data) return null;
        if (Date.now() - parsed.ts > DETAIL_CACHE_TTL_MS) return null;
        detailsMemoryCache.set(key, { ts: parsed.ts, data: parsed.data });
        return parsed.data;
    } catch (_) {
        return null;
    }
}

// Compatibility alias used by Similar Finds pipeline.
function readFreshDetailCache(id, type, provider = '') {
    return readDetailCache(id, type, provider);
}

function readStaleDetailCache(id, type, provider = '') {
    const key = getDetailKey(id, type, provider);
    const mem = detailsMemoryCache.get(key);
    if (mem?.data) return mem.data;
    try {
        const raw = localStorage.getItem(`${CACHE_PREFIX}detail:${key}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.data || null;
    } catch (_) {
        return null;
    }
}

function writeDetailCache(id, type, provider = '', data) {
    const key = getDetailKey(id, type, provider);
    const payload = { ts: Date.now(), data };
    detailsMemoryCache.set(key, payload);
    try {
        localStorage.setItem(`${CACHE_PREFIX}detail:${key}`, JSON.stringify(payload));
    } catch (_) {
        // Ignore cache write errors
    }
}

// ------------------ CONTINUE WATCHING -------------------------------------
function loadContinueWatching() {
    if (!continueWatchingGrid || !continueWatchingSection) return;
    applyContinueGridLayout();

    const raw = localStorage.getItem('sv_continue_watching');
    if (!raw) {
        continueWatchingSection.style.display = 'none';
        updateContinueWatchingControls(0);
        return;
    }

    try {
        const items = JSON.parse(raw);
        const validItems = Array.isArray(items)
            ? items.filter((item) => item && String(item.id || '').trim() && String(item.type || '').trim())
            : [];

        if (validItems.length === 0) {
            continueWatchingSection.style.display = 'none';
            continueWatchingGrid.innerHTML = '';
            updateContinueWatchingControls(0);
            return;
        }

        renderContinueWatching(validItems);
        updateContinueWatchingControls(validItems.length);
    } catch (e) {
        console.error('Error loading continue watching:', e);
        continueWatchingSection.style.display = 'none';
        continueWatchingGrid.innerHTML = '';
        updateContinueWatchingControls(0);
    }
}

function applyContinueGridLayout() {
    if (!continueWatchingGrid) return;
    const width = window.innerWidth || document.documentElement.clientWidth || 0;
    let cols = 6;
    if (width <= 420) cols = 1;
    else if (width <= 560) cols = 2;
    else if (width <= 768) cols = 3;

    continueWatchingGrid.style.setProperty('display', 'grid', 'important');
    continueWatchingGrid.style.setProperty('grid-template-columns', `repeat(${cols}, minmax(0, 1fr))`, 'important');
    continueWatchingGrid.style.setProperty('gap', '1.2rem', 'important');
    continueWatchingGrid.style.setProperty('align-items', 'start', 'important');
    continueWatchingGrid.style.setProperty('grid-auto-flow', 'row', 'important');
}

function getContinueItemKey(item) {
    return `${String(item?.type || '').toLowerCase()}:${String(item?.id || '')}`;
}

function getContinueWatchingItems() {
    try {
        const raw = localStorage.getItem('sv_continue_watching');
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function removeContinueWatchingEntry(id, type) {
    try {
        const items = getContinueWatchingItems();
        const filtered = items.filter((row) => !(
            String(row?.id || '') === String(id || '') &&
            String(row?.type || '').toLowerCase() === String(type || '').toLowerCase()
        ));
        localStorage.setItem('sv_continue_watching', JSON.stringify(filtered));
    } catch (_) {
        // Ignore storage failures.
    }
}

function initContinueWatchingControls() {
    if (!continueClearToggleBtn || !continueClearConfirmBtn || !continueClearCancelBtn) return;

    continueClearToggleBtn.addEventListener('click', () => {
        continueSelectionMode = true;
        continueSelectedKeys = new Set();
        loadContinueWatching();
    });

    continueClearCancelBtn.addEventListener('click', () => {
        continueSelectionMode = false;
        continueSelectedKeys = new Set();
        loadContinueWatching();
    });

    continueClearConfirmBtn.addEventListener('click', () => {
        if (!continueSelectedKeys.size) return;
        const items = getContinueWatchingItems();
        const filtered = items.filter((item) => !continueSelectedKeys.has(getContinueItemKey(item)));
        localStorage.setItem('sv_continue_watching', JSON.stringify(filtered));
        continueSelectionMode = false;
        continueSelectedKeys = new Set();
        loadContinueWatching();
    });

    if (continueClearAllBtn) {
        continueClearAllBtn.addEventListener('click', () => {
            localStorage.removeItem('sv_continue_watching');
            continueSelectionMode = false;
            continueSelectedKeys = new Set();
            loadContinueWatching();
        });
    }
}

function updateContinueWatchingControls(totalCount = 0) {
    if (!continueClearToggleBtn || !continueClearConfirmBtn || !continueClearCancelBtn) return;

    const hasItems = Number(totalCount) > 0;
    continueClearToggleBtn.style.display = hasItems && !continueSelectionMode ? 'inline-flex' : 'none';
    continueClearConfirmBtn.style.display = hasItems && continueSelectionMode ? 'inline-flex' : 'none';
    if (continueClearAllBtn) {
        continueClearAllBtn.style.display = hasItems && continueSelectionMode ? 'inline-flex' : 'none';
    }
    continueClearCancelBtn.style.display = hasItems && continueSelectionMode ? 'inline-flex' : 'none';

    const selectedCount = continueSelectedKeys.size;
    continueClearConfirmBtn.textContent = selectedCount > 0 ? `Clear Selected (${selectedCount})` : 'Clear Selected';
    continueClearConfirmBtn.disabled = selectedCount === 0;
    continueClearConfirmBtn.style.opacity = selectedCount === 0 ? '0.55' : '1';
    continueClearConfirmBtn.style.cursor = selectedCount === 0 ? 'not-allowed' : 'pointer';
}

function toggleContinueSelection(item) {
    const key = getContinueItemKey(item);
    if (continueSelectedKeys.has(key)) {
        continueSelectedKeys.delete(key);
    } else {
        continueSelectedKeys.add(key);
    }
    loadContinueWatching();
}

function renderContinueWatching(items) {
    if (!Array.isArray(items) || items.length === 0) {
        continueWatchingGrid.innerHTML = '';
        continueWatchingSection.style.display = 'none';
        updateContinueWatchingControls(0);
        return;
    }

    continueWatchingGrid.innerHTML = '';
    continueWatchingSection.style.display = 'block';

    const maxInitialCards = 6;
    const initialItems = continueSelectionMode ? items.slice() : items.slice(0, maxInitialCards);
    const remainingItems = continueSelectionMode ? [] : items.slice(maxInitialCards);

    // Render initial cards
    initialItems.forEach(item => {
        const card = createContinueWatchingCard(item);
        continueWatchingGrid.appendChild(card);
    });

    // Add "more..." button if there are more items
    if (remainingItems.length > 0) {
        const moreButton = document.createElement('div');
        moreButton.className = 'continue-more-button';
        moreButton.innerHTML = `
            <div class="more-button-content">
                <i class="fa-solid fa-plus"></i>
                <span>Show ${remainingItems.length} more</span>
            </div>
        `;

        moreButton.onclick = () => {
            // Remove the button
            moreButton.remove();

            // Add remaining cards
            remainingItems.forEach(item => {
                const card = createContinueWatchingCard(item);
                continueWatchingGrid.appendChild(card);
            });
        };

        continueWatchingGrid.appendChild(moreButton);
    }
}

function isBadContinuePoster(url) {
    const value = String(url || '');
    if (!value) return true;
    const low = value.toLowerCase();
    return low.includes('placehold.co') || low.includes('no+image') || low.includes('dramaool.png') || low.includes('default-poster') || low.includes('null');
}

function normalizeContinuePosterIdentity(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isLikelySameContinueTitle(seedTitle, candidateTitle) {
    const a = normalizeContinuePosterIdentity(seedTitle);
    const b = normalizeContinuePosterIdentity(candidateTitle);
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
}

async function resolveContinueWatchingTmdbPoster(item) {
    const type = String(item?.type || 'movie').toLowerCase() === 'tv' ? 'tv' : 'movie';
    const id = String(item?.id || '').trim();
    const cacheKey = `${type}:${id}`;
    if (!id) return '';

    const cached = continuePosterCache.get(cacheKey);
    if (cached) return cached;
    if (continuePosterInFlight.has(cacheKey)) return continuePosterInFlight.get(cacheKey);

    const promise = (async () => {
        try {
            // Prefer canonical TMDB payload (no provider override).
            const details = await fetchDetails(id, type, '');
            const detailsTitle = getTitle(details);
            const seedTitle = item?.title || '';
            const poster = getPoster(details);
            if (poster && !isBadContinuePoster(poster) && isLikelySameContinueTitle(seedTitle, detailsTitle)) {
                continuePosterCache.set(cacheKey, poster);
                return poster;
            }
        } catch (_) {
            // Ignore and fallback below.
        }

        // Fallback: search by title and choose best identity match.
        try {
            const seedTitle = String(item?.title || '').trim();
            if (!seedTitle) return '';
            const payload = await fetchJsonWithFallback(`/${encodeURIComponent(seedTitle)}`, 5000);
            const rows = Array.isArray(payload?.results) ? payload.results : [];
            const best = rows
                .filter((candidate) => String(getType(candidate) || '').toLowerCase() === type)
                .map((candidate) => {
                    const sameTitle = isLikelySameContinueTitle(seedTitle, getTitle(candidate));
                    const score = (sameTitle ? 120 : 0) + Number(getRating(candidate) || 0);
                    return { candidate, score, sameTitle };
                })
                .sort((a, b) => b.score - a.score)[0];
            if (best?.sameTitle && best.score >= 120) {
                const poster = getPoster(best.candidate);
                if (poster && !isBadContinuePoster(poster)) {
                    continuePosterCache.set(cacheKey, poster);
                    return poster;
                }
            }
        } catch (_) {
            // Ignore; keep existing poster.
        }

        return '';
    })();

    continuePosterInFlight.set(cacheKey, promise);
    try {
        return await promise;
    } finally {
        continuePosterInFlight.delete(cacheKey);
    }
}

function createContinueWatchingCard(item) {
    const card = document.createElement('div');
    const itemKey = getContinueItemKey(item);
    const isSelected = continueSelectedKeys.has(itemKey);
    card.className = `movie-card continue-card ${continueSelectionMode ? 'selection-mode' : ''} ${isSelected ? 'selected' : ''}`.trim();

    const watchedPercent = Math.min(100, (item.currentTime / item.duration) * 100) || 0;
    const timeLeft = Math.max(0, item.duration - item.currentTime);

    const formatTime = (seconds) => {
        if (!seconds || seconds < 0) return '0:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const lastWatchedDate = new Date(item.lastUpdated).toLocaleDateString();

    const getPrettyAudio = (token, label) => {
        // Prefer the rich display label saved directly from the active track
        const rawLabel = String(label || token || '').trim();
        if (!rawLabel) return 'SUB';

        const low = rawLabel.toLowerCase();

        // Known keyword mappings
        if (low.includes('hindi')) return 'HINDI';
        if (low.includes('japan') || low === 'jpn' || low === 'jp') return 'JPN';
        if (low.includes('english') || low === 'eng' || low === 'en') return 'ENG';
        if (low.includes('tamil') || low === 'tam') return 'TAMIL';
        if (low.includes('telugu') || low === 'tel') return 'TEL';
        if (low.includes('kannada') || low === 'kan') return 'KAN';
        if (low.includes('malayalam') || low === 'mal') return 'MAL';
        if (low.includes('korean') || low === 'kor' || low === 'ko') return 'KOR';
        if (low.includes('chinese') || low === 'chi' || low === 'zh') return 'CHI';
        if (low.includes('dubbed') || low === 'dub') return 'DUB';
        if (low === 'subbed' || low === 'sub') return 'SUB';
        if (low === 'auto') return 'AUTO';

        // For anything else (e.g. "Bangla", "Punjabi"): title-case and cap at 6 chars
        const titleCased = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
        return titleCased.length > 6 ? titleCased.substring(0, 6).toUpperCase() : titleCased.toUpperCase();
    };
    const audioLabel = getPrettyAudio(item.audio, item.audioLabel);

    const seasonNoRaw = Number(item?.seasonNo);
    const seasonNo = Number.isFinite(seasonNoRaw) && seasonNoRaw > 0
        ? seasonNoRaw
        : (() => {
            const legacySeasonIndex = Number(item?.seasonIndex);
            if (Number.isFinite(legacySeasonIndex) && legacySeasonIndex >= 0) return legacySeasonIndex + 1;
            const legacySeason = Number(item?.season);
            if (Number.isFinite(legacySeason) && legacySeason >= 0) return legacySeason + 1;
            return 1;
        })();
    const episodeNoRaw = Number(item?.episodeNo);
    const episodeNo = Number.isFinite(episodeNoRaw) && episodeNoRaw > 0
        ? episodeNoRaw
        : (() => {
            const legacyEpisodeIndex = Number(item?.episodeIndex);
            if (Number.isFinite(legacyEpisodeIndex) && legacyEpisodeIndex >= 0) return legacyEpisodeIndex + 1;
            const legacyEpisode = Number(item?.episode);
            if (Number.isFinite(legacyEpisode) && legacyEpisode >= 0) return legacyEpisode + 1;
            return 1;
        })();
    const tvLabel = item.type === 'tv' ? ` - S${seasonNo}E${episodeNo}` : '';
    const seasonEpisodeBadge = item.type === 'tv' ? `<span class="season-episode-badge">S${seasonNo}E${episodeNo}</span>` : '';

    card.innerHTML = `
        <img class="continue-card-poster" src="${imgUrl(item.poster)}" alt="${item.title}" loading="lazy"
             onerror="this.src='https://placehold.co/300x450/1a1a2e/e50914?text=No+Image'">
        ${continueSelectionMode ? `<button type="button" class="continue-select-toggle ${isSelected ? 'selected' : ''}" aria-label="Select item for clearing"><i class="fa-solid fa-check"></i></button>` : ''}
        ${seasonEpisodeBadge}
        <div class="movie-card-meta-left">
            <span class="meta-pill-left">${formatTime(item.currentTime)}</span>
            <span class="meta-pill-left">${item.type === 'tv' ? 'TV' : 'Movie'}</span>
        </div>
        <div class="audio-badge">
            <span class="audio-dot"></span>
            ${audioLabel}
        </div>
        <div class="continue-play-overlay">
            <i class="fa-solid fa-play"></i>
        </div>
        <div class="progress-container">
            <div class="progress-bar" style="width: ${watchedPercent}%"></div>
        </div>
        <div class="movie-card-info">
            <h3 class="movie-card-title">${item.title}${tvLabel}</h3>
            <div class="continue-meta">
                <span>${formatTime(item.currentTime)} watched • ${formatTime(timeLeft)} left</span>
                <span>Last watched: ${lastWatchedDate}</span>
            </div>
        </div>
    `;

    const selectToggle = card.querySelector('.continue-select-toggle');
    if (selectToggle) {
        selectToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleContinueSelection(item);
        });
    }

    card.onclick = () => {
        if (continueSelectionMode) {
            toggleContinueSelection(item);
            return;
        }
        const providerPart = item.provider ? `&provider=${encodeURIComponent(item.provider)}` : '';
        const seasonEpisodePart = item.type === 'tv' ? `&season=${seasonNo}&episode=${episodeNo}` : '';
        const apiSource = getCurrentApiSource();
        const url = `player.html?id=${encodeURIComponent(item.id)}&type=${item.type}${providerPart}${seasonEpisodePart}&t=${Math.floor(item.currentTime)}&audio=${encodeURIComponent(item.audio || '')}&apiSource=${encodeURIComponent(apiSource)}`;
        window.location.href = url;
    };

    // Hydrate poster to TMDB art in background without blocking first render.
    const posterEl = card.querySelector('.continue-card-poster');
    if (posterEl) {
        resolveContinueWatchingTmdbPoster(item).then((tmdbPoster) => {
            if (!tmdbPoster || !posterEl.isConnected) return;
            posterEl.src = tmdbPoster;
        }).catch(() => { });
    }

    return card;
}

function normalizeDetailPayload(payload, id) {
    let movie = payload;
    if (movie?.data) movie = movie.data;
    if (Array.isArray(movie?.results) && movie.results.length) {
        movie = movie.results[0];
    }
    if (Array.isArray(movie) && movie.length) {
        movie = movie[0];
    }
    if (!movie || typeof movie !== 'object') throw new Error('Empty response');

    // Error handling for API returned messages
    if (movie.message && !movie.id && !movie.title && !movie.name) {
        throw new Error(movie.message);
    }

    if (!movie.id) movie.id = id;

    // Ensure title field is always populated for getTitle() to work
    if (!movie.title && !movie.name) {
        movie.title = movie.originalTitle || movie.original_title ||
            movie.originalName || movie.original_name || movie.romaji || movie.english || '';
    }

    // Standardize duration/runtime
    if (!movie.duration && (movie.runtime || movie.runTime)) {
        movie.duration = movie.runtime || movie.runTime;
    }

    // Standardize release dates
    if (!movie.releaseDate && (movie.release_date || movie.first_air_date || movie.startDate)) {
        movie.releaseDate = movie.release_date || movie.first_air_date || movie.startDate;
    }

    return movie;
}

function getDetailsUrl(id, type, provider = '') {
    const canonicalId = provider ? id : normalizeTmdbId(id);
    const safeType = (String(type || '').trim().toLowerCase() === 'tv') ? 'tv' : 'movie';
    return provider
    ? `${BASE_URL.replace('/meta/tmdb', '/movies/' + provider)}/info?id=${encodeURIComponent(canonicalId)}&type=${safeType}`
        : `${BASE_URL}/info/${canonicalId}?type=${safeType}`;
}

async function fetchDetails(id, type, provider = '') {
    const key = getDetailKey(id, type, provider);
    const inFlight = detailsInFlight.get(key);
    if (inFlight) return inFlight;

    const promise = (async () => {
        const url = getDetailsUrl(id, type, provider);
        const alternateType = type === 'tv' ? 'movie' : (type === 'movie' ? 'tv' : type);
        let data;
        let lastError;

        try {
            // Main path: one request chain (primary -> fallback) without noisy probe loops.
            data = await fetchJsonWithFallback(url, 9000);
        } catch (e) {
            lastError = e;
        }

        // Only try alternate type when primary likely failed due mismatch (404).
        if (!data && !provider && (type === 'tv' || type === 'movie')) {
            const status = Number(lastError?.status || 0);
            if (status === 404) {
                try {
                    data = await fetchJsonWithFallback(getDetailsUrl(id, alternateType, provider), 10000);
                } catch (e2) {
                    lastError = e2;
                }
            }
        }

        if (!data) throw lastError || new Error('Failed to fetch details');

        const movie = normalizeDetailPayload(data, id);
        writeDetailCache(id, type, provider, movie);
        return movie;
    })();

    detailsInFlight.set(key, promise);
    try {
        return await promise;
    } finally {
        detailsInFlight.delete(key);
    }
}

function getGenreInfo(genre) {
    const g = genre.toLowerCase();
    let icon = 'fa-tag', color = '#94a3b8';
    
    if (g.includes('action')) { icon = 'fa-fire'; color = '#ff4d4d'; }
    else if (g.includes('adventure')) { icon = 'fa-compass'; color = '#4ade80'; }
    else if (g.includes('animation')) { icon = 'fa-palette'; color = '#f472b6'; }
    else if (g.includes('comedy')) { icon = 'fa-face-laugh'; color = '#fbbf24'; }
    else if (g.includes('crime')) { icon = 'fa-mask'; color = '#94a3b8'; }
    else if (g.includes('documentary')) { icon = 'fa-video'; color = '#0ea5e9'; }
    else if (g.includes('drama')) { icon = 'fa-masks-theater'; color = '#a78bfa'; }
    else if (g.includes('family')) { icon = 'fa-house-user'; color = '#22c55e'; }
    else if (g.includes('fantasy')) { icon = 'fa-wand-sparkles'; color = '#f43f5e'; }
    else if (g.includes('history')) { icon = 'fa-book-atlas'; color = '#d97706'; }
    else if (g.includes('horror')) { icon = 'fa-ghost'; color = '#e11d48'; }
    else if (g.includes('music')) { icon = 'fa-music'; color = '#c084fc'; }
    else if (g.includes('mystery')) { icon = 'fa-magnifying-glass'; color = '#6366f1'; }
    else if (g.includes('romance')) { icon = 'fa-heart'; color = '#ec4899'; }
    else if (g.includes('sci-fi') || g.includes('science')) { icon = 'fa-shuttle-space'; color = '#22d3ee'; }
    else if (g.includes('thriller')) { icon = 'fa-bolt'; color = '#fb7185'; }
    else if (g.includes('war')) { icon = 'fa-shield-halved'; color = '#b91c1c'; }
    else if (g.includes('western')) { icon = 'fa-hat-cowboy'; color = '#f59e0b'; }
    else if (g.includes('anime')) { icon = 'fa-dragon'; color = '#f472b6'; }
    else if (g.includes('kids')) { icon = 'fa-child'; color = '#60a5fa'; }
    else if (g.includes('news')) { icon = 'fa-newspaper'; color = '#ef4444'; }

    return { icon, color };
}

// Reverse genre map for name to ID
const GENRE_NAME_TO_ID = {};
Object.entries(GENRE_MAP).forEach(([id, name]) => {
    GENRE_NAME_TO_ID[name.toLowerCase()] = parseInt(id);
});

const HOME_GENRE_FILTER_NAMES = [
    'Action',
    'Adventure',
    'Animation',
    'Comedy',
    'Crime',
    'Drama',
    'Family',
    'Fantasy',
    'Horror',
    'Mystery',
    'Romance',
    'Science Fiction',
    'Thriller'
];

function getHomeGenreFilters() {
    return TMDB_GENRE_FILTERS
        .map((entry) => ({
            id: entry.id,
            name: entry.name,
            icon: entry.icon || 'fa-film',
            color: entry.color || '#e50914',
            movieIds: Array.isArray(entry.movieIds) ? entry.movieIds.slice() : [],
            tvIds: Array.isArray(entry.tvIds) ? entry.tvIds.slice() : []
        }))
        .filter(Boolean);
}

function getActiveGenreLabel() {
    if (!Array.isArray(activeGenreFilterIds) || !activeGenreFilterIds.length) return 'Genre';
    if (activeGenreFilterIds.length === 1) {
        const id = activeGenreFilterIds[0];
        const name = GENRE_MAP[id] || 'Genre';
        return `${name} (${id})`;
    }
    return `${activeGenreFilterIds.length} Genres`;
}

function getActiveGenreScopeLabel() {
    if (activeGenreTypeFilter === 'movie') return 'Movies';
    if (activeGenreTypeFilter === 'tv') return 'TV Shows';
    return 'All Media';
}

function getActiveGenreMatchLabel() {
    return activeGenreMatchMode === 'all' ? 'Match All' : 'Match Any';
}

function getActiveGenreSortLabel() {
    const map = {
        'popularity.desc': 'Popular',
        'vote_average.desc': 'Top Rated',
        'vote_count.desc': 'Most Voted',
        'primary_release_date.desc': 'Newest Movies',
        'first_air_date.desc': 'Newest TV'
    };
    return map[activeGenreSortBy] || 'Popular';
}

function setActiveGenreScope(type) {
    const next = String(type || 'all').trim();
    activeGenreTypeFilter = next === 'movie' || next === 'tv' ? next : 'all';
    renderGenreFilterPanel();
    applyGenreFilter().catch(() => { });
}

function setActiveGenreMatchMode(mode) {
    const next = String(mode || 'all').trim();
    activeGenreMatchMode = next === 'any' ? 'any' : 'all';
    renderGenreFilterPanel();
    applyGenreFilter().catch(() => { });
}

function setActiveGenreSortBy(sortBy) {
    const next = String(sortBy || 'popularity.desc').trim();
    activeGenreSortBy = next || 'popularity.desc';
    renderGenreFilterPanel();
    applyGenreFilter().catch(() => { });
}

function getActiveGenreLabels() {
    if (!Array.isArray(activeGenreFilterIds) || !activeGenreFilterIds.length) return [];
    return activeGenreFilterIds
    .map((id) => `${GENRE_MAP[id] || 'Genre'} (${id})`)
        .filter(Boolean);
}

function getGenreResultsTitleText() {
    const labels = getActiveGenreLabels();
    if (!labels.length) return 'Genre';
    if (labels.length === 1) return labels[0];
    return labels.join(' + ');
}

function normalizeGenreSelection(ids) {
    const seen = new Set();
    const out = [];
    (ids || []).forEach((value) => {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0 || !GENRE_MAP[n] || seen.has(n)) return;
        seen.add(n);
        out.push(n);
    });
    return out;
}

function syncActiveGenrePrimary() {
    activeGenreFilterId = (activeGenreFilterIds && activeGenreFilterIds.length) ? activeGenreFilterIds[0] : null;
}

function filterItemsByActiveGenres(items) {
    const selected = normalizeGenreSelection(activeGenreFilterIds);
    if (selected.length <= 1) return Array.isArray(items) ? items : [];

    // TMDB discover results are already exact; do not re-filter them.
    if (activeGenreDiscoverState?.source === 'discover') {
        return Array.isArray(items) ? items : [];
    }

    return (items || []).filter((item) => {
        const ids = getGenreIds(item);
        return ids.length ? selected.some((gid) => ids.includes(gid)) : false;
    });
}

function updateGenreFilterButtonState() {
    if (!genreFilterBtn) return;
    const label = getActiveGenreLabel();
    genreFilterBtn.classList.toggle('active', Array.isArray(activeGenreFilterIds) && activeGenreFilterIds.length > 0);
    genreFilterBtn.setAttribute('aria-expanded', String(genreFilterPanelOpen));
    genreFilterBtn.title = (Array.isArray(activeGenreFilterIds) && activeGenreFilterIds.length > 0)
        ? `Genre: ${label} • ${getActiveGenreScopeLabel()} • ${getActiveGenreMatchLabel()} • ${getActiveGenreSortLabel()}`
        : 'Filter by genre';

    const labelNode = genreFilterBtn.querySelector('span');
    if (labelNode) {
        labelNode.textContent = label;
    }
}

function ensureGenreResultsSection() {
    if (!contentRows) return null;

    let section = document.getElementById('genre-results-section');
    if (section) return section;

    section = document.createElement('section');
    section.className = 'row-section';
    section.id = 'genre-results-section';
    section.style.display = 'none';
    section.innerHTML = `
        <div class="section-title-row">
            <h2 class="section-title" id="genre-results-title">Genre Results</h2>
            <button type="button" class="continue-action-btn" id="genre-results-more-btn" style="display:none;">Load More</button>
        </div>
        <p class="genre-results-meta" id="genre-results-meta"></p>
        <div class="movie-grid" id="genre-results-grid"></div>
        <div id="genre-results-sentinel" class="genre-results-sentinel" aria-hidden="true"></div>
    `;

    const firstRow = contentRows.querySelector('.row-section');
    if (firstRow) {
        contentRows.insertBefore(section, firstRow);
    } else {
        contentRows.appendChild(section);
    }

    const moreBtn = section.querySelector('#genre-results-more-btn');
    if (moreBtn) {
        moreBtn.addEventListener('click', () => {
            if (!activeGenreFilterId) return;
            loadMoreGenreResults(activeGenreFilterId).catch(() => { });
        });
    }

    if (!genreResultsObserver) {
        genreResultsObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                if (!activeGenreFilterId || !activeGenreDiscoverState) continue;
                if (activeGenreDiscoverState.loadingMore) continue;
                if (!activeGenreDiscoverState.hasMoreMovie && !activeGenreDiscoverState.hasMoreTv && !activeGenreDiscoverState.hasMoreMix) continue;
                loadMoreGenreResults(activeGenreFilterId).catch(() => { });
                break;
            }
        }, {
            root: null,
            rootMargin: '800px 0px',
            threshold: 0.1
        });
    }

    return section;
}

function updateGenreResultsSentinel() {
    const sentinel = document.getElementById('genre-results-sentinel');
    if (!sentinel || !genreResultsObserver) return;
    genreResultsObserver.disconnect();
    genreResultsObserver.observe(sentinel);
}

function isGenreResultsSentinelVisible() {
    const sentinel = document.getElementById('genre-results-sentinel');
    if (!sentinel) return false;
    const rect = sentinel.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    return rect.top <= viewportHeight + 1200;
}

function maybeAutoLoadMoreGenreResults() {
    if (genreResultsAutoLoadQueued) return;
    if (!activeGenreDiscoverState || !activeGenreFilterId) return;
    if (activeGenreDiscoverState.loadingMore) return;
    if (!isGenreResultsSentinelVisible()) return;
    if (!activeGenreDiscoverState.hasMoreMovie && !activeGenreDiscoverState.hasMoreTv && !activeGenreDiscoverState.hasMoreMix && !activeGenreDiscoverState.hasMore) return;

    genreResultsAutoLoadQueued = true;
    setTimeout(() => {
        genreResultsAutoLoadQueued = false;
        if (!activeGenreDiscoverState || !activeGenreFilterId) return;
        if (activeGenreDiscoverState.loadingMore) return;
        if (!isGenreResultsSentinelVisible()) return;
        if (!activeGenreDiscoverState.hasMoreMovie && !activeGenreDiscoverState.hasMoreTv && !activeGenreDiscoverState.hasMoreMix && !activeGenreDiscoverState.hasMore) return;
        loadMoreGenreResults(activeGenreFilterId).catch(() => { });
    }, 120);
}

function getGenreDiscoverCacheKey(genreId, options = {}) {
    const selectedIds = Array.isArray(options.selectedGenreIds) ? normalizeGenreSelection(options.selectedGenreIds) : [];
    const typeFilter = String(options.typeFilter || 'all').trim() || 'all';
    const matchMode = String(options.matchMode || 'all').trim() || 'all';
    const sortBy = String(options.sortBy || 'popularity.desc').trim() || 'popularity.desc';
    const mediaScope = String(options.mediaScope || 'all').trim() || 'all';
    if (!selectedIds.length) {
        return `search-verified:v4:genre:${genreId}:all`;
    }
    return `search-verified:v4:genre:${selectedIds.join('-')}:type:${typeFilter}:match:${matchMode}:sort:${sortBy}:scope:${mediaScope}`;
}

const VERIFIED_GENRE_PAGE_LIMIT = 1000;
const VERIFIED_GENRE_INITIAL_TARGET = 72;
const VERIFIED_GENRE_MORE_TARGET = 60;
const VERIFIED_GENRE_PAGE_SIZE = VERIFIED_GENRE_MORE_TARGET;
const mediaGenreResolutionCache = new Map();
let genreResultsAutoLoadQueued = false;

function getMediaIdentityKey(item, fallbackType = 'movie') {
    const type = inferMediaType(item, fallbackType === 'tv' ? 'tv' : 'movie');
    const id = String(item?.id || '').trim();
    return id ? `${type}:${id}` : '';
}

function getGenreFilterConfig(genreId) {
    return TMDB_GENRE_FILTER_BY_ID.get(Number(genreId)) || null;
}

function getGenreQueryIdsForType(selectedGenreIds, mediaType) {
    const type = String(mediaType || 'all').trim();
    const ids = [];

    normalizeGenreSelection(selectedGenreIds).forEach((genreId) => {
        const config = getGenreFilterConfig(genreId);
        if (!config) return;

        if (type === 'movie') {
            ids.push(...(config.movieIds || []));
            return;
        }

        if (type === 'tv') {
            ids.push(...(config.tvIds || []));
            return;
        }

        ids.push(...(config.movieIds || []), ...(config.tvIds || []));
    });

    return Array.from(new Set(ids.filter((value) => Number.isFinite(Number(value)) && Number(value) > 0).map(Number)));
}

function getGenreIdsForSelectionOnItemType(selectedGenreIds, mediaType) {
    const type = String(mediaType || 'movie').trim() === 'tv' ? 'tv' : 'movie';
    return normalizeGenreSelection(selectedGenreIds).flatMap((genreId) => {
        const config = getGenreFilterConfig(genreId);
        if (!config) return [];
        return type === 'tv'
            ? (config.tvIds || [])
            : (config.movieIds || []);
    });
}

function itemMatchesSelectedGenres(item, selectedGenreIds, matchMode = 'all') {
    const type = inferMediaType(item, 'movie');
    const itemGenreIds = getGenreIds(item);
    if (!itemGenreIds.length) return false;

    const selected = normalizeGenreSelection(selectedGenreIds);
    if (!selected.length) return false;

    const matches = selected.map((genreId) => {
        const allowedIds = getGenreIdsForSelectionOnItemType([genreId], type);
        return allowedIds.some((allowed) => itemGenreIds.includes(allowed));
    });

    return String(matchMode || 'all').trim() === 'any'
        ? matches.some(Boolean)
        : matches.every(Boolean);
}

async function fetchGenreDiscoverPage(mediaType, page, selectedGenreIds, options = {}) {
    const type = String(mediaType || 'movie').trim() === 'tv' ? 'tv' : 'movie';
    const selectedIds = normalizeGenreSelection(selectedGenreIds);
    if (!selectedIds.length) {
        return { page: Number(page) || 1, totalPages: 0, totalResults: 0, hasNextPage: false, results: [] };
    }

    const matchMode = String(options.matchMode || activeGenreMatchMode || 'all').trim() === 'any' ? 'any' : 'all';
    const sortBy = String(options.sortBy || activeGenreSortBy || 'popularity.desc').trim() || 'popularity.desc';
    const pageNumber = Math.max(1, Number(page) || 1);
    const sourceUrls = [
        `/trending?type=${type}&timePeriod=day&page=${encodeURIComponent(pageNumber)}`,
        `/trending?type=${type}&timePeriod=week&page=${encodeURIComponent(pageNumber)}`,
        `/trending?type=${type}&timePeriod=day&page=${encodeURIComponent(pageNumber + 1)}`
    ];

    const cacheKey = `genre-browse:v2:${type}:${pageNumber}:${selectedIds.join(matchMode === 'any' ? '|' : ',')}:${sortBy}`;
    const cached = readCache(cacheKey);
    if (cached?.results) return cached;

    try {
        const settled = await Promise.allSettled(sourceUrls.map((url) => fetchJsonWithFallback(url, 9000)));
        const rawResults = [];

        settled.forEach((entry) => {
            if (entry.status !== 'fulfilled') return;
            const payload = entry.value;
            const rows = Array.isArray(payload?.results) ? payload.results : [];
            rows.forEach((row) => {
                const rowType = inferMediaType(row, type);
                const normalizedRow = {
                    ...row,
                    media_type: row.media_type || rowType,
                    type: row.type || (rowType === 'tv' ? 'TV Series' : 'Movie')
                };
                rawResults.push(normalizedRow);
            });
        });

        const filtered = dedupeDiscoverItems(rawResults).filter((item) => itemMatchesSelectedGenres(item, selectedIds, matchMode));

        const sortValue = (item, key) => {
            if (key === 'vote_average.desc') return Number(item?.vote_average || item?.rating || 0);
            if (key === 'vote_count.desc') return Number(item?.vote_count || 0);
            if (key === 'primary_release_date.desc') return Date.parse(item?.release_date || item?.first_air_date || 0) || 0;
            if (key === 'first_air_date.desc') return Date.parse(item?.first_air_date || item?.release_date || 0) || 0;
            return Number(item?.popularity || 0);
        };

        filtered.sort((a, b) => sortValue(b, sortBy) - sortValue(a, sortBy));

        const normalized = {
            page: pageNumber,
            totalPages: Math.max(pageNumber + 1, 2),
            totalResults: filtered.length,
            hasNextPage: pageNumber < 10 && filtered.length > 0,
            results: filtered
        };

        writeCache(cacheKey, normalized);
        return normalized;
    } catch (error) {
        return { page: Number(page) || 1, totalPages: 0, totalResults: 0, hasNextPage: false, results: [] };
    }
}

function dedupeDiscoverItems(items) {
    return dedupeByMediaIdentity(items || []);
}

function normalizeDiscoverRows(payload, fallbackType) {
    const rows = Array.isArray(payload?.results) ? payload.results : [];
    return rows.map((row) => {
        const mediaType = inferMediaType(row, fallbackType === 'tv' ? 'tv' : 'movie');
        return {
            ...row,
            media_type: row.media_type || mediaType,
            type: row.type || (mediaType === 'tv' ? 'TV Series' : 'Movie')
        };
    });
}

function payloadHasNextPage(payload, rows, page) {
    if (typeof payload?.hasNextPage === 'boolean') {
        return payload.hasNextPage && Number(page || 0) < VERIFIED_GENRE_PAGE_LIMIT;
    }
    return (rows || []).length >= 20 && Number(page || 0) < VERIFIED_GENRE_PAGE_LIMIT;
}

function getGenreSearchQueries(kind, genreId) {
    const label = String(GENRE_MAP[genreId] || '').trim();
    if (!label) {
        if (kind === 'tv') return ['tv series', 'popular tv'];
        if (kind === 'movie') return ['movie', 'popular movies'];
        return ['popular', 'trending'];
    }

    const lower = label.toLowerCase();
    const compact = lower.replace(/&/g, 'and').replace(/\s+/g, ' ').trim();

    if (kind === 'all') {
        const allVariants = [
            label,
            `${compact} movies`,
            `${compact} tv series`,
            `${compact} trending`
        ];
        return Array.from(new Set(allVariants.filter(Boolean)));
    }

    if (kind === 'tv') {
        if (lower === 'science fiction') {
            return ['science fiction tv series', 'sci fi tv series', 'sci-fi tv'];
        }
        const tvVariants = [
            `${label} tv series`,
            `${compact} tv`,
            `${compact} shows`
        ];
        return Array.from(new Set(tvVariants.filter(Boolean)));
    }

    if (lower === 'science fiction') {
        return ['science fiction movie', 'sci fi movie', 'sci-fi films'];
    }
    const movieVariants = [
        `${label} movie`,
        `${compact} films`,
        `${compact} cinema`
    ];
    return Array.from(new Set(movieVariants.filter(Boolean)));
}

async function fetchDiscoverCatalogPage(type, page = 1, genreId = null) {
    const queries = getGenreSearchQueries(type, genreId);
    const cacheKey = `search:catalog:v2:${type}:${genreId || 'na'}:${page}`;
    const cached = readCache(cacheKey);
    if (cached?.results) return cached;

    const searchPaths = (queries || []).map((query) => `/${encodeURIComponent(query)}?page=${encodeURIComponent(page)}`);
    const trendingPaths = (() => {
        if (type === 'movie' || type === 'tv') {
            return [
                `/trending?type=${type}&timePeriod=day&page=${encodeURIComponent(page)}`,
                `/trending?type=${type}&timePeriod=week&page=${encodeURIComponent(page)}`
            ];
        }
        return [
            `/trending?timePeriod=day&page=${encodeURIComponent(page)}`,
            `/trending?timePeriod=week&page=${encodeURIComponent(page)}`
        ];
    })();

    const requestPaths = Array.from(new Set([...searchPaths, ...trendingPaths]));
    const settled = await Promise.allSettled(
        requestPaths.map((path) => fetchJsonWithFallback(path, 9000))
    );

    const mergedResults = [];
    let hasNextPage = false;

    settled.forEach((entry) => {
        if (entry.status !== 'fulfilled') return;
        const payload = entry.value;
        const rows = normalizeDiscoverRows(payload, type === 'tv' ? 'tv' : 'movie');
        if (rows.length) mergedResults.push(...rows);
        if (payloadHasNextPage(payload, rows, page)) hasNextPage = true;
    });

    const mergedPayload = {
        page: Number(page) || 1,
        hasNextPage,
        results: dedupeByMediaIdentity(mergedResults)
    };

    writeCache(cacheKey, mergedPayload);
    return mergedPayload;
}

async function resolveMediaGenreIds(item, fallbackType = 'movie') {
    const identity = getMediaIdentityKey(item, fallbackType);
    if (!identity) return [];

    const cached = mediaGenreResolutionCache.get(identity);
    if (Array.isArray(cached)) return cached;

    const direct = getGenreIds(item);
    if (direct.length) {
        mediaGenreResolutionCache.set(identity, direct);
        return direct;
    }

    mediaGenreResolutionCache.set(identity, []);
    return [];
}

async function collectGenreMatchesFromCatalogPage(type, page, genreId) {
    const payload = await fetchDiscoverCatalogPage(type, page, genreId);
    const rows = normalizeDiscoverRows(payload, type);
    const matches = [];
    const requestedGenreId = Number(genreId);
    const attachRequestedGenre = (row) => {
        const existing = getGenreIds(row);
        const merged = Array.from(new Set([...existing, requestedGenreId].filter((v) => Number.isFinite(v) && v > 0)));
        return {
            ...row,
            genre_ids: merged
        };
    };
    const genreLabel = String(GENRE_MAP[genreId] || '').toLowerCase().replace(/&/g, 'and').trim();
    const looseGenreTokens = genreLabel.split(/\s+/).filter(Boolean);

    await Promise.all(rows.map(async (row) => {
        const ids = await resolveMediaGenreIds(row, type);
        if (ids.includes(Number(genreId))) {
            matches.push(attachRequestedGenre(row));
            return;
        }

        // Fallback for sparse payloads missing genre IDs.
        const textBlob = `${String(row?.title || row?.name || '')} ${String(row?.overview || '')}`.toLowerCase();
        if (!textBlob) return;

        if (genreLabel && textBlob.includes(genreLabel)) {
            matches.push(attachRequestedGenre(row));
            return;
        }

        if (looseGenreTokens.length >= 2 && looseGenreTokens.every((token) => textBlob.includes(token))) {
            matches.push(attachRequestedGenre(row));
        }
    }));

    if (!matches.length && rows.length) {
        rows.slice(0, 12).forEach((row) => {
            matches.push(attachRequestedGenre(row));
        });
    }

    return {
        matches,
        hasNext: payloadHasNextPage(payload, rows, page)
    };
}

async function advanceGenreDiscoveryState(state, genreId, requestVersion, targetAdditions = VERIFIED_GENRE_INITIAL_TARGET) {
    if (!state) return;

    const genre = Number(genreId);
    let totalAdded = 0;

    while (totalAdded < targetAdditions && (state.hasMoreMovie || state.hasMoreTv || state.hasMoreMix)) {
        if (requestVersion !== genreResultsRequestVersion || activeGenreFilterId !== genre) return;

        const jobs = [];

        if (state.hasMoreMovie) {
            const nextMoviePage = state.moviePage + 1;
            jobs.push(
                collectGenreMatchesFromCatalogPage('movie', nextMoviePage, genre)
                    .then((res) => ({ ok: true, type: 'movie', page: nextMoviePage, res }))
                    .catch(() => ({ ok: false, type: 'movie', page: nextMoviePage, res: null }))
            );
        }

        if (state.hasMoreTv) {
            const nextTvPage = state.tvPage + 1;
            jobs.push(
                collectGenreMatchesFromCatalogPage('tv', nextTvPage, genre)
                    .then((res) => ({ ok: true, type: 'tv', page: nextTvPage, res }))
                    .catch(() => ({ ok: false, type: 'tv', page: nextTvPage, res: null }))
            );
        }

        if (state.hasMoreMix) {
            const nextMixPage = state.mixPage + 1;
            jobs.push(
                collectGenreMatchesFromCatalogPage('all', nextMixPage, genre)
                    .then((res) => ({ ok: true, type: 'mix', page: nextMixPage, res }))
                    .catch(() => ({ ok: false, type: 'mix', page: nextMixPage, res: null }))
            );
        }

        if (!jobs.length) break;

        const settled = await Promise.all(jobs);
        if (requestVersion !== genreResultsRequestVersion || activeGenreFilterId !== genre) return;

        let roundAdditions = [];

        settled.forEach((entry) => {
            if (entry.type === 'movie') {
                if (!entry.ok || !entry.res) {
                    state.movieFailureCount = Number(state.movieFailureCount || 0) + 1;
                    if (state.movieFailureCount >= 2) {
                        state.hasMoreMovie = false;
                    }
                    return;
                }
                state.movieFailureCount = 0;
                state.moviePage = entry.page;
                state.hasMoreMovie = entry.res.hasNext;
                roundAdditions = roundAdditions.concat(entry.res.matches || []);
                return;
            }

            if (entry.type === 'tv') {
                if (!entry.ok || !entry.res) {
                    state.tvFailureCount = Number(state.tvFailureCount || 0) + 1;
                    if (state.tvFailureCount >= 2) {
                        state.hasMoreTv = false;
                    }
                    return;
                }
                state.tvFailureCount = 0;
                state.tvPage = entry.page;
                state.hasMoreTv = entry.res.hasNext;
                roundAdditions = roundAdditions.concat(entry.res.matches || []);
                return;
            }

            if (!entry.ok || !entry.res) {
                state.mixFailureCount = Number(state.mixFailureCount || 0) + 1;
                if (state.mixFailureCount >= 2) {
                    state.hasMoreMix = false;
                }
                return;
            }
            state.mixFailureCount = 0;
            state.mixPage = entry.page;
            state.hasMoreMix = entry.res.hasNext;
            roundAdditions = roundAdditions.concat(entry.res.matches || []);
        });

        const before = (state.items || []).length;
        state.items = dedupeByMediaIdentity([...(state.items || []), ...roundAdditions]).slice(0, 2000);
        const after = state.items.length;
        totalAdded += Math.max(0, after - before);

        if (!roundAdditions.length && !state.hasMoreMovie && !state.hasMoreTv && !state.hasMoreMix) break;
    }
}

function updateGenreResultsMeta(genreId, count) {
    const metaEl = document.getElementById('genre-results-meta');
    if (!metaEl) return;
    const labels = getActiveGenreLabels();
    const labelText = labels.length <= 1 ? (GENRE_MAP[genreId] || labels[0] || 'Selected Genre') : labels.join(' + ');
    const modeHint = activeGenreDiscoverState?.multi ? ' Matching all selected genres.' : '';
    metaEl.textContent = `Showing ${count} ${labelText} titles. Scroll to load more.${modeHint}`;
}

function updateGenreResultsLoadMoreButton(state, loading = false) {
    const btn = document.getElementById('genre-results-more-btn');
    if (!btn) return;
    const hasMore = !!(state?.hasMoreMovie || state?.hasMoreTv || state?.hasMoreMix);
    btn.style.display = hasMore ? 'inline-flex' : 'none';
    btn.disabled = !hasMore || loading;
    btn.textContent = loading ? 'Loading...' : 'Load More';
}

function showGenreResultsLoading(genreId) {
    const section = ensureGenreResultsSection();
    if (!section) return;
    const grid = document.getElementById('genre-results-grid');
    const title = document.getElementById('genre-results-title');
    const label = getGenreResultsTitleText() || GENRE_MAP[genreId] || 'Genre';

    if (title) title.textContent = `${label}`;
    if (grid) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; display:flex; align-items:center; justify-content:center; min-height: 220px;">
                <div style="width:42px;height:42px;border:3px solid rgba(255,255,255,.12);border-top-color:var(--primary);border-radius:50%;animation:spin 1s linear infinite;"></div>
            </div>
            <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
        `;
    }
    updateGenreResultsMeta(genreId, 0);
    updateGenreResultsLoadMoreButton(null, true);
}

function renderGenreResults(items, genreId) {
    const section = ensureGenreResultsSection();
    const grid = document.getElementById('genre-results-grid');
    const title = document.getElementById('genre-results-title');
    if (!section || !grid) return;

    section.style.display = 'block';
    if (title) {
        const label = getGenreResultsTitleText() || GENRE_MAP[genreId] || 'Genre';
        title.textContent = `${label}`;
    }

    const filteredItems = filterItemsByActiveGenres(items);

    if (!Array.isArray(filteredItems) || !filteredItems.length) {
        grid.innerHTML = `
            <div class="genre-filter-empty-state" style="display:grid; grid-column: 1 / -1; margin: 0;">
                <i class="fa-solid fa-circle-exclamation"></i>
                <h3>No titles found</h3>
                <p>Try another genre or select <strong>All Genres</strong>.</p>
            </div>
        `;
        updateGenreResultsMeta(genreId, 0);
        return;
    }

    displayGrid(filteredItems, grid);
    updateGenreResultsMeta(genreId, filteredItems.length);
    updateGenreResultsSentinel();
    maybeAutoLoadMoreGenreResults();
}

function toggleBaseRowsForGenreMode(enabled) {
    if (!contentRows) return;

    contentRows.classList.toggle('genre-mode-active', !!enabled);

    if (heroSection) {
        if (enabled) {
            if (heroSection.dataset.genreModePrevDisplay === undefined) {
                heroSection.dataset.genreModePrevDisplay = heroSection.style.display;
            }
            heroSection.style.display = 'none';
        } else if (heroSection.dataset.genreModePrevDisplay !== undefined) {
            heroSection.style.display = heroSection.dataset.genreModePrevDisplay;
            delete heroSection.dataset.genreModePrevDisplay;
        } else {
            heroSection.style.display = '';
        }
    }

    const rows = Array.from(contentRows.querySelectorAll('.row-section'));
    rows.forEach((row) => {
        if (row.id === 'genre-results-section') return;
        if (enabled) {
            if (row.dataset.genreModePrevDisplay === undefined) {
                row.dataset.genreModePrevDisplay = row.style.display;
            }
            row.style.display = 'none';
            return;
        }

        if (row.dataset.genreModePrevDisplay !== undefined) {
            row.style.display = row.dataset.genreModePrevDisplay;
            delete row.dataset.genreModePrevDisplay;
        } else {
            row.style.display = '';
        }
    });

    const section = ensureGenreResultsSection();
    if (section) {
        section.style.display = enabled ? 'block' : 'none';
    }

    if (!enabled && genreResultsObserver) {
        genreResultsObserver.disconnect();
    }
}

function hasMoreInGenreState(state) {
    return !!(state?.hasMoreMovie || state?.hasMoreTv || state?.hasMoreMix);
}

function buildGenreStateFromCache(genreId, cached) {
    return {
        genreId,
        items: Array.isArray(cached?.items) ? cached.items.slice() : [],
        moviePage: Number(cached?.moviePage) || 0,
        tvPage: Number(cached?.tvPage) || 0,
        mixPage: Number(cached?.mixPage) || 0,
        hasMoreMovie: cached?.hasMoreMovie !== undefined
            ? (!!cached.hasMoreMovie || (Array.isArray(cached?.items) && cached.items.length < VERIFIED_GENRE_INITIAL_TARGET))
            : true,
        hasMoreTv: cached?.hasMoreTv !== undefined
            ? (!!cached.hasMoreTv || (Array.isArray(cached?.items) && cached.items.length < VERIFIED_GENRE_INITIAL_TARGET))
            : true,
        hasMoreMix: cached?.hasMoreMix !== undefined
            ? (!!cached.hasMoreMix || (Array.isArray(cached?.items) && cached.items.length < VERIFIED_GENRE_INITIAL_TARGET))
            : true,
        movieFailureCount: 0,
        tvFailureCount: 0,
        mixFailureCount: 0,
        loadingMore: false
    };
}

function persistGenreStateCache(state) {
    if (!state?.genreId) return;
    writeCache(getGenreDiscoverCacheKey(state.genreId), {
        items: state.items,
        moviePage: state.moviePage,
        tvPage: state.tvPage,
        mixPage: state.mixPage,
        hasMoreMovie: state.hasMoreMovie,
        hasMoreTv: state.hasMoreTv,
        hasMoreMix: state.hasMoreMix
    });
}

function getItemIdentity(item) {
    const id = String(item?.id || '').trim();
    if (!id) return '';
    const type = inferMediaType(item, 'movie');
    return `${type}:${id}`;
}

function combineMultiGenreStates(perGenreStates, selectedGenreIds) {
    const selected = normalizeGenreSelection(selectedGenreIds);
    if (!selected.length) return { items: [], matchMode: 'and', hasExactMatches: false };

    const perKey = new Map();
    perGenreStates.forEach((state) => {
        const gid = Number(state?.genreId || 0);
        (state?.items || []).forEach((item) => {
            const key = getItemIdentity(item);
            if (!key) return;
            let bucket = perKey.get(key);
            if (!bucket) {
                bucket = {
                    item,
                    genres: new Set(),
                    votes: 0
                };
                perKey.set(key, bucket);
            }
            bucket.votes += 1;
            if (gid > 0) bucket.genres.add(gid);
            if (!bucket.item?.overview && item?.overview) bucket.item = item;
        });
    });

    const finalizeItem = (entry) => {
        const originalIds = getGenreIds(entry.item);
        const mergedIds = Array.from(new Set([...originalIds, ...entry.genres, ...selected]));
        return {
            ...entry.item,
            genre_ids: mergedIds
        };
    };

    const strictItems = [];

    perKey.forEach((entry) => {
        const candidate = finalizeItem(entry);
        if (entry.votes >= selected.length) {
            strictItems.push(candidate);
        }
    });

    return {
        items: dedupeByMediaIdentity(strictItems),
        matchMode: 'and',
        hasExactMatches: strictItems.length > 0
    };
}

function isGenreSelectionStillActive(selectedGenreIds) {
    const expected = normalizeGenreSelection(selectedGenreIds).join(',');
    const current = normalizeGenreSelection(activeGenreFilterIds).join(',');
    return expected === current;
}

async function loadGenreResults(genreId) {
    const section = ensureGenreResultsSection();
    if (!section) return;

    const requestVersion = ++genreResultsRequestVersion;
    const selectedGenreIds = normalizeGenreSelection(activeGenreFilterIds);
    const typeFilter = activeGenreTypeFilter === 'movie' || activeGenreTypeFilter === 'tv' ? activeGenreTypeFilter : 'all';
    const cacheKey = getGenreDiscoverCacheKey(genreId, {
        selectedGenreIds,
        typeFilter,
        matchMode: activeGenreMatchMode,
        sortBy: activeGenreSortBy,
        mediaScope: typeFilter
    });
    const cached = readCache(cacheKey);

    if (!selectedGenreIds.length) {
        activeGenreDiscoverState = null;
        renderGenreResults([], genreId);
        updateGenreResultsLoadMoreButton(null, false);
        return;
    }

    showGenreResultsLoading(genreId);

    try {
        const state = {
            genreId,
            source: 'catalog',
            multi: selectedGenreIds.length > 1,
            typeFilter,
            selectedGenreIds: selectedGenreIds.slice(),
            matchMode: activeGenreMatchMode,
            sortBy: activeGenreSortBy,
            items: Array.isArray(cached?.items) ? cached.items.slice() : [],
            moviePage: Number(cached?.moviePage) || 0,
            tvPage: Number(cached?.tvPage) || 0,
            mixPage: Number(cached?.mixPage) || 0,
            hasMoreMovie: cached?.hasMoreMovie !== undefined ? !!cached.hasMoreMovie : true,
            hasMoreTv: cached?.hasMoreTv !== undefined ? !!cached.hasMoreTv : true,
            hasMoreMix: cached?.hasMoreMix !== undefined ? !!cached.hasMoreMix : true,
            hasMore: cached?.hasMore !== undefined ? !!cached.hasMore : true,
            loadingMore: false
        };

        await advanceGenreDiscoveryState(state, genreId, requestVersion, VERIFIED_GENRE_INITIAL_TARGET);

        if (requestVersion !== genreResultsRequestVersion || !isGenreSelectionStillActive(selectedGenreIds)) return;

        state.hasMore = !!(state.hasMoreMovie || state.hasMoreTv || state.hasMoreMix);

        activeGenreDiscoverState = state;
        renderGenreResults(state.items, genreId);
        updateGenreResultsLoadMoreButton(state, false);
        updateGenreResultsSentinel();
        maybeAutoLoadMoreGenreResults();

        writeCache(cacheKey, {
            items: state.items,
            moviePage: state.moviePage,
            tvPage: state.tvPage,
            mixPage: state.mixPage,
            hasMoreMovie: state.hasMoreMovie,
            hasMoreTv: state.hasMoreTv,
            hasMoreMix: state.hasMoreMix,
            hasMore: state.hasMore
        });
    } catch (err) {
        if (requestVersion !== genreResultsRequestVersion || !isGenreSelectionStillActive(selectedGenreIds)) return;
        activeGenreDiscoverState = null;
        renderGenreResults([], genreId);
        updateGenreResultsLoadMoreButton(null, false);
        console.error('Genre discover failed:', err?.message || err);
    }
}

async function loadMoreGenreResults(genreId) {
    const state = activeGenreDiscoverState;
    if (!state || state.genreId !== genreId || state.loadingMore) return;
    if (state.source !== 'catalog' && state.source !== 'discover') return;
    if (!state.hasMoreMovie && !state.hasMoreTv && !state.hasMoreMix && !state.hasMore) return;

    state.loadingMore = true;
    updateGenreResultsLoadMoreButton(state, true);

    const requestVersion = genreResultsRequestVersion;
    const selectedGenreIds = normalizeGenreSelection(state.selectedGenreIds || activeGenreFilterIds);

    try {
        await advanceGenreDiscoveryState(state, genreId, requestVersion, VERIFIED_GENRE_PAGE_SIZE);

        if (requestVersion !== genreResultsRequestVersion || !isGenreSelectionStillActive(selectedGenreIds)) {
            state.loadingMore = false;
            updateGenreResultsLoadMoreButton(state, false);
            return;
        }

        state.hasMore = !!(state.hasMoreMovie || state.hasMoreTv || state.hasMoreMix);
        state.loadingMore = false;

        renderGenreResults(state.items, genreId);
        updateGenreResultsLoadMoreButton(state, false);
        updateGenreResultsSentinel();
        maybeAutoLoadMoreGenreResults();

        writeCache(getGenreDiscoverCacheKey(genreId, {
            selectedGenreIds,
            typeFilter: state.typeFilter,
            matchMode: state.matchMode,
            sortBy: state.sortBy,
            mediaScope: state.typeFilter
        }), {
            items: state.items,
            moviePage: state.moviePage,
            tvPage: state.tvPage,
            mixPage: state.mixPage,
            hasMoreMovie: state.hasMoreMovie,
            hasMoreTv: state.hasMoreTv,
            hasMoreMix: state.hasMoreMix,
            hasMore: state.hasMore
        });
    } catch (err) {
        state.loadingMore = false;
        updateGenreResultsLoadMoreButton(state, false);
        console.error('Genre load more failed:', err?.message || err);
    }
}

function renderGenreFilterPanel() {
    if (!genreFilterPanel) return;

    const filters = getHomeGenreFilters();
    const activeLabel = getActiveGenreLabel();

    genreFilterPanel.innerHTML = `
        <div class="genre-filter-advanced">
            <div class="genre-control-group">
                <span class="genre-control-label">Scope</span>
                <div class="genre-toggle-group" id="genre-scope-group">
                    <button type="button" class="genre-toggle-btn ${activeGenreTypeFilter === 'all' ? 'active' : ''}" data-scope="all">All</button>
                    <button type="button" class="genre-toggle-btn ${activeGenreTypeFilter === 'movie' ? 'active' : ''}" data-scope="movie">Movies</button>
                    <button type="button" class="genre-toggle-btn ${activeGenreTypeFilter === 'tv' ? 'active' : ''}" data-scope="tv">TV</button>
                </div>
            </div>
            <div class="genre-control-group">
                <span class="genre-control-label">Match</span>
                <div class="genre-toggle-group" id="genre-match-group">
                    <button type="button" class="genre-toggle-btn ${activeGenreMatchMode === 'all' ? 'active' : ''}" data-match="all">All selected</button>
                    <button type="button" class="genre-toggle-btn ${activeGenreMatchMode === 'any' ? 'active' : ''}" data-match="any">Any selected</button>
                </div>
            </div>
            <div class="genre-control-group genre-sort-control">
                <span class="genre-control-label">Sort</span>
                <div class="genre-sort-dropdown" id="genre-sort-dropdown">
                    <button
                        type="button"
                        id="genre-sort-trigger"
                        class="genre-sort-trigger"
                        aria-haspopup="listbox"
                        aria-expanded="false"
                        aria-label="Sort genre results"
                    >
                        <span id="genre-sort-trigger-label">${getActiveGenreSortLabel()}</span>
                        <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
                    </button>
                    <div class="genre-sort-menu" id="genre-sort-menu" role="listbox" aria-label="Sort options">
                        <button type="button" class="genre-sort-option ${activeGenreSortBy === 'popularity.desc' ? 'active' : ''}" data-sort="popularity.desc" role="option" aria-selected="${activeGenreSortBy === 'popularity.desc'}">Popular</button>
                        <button type="button" class="genre-sort-option ${activeGenreSortBy === 'vote_average.desc' ? 'active' : ''}" data-sort="vote_average.desc" role="option" aria-selected="${activeGenreSortBy === 'vote_average.desc'}">Top Rated</button>
                        <button type="button" class="genre-sort-option ${activeGenreSortBy === 'vote_count.desc' ? 'active' : ''}" data-sort="vote_count.desc" role="option" aria-selected="${activeGenreSortBy === 'vote_count.desc'}">Most Voted</button>
                        <button type="button" class="genre-sort-option ${activeGenreSortBy === 'primary_release_date.desc' ? 'active' : ''}" data-sort="primary_release_date.desc" role="option" aria-selected="${activeGenreSortBy === 'primary_release_date.desc'}">Newest Movies</button>
                        <button type="button" class="genre-sort-option ${activeGenreSortBy === 'first_air_date.desc' ? 'active' : ''}" data-sort="first_air_date.desc" role="option" aria-selected="${activeGenreSortBy === 'first_air_date.desc'}">Newest TV</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="genre-filter-chip-wrap" id="genre-filter-chip-wrap"></div>
    `;

    const chipWrap = genreFilterPanel.querySelector('#genre-filter-chip-wrap');
    if (!chipWrap) return;

    const allButton = document.createElement('button');
    allButton.type = 'button';
    allButton.className = 'genre-filter-chip';
    allButton.dataset.genreId = '';
    allButton.innerHTML = '<i class="fa-solid fa-border-all"></i><span>All Genres</span>';
    allButton.classList.toggle('active', !activeGenreFilterIds.length);
    allButton.addEventListener('click', () => {
        setActiveGenreFilter(null);
    });
    chipWrap.appendChild(allButton);

    filters.forEach((filter) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'genre-filter-chip';
        button.dataset.genreId = String(filter.id);
        button.style.setProperty('--genre-chip-color', filter.color);
        button.classList.toggle('active', activeGenreFilterIds.includes(filter.id));
        button.innerHTML = `<i class="fa-solid ${filter.icon}"></i><span>${filter.name}</span><small class="genre-chip-id">${filter.id}</small>`;
        button.addEventListener('click', () => {
            setActiveGenreFilter(filter.id, true);
        });
        chipWrap.appendChild(button);
    });

    const scopeGroup = genreFilterPanel.querySelector('#genre-scope-group');
    const matchGroup = genreFilterPanel.querySelector('#genre-match-group');
    const sortDropdown = genreFilterPanel.querySelector('#genre-sort-dropdown');
    const sortTrigger = genreFilterPanel.querySelector('#genre-sort-trigger');
    const sortOptions = Array.from(genreFilterPanel.querySelectorAll('.genre-sort-option'));

    if (scopeGroup) {
        scopeGroup.querySelectorAll('[data-scope]').forEach((btn) => {
            btn.addEventListener('click', () => setActiveGenreScope(btn.dataset.scope));
        });
    }

    if (matchGroup) {
        matchGroup.querySelectorAll('[data-match]').forEach((btn) => {
            btn.addEventListener('click', () => setActiveGenreMatchMode(btn.dataset.match));
        });
    }

    if (sortDropdown && sortTrigger) {
        const closeSortDropdown = () => {
            sortDropdown.classList.remove('open');
            sortTrigger.setAttribute('aria-expanded', 'false');
        };

        sortTrigger.addEventListener('click', (event) => {
            event.stopPropagation();
            const willOpen = !sortDropdown.classList.contains('open');
            sortDropdown.classList.toggle('open', willOpen);
            sortTrigger.setAttribute('aria-expanded', String(willOpen));
        });

        sortOptions.forEach((optionBtn) => {
            optionBtn.addEventListener('click', () => {
                const nextSort = String(optionBtn.dataset.sort || '').trim();
                if (nextSort) setActiveGenreSortBy(nextSort);
                closeSortDropdown();
            });
        });

        genreFilterPanel.onclick = (event) => {
            if (!sortDropdown.contains(event.target)) {
                closeSortDropdown();
            }
        };

        genreFilterPanel.onkeydown = (event) => {
            if (event.key === 'Escape') {
                closeSortDropdown();
            }
        };
    }

    if (genreFilterBtn) {
        genreFilterBtn.setAttribute('title', activeGenreFilterIds.length ? `Genre: ${activeLabel}` : 'Filter by genre');
    }
}

function openGenreFilterPanel() {
    if (!genreFilterPanel || !genreFilterBtn) return;
    genreFilterPanel.classList.add('open');
    genreFilterPanel.setAttribute('aria-hidden', 'false');
    genreFilterPanelOpen = true;
    updateGenreFilterButtonState();
}

function closeGenreFilterPanel() {
    if (!genreFilterPanel || !genreFilterBtn) return;
    genreFilterPanel.classList.remove('open');
    genreFilterPanel.setAttribute('aria-hidden', 'true');
    genreFilterPanelOpen = false;
    updateGenreFilterButtonState();
}

function toggleGenreFilterPanel() {
    if (!genreFilterPanelOpen) {
        openGenreFilterPanel();
        return;
    }
    closeGenreFilterPanel();
}

function parseCardItem(card) {
    if (!card) return null;
    try {
        return JSON.parse(card.dataset.item || '{}');
    } catch (error) {
        return null;
    }
}

function parseGenreIdsFromDataset(card) {
    if (!card) return [];
    const raw = String(card.dataset.genreIds || '').trim();
    if (!raw) return [];
    return raw
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0);
}

function setCardGenreIds(card, ids) {
    if (!card) return;
    const normalized = Array.from(new Set((ids || [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)));
    card.dataset.genreIds = normalized.join(',');
}

async function resolveCardGenreIds(card, item) {
    const cachedIds = parseGenreIdsFromDataset(card);
    if (cachedIds.length) return cachedIds;

    const itemGenreIds = getGenreIds(item);
    if (itemGenreIds.length) {
        setCardGenreIds(card, itemGenreIds);
        return itemGenreIds;
    }

    const id = String(item?.id || '').trim();
    if (!id) return [];

    const provider = String(card?.dataset?.provider || item?.provider || '').trim();
    const fallbackType = String(card?.dataset?.type || '').toLowerCase().trim() || 'movie';
    const type = inferMediaType(item, fallbackType === 'tv' ? 'tv' : 'movie');

    try {
        const details = await fetchDetails(id, type, provider);
        const detailGenreIds = getGenreIds(details);
        if (detailGenreIds.length) setCardGenreIds(card, detailGenreIds);
        return detailGenreIds;
    } catch (_) {
        return [];
    }
}

function ensureGenreFilterEmptyStateNode() {
    if (!contentRows) return null;
    let node = document.getElementById('genre-filter-empty-state');
    if (node) return node;

    node = document.createElement('div');
    node.id = 'genre-filter-empty-state';
    node.className = 'genre-filter-empty-state';
    node.setAttribute('role', 'status');
    node.style.display = 'none';
    contentRows.appendChild(node);
    return node;
}

function updateGenreFilterEmptyState(isVisible) {
    const node = ensureGenreFilterEmptyStateNode();
    if (!node) return;

    if (!isVisible || !activeGenreFilterIds.length) {
        node.style.display = 'none';
        node.innerHTML = '';
        return;
    }

    const labels = getActiveGenreLabels();
    const label = labels.length > 1 ? labels.join(' + ') : getActiveGenreLabel();
    node.innerHTML = `
        <i class="fa-solid fa-circle-exclamation"></i>
        <h3>No titles found for ${label}</h3>
        <p>Try another genre or select <strong>All Genres</strong> to see everything.</p>
    `;
    node.style.display = 'grid';
}

function setActiveGenreFilter(genreId, toggleOnly = false) {
    if (!genreId) {
        activeGenreFilterIds = [];
        syncActiveGenrePrimary();
        renderGenreFilterPanel();
        applyGenreFilter().catch(() => { });
        closeGenreFilterPanel();
        return;
    }

    const nextId = Number(genreId);
    if (!Number.isFinite(nextId) || !GENRE_MAP[nextId]) return;

    const next = normalizeGenreSelection(activeGenreFilterIds);
    const idx = next.indexOf(nextId);
    if (toggleOnly) {
        if (idx >= 0) {
            next.splice(idx, 1);
        } else {
            next.push(nextId);
        }
    } else {
        next.length = 0;
        next.push(nextId);
    }

    activeGenreFilterIds = normalizeGenreSelection(next);
    syncActiveGenrePrimary();
    renderGenreFilterPanel();
    applyGenreFilter().catch(() => { });

    if (!toggleOnly) {
        closeGenreFilterPanel();
    }
}

async function applyGenreFilter() {
    if (!contentRows) return;
    ++genreFilterRequestVersion;
    syncActiveGenrePrimary();

    if (!activeGenreFilterIds.length || !activeGenreFilterId) {
        activeGenreDiscoverState = null;
        toggleBaseRowsForGenreMode(false);
        updateGenreFilterButtonState();
        updateGenreFilterEmptyState(false);
        updateGenreResultsLoadMoreButton(null, false);
        return;
    }

    toggleBaseRowsForGenreMode(true);
    updateGenreFilterButtonState();
    updateGenreFilterEmptyState(false);
    await loadGenreResults(activeGenreFilterId);
}

function getGenreIds(media) {
    const out = new Set();
    if (!media) return [];

    const addId = (v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) out.add(n);
    };

    const fromGenreIds = media.genre_ids;
    if (Array.isArray(fromGenreIds)) {
        fromGenreIds.forEach(addId);
    } else if (typeof fromGenreIds === 'string') {
        fromGenreIds
            .split(',')
            .map((part) => part.trim())
            .forEach(addId);
    }

    const fromGenres = media.genres;
    if (Array.isArray(fromGenres)) {
        fromGenres.forEach((g) => {
            if (typeof g === 'number') {
                addId(g);
                return;
            }
            if (typeof g === 'string') {
                const key = g.toLowerCase().trim();
                if (GENRE_NAME_TO_ID[key]) addId(GENRE_NAME_TO_ID[key]);
                return;
            }
            if (g && typeof g === 'object') {
                if (g.id) addId(g.id);
                if (g.name) {
                    const key = String(g.name).toLowerCase().trim();
                    if (GENRE_NAME_TO_ID[key]) addId(GENRE_NAME_TO_ID[key]);
                }
            }
        });
    } else if (typeof fromGenres === 'string') {
        fromGenres
            .split(',')
            .map((genre) => genre.trim())
            .forEach((genre) => {
                const key = genre.toLowerCase();
                if (GENRE_NAME_TO_ID[key]) addId(GENRE_NAME_TO_ID[key]);
            });
    }

    return Array.from(out);
}

function inferMediaType(item, fallback = 'movie') {
    const mt = String(item?.media_type || item?.type || item?.format || '').toLowerCase().trim();
    if (mt) {
        if (mt === 'movie' || mt === 'film' || mt.includes('movie')) return 'movie';
        if (mt === 'tv' || mt.includes('tv') || mt.includes('series') || mt.includes('show')) return 'tv';
    }

    // Structural hints from payload shape.
    if (item?.name && !item?.title) return 'tv';
    if (item?.title && !item?.name) return 'movie';
    if (item?.first_air_date && !item?.release_date) return 'tv';
    if (item?.release_date && !item?.first_air_date) return 'movie';

    return fallback === 'tv' ? 'tv' : 'movie';
}

function dedupeByMediaIdentity(items) {
    const seen = new Set();
    const out = [];
    for (const item of items || []) {
        const id = String(item?.id || '');
        const type = inferMediaType(item, 'movie');
        const key = `${type}:${id}`;
        if (!id || seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out;
}

function normalizeSearchIdentityText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[_:]+/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getSearchResultIdentityKey(item) {
    const type = inferMediaType(item, 'movie');
    const title = normalizeSearchIdentityText(
        item?.title || item?.name || item?.originalTitle || item?.original_title || item?.originalName || item?.original_name || item?.romaji || item?.english || ''
    );
    const year = String(getYear(item) || '').trim();
    return `${type}::${title}::${year}`;
}

function isBetterSearchResult(candidate, current) {
    if (!current) return true;

    const hasRealPoster = (item) => {
        const poster = String(getPoster(item) || '');
        return poster && !poster.includes('placehold.co') && !poster.includes('No+Image');
    };

    const score = (item) => {
        let value = 0;
        if (item?.title || item?.name) value += 3;
        if (item?.originalTitle || item?.original_title || item?.originalName || item?.original_name) value += 2;
        if (item?.overview || item?.description) value += 2;
        if (hasRealPoster(item)) value += 4;
        if (Number(getRating(item) || 0) > 0) value += 1;
        if (String(item?.provider || '').trim()) value += 0.5;
        return value;
    };

    return score(candidate) > score(current);
}

function dedupeSearchResults(items) {
    const byKey = new Map();
    for (const item of items || []) {
        if (!item || typeof item !== 'object') continue;
        const key = getSearchResultIdentityKey(item);
        if (!key || key.includes('unknown')) continue;
        const existing = byKey.get(key);
        if (!existing || isBetterSearchResult(item, existing)) {
            byKey.set(key, item);
        }
    }
    return Array.from(byKey.values());
}

const SEARCH_QUERY_NOISE_WORDS = new Set([
    'the', 'a', 'an', 'and', 'of', 'for', 'to', 'in', 'on', 'at', 'by',
    'new', 'newest', 'latest', 'version', 'one'
]);

function buildSearchTokens(value) {
    return normalizeSearchIdentityText(value)
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token && token.length >= 2 && !SEARCH_QUERY_NOISE_WORDS.has(token));
}

function extractQueryYear(value) {
    const match = String(value || '').match(/\b(19|20)\d{2}\b/);
    return match ? Number(match[0]) : null;
}

function buildAlternativeSearchQueries(query) {
    const raw = String(query || '').trim();
    if (!raw) return [];

    const alternatives = new Set();
    const strippedNewOne = raw
        .replace(/\b(the\s+)?new\s+one\b/gi, ' ')
        .replace(/\bnew\s+version\b/gi, ' ')
        .replace(/\blatest\s+version\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (strippedNewOne && strippedNewOne.toLowerCase() !== raw.toLowerCase()) {
        alternatives.add(strippedNewOne);
    }

    const compactTokens = buildSearchTokens(raw).join(' ').trim();
    if (compactTokens && compactTokens.toLowerCase() !== raw.toLowerCase() && compactTokens.length >= 3) {
        alternatives.add(compactTokens);
    }

    const withoutYear = raw
        .replace(/\b(19|20)\d{2}\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (withoutYear && withoutYear.toLowerCase() !== raw.toLowerCase()) {
        alternatives.add(withoutYear);
    }

    const compactWithoutYear = buildSearchTokens(withoutYear || raw)
        .filter((token) => !/^((19|20)\d{2})$/.test(token))
        .join(' ')
        .trim();
    if (compactWithoutYear && compactWithoutYear.toLowerCase() !== raw.toLowerCase() && compactWithoutYear.length >= 3) {
        alternatives.add(compactWithoutYear);
    }

    return Array.from(alternatives).slice(0, 3);
}

function getSearchRelevanceScore(item, query) {
    const queryNorm = normalizeSearchIdentityText(query);
    const titleNorm = normalizeSearchIdentityText(getTitle(item));
    const altNorm = normalizeSearchIdentityText(
        item?.originalTitle || item?.original_title || item?.originalName || item?.original_name || ''
    );
    const haystack = `${titleNorm} ${altNorm}`.trim();

    let score = 0;
    if (!queryNorm || !haystack) return score;

    if (titleNorm === queryNorm) score += 320;
    if (haystack === queryNorm) score += 160;
    if (titleNorm.startsWith(queryNorm)) score += 120;
    if (haystack.includes(queryNorm)) score += 85;

    const tokens = buildSearchTokens(queryNorm);
    if (tokens.length) {
        let overlap = 0;
        for (const token of tokens) {
            if (haystack.includes(token)) overlap += 1;
        }
        score += overlap * 24;
        if (overlap === tokens.length && tokens.length >= 2) score += 95;
    }

    const queryYear = extractQueryYear(queryNorm);
    const itemYear = Number(getYear(item));
    if (queryYear && Number.isFinite(itemYear)) {
        if (itemYear === queryYear) score += 70;
        else if (Math.abs(itemYear - queryYear) <= 1) score += 25;
    }

    if (queryNorm.includes('new') || queryNorm.includes('latest')) {
        if (Number.isFinite(itemYear) && itemYear >= 2020) score += 18;
    }

    const queryWantsTv = /\b(tv|series|show|season|episode)\b/i.test(queryNorm);
    const queryWantsMovie = /\b(movie|film|cinema)\b/i.test(queryNorm);
    const mediaType = inferMediaType(item, 'movie');
    if (queryWantsTv && mediaType === 'tv') score += 30;
    if (queryWantsMovie && mediaType === 'movie') score += 30;

    score += Math.min(10, Number(getRating(item) || 0)) * 0.9;
    score += Math.min(10, Number(item?.popularity || 0) / 18);

    return score;
}

function sortSearchResultsByQuery(items, query) {
    const ranked = [...(items || [])];
    ranked.sort((a, b) => {
        const byScore = getSearchRelevanceScore(b, query) - getSearchRelevanceScore(a, query);
        if (byScore !== 0) return byScore;
        const byYear = Number(getYear(b) || 0) - Number(getYear(a) || 0);
        if (byYear !== 0) return byYear;
        return Number(getRating(b) || 0) - Number(getRating(a) || 0);
    });
    return ranked;
}

function shouldRescueSearchResults(items, query) {
    if (!Array.isArray(items) || items.length < 8) return true;
    const top = sortSearchResultsByQuery(items, query)[0];
    if (!top) return true;
    return getSearchRelevanceScore(top, query) < 120;
}

function normalizeGenreToken(v) {
    const raw = String(v || '').toLowerCase().trim();
    if (!raw) return '';
    let t = raw
        .replace(/&/g, ' and ')
        .replace(/\//g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Normalize frequent aliases so matching is reliable.
    if (t === 'sci fi' || t === 'sci-fi' || t === 'science fiction') t = 'science fiction';
    if (t === 'action and adventure') t = 'action adventure';
    if (t === 'war and politics') t = 'war politics';
    return t;
}

function getGenreTokenSet(media) {
    const tokens = new Set();
    const names = getGenreNames(media?.genres || media?.genre_ids || []);
    names.forEach((name) => {
        const base = normalizeGenreToken(name);
        if (base) tokens.add(base);
        // Split compound labels so Action and Adventure can match either bucket.
        base.split(' ').forEach((part) => {
            const p = normalizeGenreToken(part);
            if (p && p.length > 2) tokens.add(p);
        });
    });
    return tokens;
}

function scoreGenreOverlap(seedGenreIds, seedTokens, candidate) {
    const candidateGenreIds = getGenreIds(candidate);
    const candidateTokens = getGenreTokenSet(candidate);

    const idMatches = seedGenreIds.length
        ? seedGenreIds.filter((gid) => candidateGenreIds.includes(gid)).length
        : 0;

    let tokenMatches = 0;
    if (seedTokens.size && candidateTokens.size) {
        seedTokens.forEach((token) => {
            if (candidateTokens.has(token)) tokenMatches += 1;
        });
    }

    const overlap = idMatches + tokenMatches;
    const rating = Number(candidate?.vote_average || candidate?.rating || 0);
    const score = (idMatches * 120) + (tokenMatches * 35) + rating;
    return { overlap, score };
}

function hasExactGenreSet(seedGenreIds, candidate) {
    const seedIds = Array.from(new Set((seedGenreIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))).sort((a, b) => a - b);
    const candidateIds = Array.from(new Set(getGenreIds(candidate))).sort((a, b) => a - b);
    if (!seedIds.length || !candidateIds.length) return false;
    if (seedIds.length !== candidateIds.length) return false;
    return seedIds.every((id, index) => candidateIds[index] === id);
}

function hasAllSeedGenres(seedGenreIds, candidate) {
    const seedIds = Array.from(new Set((seedGenreIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)));
    const candidateIds = new Set(getGenreIds(candidate));
    if (!seedIds.length || !candidateIds.size) return false;
    return seedIds.every((id) => candidateIds.has(id));
}

function genreSetKey(media) {
    return Array.from(new Set(getGenreIds(media))).sort((a, b) => a - b).join(',');
}

const SIMILAR_STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'over', 'under',
    'their', 'about', 'after', 'before', 'while', 'where', 'what', 'when', 'your',
    'have', 'has', 'had', 'will', 'would', 'there', 'here', 'than', 'then', 'they',
    'them', 'were', 'been', 'being', 'also', 'just', 'only', 'very', 'more', 'some'
]);

function tokenizeText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]+/g, ' ')
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t && t.length >= 3 && !SIMILAR_STOP_WORDS.has(t));
}

function getMediaSemanticTokenSet(media) {
    const title = [
        media?.title,
        media?.name,
        media?.originalTitle,
        media?.original_title,
        media?.originalName,
        media?.original_name,
    ].filter(Boolean).join(' ');
    const overview = String(media?.overview || media?.description || '');
    const tokens = new Set([...tokenizeText(title), ...tokenizeText(overview)]);
    return tokens;
}

function scoreTokenOverlap(seedTokens, candidateTokens) {
    if (!seedTokens?.size || !candidateTokens?.size) return 0;
    let inter = 0;
    seedTokens.forEach((t) => {
        if (candidateTokens.has(t)) inter += 1;
    });
    const union = new Set([...seedTokens, ...candidateTokens]).size;
    if (!union) return 0;
    return inter / union;
}

function getNumericYear(item) {
    const y = Number(getYear(item));
    if (!Number.isFinite(y) || y <= 0) return null;
    return y;
}

function scoreYearCloseness(seedYear, candidateYear) {
    if (!seedYear || !candidateYear) return 0;
    const diff = Math.abs(seedYear - candidateYear);
    if (diff <= 1) return 1;
    if (diff <= 3) return 0.75;
    if (diff <= 6) return 0.45;
    if (diff <= 10) return 0.2;
    return 0;
}

function withTimeout(promise, timeoutMs = 2500) {
    return new Promise((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            resolve(null);
        }, timeoutMs);

        Promise.resolve(promise)
            .then((value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(value);
            })
            .catch(() => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(null);
            });
    });
}

function diversifyResults(items, limit = 24) {
    const selected = [];
    const byPrimaryGenre = new Map();

    for (const item of items || []) {
        if (selected.length >= limit) break;
        const primaryGenre = getGenreIds(item)[0] || 0;
        const count = byPrimaryGenre.get(primaryGenre) || 0;
        if (selected.length < 8 || count < 3) {
            selected.push(item);
            byPrimaryGenre.set(primaryGenre, count + 1);
        }
    }

    if (selected.length < limit) {
        const used = new Set(selected.map((x) => `${inferMediaType(x, 'movie')}:${String(x?.id || '')}`));
        for (const item of items || []) {
            if (selected.length >= limit) break;
            const key = `${inferMediaType(item, 'movie')}:${String(item?.id || '')}`;
            if (used.has(key)) continue;
            selected.push(item);
            used.add(key);
        }
    }

    return selected.slice(0, limit);
}

async function fetchSimilar(id, type, provider = '', seedMedia = null) {
    try {
        const sourceMedia = seedMedia || await fetchDetails(id, type, provider);
        const sourceType = inferMediaType(sourceMedia, type);
        const sourceYear = getNumericYear(sourceMedia) || 0;
        const cacheKey = `${String(sourceType || 'movie').toLowerCase()}::${String(id || '')}::${genreSetKey(sourceMedia)}::${sourceYear}`;
        const cached = similarMemoryCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < SIMILAR_CACHE_TTL_MS && Array.isArray(cached.items)) {
            return cached.items;
        }

        const currentGenreIds = getGenreIds(sourceMedia);
        const currentGenreTokens = getGenreTokenSet(sourceMedia);
        const currentSemanticTokens = getMediaSemanticTokenSet(sourceMedia);

        if (!currentGenreIds.length && !currentGenreTokens.size && !currentSemanticTokens.size) return [];

        const otherType = sourceType === 'movie' ? 'tv' : 'movie';
        const candidateRequests = [
            `/trending?type=${sourceType}&timePeriod=day&page=1`,
            `/trending?type=${sourceType}&timePeriod=day&page=2`,
            `/trending?type=${sourceType}&timePeriod=week&page=1`,
            `/trending?type=${otherType}&timePeriod=day&page=1`,
        ];

        const candidateResponses = await Promise.all(
            candidateRequests.map((url) => fetchJsonWithFallback(url, 7000).catch(() => ({ results: [] })))
        );

        const pickResults = (payload) => {
            if (Array.isArray(payload?.results)) return payload.results;
            if (Array.isArray(payload?.data?.results)) return payload.data.results;
            if (Array.isArray(payload?.data)) return payload.data;
            return [];
        };

        const mixedCandidates = dedupeByMediaIdentity(candidateResponses.flatMap((payload) => pickResults(payload))).filter((item) => {
            const itemType = inferMediaType(item, type);
            return !(String(item?.id || '') === String(id) && itemType === sourceType);
        });

        const hydrateLimit = 22;
        const detailedCandidates = await Promise.all(
            mixedCandidates.slice(0, hydrateLimit).map(async (candidate) => {
                const itemType = inferMediaType(candidate, sourceType);
                const cId = candidate?.id;
                if (!cId) return candidate;

                const fresh = readFreshDetailCache(cId, itemType, '');
                if (fresh) {
                    const tmdbId =
                        fresh?.mappings?.tmdb ||
                        fresh?.mapping?.tmdb ||
                        fresh?.tmdbId ||
                        fresh?.tmdb ||
                        candidate?.mappings?.tmdb ||
                        candidate?.id;
                    return { ...fresh, ...candidate, id: String(tmdbId), media_type: itemType };
                }

                const stale = readStaleDetailCache(cId, itemType, '');
                if (stale) {
                    const tmdbId =
                        stale?.mappings?.tmdb ||
                        stale?.mapping?.tmdb ||
                        stale?.tmdbId ||
                        stale?.tmdb ||
                        candidate?.mappings?.tmdb ||
                        candidate?.id;
                    return { ...stale, ...candidate, id: String(tmdbId), media_type: itemType };
                }

                const fetched = await withTimeout(fetchDetails(cId, itemType, ''), 2200);
                if (!fetched) return candidate;
                const tmdbId =
                    fetched?.mappings?.tmdb ||
                    fetched?.mapping?.tmdb ||
                    fetched?.tmdbId ||
                    fetched?.tmdb ||
                    candidate?.mappings?.tmdb ||
                    candidate?.id;
                return { ...fetched, ...candidate, id: String(tmdbId), media_type: itemType };
            })
        );

        const enrichedCandidates = dedupeByMediaIdentity([
            ...detailedCandidates,
            ...mixedCandidates,
        ]);

        const ranked = enrichedCandidates
            .map((item) => {
                const itemType = inferMediaType(item, sourceType);
                const sameTypeBoost = itemType === sourceType ? 1 : 0;

                const genreScore = scoreGenreOverlap(currentGenreIds, currentGenreTokens, item);
                const semanticTokens = getMediaSemanticTokenSet(item);
                const semanticOverlap = scoreTokenOverlap(currentSemanticTokens, semanticTokens);

                const seedYear = getNumericYear(sourceMedia);
                const candidateYear = getNumericYear(item);
                const yearCloseness = scoreYearCloseness(seedYear, candidateYear);

                const rating = Number(item?.vote_average || item?.rating || 0);
                const popularity = Number(item?.popularity || 0);
                const qualityScore = Math.max(0, rating) * 2.2 + Math.min(12, Math.log10(Math.max(1, popularity) + 1) * 5);

                const totalScore =
                    (genreScore.score * 3.4) +
                    (semanticOverlap * 320) +
                    (yearCloseness * 45) +
                    (sameTypeBoost * 22) +
                    qualityScore;

                const hasStrongMatch = genreScore.overlap > 0 || semanticOverlap >= 0.05;
                return { item, totalScore, hasStrongMatch };
            })
            .sort((a, b) => b.totalScore - a.totalScore)
            .map((entry) => entry);

        const strongMatches = ranked.filter((entry) => entry.hasStrongMatch).map((entry) => entry.item);
        const backupMatches = ranked.filter((entry) => !entry.hasStrongMatch).map((entry) => entry.item);

        let finalItems = diversifyResults([...strongMatches, ...backupMatches], 24);
        if (!finalItems.length) {
            finalItems = mixedCandidates.slice(0, 24);
        }

        const filteredFinalItems = finalItems.filter(hasPositiveRating);
        similarMemoryCache.set(cacheKey, { ts: Date.now(), items: filteredFinalItems });
        return filteredFinalItems;
    } catch (fallbackErr) {
        console.error('Similar movies fetch failed:', fallbackErr);
        return [];
    }
}

// Simple Levenshtein distance for fuzzy matching
function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

function renderDetailsModal(movie, id, type, provider = '') {
    currentModalMovie = movie;
    const resolvedProvider = provider || getItemProvider(movie);
    const isAdded = isInWatchlist(id);
    const title = getTitle(movie);
    const cover = getCover(movie);
    const poster = getPoster(movie);
    const year = getYear(movie);
    const rating = getRating(movie);

    const parseRuntimeMinutes = (value) => {
        if (value == null) return 0;
        if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));

        const str = String(value).trim();
        if (!str) return 0;

        // ISO-8601 duration like PT2H10M
        const iso = str.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
        if (iso) {
            const h = Number(iso[1] || 0);
            const m = Number(iso[2] || 0);
            const s = Number(iso[3] || 0);
            return Math.max(0, (h * 60) + m + (s >= 30 ? 1 : 0));
        }

        // Formats like "2h 10m"
        const hMatch = str.match(/(\d+)\s*h/i);
        const mMatch = str.match(/(\d+)\s*m/i);
        if (hMatch || mMatch) {
            const h = Number(hMatch?.[1] || 0);
            const m = Number(mMatch?.[1] || 0);
            return Math.max(0, (h * 60) + m);
        }

        // Plain number-like strings or "130 min"
        const num = Number((str.match(/\d+/) || [0])[0]);
        return Number.isFinite(num) ? Math.max(0, num) : 0;
    };

    const runtimeVal = parseRuntimeMinutes(
        movie.duration ??
        movie.runtime ??
        movie.runTime ??
        movie.length ??
        movie.tmdbRuntime
    );
    let runtime = 'N/A';
    if (type === 'movie' && runtimeVal > 0) {
        const h = Math.floor(runtimeVal / 60);
        const m = runtimeVal % 60;
        runtime = h > 0 ? `${h}h ${m}m` : `${m}m`;
    } else if (type === 'tv') {
        runtime = `${(movie.totalEpisodes || movie.episodes?.length || 0) || 'N/A'} Episodes`;
    }

    const genresList = Array.isArray(movie.genres) ? movie.genres : (movie.genres || 'N/A').split(',').map(g => g.trim());
    const desc = movie.description || movie.overview || 'No overview available.';

    // Helper function to check if trailer type is official
    function isOfficialTrailer(trailerObj) {
        if (!trailerObj) return false;
        
        const type = (trailerObj.type || '').toLowerCase().trim();
        const name = (trailerObj.name || '').toLowerCase().trim();
        
        // Check type - exclude known non-official types
        const excludedTypes = ['teaser', 'clip', 'behind the scenes', 'featurette', 'opening credits'];
        if (excludedTypes.some(excluded => type.includes(excluded))) {
            return false;
        }
        
        // Check name for forbidden keywords
        const forbiddenKeywords = ['teaser', 'clip', 'behind', 'scene', 'featurette', 'short', 'sneak', 'peek', 'interview', 'making of'];
        if (forbiddenKeywords.some(keyword => name.includes(keyword))) {
            return false;
        }
        
        // Official trailer should have 'trailer' in type or name OR be a generic name
        if (!type && !name) return true; // If no type/name, give it a chance
        if (type.includes('trailer') || name.includes('official')) return true;
        
        return false;
    }

    // Simplified trailer detection with filtration
    let trailerUrl = null;

    function normalizeTrailerUrl(candidate) {
        if (!candidate) return null;

        if (typeof candidate === 'string') {
            const s = candidate.trim();
            if (!s) return null;
            if (s.includes('youtube.com') || s.includes('youtu.be')) {
                return s.includes('/shorts/') ? null : s;
            }
            // Raw YouTube video id fallback
            if (/^[a-zA-Z0-9_-]{6,}$/.test(s)) {
                return `https://www.youtube.com/watch?v=${s}`;
            }
            return null;
        }

        if (typeof candidate === 'object') {
            const url = candidate.url || candidate.link;
            if (typeof url === 'string' && (url.includes('youtube.com') || url.includes('youtu.be')) && !url.includes('/shorts/')) {
                return url;
            }

            const idOrKey = candidate.id || candidate.key || candidate.youtubeId || candidate.videoId;
            if (typeof idOrKey === 'string' && idOrKey.length >= 6) {
                return `https://www.youtube.com/watch?v=${idOrKey}`;
            }
        }

        return null;
    }

    // Priority 1: direct trailer field
    if (movie.trailer) {
        if (typeof movie.trailer === 'string') {
            trailerUrl = normalizeTrailerUrl(movie.trailer);
        } else if (typeof movie.trailer === 'object' && !Array.isArray(movie.trailer)) {
            if (isOfficialTrailer(movie.trailer) || !movie.trailer.type) {
                trailerUrl = normalizeTrailerUrl(movie.trailer);
            }
        } else if (Array.isArray(movie.trailer) && movie.trailer.length > 0) {
            for (const t of movie.trailer) {
                if (t && typeof t === 'object' && (isOfficialTrailer(t) || !t.type)) {
                    trailerUrl = normalizeTrailerUrl(t);
                    if (trailerUrl) break;
                }
            }
        }
    }

    // Priority 2: TMDB-style videos payload fallback
    if (!trailerUrl && Array.isArray(movie.videos?.results)) {
        for (const v of movie.videos.results) {
            if (!v || typeof v !== 'object') continue;
            if (!isOfficialTrailer(v) && (v.type || '').toLowerCase() !== 'trailer') continue;
            trailerUrl = normalizeTrailerUrl(v);
            if (trailerUrl) break;
        }
    }

    // Priority 2b: if the API only returned teasers/clips but they still point to
    // YouTube, keep the trailer affordance available instead of hiding it entirely.
    if (!trailerUrl && Array.isArray(movie.videos?.results)) {
        const videoCandidates = movie.videos.results
            .filter(v => v && typeof v === 'object')
            .filter(v => String(v.site || '').toLowerCase() === 'youtube' || v.key || v.youtubeId || v.videoId || v.url)
            .sort((a, b) => {
                const score = (v) => {
                    const type = String(v.type || '').toLowerCase();
                    const name = String(v.name || '').toLowerCase();
                    return (
                        (type.includes('trailer') ? 40 : 0) +
                        (name.includes('trailer') ? 30 : 0) +
                        (name.includes('official') ? 20 : 0) -
                        (type.includes('clip') || name.includes('clip') ? 25 : 0)
                    );
                };
                return score(b) - score(a);
            });

        for (const v of videoCandidates) {
            trailerUrl = normalizeTrailerUrl(v);
            if (trailerUrl) break;
        }
    }

    // Priority 3: common alternate fields
    if (!trailerUrl) {
        trailerUrl = normalizeTrailerUrl(movie.trailer_url || movie.trailerUrl || movie.youtube_trailer || movie.youtubeTrailer);
    }

    // Priority 4: search fallback only when a YouTube API key is configured.
    // YouTube search embed URLs are unreliable, so do not render a trailer CTA
    // unless playTrailer() can resolve the search to a real video ID first.
    if (!trailerUrl && YOUTUBE_API_KEY) {
        const searchTitle = `${title} ${year !== 'N/A' ? year : ''} official trailer`.replace(/\s+/g, ' ').trim();
        if (searchTitle) {
            trailerUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchTitle)}`;
        }
    }
    
    const hasTrailer = Boolean(trailerUrl);
    const safeTrailerUrl = hasTrailer ? encodeURIComponent(trailerUrl) : '';
    const safeCover = encodeURIComponent(cover || '');

    modalBody.innerHTML = `
        <div class="modal-header-container">
            <div class="modal-header-bg ${hasTrailer ? 'trailer-clickable' : ''}" style="background-image:url('${cover}')" ${hasTrailer ? `id="modal-hero-bg" data-trailer-url="${safeTrailerUrl}" data-cover="${safeCover}"` : ''}>
                <div class="modal-header-overlay-vignette"></div>
                ${hasTrailer ? '<div class="trailer-play-icon"><i class="fa-solid fa-play"></i></div>' : ''}
            </div>
            <div class="modal-trailer-container" id="modal-trailer-container" style="display: none;">
                <iframe id="modal-trailer-iframe" 
                    src="" 
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen>
                </iframe>
            </div>
            <div class="modal-poster-wrapper">
                <img class="modal-poster" src="${poster}" alt="${title}"
                     onerror="this.src='https://placehold.co/200x300/1a1a2e/e50914?text=No+Poster'">
            </div>
        </div>
        
        <div class="modal-content-details">
            <div class="modal-main-info">
                <h2 class="modal-title">${title}</h2>
                
                <div class="modal-meta-pills">
                    <span class="meta-pill rating-pill"><i class="fa-solid fa-star"></i> ${rating}</span>
                    <span class="meta-pill" style="border-color:#38bdf833">
                        <i class="fa-solid fa-${type === 'movie' ? 'clock' : 'tv'}" style="color:#38bdf8"></i> ${runtime}
                    </span>
                    <span class="meta-pill" style="border-color:#4ade8033">
                        <i class="fa-solid fa-calendar-days" style="color:#4ade80"></i> ${year}
                    </span>
                </div>

                <div class="modal-genres">
                    ${genresList.map(g => {
                        const info = getGenreInfo(g);
                        return `<span class="genre-pill" style="border-color:${info.color}33; background:rgba(255,255,255,0.03)">
                                    <i class="fa-solid ${info.icon}" style="color:${info.color}"></i> ${g}
                                </span>`;
                    }).join('')}
                </div>
                
                <div class="modal-action-buttons">
                    <button class="btn btn-watch-now" onclick="watchNow('${id}','${type}', '${resolvedProvider}')">
                        <i class="fa-solid fa-play"></i> Watch Now
                    </button>
                    <button id="modal-watchlist-btn" class="btn btn-list ${isAdded ? 'btn-in-list' : 'btn-add-list'}" 
                            onclick="handleWatchlistToggle('${id}', '${type}', '${resolvedProvider}')">
                        <i class="fa-solid fa-${isAdded ? 'check' : 'plus'}"></i> ${isAdded ? 'In Your List' : 'Add to List'}
                    </button>
                </div>

                <div class="modal-description-section">
                    <div class="modal-desc-container">
                        <p id="modal-desc-text" class="modal-desc ${desc.length > 200 ? 'truncated' : ''}">${desc}</p>
                        ${desc.length > 200 ? `
                        <div id="desc-toggle-btn" class="description-more" onclick="toggleDescription()">
                           Read More <i class="fa-solid fa-chevron-down"></i>
                        </div>` : ''}
                    </div>
                </div>

                <div class="modal-similar-section">
                    <h3 class="similar-title">Similar Finds</h3>
                    <div id="similar-movies-grid" class="movie-grid">
                        <div class="similar-loading">Loading similar movies...</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    if (hasTrailer) {
        const trailerTrigger = document.getElementById('modal-hero-bg');
        if (trailerTrigger) {
            trailerTrigger.addEventListener('click', () => {
                const encodedTrailer = trailerTrigger.getAttribute('data-trailer-url') || '';
                const encodedCover = trailerTrigger.getAttribute('data-cover') || '';
                const decodedTrailer = decodeURIComponent(encodedTrailer);
                const decodedCover = decodeURIComponent(encodedCover);
                playTrailer(decodedTrailer, decodedCover);
            });
        }
    }

    // Check if description actually needs a "More" button
    setTimeout(() => {
        const descEl = document.getElementById('modal-desc-text');
        const toggleBtn = document.getElementById('desc-toggle-btn');
        if (descEl && toggleBtn) {
            // If the actual height is less than or equal to the visible height (clamped),
            // it means no truncation is occurring.
            if (descEl.scrollHeight <= descEl.offsetHeight + 2) {
                toggleBtn.style.display = 'none';
                descEl.classList.remove('truncated');
            }
        }
    }, 100);

    // Load similar movies by shared genre with the clicked item.
    fetchSimilar(id, type, provider, movie).then(similarMovies => {
        const grid = document.getElementById('similar-movies-grid');
        if (!grid) return;

        const visibleSimilarMovies = (similarMovies || []).filter(hasPositiveRating);

        if (visibleSimilarMovies.length === 0) {
            grid.innerHTML = '<div class="no-similar">No similar movies found</div>';
            return;
        }

        // Initially show 6, then reveal 6 more per click.
        let showCount = 6;
        const totalCount = visibleSimilarMovies.length;

        function renderSimilarGrid(count) {
            const moviesToShow = visibleSimilarMovies.slice(0, count);
            grid.innerHTML = moviesToShow.map(movie => {
                const title = getTitle(movie);
                const poster = getPoster(movie);
                const year = getYear(movie);
                const rating = getRating(movie);
                const ratingNum = Math.max(0, Math.min(10, Number(rating) || 0));
                const ratingProgress = Math.round(ratingNum * 10);
                const movieId = movie.id;
                const movieType = inferMediaType(movie, type);
                const movieProvider = getItemProvider(movie);
                
                // Check for continue watching data to show season/episode info
                let seasonEpisodeBadge = '';
                if (movieType === 'tv') {
                    const continueWatchingRaw = localStorage.getItem('sv_continue_watching');
                    if (continueWatchingRaw) {
                        try {
                            const continueWatchingItems = JSON.parse(continueWatchingRaw);
                            const watchedItem = continueWatchingItems.find(cw => 
                                String(cw.id) === String(movieId) && cw.type === 'tv'
                            );
                            if (watchedItem) {
                                const seasonNo = watchedItem.seasonNo || watchedItem.season || 1;
                                const episodeNo = watchedItem.episodeNo || watchedItem.episode || 1;
                                seasonEpisodeBadge = `<span class="similar-type-badge">S${seasonNo}E${episodeNo}</span>`;
                            } else {
                                seasonEpisodeBadge = `<span class="similar-type-badge">TV</span>`;
                            }
                        } catch (e) {
                            seasonEpisodeBadge = `<span class="similar-type-badge">TV</span>`;
                        }
                    } else {
                        seasonEpisodeBadge = `<span class="similar-type-badge">TV</span>`;
                    }
                } else {
                    seasonEpisodeBadge = `<span class="similar-type-badge">MOVIE</span>`;
                }

                return `
                    <div class="movie-card" onclick="openDetails('${movieId}', '${movieType}', '${movieProvider}')">
                        <img src="${poster}" alt="${title}" onerror="this.src='https://placehold.co/200x300/1a1a2e/e50914?text=No+Poster'">
                        <span class="quality-badge">HD</span>
                        <div class="similar-rating-ring" style="--rating-progress:${ratingProgress}">
                            <span><i class="fa-solid fa-star rating"></i> ${rating}</span>
                        </div>
                        ${seasonEpisodeBadge}
                        <div class="similar-badge-meta">
                            <span class="similar-year-badge">${year}</span>
                        </div>
                        <div class="movie-card-info">
                            <h3 class="movie-card-title">${title}</h3>
                            <div class="movie-card-meta">
                                <span>${year}</span>
                                <span><i class="fa-solid fa-star rating"></i> ${rating}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // Add "More..." button if there are more movies
            if (count < totalCount) {
                grid.innerHTML += `<button id="similar-more-btn" class="similar-more-btn" onclick="showMoreSimilar(${count}, ${totalCount})">More...</button>`;
            }
        }

        // Initially show 6
        renderSimilarGrid(showCount);

        // Make showMoreSimilar available globally
        window.showMoreSimilar = function(currentCount, total) {
            const nextCount = Math.min(total, Number(currentCount || 0) + 6);
            showCount = nextCount;
            renderSimilarGrid(showCount);
        };
    }).catch(() => {
        const grid = document.getElementById('similar-movies-grid');
        if (grid) grid.innerHTML = '<div class="no-similar">Failed to load similar movies</div>';
    });
}

// ------------------ FETCH TRENDING -----------------------------------------
async function fetchTrending() {
    const cacheKey = 'trending:all:day';
    try {
        const cached = readCache(cacheKey);
        if (cached?.results?.length) {
            const cachedItems = (cached.results || [])
                .filter(item => typeof item.id === 'number' && hasPositiveRating(item))
                .slice(0, 12);
            heroItems = cachedItems.slice(0, 5);
            if (heroItems.length && typeof displayHero === 'function') {
                displayHero(heroItems[0]);
                startHeroRotation();
            }
            displayGrid(cachedItems, trendingGrid);
        }

        // Explicitly using the full path to ensure we hit the meta/tmdb trending
        const data = await fetchJsonWithFallback('/trending');
        writeCache(cacheKey, data);
        const items = (data.results || [])
            .filter(item => typeof item.id === 'number' && hasPositiveRating(item))
            .slice(0, 12);
        if (!items.length) return true;

        heroItems = items.slice(0, 5);
        if (heroItems.length) {
            displayHero(heroItems[0]);
            startHeroRotation();
        }
        displayGrid(items, trendingGrid);
        return true;
    } catch (err) {
        console.error('Trending error:', err?.message || err);
        return false;
    }
}

// ------------------ FETCH SECTION ------------------------------------------
async function fetchSection(type, grid, mediaType, timePeriod = 'day') {
    if (!grid) return true;
    const cacheKey = `trending:${type}:${timePeriod}`;
    // Explicitly using the full trending path for categories
    const url = `/trending?type=${type}&timePeriod=${timePeriod}`;
    try {
        const cached = readCache(cacheKey);
        if (cached?.results?.length) {
            displayGrid((cached.results || []).slice(0, 12), grid, mediaType);
        }

        const data = await fetchJsonWithFallback(url);
        writeCache(cacheKey, data);
        displayGrid((data.results || []).slice(0, 12), grid, mediaType);
        return true;
    } catch (err) {
        console.error(`Error fetching ${type}:`, err?.message || err);
        return false;
    }
}

// ------------------ FETCH DRAMAS -------------------------------------------
async function fetchDramas() {
    if (!dramasGrid) return true;
    const cacheKey = 'dramacool:popular';
    try {
        const dcBase = BASE_URL.replace('/meta/tmdb', '/movies/dramacool');
        const url = `${dcBase}/popular`;

        const cached = readCache(cacheKey);
        if (cached) {
            const results = cached.results || (Array.isArray(cached) ? cached : []);
            const cachedItems = results.slice(0, 12).map(item => ({
                ...item,
                title: item.title || item.name || 'Untitled Drama',
                image: item.image || item.poster || item.img || item.thumbnail || item.poster_path || '',
                media_type: 'tv',
                provider: 'dramacool'
            }));
            if (cachedItems.length) {
                displayGrid(cachedItems, dramasGrid);
                // Trigger hydration for cached items too
                setTimeout(() => {
                    const cards = dramasGrid.querySelectorAll('.movie-card');
                    cachedItems.forEach((item, idx) => {
                        if (cards[idx]) hydrateGridCard(item, cards[idx]);
                    });
                }, 100);
            }
        }

        const data = await fetchJsonWithFallback(url);
        writeCache(cacheKey, data);

        const results = data.results || (Array.isArray(data) ? data : []);
        const items = results.slice(0, 12).map(item => ({
            ...item,
            title: item.title || item.name || 'Untitled Drama',
            image: item.image || item.poster || item.img || item.thumbnail || item.poster_path || '',
            media_type: 'tv',
            provider: 'dramacool'
        }));
        displayGrid(items, dramasGrid);

        // Hydrate items background
        setTimeout(() => {
            const cards = dramasGrid.querySelectorAll('.movie-card');
            items.forEach((item, idx) => {
                if (cards[idx]) hydrateGridCard(item, cards[idx]);
            });
        }, 200);

        return true;
    } catch (err) {
        console.error('Error fetching dramas:', err?.message || err);
        return false;
    }
}

async function hydrateGridCard(item, card) {
    try {
        const img = card.querySelector('img');
        const isBad = (s) => !s || s.includes('placehold.co') || s.includes('No+Image') || s.includes('dramaool.png');
        const normalizeIdentity = (value) => String(value || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const toYearNum = (value) => {
            const n = Number(String(value || '').match(/\d{4}/)?.[0] || 0);
            return Number.isFinite(n) && n > 1800 ? n : 0;
        };
        const isLikelySameTitle = (seed, candidate) => {
            const seedTitle = normalizeIdentity(getTitle(seed));
            const candTitle = normalizeIdentity(getTitle(candidate));
            if (!seedTitle || !candTitle) return false;
            if (seedTitle === candTitle) return true;
            if (seedTitle.includes(candTitle) || candTitle.includes(seedTitle)) return true;
            return false;
        };

        const itemType = getType(item) || item.media_type || 'movie';
        const itemProvider = item.provider || '';
        const seedYear = toYearNum(getYear(item));

        // 1. Fetch details from original provider
        const details = await fetchDetails(item.id, itemType, itemProvider);
        const detailsYear = details ? toYearNum(getYear(details)) : 0;
        const detailsIdentityMatches = !!details && isLikelySameTitle(item, details) && (!seedYear || !detailsYear || Math.abs(seedYear - detailsYear) <= 2);
        let poster = details ? getPoster(details) : '';

        // 2. If image is still bad, attempt TMDB lookup by title
        if (isBad(poster)) {
            const cleanTitle = getTitle(item);
            try {
                // Hits /meta/tmdb/Title - Consumet uses path as query if no command matches
                const tmdbResults = await fetchJsonWithFallback(`/${encodeURIComponent(cleanTitle)}`, 5000);
                if (tmdbResults?.results?.length) {
                    const bestMatch = tmdbResults.results
                        .map((candidate) => {
                            const sameTitle = isLikelySameTitle(item, candidate);
                            const candidateYear = toYearNum(getYear(candidate));
                            const yearDelta = (seedYear && candidateYear) ? Math.abs(seedYear - candidateYear) : 0;
                            const yearScore = (!seedYear || !candidateYear)
                                ? 10
                                : Math.max(0, 40 - (yearDelta * 12));
                            const score = (sameTitle ? 140 : 0) + yearScore + Number(getRating(candidate) || 0);
                            return { candidate, score, sameTitle };
                        })
                        .sort((a, b) => b.score - a.score)[0];

                    if (bestMatch?.sameTitle && bestMatch.score >= 120) {
                        const tmdbPoster = getPoster(bestMatch.candidate);
                        if (!isBad(tmdbPoster)) {
                            poster = tmdbPoster;
                        }
                    }
                }
            } catch (tmdbErr) {
                // Ignore TMDB lookup errors
            }
        }

        if (img && poster && !isBad(poster)) {
            img.src = poster;
            img.style.opacity = '1';
        }

        // Hydrate other metadata
        if (details && detailsIdentityMatches) {
            const ratingVal = getRating(details);
            if (ratingVal !== '0.0') {
                const ratingMetaLabel = card.querySelector('.movie-card-meta .rating');
                if (ratingMetaLabel && ratingMetaLabel.nextSibling) {
                    ratingMetaLabel.nextSibling.textContent = ' ' + ratingVal;
                }
                const ringValue = card.querySelector('.card-rating-ring-value');
                if (ringValue) {
                    ringValue.innerHTML = `<i class="fa-solid fa-star"></i> ${ratingVal}`;
                }
                const ringEl = card.querySelector('.card-rating-ring');
                if (ringEl) {
                    const p = Math.round(Math.max(0, Math.min(10, Number(ratingVal) || 0)) * 10);
                    ringEl.style.setProperty('--rating-progress', String(p));
                }
            }
            const yearVal = getYear(details);
            if (yearVal !== 'N/A') {
                const metaSpan = card.querySelector('.movie-card-meta span:first-child');
                if (metaSpan) metaSpan.textContent = yearVal;
            }

            // Also rescue the title if it was "Unknown" in the initial search results
            const titleEl = card.querySelector('.movie-card-title');
            const currentTitle = titleEl ? titleEl.textContent.trim() : '';
            if (titleEl && (currentTitle === 'Unknown' || !currentTitle) && details.title && details.title !== 'Unknown') {
                titleEl.textContent = details.title;
            }
        }
    } catch (e) { }
}

// ------------------ HERO ---------------------------------------------------
function displayHero(item) {
    if (!item) return;
    if (!heroSection || !heroContainer) return;
    const title = getTitle(item);
    const year = getYear(item);
    const rating = getRating(item);
    const bg = getCover(item);
    const type = getType(item);
    const id = item.id;

    heroSection.style.backgroundImage = `url('${bg}')`;
    heroSection.classList.add('is-switching');
    setTimeout(() => heroSection.classList.remove('is-switching'), 260);

    // Add Animation Class
    const heroInfo = heroContainer.querySelector('.hero-info');
    if (heroInfo) {
        heroInfo.classList.remove('animate-in');
        void heroInfo.offsetWidth; // Trigger reflow
        heroInfo.classList.add('animate-in');
    }

    heroContainer.innerHTML = `
        <div class="hero-info">
            <div class="hero-content-main">
                <span class="hero-tagline">Now Streaming</span>
                <h1 class="hero-title">${title}</h1>
                <div class="hero-meta">
                    <span class="meta-pill rating-pill"><i class="fa-solid fa-star"></i> ${rating}</span>
                    <span class="meta-pill" style="border-color:#38bdf833">
                        <i class="fa-solid fa-calendar-days" style="color:#38bdf8"></i> ${year}
                    </span>
                    <span class="meta-pill" style="border-color:#4ade8033">
                        <i class="fa-solid fa-${type === 'tv' ? 'tv' : 'film'}" style="color:#4ade80"></i> ${type === 'tv' ? 'TV' : 'Movie'}
                    </span>
                </div>
                <p class="hero-description">${item.description || item.overview || ''}</p>
                <div class="hero-btns">
                    <button class="btn btn-watch-now" onclick="watchNow('${id}','${type}')">
                        <i class="fa-solid fa-play"></i> Watch Now
                    </button>
                    <button class="btn btn-more-info" onclick="openDetails('${id}','${type}')">
                        <i class="fa-solid fa-circle-info"></i> More Info
                    </button>
                </div>
            </div>
        </div>
    `;
    const heroInfoBtn = heroContainer.querySelector('.btn-more-info');
    if (heroInfoBtn) {
        heroInfoBtn.addEventListener('mouseenter', () => prefetchDetails(id, type), { once: true });
        heroInfoBtn.addEventListener('touchstart', () => prefetchDetails(id, type), { once: true, passive: true });
    }
    syncHeroControls();
    startHeroProgress();
}

function startHeroRotation() {
    clearInterval(heroInterval);
    if (!Array.isArray(heroItems) || heroItems.length <= 1) return;
    heroInterval = setInterval(() => {
        setHeroSlide(heroIndex + 1, false);
    }, HERO_ROTATION_MS); // 8s for better readability
}

function setHeroSlide(nextIndex, isManual = false) {
    if (!Array.isArray(heroItems) || heroItems.length === 0) return;
    const total = heroItems.length;
    heroIndex = ((Number(nextIndex || 0) % total) + total) % total;
    resetHeroProgress();
    displayHero(heroItems[heroIndex]);
    if (isManual) startHeroRotation();
}

function buildHeroDots() {
    if (!heroDotsEl) return;
    heroDotsEl.innerHTML = '';
    const total = Array.isArray(heroItems) ? heroItems.length : 0;
    for (let i = 0; i < total; i += 1) {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'hero-dot' + (i === heroIndex ? ' active' : '');
        dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
        dot.dataset.index = String(i);
        dot.addEventListener('click', () => setHeroSlide(i, true));
        heroDotsEl.appendChild(dot);
    }
}

function syncHeroControls() {
    if (!heroControls) return;
    const total = Array.isArray(heroItems) ? heroItems.length : 0;
    const show = total > 1;
    heroControls.style.display = show ? 'flex' : 'none';
    if (!show) return;

    buildHeroDots();
}

function initHeroManualControls() {
    if (heroControls) {
        heroControls.style.setProperty('--hero-rotation-ms', `${HERO_ROTATION_MS}ms`);
    }
    if (heroPrevBtn) {
        heroPrevBtn.addEventListener('click', () => setHeroSlide(heroIndex - 1, true));
    }
    if (heroNextBtn) {
        heroNextBtn.addEventListener('click', () => setHeroSlide(heroIndex + 1, true));
    }
    if (heroSection) {
        heroSection.addEventListener('mouseenter', pauseHeroProgress);
        heroSection.addEventListener('mouseleave', resumeHeroProgress);
    }
}

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

function updateHeroProgress() {
    if (!heroDotsEl || !Array.isArray(heroItems) || heroItems.length <= 1) return;
    const activeDot = heroDotsEl.querySelector('.hero-dot.active');
    if (!activeDot) return;

    const elapsed = heroProgressElapsedBeforePause + (heroProgressPausedAt ? 0 : (performance.now() - heroProgressStartedAt));
    const raw = Math.min(1, Math.max(0, elapsed / HERO_ROTATION_MS));
    const eased = easeOutCubic(raw);
    activeDot.style.setProperty('--hero-progress', eased.toFixed(4));

    if (raw >= 1) {
        activeDot.style.setProperty('--hero-progress', '1');
        return;
    }

    heroProgressRaf = requestAnimationFrame(updateHeroProgress);
}

function startHeroProgress() {
    cancelHeroProgress();
    if (!Array.isArray(heroItems) || heroItems.length <= 1) return;
    heroProgressStartedAt = performance.now();
    heroProgressPausedAt = 0;
    heroProgressElapsedBeforePause = 0;
    const activeDot = heroDotsEl?.querySelector('.hero-dot.active');
    if (activeDot) activeDot.style.setProperty('--hero-progress', '0');
    heroProgressRaf = requestAnimationFrame(updateHeroProgress);
}

function pauseHeroProgress() {
    if (heroProgressPausedAt || !heroProgressStartedAt) return;
    heroProgressPausedAt = performance.now();
    heroProgressElapsedBeforePause += heroProgressPausedAt - heroProgressStartedAt;
    cancelAnimationFrame(heroProgressRaf);
    heroProgressRaf = null;
}

function resumeHeroProgress() {
    if (!heroProgressPausedAt || !Array.isArray(heroItems) || heroItems.length <= 1) return;
    heroProgressStartedAt = performance.now();
    heroProgressPausedAt = 0;
    heroProgressRaf = requestAnimationFrame(updateHeroProgress);
}

function cancelHeroProgress() {
    if (heroProgressRaf) cancelAnimationFrame(heroProgressRaf);
    heroProgressRaf = null;
    heroProgressStartedAt = 0;
    heroProgressPausedAt = 0;
    heroProgressElapsedBeforePause = 0;
}

function resetHeroProgress() {
    cancelHeroProgress();
    const activeDot = heroDotsEl?.querySelector('.hero-dot.active');
    if (activeDot) activeDot.style.setProperty('--hero-progress', '0');
}

// ------------------ GRID ---------------------------------------------------
function displayGrid(items, container, forcedType = null, options = {}) {
    if (!container) return;
    container.innerHTML = '';
    const includeUnrated = !!options.includeUnrated;
    const renderItems = Array.isArray(items)
        ? (includeUnrated ? items.filter(Boolean) : items.filter(hasPositiveRating))
        : [];

    // Setup lazy hydration
    if (!hydrationObserver) {
        hydrationObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const card = entry.target;
                    const itemData = JSON.parse(card.dataset.item || '{}');
                    const itemType = card.dataset.type;
                    const itemProv = card.dataset.provider;

                    if (card.dataset.hydrated !== 'true') {
                        card.dataset.hydrated = 'true';
                        hydrateGridCard(itemData, card);
                    }
                    hydrationObserver.unobserve(card);
                }
            });
        }, { rootMargin: '200px' });
    }

    renderItems.forEach(item => {
        const normalizedItem = item && typeof item === 'object' ? { ...item } : item;
        const provider = getItemProvider(normalizedItem);
        if (normalizedItem && typeof normalizedItem === 'object') {
            normalizedItem.provider = provider;
        }

        const poster = getPoster(normalizedItem);
        const title = getTitle(normalizedItem);
        const year = getYear(normalizedItem);
        const rating = getRating(normalizedItem);
        const ratingNum = Math.max(0, Math.min(10, Number(rating) || 0));
        const ratingProgress = Math.round(ratingNum * 10);
        const detectedType = getType(normalizedItem);
        const type = detectedType || forcedType || 'movie';
        const id = normalizedItem.id;
        
        // Check for continue watching data to show season/episode info
        let seasonEpisodeBadge = '';
        if (type === 'tv') {
            const continueWatchingRaw = localStorage.getItem('sv_continue_watching');
            if (continueWatchingRaw) {
                try {
                    const continueWatchingItems = JSON.parse(continueWatchingRaw);
                    const watchedItem = continueWatchingItems.find(cw => 
                        String(cw.id) === String(id) && cw.type === 'tv'
                    );
                    if (watchedItem) {
                        const seasonNo = watchedItem.seasonNo || watchedItem.season || 1;
                        const episodeNo = watchedItem.episodeNo || watchedItem.episode || 1;
                        seasonEpisodeBadge = `<span class="season-episode-badge">S${seasonNo}E${episodeNo}</span>`;
                    } else {
                        seasonEpisodeBadge = `<span class="season-episode-badge">TV</span>`;
                    }
                } catch (e) {
                    seasonEpisodeBadge = `<span class="season-episode-badge">TV</span>`;
                }
            } else {
                seasonEpisodeBadge = `<span class="season-episode-badge">TV</span>`;
            }
        } else {
            seasonEpisodeBadge = `<span class="season-episode-badge">MOVIE</span>`;
        }

        const card = document.createElement('div');
        card.className = 'movie-card';
        card.dataset.item = JSON.stringify(normalizedItem);
        card.dataset.type = type;
        card.dataset.provider = provider;
        setCardGenreIds(card, getGenreIds(normalizedItem));

        card.innerHTML = `
            <img src="${poster}" alt="${title}" loading="lazy"
                 onerror="this.src='https://placehold.co/300x450/1a1a2e/e50914?text=No+Image'">
            <span class="quality-badge">HD</span>
            <div class="card-rating-ring" style="--rating-progress:${ratingProgress}">
                <span class="card-rating-ring-value"><i class="fa-solid fa-star"></i> ${rating}</span>
            </div>
            ${seasonEpisodeBadge}
            <div class="movie-card-info">
                <h3 class="movie-card-title">${title}</h3>
                <div class="movie-card-meta">
                    <span>${year}</span>
                    <span><i class="fa-solid fa-star rating"></i> ${rating}</span>
                </div>
            </div>
        `;
        card.onclick = () => openDetails(id, type, provider, normalizedItem);
        card.addEventListener('mouseenter', () => prefetchDetails(id, type, provider), { once: true });
        card.addEventListener('touchstart', () => prefetchDetails(id, type, provider), { once: true, passive: true });
        card.addEventListener('pointerdown', () => prefetchDetails(id, type, provider), { once: true, passive: true });

        container.appendChild(card);
        if (container !== trendingGrid && container !== popularTvGrid) {
            hydrationObserver.observe(card);
        }
    });

    if (container.closest && container.closest('#content-rows') && container.id !== 'genre-results-grid') {
        applyGenreFilter().catch(() => { });
    }
}

// ------------------ DISPLAY ------------------------------------------------
// Alias for backward compatibility
function displayMovies(items, container, type) { displayGrid(items, container, type); }

// ------------------ SEARCH -------------------------------------------------
let searchTimeout;

async function triggerSearch(immediate = false) {
    if (!immediate) {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => triggerSearch(true), 500);
        return;
    }

    clearTimeout(searchTimeout);
    const q = searchInput.value.trim();
    if (q.length < 2) {
        searchPage.style.display = 'none';
        heroSection.style.display = 'block';
        contentRows.style.display = 'block';
        return;
    }

    const version = ++searchVersion;

    // UI state
    heroSection.style.display = 'none';
    contentRows.style.display = 'none';
    searchPage.style.display = 'block';
    
    // Auto-scroll to top to prevent being thrown down the page
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'instant' });

    searchTitle.textContent = `Searching for "${q}"...`;
    searchPageGrid.innerHTML = `
        <div style="grid-column: 1/-1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 4rem 0;">
            <div style="width:40px;height:40px;border:3px solid rgba(255,255,255,.1);border-top-color:var(--primary);border-radius:50%;animation:spin 1s linear infinite;"></div>
            <p style="margin-top:1rem;color:var(--text-muted)">Looking for titles...</p>
        </div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;

    try {
        let data;
        // Use the centralized fetchJsonWithFallback which already handles prod/local routing
        data = await fetchJsonWithFallback(`/${encodeURIComponent(q)}`, 9000);

        if (version !== searchVersion) return; // Ignore stale results

        const mergedResults = [...(data?.results || [])];
        if (shouldRescueSearchResults(mergedResults, q)) {
            const alternatives = buildAlternativeSearchQueries(q);
            for (const altQuery of alternatives) {
                try {
                    const altData = await fetchJsonWithFallback(`/${encodeURIComponent(altQuery)}`, 9000);
                    if (version !== searchVersion) return;
                    mergedResults.push(...(altData?.results || []));
                } catch (_) {
                    // Best-effort rescue query, keep primary results if fallback fails.
                }
            }
        }

        const hits = sortSearchResultsByQuery(
            dedupeSearchResults(mergedResults)
                .filter(r => (r.type || r.media_type || '').toLowerCase() !== 'person'),
            q
        );
        displaySearchResults(hits, q);
    } catch (err) {
        console.error('Search error:', err);
        searchPageGrid.innerHTML = `<p style="grid-column: 1/-1; color:var(--text-muted); text-align:center">Search service unavailable. Please check your connection or try again.</p>`;
    }
}

// Attach listeners with improved robustness for paste/enter
searchInput.addEventListener('input', () => triggerSearch(false));
searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        triggerSearch(true);
    }
});
searchInput.addEventListener('paste', () => {
    // Small timeout to allow input value to update before triggering
    setTimeout(() => triggerSearch(true), 20);
});
const searchBtn = document.getElementById('search-btn');
const searchCloseBtn = document.getElementById('search-close-btn');

function isMobileSearchViewport() {
    return window.matchMedia('(max-width: 768px)').matches;
}

function setMobileSearchExpanded(expanded) {
    if (!searchContainer) return;
    const shouldExpand = !!expanded;
    searchContainer.classList.toggle('mobile-search-expanded', shouldExpand);
    if (header) {
        header.classList.toggle('mobile-search-open', shouldExpand && isMobileSearchViewport());
    }
}

function syncMobileSearchUi() {
    if (!searchContainer || !searchInput) return;
    if (!isMobileSearchViewport()) {
        searchContainer.classList.remove('mobile-search-expanded');
        header?.classList.remove('mobile-search-open');
        return;
    }
    // Keep expanded while actively focused so virtual keyboard resize does not collapse it.
    const hasQuery = String(searchInput.value || '').trim().length > 0;
    const isActive = document.activeElement === searchInput || searchContainer.matches(':focus-within');
    setMobileSearchExpanded(hasQuery || isActive);
}

if (searchBtn) {
    searchBtn.addEventListener('click', (e) => {
        if (isMobileSearchViewport() && searchContainer && !searchContainer.classList.contains('mobile-search-expanded')) {
            e.preventDefault();
            e.stopPropagation();
            setMobileSearchExpanded(true);
            searchInput?.focus();
            return;
        }
        triggerSearch(true);
    });
}

if (searchCloseBtn) {
    searchCloseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (searchInput) {
            searchInput.value = '';
        }
        triggerSearch(true);
        if (isMobileSearchViewport()) {
            setMobileSearchExpanded(false);
            searchInput?.blur();
        }
    });
}

searchInput?.addEventListener('focus', () => {
    if (isMobileSearchViewport()) setMobileSearchExpanded(true);
});

searchInput?.addEventListener('blur', () => {
    // Delay to allow click handlers inside the search bar to run first.
    setTimeout(() => {
        if (!searchContainer || !searchInput || !isMobileSearchViewport()) return;
        const hasQuery = String(searchInput.value || '').trim().length > 0;
        if (!searchContainer.matches(':focus-within') && !hasQuery) {
            setMobileSearchExpanded(false);
        }
    }, 120);
});

window.addEventListener('resize', syncMobileSearchUi);
window.addEventListener('orientationchange', syncMobileSearchUi);
syncMobileSearchUi();

function displaySearchResults(results, query) {
    heroSection.style.display = 'none';
    contentRows.style.display = 'none';
    searchPage.style.display = 'block';

    searchTitle.textContent = `Search Results for "${query}"`;

    const dedupedResults = dedupeSearchResults(results);

    if (!dedupedResults.length) {
        searchPageGrid.innerHTML = '<p style="color:var(--text-muted);font-size:1.1rem">No results found.</p>';
        return;
    }
    // For search we keep unrated/upcoming titles visible so users can discover complete TMDB matches.
    displayGrid(dedupedResults, searchPageGrid, null, { includeUnrated: true });
}

// ------------------ DETAILS MODAL HANDLERS --------------------------------
function closeDetailsModal() {
    movieModal.classList.remove('active');
    
    // Get the stored scroll position
    const storedScrollY = window.storedScrollPosition || 0;
    
    // Remove modal-open class which removes overflow: hidden
    document.body.classList.remove('modal-open');
    
    // Immediately scroll to stored position before browser can reset it
    window.scroll(0, storedScrollY);
    
    // Clean up stored position
    setTimeout(() => {
        delete window.storedScrollPosition;
    }, 0);
}

function isTrailerPlaying() {
    const trailerContainer = document.getElementById('modal-trailer-container');
    const trailerIframe = document.getElementById('modal-trailer-iframe');
    return Boolean(
        trailerContainer &&
        trailerIframe &&
        trailerContainer.style.display !== 'none' &&
        trailerIframe.src
    );
}

closeModal.onclick = () => {
    if (isTrailerPlaying()) {
        closeTrailer();
        return;
    }

    closeDetailsModal();
};
window.onclick = e => {
    if (e.target === movieModal) {
        closeDetailsModal();
    }
};

// ------------------ PLAYER ------------------------------------------------
function showResumeChoiceDialog({ title, prettyTime, tvHint }) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'resume-choice-overlay';
        overlay.innerHTML = `
            <div class="resume-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="resume-choice-title">
                <button class="resume-choice-close" type="button" aria-label="Close resume dialog">
                    <i class="fa-solid fa-xmark"></i>
                </button>
                <div class="resume-choice-icon"><i class="fa-solid fa-clock-rotate-left"></i></div>
                <h3 id="resume-choice-title" class="resume-choice-title"></h3>
                <p class="resume-choice-text">
                    Continue from <strong>${prettyTime}${tvHint}</strong>?
                </p>
                <div class="resume-choice-actions">
                    <button type="button" class="resume-choice-btn resume-choice-btn-secondary" data-action="restart">Start Over</button>
                    <button type="button" class="resume-choice-btn resume-choice-btn-primary" data-action="continue">Continue</button>
                </div>
            </div>
        `;

        const titleEl = overlay.querySelector('.resume-choice-title');
        if (titleEl) titleEl.textContent = String(title || 'Resume playback');

        const finalize = (choice) => {
            document.removeEventListener('keydown', onKeyDown);
            overlay.remove();
            resolve(choice);
        };

        const onKeyDown = (e) => {
            if (e.key === 'Escape') finalize(null);
        };

        overlay.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.getAttribute('data-action');
            if (action === 'continue') return finalize('continue');
            if (action === 'restart') return finalize('restart');
            if (e.target.classList.contains('resume-choice-overlay') || e.target.closest('.resume-choice-close')) {
                return finalize(null);
            }
        });

        document.addEventListener('keydown', onKeyDown);
        document.body.appendChild(overlay);
        overlay.querySelector('[data-action="continue"]')?.focus();
    });
}

async function resolveYouTubeVideoIdFromSearchUrl(trailerUrl) {
    if (!trailerUrl || !YOUTUBE_API_KEY) return null;
    try {
        const url = new URL(trailerUrl);
        const isYouTubeSearch =
            url.hostname.includes('youtube.com') &&
            (url.pathname === '/results' || url.pathname === '/results/');
        if (!isYouTubeSearch) return null;

        const query = url.searchParams.get('search_query') || url.searchParams.get('q') || '';
        if (!query) return null;

        const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=1&q=${encodeURIComponent(query)}&key=${encodeURIComponent(YOUTUBE_API_KEY)}`;
        const result = await fetchJson(apiUrl, 9000);
        const videoId = result?.items?.[0]?.id?.videoId;
        return (typeof videoId === 'string' && videoId.length >= 6) ? videoId : null;
    } catch (_) {
        return null;
    }
}

function getYouTubeSearchQuery(trailerUrl) {
    try {
        const url = new URL(trailerUrl);
        const isYouTubeSearch =
            url.hostname.includes('youtube.com') &&
            (url.pathname === '/results' || url.pathname === '/results/');
        if (!isYouTubeSearch) return '';
        return url.searchParams.get('search_query') || url.searchParams.get('q') || '';
    } catch (_) {
        return '';
    }
}

function showTrailerEmbed(embedSrc) {
    const heroBg = document.getElementById('modal-hero-bg');
    const trailerContainer = document.getElementById('modal-trailer-container');
    const trailerIframe = document.getElementById('modal-trailer-iframe');
    const posterWrapper = document.querySelector('.modal-poster-wrapper');
    const modalCloseBtn = document.querySelector('.close-modal');

    if (heroBg && trailerContainer && trailerIframe) {
        heroBg.classList.add('trailer-starting');

        setTimeout(() => {
            trailerIframe.src = embedSrc;
            heroBg.style.display = 'none';
            trailerContainer.style.display = 'block';
            requestAnimationFrame(() => trailerContainer.classList.add('trailer-visible'));

            if (posterWrapper) {
                posterWrapper.classList.add('poster-top-cut');
            }

            if (modalCloseBtn) {
                modalCloseBtn.classList.remove('hidden');
                modalCloseBtn.classList.add('trailer-active-close');
            }
        }, 260);
    }
}

async function playTrailer(trailerUrl, coverImage) {
    if (!trailerUrl) {
        console.warn('No trailer URL provided');
        return;
    }

    // Extract video ID from YouTube URL - supports multiple formats
    let videoId = null;
    
    // Create URL object for safe parsing
    try {
        const url = new URL(trailerUrl);
        
        // Try youtube.com v= parameter
        if (url.hostname.includes('youtube.com')) {
            videoId = url.searchParams.get('v');
            if (!videoId && url.pathname.startsWith('/embed/')) {
                videoId = url.pathname.split('/')[2] || null;
            }
        }
        // Try youtu.be short format
        else if (url.hostname.includes('youtu.be')) {
            videoId = url.pathname.split('/')[1];
        }
    } catch (e) {
        // If URL object fails, try manual extraction
        console.warn('URL parsing failed, trying manual extraction');
        
        // Try v= parameter
        if (trailerUrl.includes('v=')) {
            const match = trailerUrl.match(/v=([a-zA-Z0-9_-]+)/);
            if (match) videoId = match[1];
        }
        // Try youtu.be format
        else if (trailerUrl.includes('youtu.be')) {
            const match = trailerUrl.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
            if (match) videoId = match[1];
        }
    }
    
    if (!videoId) {
        // If trailer is a YouTube search URL, resolve to a concrete video via YouTube API key.
        videoId = await resolveYouTubeVideoIdFromSearchUrl(trailerUrl);
    }

    if (!videoId) {
        const searchQuery = getYouTubeSearchQuery(trailerUrl);
        console.warn('Could not resolve playable trailer video ID:', searchQuery || trailerUrl);
        return;
    }

    showTrailerEmbed(`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&controls=1&fs=1&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=0`);
}

function closeTrailer() {
    const heroBg = document.getElementById('modal-hero-bg');
    const trailerContainer = document.getElementById('modal-trailer-container');
    const trailerIframe = document.getElementById('modal-trailer-iframe');
    const posterWrapper = document.querySelector('.modal-poster-wrapper');
    const modalCloseBtn = document.querySelector('.close-modal');

    if (heroBg && trailerContainer && trailerIframe) {
        // Stop the video by clearing src
        trailerIframe.src = '';
        
        // Show hero and hide trailer
        trailerContainer.classList.remove('trailer-visible');
        heroBg.style.display = 'block';
        heroBg.classList.remove('trailer-starting');
        trailerContainer.style.display = 'none';
        
        // Reset poster (remove top cut animation)
        if (posterWrapper) {
            posterWrapper.classList.remove('poster-top-cut');
        }
        
        // Show modal close button again
        if (modalCloseBtn) {
            modalCloseBtn.classList.remove('hidden');
            modalCloseBtn.classList.remove('trailer-active-close');
        }

    }
}

async function watchNow(id, type, provider = '') {
    const apiSource = getCurrentApiSource();
    const params = new URLSearchParams();
    params.set('id', String(id || ''));
    const safeType = (String(type || '').trim().toLowerCase() === 'tv') ? 'tv' : 'movie';
    params.set('type', safeType);
    params.set('apiSource', String(apiSource || ''));

    const continueEntry = (() => {
        try {
            const raw = localStorage.getItem('sv_continue_watching');
            if (!raw) return null;
            const rows = JSON.parse(raw);
            if (!Array.isArray(rows)) return null;
            return rows.find((row) =>
                String(row?.id || '') === String(id) &&
                String(row?.type || '').toLowerCase() === String(type).toLowerCase()
            ) || null;
        } catch (_) {
            return null;
        }
    })();

    const hasResumePoint = continueEntry && Number(continueEntry.currentTime || 0) > 5;
    if (hasResumePoint) {
        const seconds = Math.floor(Number(continueEntry.currentTime || 0));
        const mm = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const ss = Math.floor(seconds % 60).toString().padStart(2, '0');
        const hh = Math.floor(seconds / 3600);
        const prettyTime = hh > 0 ? `${hh}:${mm}:${ss}` : `${Math.floor(seconds / 60)}:${ss}`;
        const seasonNo = Number(continueEntry.seasonNo || 0);
        const episodeNo = Number(continueEntry.episodeNo || 0);
        const tvHint = String(type).toLowerCase() === 'tv' && seasonNo > 0 && episodeNo > 0
            ? ` (S${seasonNo}E${episodeNo})`
            : '';

        const resumeChoice = await showResumeChoiceDialog({
            title: 'Resume Watching',
            prettyTime,
            tvHint,
        });
        if (resumeChoice === null) {
            return;
        }

        if (resumeChoice === 'continue') {
            const chosenProvider = provider || String(continueEntry.provider || '').trim();
            if (chosenProvider) params.set('provider', chosenProvider);
            params.set('t', String(Math.floor(Number(continueEntry.currentTime || 0))));
            if (String(type).toLowerCase() === 'tv') {
                if (seasonNo > 0) params.set('season', String(seasonNo));
                if (episodeNo > 0) params.set('episode', String(episodeNo));
            }
            if (continueEntry.audio) params.set('audio', String(continueEntry.audio));
            window.location.href = `player.html?${params.toString()}`;
            return;
        }

        // User explicitly chose Start Over.
        removeContinueWatchingEntry(id, type);
        params.set('resume', '0');
        params.set('t', '0');
    }

    if (provider) params.set('provider', String(provider));
    window.location.href = `player.html?${params.toString()}`;
}

function prefetchDetails(id, type, provider = '') {
    if (!id) return;
    if (readDetailCache(id, type, provider)) return;
    fetchDetails(id, type, provider).catch(() => { });
}
// ------------------ MOBILE DROPDOWN ---------------------------------------
const mobileDropdown = document.getElementById('mobile-dropdown-menu');

function toggleMobileMenu() {
    if (!mobileDropdown) return;
    mobileDropdown.classList.toggle('active');

    const icon = mobileMenuToggle?.querySelector('i');
    if (icon) {
        if (mobileDropdown.classList.contains('active')) {
            icon.classList.replace('fa-bars', 'fa-xmark');
        } else {
            icon.classList.replace('fa-xmark', 'fa-bars');
        }
    }
}

if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMobileMenu();
    });
}

document.addEventListener('click', (e) => {
    if (mobileDropdown && mobileDropdown.classList.contains('active')) {
        if (!mobileDropdown.contains(e.target) && !mobileMenuToggle?.contains(e.target)) {
            mobileDropdown.classList.remove('active');
            const icon = mobileMenuToggle?.querySelector('i');
            if (icon) icon.classList.replace('fa-xmark', 'fa-bars');
        }
    }

    if (isMobileSearchViewport() && searchContainer && searchContainer.classList.contains('mobile-search-expanded')) {
        if (!searchContainer.contains(e.target)) {
            const hasQuery = String(searchInput?.value || '').trim().length > 0;
            if (!hasQuery) setMobileSearchExpanded(false);
        }
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileDropdown && mobileDropdown.classList.contains('active')) {
        mobileDropdown.classList.remove('active');
        const icon = mobileMenuToggle?.querySelector('i');
        if (icon) icon.classList.replace('fa-xmark', 'fa-bars');
    }

    if (e.key === 'Escape' && isMobileSearchViewport() && searchContainer && searchContainer.classList.contains('mobile-search-expanded')) {
        const hasQuery = String(searchInput?.value || '').trim().length > 0;
        if (!hasQuery) setMobileSearchExpanded(false);
    }
});
// ------------------ FILTER & NAVIGATION -----------------------------------
function filterType(type) {
    if (searchInput.value.length >= 2) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
    }
    document.querySelectorAll('.desktop-nav a, .mobile-tabs-nav a, .mobile-dropdown a').forEach(a => a.classList.remove('active'));
    document.querySelectorAll(`.desktop-nav a[onclick*="${type}"], .mobile-tabs-nav a[onclick*="${type}"], .mobile-dropdown a[onclick*="${type}"]`).forEach(el => el.classList.add('active'));

    // Close mobile dropdown if open
    const dropdown = document.getElementById('mobile-dropdown-menu');
    if (dropdown && dropdown.classList.contains('active')) {
        toggleMobileMenu();
    }

    let sectionId = '';
    if (type === 'movie') sectionId = 'popular-movies-section';
    else if (type === 'tv') sectionId = 'popular-tv-section';
    else if (type === 'dramas') {
        sectionId = 'dramas-section';
        fetchDramas();
    }
    else if (type === 'trending') sectionId = 'trending-section';

    const section = document.getElementById(sectionId);
    if (section) {
        setTimeout(() => {
            const offset = 80;
            const elementPosition = section.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - offset;

            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
        }, 100);
    }
}

function updateSwitcherState() {
    const src = getCurrentApiSource();
    BASE_URL = src === 'local' ? LOCAL_API : PROD_API;
    const localBtn = document.getElementById('api-local');
    const prodBtn = document.getElementById('api-prod');
    if (!localBtn || !prodBtn) return;
    localBtn.classList.toggle('active', src === 'local');
    prodBtn.classList.toggle('active', src === 'prod');
}

// Fast modal override: render immediately from seed/cache, then hydrate full details.
async function openDetails(id, type, provider = '', seedItem = null) {
    // Store scroll position before opening modal
    window.storedScrollPosition = window.scrollY;
    
    movieModal.classList.add('active');
    document.body.classList.add('modal-open');
    const requestId = ++activeModalRequestId;

    const cached = readDetailCache(id, type, provider);
    const initial = cached || (seedItem && typeof seedItem === 'object' ? { ...seedItem, id: seedItem.id || id } : null);

    if (initial) {
        renderDetailsModal(initial, id, type, provider);
    } else {
        modalBody.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;min-height:400px;">
                <div style="width:50px;height:50px;border:3px solid rgba(255,255,255,.1);border-top-color:#e50914;border-radius:50%;animation:spin 1s linear infinite;"></div>
            </div>
            <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;
    }

    try {
        let movie = null;
        try {
            // Always revalidate against backend so newly-available trailer URLs are picked up.
            movie = await fetchDetails(id, type, provider);
        } catch (err) {
            // If network fails, gracefully fall back to cached/stale payload.
            movie = cached || readStaleDetailCache(id, type, provider);
            if (!movie) throw err;
        }

        if (requestId !== activeModalRequestId) return;

        // Merge with initial data (from search results) to ensure we don't lose title/poster
        // if the info hydration is partial or returns "Unknown" due to TMDB proxy lag
        if (initial) {
            if (!movie.title || movie.title === 'Unknown') movie.title = initial.title || initial.name || movie.title;
            if (!movie.image) movie.image = initial.image || initial.poster_path;
            if (!movie.cover) movie.cover = initial.cover || initial.backdrop_path;
            if (!movie.releaseDate) movie.releaseDate = initial.releaseDate || initial.release_date || initial.first_air_date;
        }

        renderDetailsModal(movie, id, type, provider);

        // --- BACKGROUND ENRICHMENT ---
        // Improve images/info in the background if they look bad.
        const isBad = (s) => !s || s.includes('placehold.co') || s.includes('No Image') || s.includes('No+Image') || s.includes('originalnull');
        if (isBad(getPoster(movie)) || (provider === 'dramacool' && movie.description?.includes('Dramacool lovers'))) {
            const cleanTitle = getTitle(movie);
            fetchJsonWithFallback(`/${encodeURIComponent(cleanTitle)}`, 4000).then(tmdbResults => {
                if (tmdbResults?.results?.length && requestId === activeModalRequestId) {
                    const tmdb = tmdbResults.results[0];
                    let changed = false;
                    if (isBad(movie.image)) { movie.image = tmdb.image || tmdb.poster_path; changed = true; }
                    if (isBad(movie.cover)) { movie.cover = tmdb.cover || tmdb.backdrop_path; changed = true; }
                    if (!movie.rating || movie.rating == 0) { movie.rating = tmdb.rating || tmdb.vote_average; changed = true; }
                    if (!movie.description || movie.description.includes('Dramacool lovers')) {
                        movie.description = tmdb.description || tmdb.overview;
                        changed = true;
                    }
                    if (changed) renderDetailsModal(movie, id, type, provider);
                }
            }).catch(() => { });
        }
    } catch (err) {
        if (requestId !== activeModalRequestId) return;
        console.error('Details error:', err);
        const userMessage =
            String(err?.message || '').toLowerCase().includes('timed out')
                ? 'Request timed out. Try again in a moment.'
                : (err?.message || 'Failed to fetch details');
        modalBody.innerHTML = `
            <div style="padding:4rem;text-align:center;">
                <i class="fa-solid fa-circle-exclamation" style="font-size:3rem;color:#e50914;margin-bottom:1rem;display:block"></i>
                <h3>Couldn't load details</h3>
                <p style="color:var(--text-muted);margin-top:.5rem">${userMessage}</p>
            </div>`;
    }
}

function toggleDescription() {
    const desc = document.getElementById('modal-desc-text');
    const btn = document.getElementById('desc-toggle-btn');
    if (!desc || !btn) return;

    if (desc.classList.contains('truncated')) {
        desc.classList.remove('truncated');
        btn.innerHTML = 'Read Less <i class="fa-solid fa-chevron-up"></i>';
    } else {
        desc.classList.add('truncated');
        btn.innerHTML = 'Read More <i class="fa-solid fa-chevron-down"></i>';
    }
}
