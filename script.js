// ------------------ API CONFIGURATION -------------------------------------
const RUNTIME_CONFIG = window.__STREAMVERSE_CONFIG__ || {};
const LOCAL_API = String(
    RUNTIME_CONFIG.LOCAL_META_API_BASE ||
    RUNTIME_CONFIG.LOCAL_API_BASE ||
    'http://localhost:3000/meta/tmdb'
);
const PROD_API = String(
    RUNTIME_CONFIG.PROD_META_API_BASE ||
    RUNTIME_CONFIG.API_BASE ||
    RUNTIME_CONFIG.META_API_BASE ||
    'https://streamverse-api.ddns.net/meta/tmdb'
);
const FALLBACK_API = String(
    RUNTIME_CONFIG.FALLBACK_API_BASE ||
    'https://consumet-api.vercel.app/meta/tmdb'
);
const PROD_API_HOST = (() => {
    try { return new URL(PROD_API).host; } catch (_) { return ''; }
})();
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
    return saved === 'local' || saved === 'prod' ? saved : getDefaultApiSource();
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

// ------------------ STATE -------------------------------------------------
let heroItems = [];
let heroIndex = 0;
let heroInterval;
const detailsMemoryCache = new Map();
const detailsInFlight = new Map();
let activeModalRequestId = 0;
let searchVersion = 0;
let hydrationObserver = null;

// ------------------ SCROLL HANDLER ----------------------------------------
window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 50);
});
// Initial check
header.classList.toggle('scrolled', window.scrollY > 50);

// ------------------ INIT --------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    updateSwitcherState();
    fetchTrending();
    fetchSection('movie', popularMoviesGrid, 'movie');
    fetchDramas();
    fetchSection('tv', popularTvGrid, 'tv');
    fetchSection('movie', topRatedGrid, 'movie', 'week');
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
    return `${provider || 'meta'}:${type}:${id}`;
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
    return provider
        ? `${BASE_URL.replace('/meta/tmdb', '/movies/' + provider)}/info?id=${encodeURIComponent(id)}`
        : `${BASE_URL}/info/${id}?type=${type}`;
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

