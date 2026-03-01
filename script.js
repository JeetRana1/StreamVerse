// ------------------ API CONFIGURATION -------------------------------------
const RUNTIME_CONFIG = window.__STREAMVERSE_CONFIG__ || {};
const LOCAL_API = String(
    RUNTIME_CONFIG.LOCAL_META_API_BASE ||
    RUNTIME_CONFIG.LOCAL_API_BASE ||
    'http://localhost:3000/meta/tmdb'
);
const PROD_API = String(
    RUNTIME_CONFIG.PROD_META_API_BASE ||
    RUNTIME_CONFIG.PROXY_META_API_BASE ||
    RUNTIME_CONFIG.META_API_BASE ||
    'http://localhost:3000/meta/tmdb'
);
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
        return await res.json();
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
    if (!path) return 'https://placehold.co/300x450/1a1a2e/e50914?text=No+Image';
    if (path.startsWith('http')) return path;
    return `${IMG_BASE}${size}${path}`;
}

function coverUrl(path) {
    return imgUrl(path, 'w1280');
}

function getTitle(item) { return item.name || item.title || 'Unknown'; }
function getYear(item) { return String(item.releaseDate || item.release_date || item.first_air_date || '').slice(0, 4) || 'N/A'; }
function getRating(item) { return parseFloat(item.rating || item.vote_average || 0).toFixed(1); }
function getPoster(item) { return imgUrl(item.image || item.poster_path); }
function getCover(item) { return coverUrl(item.cover || item.backdrop_path || item.image || item.poster_path); }
function getType(item) {
    const t = (item.type || item.media_type || 'movie').toLowerCase();
    if (t === 'tv series' || t === 'tv') return 'tv';
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
    if (!movie || typeof movie !== 'object') throw new Error('Empty response');
    if (movie.message && !movie.id && !movie.title && !movie.name) {
        throw new Error(movie.message);
    }
    if (!movie.id) movie.id = id;
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
        let isServerError = false;
        try {
            data = await fetchJson(url, 9000);
        } catch (firstErr) {
            if (firstErr.status >= 400) isServerError = true;

            // If non-provider meta detail fails, try opposite type once (some lists have bad type tags).
            if (!provider && (type === 'tv' || type === 'movie')) {
                try {
                    const altUrl = getDetailsUrl(id, alternateType, provider);
                    data = await fetchJson(altUrl, 12000);
                    const movie = normalizeDetailPayload(data, id);
                    // Cache under both requested and resolved keys to avoid repeated bad-type fetches.
                    writeDetailCache(id, alternateType, provider, movie);
                    writeDetailCache(id, type, provider, movie);
                    return movie;
                } catch (secondErr) {
                    if (secondErr.status >= 400) isServerError = true;
                }
            }
            // Retry same URL ONLY if it was a network timeout or abort, not a hard 4xx/5xx HTTP error
            if (isServerError) throw firstErr;
            data = await fetchJson(url, 16000);
        }
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
    const runtime = type === 'movie'
        ? `${movie.duration || 0} min`
        : `${(movie.totalEpisodes || 0)} Episodes`;
    const genres = Array.isArray(movie.genres)
        ? movie.genres.join(', ')
        : (movie.genres || 'N/A');
    const director = Array.isArray(movie.directors) && movie.directors.length
        ? movie.directors[0]
        : (movie.directors || 'N/A');
    const desc = movie.description || movie.overview || 'No overview available.';
    const cast = (Array.isArray(movie.actors) ? movie.actors : [])
        .slice(0, 6)
        .map((actor) => {
            if (typeof actor === 'string') return { name: actor, image: '' };
            return {
                name: actor?.name || actor?.originalName || actor?.actor || 'Unknown',
                image: actor?.image || actor?.profilePath || actor?.profile_path || actor?.photo || '',
            };
        });
    const status = movie.status || 'N/A';

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
                            ${genres.split(', ').map(g => `<span class="modal-tag">${g}</span>`).join('')}
                        </div>
                        <p class="modal-desc">${desc}</p>
                        <div class="hero-btns modal-actions">
                            <button class="btn btn-primary btn-glass-primary" onclick="watchNow('${id}','${type}', '${provider}')">
                                <i class="fa-solid fa-play"></i> Watch Now
                            </button>
                            <button class="btn btn-secondary btn-glass-secondary">
                                <i class="fa-solid fa-plus"></i> Add to List
                            </button>
                        </div>
                    </div>
                </div>

                <div class="modal-bottom">
                    <div class="modal-cast-panel">
                        ${cast.length ? `
                        <h3 class="section-title modal-subtitle">Cast</h3>
                        <div class="modal-cast-list">
                            ${cast.map(actor => `
                                <div class="modal-cast-item">
                                    <div class="modal-cast-avatar">
                                        ${actor.image ? `<img src="${imgUrl(actor.image, 'w185')}" alt="${actor.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid';">` : ''}
                                        <span class="modal-cast-fallback"${actor.image ? ' style="display:none;"' : ''}><i class="fa-solid fa-user"></i></span>
                                    </div>
                                    <p>${actor.name}</p>
                                </div>
                            `).join('')}
                        </div>` : ''}
                    </div>
                    <div class="modal-info-panel">
                        <h3 class="section-title modal-subtitle">Details</h3>
                        <p><span>Director:</span> ${director}</p>
                        <p><span>Genres:</span> ${genres}</p>
                        <p><span>Status:</span> ${status}</p>
                        <p><span>Type:</span> ${type === 'tv' ? 'TV Series' : 'Movie'}</p>
                    </div>
                </div>
            </div>
        `;
}

// ------------------ FETCH TRENDING -----------------------------------------
async function fetchTrending() {
    const cacheKey = 'trending:all:day';
    try {
        const cached = readCache(cacheKey);
        if (cached?.results?.length) {
            const cachedItems = cached.results.slice(0, 12);
            heroItems = cachedItems.slice(0, 5);
            if (heroItems.length) {
                displayHero(heroItems[0]);
                startHeroRotation();
            }
            displayGrid(cachedItems, trendingGrid);
        }

        const data = await fetchJson(`${BASE_URL}/trending`);
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
    const url = `${BASE_URL}/trending?type=${type}&timePeriod=${timePeriod}`;
    try {
        const cached = readCache(cacheKey);
        if (cached?.results?.length) {
            displayGrid((cached.results || []).slice(0, 12), grid, mediaType);
        }

        const data = await fetchJson(url);
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
        // We use DramaCool's popular list directly for this section
        const dcBase = BASE_URL.replace('/meta/tmdb', '/movies/dramacool');
        const url = `${dcBase}/popular`;

        const cached = readCache(cacheKey);
        if (cached?.results?.length) {
            const cachedItems = cached.results.slice(0, 12).map(item => ({
                ...item,
                media_type: 'tv',
                provider: 'dramacool'
            }));
            displayGrid(cachedItems, dramasGrid);
        }

        const data = await fetchJson(url);
        writeCache(cacheKey, data);
        const items = (data.results || []).slice(0, 12).map(item => ({
            ...item,
            media_type: 'tv',
            provider: 'dramacool'
        }));
        displayGrid(items, dramasGrid);
    } catch (err) {
        console.error('Error fetching dramas:', err?.message || err);
    }
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
    });
}

// ------------------ DISPLAY ------------------------------------------------
// Alias for backward compatibility
function displayMovies(items, container, type) { displayGrid(items, container, type); }

// ------------------ SEARCH -------------------------------------------------
let searchTimeout;
searchInput.addEventListener('input', e => {
    clearTimeout(searchTimeout);
    const q = e.target.value.trim();
    if (q.length < 2) {
        searchPage.style.display = 'none';
        heroSection.style.display = 'block';
        contentRows.style.display = 'block';
        return;
    }

    searchTimeout = setTimeout(async () => {
        try {
            const data = await fetchJson(`${BASE_URL}/${encodeURIComponent(q)}`, 5000);
            const hits = (data.results || [])
                .filter(r => (r.type || r.media_type || '').toLowerCase() !== 'person');
            displaySearchResults(hits, q);
        } catch (err) {
            console.error('Search error:', err?.message || err);
        }
    }, 400);
});

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

// ------------------ DETAILS MODAL -----------------------------------------
async function openDetails(id, type, provider = '') {
    movieModal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    modalBody.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;min-height:400px;">
            <div style="width:50px;height:50px;border:3px solid rgba(255,255,255,.1);border-top-color:#e50914;border-radius:50%;animation:spin 1s linear infinite;"></div>
        </div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;

    try {
        let movie = readDetailCache(id, type, provider);
        if (!movie) {
            try {
                movie = await fetchDetails(id, type, provider);
            } catch (err) {
                const stale = readStaleDetailCache(id, type, provider);
                if (stale) {
                    movie = stale;
                } else {
                    throw err;
                }
            }
        }

        const title = getTitle(movie);
        const cover = getCover(movie);
        const poster = getPoster(movie);
        const year = getYear(movie);
        const rating = getRating(movie);
        const runtime = type === 'movie'
            ? `${movie.duration || 0} min`
            : `${(movie.totalEpisodes || 0)} Episodes`;
        const genres = Array.isArray(movie.genres)
            ? movie.genres.join(', ')
            : (movie.genres || 'N/A');
        const director = Array.isArray(movie.directors) && movie.directors.length
            ? movie.directors[0]
            : (movie.directors || 'N/A');
        const desc = movie.description || movie.overview || 'No overview available.';
        const cast = Array.isArray(movie.actors) ? movie.actors.slice(0, 8) : [];
        const status = movie.status || 'N/A';

        modalBody.innerHTML = `
            <div class="modal-header" style="background-image:url('${cover}')">
                <div class="modal-header-overlay"></div>
            </div>
            <div class="modal-details">
                <div style="display:flex;gap:2rem;margin-top:-130px;position:relative;z-index:5;flex-wrap:wrap;">
                    <img src="${poster}" alt="${title}"
                         onerror="this.src='https://placehold.co/200x300/1a1a2e/e50914?text=No+Poster'"
                         style="width:200px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.7);flex-shrink:0;">
                    <div style="padding-top:80px;min-width:0;">
                        <h2 style="font-size:2rem;margin-bottom:.5rem;font-family:'Outfit',sans-serif">${title}</h2>
                        <div class="hero-meta" style="margin-bottom:1rem;">
                            <span><i class="fa-solid fa-star rating"></i> ${rating}</span>
                            <span>${runtime}</span>
                            <span>${year}</span>
                        </div>
                        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem;">
                            ${genres.split(', ').map(g => `<span style="background:rgba(229,9,20,.15);border:1px solid rgba(229,9,20,.3);color:#e50914;padding:.2rem .7rem;border-radius:50px;font-size:.8rem;font-weight:600">${g}</span>`).join('')}
                        </div>
                        <p style="color:var(--text-muted);margin-bottom:1.5rem;max-width:600px;line-height:1.7">${desc}</p>
                        <div class="hero-btns">
                            <button class="btn btn-primary" onclick="watchNow('${id}','${type}', '${provider}')">
                                <i class="fa-solid fa-play"></i> Watch Now
                            </button>
                            <button class="btn btn-secondary">
                                <i class="fa-solid fa-plus"></i> Add to List
                            </button>
                        </div>
                    </div>
                </div>

                <div style="margin-top:3rem;display:grid;grid-template-columns:1fr 260px;gap:3rem;">
                    <div>
                        ${cast.length ? `
                        <h3 class="section-title" style="font-size:1.3rem">Cast</h3>
                        <div style="display:flex;gap:1rem;overflow-x:auto;padding-bottom:1rem;">
                            ${cast.map(name => `
                                <div style="flex:0 0 80px;text-align:center;">
                                    <div style="width:70px;height:70px;border-radius:50%;background:rgba(229,9,20,.15);display:flex;align-items:center;justify-content:center;margin:0 auto .5rem;font-size:1.5rem;">ðŸ‘¤</div>
                                    <p style="font-size:.75rem;font-weight:600;white-space:normal;line-height:1.2">${name}</p>
                                </div>
                            `).join('')}
                        </div>` : ''}
                    </div>
                    <div>
                        <h3 class="section-title" style="font-size:1.3rem">Details</h3>
                        <p style="margin-bottom:.6rem;font-size:.9rem"><span style="color:var(--text-muted)">Director:</span> ${director}</p>
                        <p style="margin-bottom:.6rem;font-size:.9rem"><span style="color:var(--text-muted)">Genres:</span> ${genres}</p>
                        <p style="margin-bottom:.6rem;font-size:.9rem"><span style="color:var(--text-muted)">Status:</span> ${status}</p>
                        <p style="margin-bottom:.6rem;font-size:.9rem"><span style="color:var(--text-muted)">Type:</span> ${type === 'tv' ? 'TV Series' : 'Movie'}</p>
                    </div>
                </div>
            </div>
        `;
    } catch (err) {
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

closeModal.onclick = () => {
    movieModal.style.display = 'none';
    document.body.style.overflow = 'auto';
};
window.onclick = e => {
    if (e.target === movieModal) {
        movieModal.style.display = 'none';
        document.body.style.overflow = 'auto';
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

// ------------------ MOBILE MENU (Replaced by horizontal tabs) --------------
// mobileMenuToggle.onclick = () => { ... };

// ------------------ FILTER ------------------------------------------------
function filterType(type) {
    if (searchInput.value.length >= 2) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
    }
    document.querySelectorAll('.desktop-nav a, .mobile-tabs-nav a').forEach(a => a.classList.remove('active'));
    document.querySelectorAll(`.desktop-nav a[onclick*="${type}"], .mobile-tabs-nav a[onclick*="${type}"]`).forEach(el => el.classList.add('active'));
    const section = document.getElementById(type === 'movie' ? 'popular-movies-section' : 'popular-tv-section');
    if (section) setTimeout(() => section.scrollIntoView({ behavior: 'smooth' }), 50);
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
    document.body.style.overflow = 'hidden';
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
        renderDetailsModal(movie, id, type, provider);
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
