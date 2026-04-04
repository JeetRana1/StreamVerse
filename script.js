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
        'http://localhost:3010/meta/tmdb'
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
const PROD_API_HOST = (() => {
    try { return new URL(PROD_API).host; } catch (_) { return ''; }
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
const FALLBACK_API_HOST = (() => {
    try { return new URL(FALLBACK_API).host; } catch (_) { return ''; }
})();
const IMG_BASE = 'https://image.tmdb.org/t/p/';
const API_TIMEOUT_MS = 7000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_PREFIX = 'sv_cache_v1:';
const DETAIL_CACHE_TTL_MS = 30 * 60 * 1000;

function getDefaultApiSource() {
    return 'prod';
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
const searchPage = document.getElementById('search-page');
const searchPageGrid = document.getElementById('search-page-grid');
const searchTitle = document.getElementById('search-title');
const contentRows = document.getElementById('content-rows');
const movieModal = document.getElementById('movie-modal');
const modalBody = document.getElementById('modal-body');
const closeModal = document.querySelector('.close-modal');
const header = document.getElementById('main-header');
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
// const mobileNav = document.getElementById('mobile-nav'); // Removed
const dramasGrid = document.getElementById('dramas-grid');
const continueWatchingSection = document.getElementById('continue-watching-section');
const continueWatchingGrid = document.getElementById('continue-watching-grid');
const heroDotsEl = document.getElementById('hero-dots');
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
document.addEventListener('DOMContentLoaded', () => {
    updateSwitcherState();
    initHeroManualControls();
    initContinueWatchingControls();
    applyContinueGridLayout();
    loadContinueWatching();
    fetchTrending();
    fetchSection('movie', popularMoviesGrid, 'movie');
    fetchDramas();
    fetchSection('tv', popularTvGrid, 'tv');
    fetchSection('movie', topRatedGrid, 'movie', 'week');
});

window.addEventListener('resize', () => {
    applyContinueGridLayout();
});

// ------------------ HELPERS -----------------------------------------------
// Consumet returns full URLs for images already, but sometimes relative paths.
function imgUrl(path, size = 'w500') {
    const isBad = !path || typeof path !== 'string' || path.length < 5 ||
        path.includes('placehold.co') || path.includes('dramaool.png') ||
        path.includes('no-image') || path.includes('default-poster') ||
        path.includes('originalnull') || path.includes('originalundefined');

    if (isBad) {
        return 'https://placehold.co/300x450/1a1a2e/e50914?text=No+Image';
    }

    // Handle full URLs and protocol-relative URLs
    if (path.startsWith('http') || path.startsWith('//')) {
        let url = path.startsWith('//') ? 'https:' + path : path;
        // Force HTTPS to avoid mixed content blocks from external providers (Dramacool, etc)
        return url.replace('http:', 'https:');
    }

    // TMDB relative paths always start with /
    if (path.startsWith('/')) {
        return `${IMG_BASE}${size}${path}`;
    }

    // If it looks like a relative path but without the leading slash (rare)
    if (path.length > 0 && !path.includes('/') && !path.includes('.')) {
        return `${IMG_BASE}${size}/${path}`;
    }

    return path;
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
function getPoster(item) {
    // Aggregate all possible poster fields across different providers
    const p = item.image || item.poster || item.img || item.thumbnail || item.poster_path ||
        item.coverImage?.large || item.coverImage?.medium || item.bannerImage || '';
    return imgUrl(p);
}
function getCover(item) {
    const c = item.cover || item.backdrop_path || item.bannerImage || item.image ||
        item.poster || item.img || item.poster_path || item.coverImage?.extraLarge || '';
    return imgUrl(c, 'w1280');
}
function getType(item) {
    if (!item) return 'movie';
    const t = String(item.type || item.media_type || item.format || '').toLowerCase();

    // Explicit indicators
    if (['tv series', 'tv', 'tv_series', 'show', 'special', 'ova', 'ona', 'tv_short'].includes(t)) {
        return 'tv';
    }
    if (t === 'movie' || t === 'film' || t === 'movie_short') return 'movie';

    // Fallback: Only infer TV if we have multiple episodes or any seasons
    // This prevents movies (which sometimes have 1 'episode' entry) from being called TV shows.
    const hasSeasons = Array.isArray(item.seasons) && item.seasons.length > 0;
    const hasManyEps = Array.isArray(item.episodes) && item.episodes.length > 1;
    const hasHighTotal = Number(item.totalEpisodes || 0) > 1;

    if (hasSeasons || hasManyEps || hasHighTotal) {
        return 'tv';
    }

    return 'movie';
}

function getDetailKey(id, type, provider = '') {
    const canonicalId = provider ? id : normalizeTmdbId(id);
    return `${provider || 'meta'}:${type}:${canonicalId}`;
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
        if (!Array.isArray(items) || items.length === 0) {
            continueWatchingSection.style.display = 'none';
            updateContinueWatchingControls(0);
            return;
        }

        renderContinueWatching(items);
        updateContinueWatchingControls(items.length);
    } catch (e) {
        console.error('Error loading continue watching:', e);
        continueWatchingSection.style.display = 'none';
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
    continueWatchingGrid.style.setProperty('align-items', 'stretch', 'important');
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

    const getPrettyAudio = (token) => {
        if (!token) return 'SUB';
        const low = token.toLowerCase();
        if (low.includes('hindi')) return 'HINDI';
        if (low.includes('japan') || low.includes('jpn') || low.includes('jp')) return 'JPN';
        if (low.includes('eng') || low.includes('en')) return 'ENG';
        if (low.includes('tam')) return 'TAMIL';
        if (low.includes('tel')) return 'TEL';
        if (low.includes('dub')) return 'DUB';
        return token.toUpperCase().substring(0, 5);
    };
    const audioLabel = getPrettyAudio(item.audio);
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
        <img src="${imgUrl(item.poster)}" alt="${item.title}" loading="lazy"
             onerror="this.src='https://placehold.co/300x450/1a1a2e/e50914?text=No+Image'">
        ${continueSelectionMode ? `<button type="button" class="continue-select-toggle ${isSelected ? 'selected' : ''}" aria-label="Select item for clearing"><i class="fa-solid fa-check"></i></button>` : ''}
        ${seasonEpisodeBadge}
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
    return provider
        ? `${BASE_URL.replace('/meta/tmdb', '/movies/' + provider)}/info?id=${encodeURIComponent(canonicalId)}`
        : `${BASE_URL}/info/${canonicalId}?type=${type}`;
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

        similarMemoryCache.set(cacheKey, { ts: Date.now(), items: finalItems });
        return finalItems;
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
    const isAdded = isInWatchlist(id);
    const title = getTitle(movie);
    const cover = getCover(movie);
    const poster = getPoster(movie);
    const year = getYear(movie);
    const rating = getRating(movie);

    const runtimeVal = Number(movie.duration || movie.runtime || 0);
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
    
    if (movie.trailer) {
        if (typeof movie.trailer === 'string') {
            // Direct string URL
            if ((movie.trailer.includes('youtube.com') || movie.trailer.includes('youtu.be')) && !movie.trailer.includes('/shorts/')) {
                trailerUrl = movie.trailer;
            }
        } else if (typeof movie.trailer === 'object' && !Array.isArray(movie.trailer)) {
            // Single object with url/id property
            if (isOfficialTrailer(movie.trailer)) {
                if (movie.trailer.url && (movie.trailer.url.includes('youtube.com') || movie.trailer.url.includes('youtu.be')) && !movie.trailer.url.includes('/shorts/')) {
                    trailerUrl = movie.trailer.url;
                } else if (movie.trailer.id && typeof movie.trailer.id === 'string' && movie.trailer.id.length > 5) {
                    trailerUrl = `https://www.youtube.com/watch?v=${movie.trailer.id}`;
                }
            }
        } else if (Array.isArray(movie.trailer) && movie.trailer.length > 0) {
            // Array - find first official trailer
            for (const t of movie.trailer) {
                if (t && typeof t === 'object' && isOfficialTrailer(t)) {
                    if (t.id && typeof t.id === 'string' && t.id.length > 5) {
                        trailerUrl = `https://www.youtube.com/watch?v=${t.id}`;
                        break;
                    } else if (t.url && (t.url.includes('youtube.com') || t.url.includes('youtu.be')) && !t.url.includes('/shorts/')) {
                        trailerUrl = t.url;
                        break;
                    }
                }
            }
        }
    }
    
    const hasTrailer = Boolean(trailerUrl);

    modalBody.innerHTML = `
        <div class="modal-header-container">
            <div class="modal-header-bg ${hasTrailer ? 'trailer-clickable' : ''}" style="background-image:url('${cover}')" ${hasTrailer ? `onclick="playTrailer('${trailerUrl}', '${cover}')" id="modal-hero-bg"` : ''}>
                <div class="modal-header-overlay-vignette"></div>
                ${hasTrailer ? '<div class="trailer-play-icon"><i class="fa-solid fa-play-circle"></i></div>' : ''}
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
                    <button class="btn btn-watch-now" onclick="watchNow('${id}','${type}', '${provider}')">
                        <i class="fa-solid fa-play"></i> Watch Now
                    </button>
                    <button id="modal-watchlist-btn" class="btn btn-list ${isAdded ? 'btn-in-list' : 'btn-add-list'}" 
                            onclick="handleWatchlistToggle('${id}', '${type}', '${provider}')">
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

        if (similarMovies.length === 0) {
            grid.innerHTML = '<div class="no-similar">No similar movies found</div>';
            return;
        }

        // Initially show 6, then reveal 6 more per click.
        let showCount = 6;
        const totalCount = similarMovies.length;

        function renderSimilarGrid(count) {
            const moviesToShow = similarMovies.slice(0, count);
            grid.innerHTML = moviesToShow.map(movie => {
                const title = getTitle(movie);
                const poster = getPoster(movie);
                const year = getYear(movie);
                const rating = getRating(movie);
                const movieId = movie.id;
                const movieType = inferMediaType(movie, type);
                const movieProvider = movie.provider || '';
                
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

                return `
                    <div class="movie-card" onclick="openDetails('${movieId}', '${movieType}', '${movieProvider}')">
                        <img src="${poster}" alt="${title}" onerror="this.src='https://placehold.co/200x300/1a1a2e/e50914?text=No+Poster'">
                        <span class="quality-badge">HD</span>
                        ${seasonEpisodeBadge}
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
            const cachedItems = (cached.results || []).slice(0, 12);
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
        const items = (data.results || []).slice(0, 12);
        if (!items.length) return;

        heroItems = items.slice(0, 5);
        if (heroItems.length) {
            displayHero(heroItems[0]);
            startHeroRotation();
        }
        displayGrid(items, trendingGrid);
    } catch (err) {
        console.error('Trending error:', err?.message || err);
    }
}

// ------------------ FETCH SECTION ------------------------------------------
async function fetchSection(type, grid, mediaType, timePeriod = 'day') {
    if (!grid) return;
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
    } catch (err) {
        console.error(`Error fetching ${type}:`, err?.message || err);
    }
}

// ------------------ FETCH DRAMAS -------------------------------------------
async function fetchDramas() {
    if (!dramasGrid) return;
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

    } catch (err) {
        console.error('Error fetching dramas:', err?.message || err);
    }
}

async function hydrateGridCard(item, card) {
    try {
        const img = card.querySelector('img');
        const isBad = (s) => !s || s.includes('placehold.co') || s.includes('No+Image') || s.includes('dramaool.png');

        // 1. Fetch details from original provider
        const details = await fetchDetails(item.id, item.media_type, item.provider);
        let poster = details ? getPoster(details) : '';

        // 2. If image is still bad, attempt TMDB lookup by title
        if (isBad(poster)) {
            const cleanTitle = getTitle(item);
            try {
                // Hits /meta/tmdb/Title - Consumet uses path as query if no command matches
                const tmdbResults = await fetchJsonWithFallback(`/${encodeURIComponent(cleanTitle)}`, 5000);
                if (tmdbResults?.results?.length) {
                    const topMatch = tmdbResults.results[0];
                    const tmdbPoster = getPoster(topMatch);
                    if (!isBad(tmdbPoster)) {
                        poster = tmdbPoster;
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
        if (details) {
            const ratingVal = getRating(details);
            if (ratingVal !== '0.0') {
                const ratingLabel = card.querySelector('.rating');
                if (ratingLabel && ratingLabel.nextSibling) {
                    ratingLabel.nextSibling.textContent = ' ' + ratingVal;
                }
            }
            const yearVal = getYear(details);
            if (yearVal !== 'N/A') {
                const metaSpan = card.querySelector('.movie-card-meta span:first-child');
                if (metaSpan) metaSpan.textContent = yearVal;
            }

            // Also rescue the title if it was "Unknown" in the initial search results
            const titleEl = card.querySelector('.movie-title');
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
    heroContainer.classList.remove('animate-in');
    void heroContainer.offsetWidth; // Trigger reflow
    heroContainer.classList.add('animate-in');

    heroContainer.innerHTML = `
        <span class="hero-tagline">Now Streaming</span>
        <h1 class="hero-title">${title}</h1>
        <div class="hero-meta modal-meta-pills">
            <span class="meta-pill rating-pill"><i class="fa-solid fa-star"></i> ${rating}</span>
            <span class="meta-pill" style="border-color:#38bdf833">
                <i class="fa-solid fa-calendar-days" style="color:#38bdf8"></i> ${year}
            </span>
            <span class="meta-pill" style="border-color:#4ade8033">
                <i class="fa-solid fa-${type === 'tv' ? 'tv' : 'film'}" style="color:#4ade80"></i> ${type === 'tv' ? 'TV Series' : 'Movie'}
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
    `;
    const heroInfoBtn = heroContainer.querySelector('.btn-secondary');
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
function displayGrid(items, container, forcedType = null) {
    if (!container) return;
    container.innerHTML = '';

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

    items.forEach(item => {
        const poster = getPoster(item);
        const title = getTitle(item);
        const year = getYear(item);
        const rating = getRating(item);
        const detectedType = getType(item);
        const type = detectedType || forcedType || 'movie';
        const id = item.id;
        const provider = item.provider || '';
        
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
        card.dataset.item = JSON.stringify(item);
        card.dataset.type = type;
        card.dataset.provider = provider;

        card.innerHTML = `
            <img src="${poster}" alt="${title}" loading="lazy"
                 onerror="this.src='https://placehold.co/300x450/1a1a2e/e50914?text=No+Image'">
            <span class="quality-badge">HD</span>
            ${seasonEpisodeBadge}
            <div class="movie-card-info">
                <h3 class="movie-card-title">${title}</h3>
                <div class="movie-card-meta">
                    <span>${year}</span>
                    <span><i class="fa-solid fa-star rating"></i> ${rating}</span>
                </div>
            </div>
        `;
        card.onclick = () => openDetails(id, type, provider, item);
        card.addEventListener('mouseenter', () => prefetchDetails(id, type, provider), { once: true });
        card.addEventListener('touchstart', () => prefetchDetails(id, type, provider), { once: true, passive: true });
        card.addEventListener('pointerdown', () => prefetchDetails(id, type, provider), { once: true, passive: true });

        container.appendChild(card);
        hydrationObserver.observe(card);
    });
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

        const hits = dedupeSearchResults((data?.results || []))
            .filter(r => (r.type || r.media_type || '').toLowerCase() !== 'person');
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
if (searchBtn) searchBtn.addEventListener('click', () => triggerSearch(true));

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
    displayGrid(dedupedResults, searchPageGrid);
}

// ------------------ DETAILS MODAL HANDLERS --------------------------------
function closeDetailsModal() {
    movieModal.classList.remove('active');
    document.body.classList.remove('modal-open');
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

function playTrailer(trailerUrl, coverImage) {
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
        // Fallback: open in new tab
        console.warn('Could not extract video ID from trailer URL:', trailerUrl);
        window.open(trailerUrl, '_blank');
        return;
    }

    // Hide hero background and show trailer
    const heroBg = document.getElementById('modal-hero-bg');
    const trailerContainer = document.getElementById('modal-trailer-container');
    const trailerIframe = document.getElementById('modal-trailer-iframe');
    const posterWrapper = document.querySelector('.modal-poster-wrapper');
    const modalCloseBtn = document.querySelector('.close-modal');

    if (heroBg && trailerContainer && trailerIframe) {
        // Set iframe source with autoplay
        trailerIframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&controls=1&fs=1&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=0`;
        
        // Hide hero and show trailer
        heroBg.style.display = 'none';
        trailerContainer.style.display = 'block';
        
        // Cut top half of poster with animation
        if (posterWrapper) {
            posterWrapper.classList.add('poster-top-cut');
        }
        
        // Hide modal close button with opacity
        if (modalCloseBtn) {
            modalCloseBtn.classList.remove('hidden');
            modalCloseBtn.classList.add('trailer-active-close');
        }

    }
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
        heroBg.style.display = 'block';
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
    params.set('id', String(id));
    params.set('type', String(type));
    params.set('apiSource', String(apiSource));

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
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileDropdown && mobileDropdown.classList.contains('active')) {
        mobileDropdown.classList.remove('active');
        const icon = mobileMenuToggle?.querySelector('i');
        if (icon) icon.classList.replace('fa-xmark', 'fa-bars');
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

// ------------------ API SWITCHER ------------------------------------------
function toggleApi(source) {
    const next = String(source || '').toLowerCase() === 'local' ? 'local' : 'prod';
    localStorage.setItem('api_source', next);
    window.location.reload();
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
        let movie = cached;
        if (!movie) {
            try {
                movie = await fetchDetails(id, type, provider);
            } catch (err) {
                const stale = readStaleDetailCache(id, type, provider);
                if (stale) movie = stale;
                else throw err;
            }
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