function renderDetailsModal(movie, id, type, provider = '') {
    const title = getTitle(movie);
    const cover = getCover(movie);
    const poster = getPoster(movie);
    const year = getYear(movie);
    const rating = getRating(movie);
    
    const runtimeVal = Number(movie.duration || movie.runtime || 0);
    const runtime = type === 'movie'
        ? (runtimeVal > 0 ? `${runtimeVal} min` : 'N/A')
        : `${(movie.totalEpisodes || movie.episodes?.length || 0) || 'N/A'} Episodes`;
    
    const genresList = Array.isArray(movie.genres) ? movie.genres : (movie.genres || 'N/A').split(',').map(g => g.trim());
    const desc = movie.description || movie.overview || 'No overview available.';

    modalBody.innerHTML = `
        <div class="modal-header" style="background-image:url('${cover}')">
            <div class="modal-header-overlay"></div>
        </div>
        <div class="modal-details modal-details-fit">
            <div class="modal-top">
                <img class="modal-poster" src="${poster}" alt="${title}"
                     onerror="this.src='https://placehold.co/200x300/1a1a2e/e50914?text=No+Poster'">
                <div class="modal-main">
                    <h2 class="modal-title">${title}</h2>
                    <div class="hero-meta modal-meta">
                        <span><i class="fa-solid fa-star rating"></i> ${rating}</span>
                        <span>${runtime}</span>
                        <span>${year}</span>
                    </div>
                    <div class="modal-tags">
                        ${genresList.map(g => `<span class="modal-tag">${g}</span>`).join('')}
                    </div>
                    
                    <div class="hero-btns modal-actions">
                        <button class="btn btn-primary btn-glass-primary" onclick="watchNow('${id}','${type}', '${provider}')">
                            <i class="fa-solid fa-play"></i> Watch Now
                        </button>
                        <button class="btn btn-secondary btn-glass-secondary">
                            <i class="fa-solid fa-plus"></i> Add to List
                        </button>
                    </div>

                    <div class="modal-desc-wrapper">
                        <p id="modal-desc-text" class="modal-desc ${desc.length > 160 ? 'truncated' : ''}">${desc}</p>
                        ${desc.length > 160 ? `
                        <div id="desc-toggle-btn" class="description-toggle" onclick="toggleDescription()">
                           more..
                        </div>` : ''}
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
}

// ------------------ FETCH TRENDING -----------------------------------------
async function fetchTrending() {
    const cacheKey = 'trending:all:day';
    try {
        const cached = readCache(cacheKey);
        if (cached?.results?.length) {
            const cachedItems = (cached.results || []).slice(0, 12);
            heroItems = cachedItems.slice(0, 5);
            if (heroItems.length) {
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
        displayHero(heroItems[0]);
        startHeroRotation();
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
    const title = getTitle(item);
    const year = getYear(item);
    const rating = getRating(item);
    const bg = getCover(item);
    const type = getType(item);
    const id = item.id;

    heroSection.style.backgroundImage = `url('${bg}')`;

    // Add Animation Class
    heroContainer.classList.remove('animate-in');
    void heroContainer.offsetWidth; // Trigger reflow
    heroContainer.classList.add('animate-in');

    heroContainer.innerHTML = `
        <span class="hero-tagline">Now Streaming</span>
        <h1 class="hero-title">${title}</h1>
        <div class="hero-meta">
            <span><i class="fa-solid fa-star rating"></i> ${rating}</span>
            <span><i class="fa-regular fa-calendar"></i> ${year}</span>
            <span><i class="fa-solid fa-layer-group"></i> ${type === 'tv' ? 'TV Series' : 'Movie'}</span>
        </div>
        <p class="hero-description">${item.description || item.overview || ''}</p>
        <div class="hero-btns">
            <button class="btn btn-primary" onclick="watchNow('${id}','${type}')">
                <i class="fa-solid fa-play"></i> Watch Now
            </button>
            <button class="btn btn-secondary" onclick="openDetails('${id}','${type}')">
                <i class="fa-solid fa-circle-info"></i> More Info
            </button>
        </div>
    `;
    const heroInfoBtn = heroContainer.querySelector('.btn-secondary');
    if (heroInfoBtn) {
        heroInfoBtn.addEventListener('mouseenter', () => prefetchDetails(id, type), { once: true });
        heroInfoBtn.addEventListener('touchstart', () => prefetchDetails(id, type), { once: true, passive: true });
    }
}

function startHeroRotation() {
    clearInterval(heroInterval);
    heroInterval = setInterval(() => {
        heroIndex = (heroIndex + 1) % heroItems.length;
        displayHero(heroItems[heroIndex]);
    }, 8000); // 8s for better readability
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

        const card = document.createElement('div');
        card.className = 'movie-card';
        card.dataset.item = JSON.stringify(item);
        card.dataset.type = type;
        card.dataset.provider = provider;

        card.innerHTML = `
            <img src="${poster}" alt="${title}" loading="lazy"
                 onerror="this.src='https://placehold.co/300x450/1a1a2e/e50914?text=No+Image'">
            <span class="quality-badge">HD</span>
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

        const hits = (data?.results || [])
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

    if (!results.length) {
        searchPageGrid.innerHTML = '<p style="color:var(--text-muted);font-size:1.1rem">No results found.</p>';
        return;
    }
    displayGrid(results, searchPageGrid);
}

// ------------------ DETAILS MODAL HANDLERS --------------------------------
closeModal.onclick = () => {
    movieModal.style.display = 'none';
    document.body.classList.remove('modal-open');
};
window.onclick = e => {
    if (e.target === movieModal) {
        movieModal.style.display = 'none';
        document.body.classList.remove('modal-open');
    }
};

// ------------------ PLAYER ------------------------------------------------
function watchNow(id, type, provider = '') {
    const apiSource = getCurrentApiSource();
    const url = provider
        ? `player.html?id=${id}&type=${type}&provider=${provider}&apiSource=${encodeURIComponent(apiSource)}`
        : `player.html?id=${id}&type=${type}&apiSource=${encodeURIComponent(apiSource)}`;
    window.open(url, '_blank');
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
    movieModal.style.display = 'block';
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
        btn.innerHTML = 'less';
    } else {
        desc.classList.add('truncated');
        btn.innerHTML = 'more..';
    }
}
