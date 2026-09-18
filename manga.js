const RUNTIME_CONFIG = window.__STREAMVERSE_CONFIG__ || {};
const PROD_API = String(RUNTIME_CONFIG.PROD_API_BASE || 'https://streamverse-api.duckdns.org/meta/tmdb');
const LOCAL_API = String(RUNTIME_CONFIG.LOCAL_API_BASE || 'http://localhost:3000/meta/tmdb');

function getCurrentApiSource() {
  return localStorage.getItem('api_source') || 'prod';
}

const currentSource = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'local'
  : getCurrentApiSource();
const API_BASE = currentSource === 'local' ? LOCAL_API : PROD_API;
const ROOT_API = API_BASE.replace(/\/meta\/tmdb\/?$/, ''); // Strip specific meta route for manga
const API_MANGA_BASE = `${ROOT_API}/manga`;
const API_UTILS_PROXY = `${ROOT_API}/utils/proxy`;

window.toggleApi = (source) => {
  localStorage.setItem('api_source', source);
  location.reload();
};
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function fmtNum(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

function fmtRelativeTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

// Fetch home sections / category browsing straight through the mangak backend browse endpoint.
function mangaBrowseUrl(sort, genres, page = 1, limit = 21) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (sort) params.set('sort', sort);
  if (genres) params.set('genres', genres);
  return `${API_MANGA_BASE}/mangak/browse?${params.toString()}`;
}

const PROVIDERS = [
  { key: 'mangak', label: 'Mangak' },
];

const READ_FALLBACK_PROVIDERS = ['mangapill', 'mangahere'];

const PAGE_SIZE = 50; // Mangak results per request (50–100 as requested)
const DISCOVER_SEEDS = [
  'one piece',
  'naruto',
  'attack on titan',
  'demon slayer',
  'jujutsu kaisen',
  'solo leveling',
  'berserk',
  'chainsaw man',
  'spy x family',
  'my hero academia',
  'one punch man',
  'vinland saga',
];

let selectedProvider = 'mangak';

// Pagination / discovery state shared between discover and search flows.
let browseState = {
  mode: 'discover', // 'discover' | 'search'
  query: '',
  seedIdx: 0,
  page: 1,
  seenIds: new Set(),
  exhausted: false,
};
let loadMoreBtn = null;
let loadMoreLoading = false;
let readerKeyHandler = null;
let fsControlsHideTimer = null;
let fsControlsMoveHandler = null;
let fsControlsTouchHandler = null;
let fsControlsFullscreenChangeHandler = null;

const providerToolbar = document.getElementById('provider-toolbar');
const searchInput = document.getElementById('search-input') || document.getElementById('manga-search');
const searchBtn = document.getElementById('search-btn') || document.getElementById('manga-search-btn');
const mangaGrid = document.getElementById('manga-grid');
const statusEl = document.getElementById('manga-status');
const errorEl = document.getElementById('manga-error');
const mangaModal = document.getElementById('manga-modal');
const mangaModalBody = document.getElementById('manga-modal-body');
const readerModal = document.getElementById('reader-modal');
const MANGA_CONTINUE_KEY = 'streamverse:manga-continue:v1';
let mangaClearMode = false;

function readMangaContinue() {
  try { return JSON.parse(localStorage.getItem(MANGA_CONTINUE_KEY) || '[]'); } catch { return []; }
}

function saveMangaContinue(entry) {
  const rows = readMangaContinue().filter((row) => row.key !== entry.key);
  rows.unshift({ ...entry, updatedAt: Date.now() });
  localStorage.setItem(MANGA_CONTINUE_KEY, JSON.stringify(rows.slice(0, 12)));
}

function renderMangaContinue() {
  const section = document.querySelector('[data-manga-section="continue"]');
  const grid = document.querySelector('[data-manga-grid="continue"]');
  if (!section || !grid) return;
  const rows = readMangaContinue();
  section.hidden = !rows.length;
  grid.innerHTML = '';
  rows.forEach((entry) => {
    const card = document.createElement('article');
    card.className = 'manga-card';
    card.innerHTML = `<label class="manga-continue-check" style="display:${mangaClearMode ? 'block' : 'none'}"><input type="checkbox" data-continue-key="${escapeHtml(entry.key)}"><span></span></label><div class="manga-poster"><img src="${entry.image || 'https://placehold.co/300x450/1a1a2e/e50914?text=Manga'}" alt="${escapeHtml(entry.mangaTitle)}"><div class="manga-play-cue"><span>Page ${entry.page}</span><i class="fa-solid fa-book-open"></i></div></div><div class="manga-card-info"><h3 class="manga-card-title">${escapeHtml(entry.mangaTitle)}</h3><div class="manga-card-meta"><span>${escapeHtml(entry.chapterTitle)}</span><span>Page ${entry.page}</span></div></div>`;
    card.querySelector('input').onclick = (event) => event.stopPropagation();
    card.onclick = () => openChapter({ ...entry, resumePage: entry.page });
    grid.appendChild(card);
  });
}

document.getElementById('manga-clear-selected')?.addEventListener('click', () => {
  const selected = new Set([...document.querySelectorAll('[data-continue-key]:checked')].map((el) => el.dataset.continueKey));
  if (!selected.size) return;
  localStorage.setItem(MANGA_CONTINUE_KEY, JSON.stringify(readMangaContinue().filter((row) => !selected.has(row.key))));
  mangaClearMode = false;
  document.getElementById('manga-clear-toggle').style.display = 'inline-flex';
  ['manga-clear-selected', 'manga-clear-all', 'manga-cancel-clear'].forEach((id) => { document.getElementById(id).style.display = 'none'; });
  renderMangaContinue();
});
document.getElementById('manga-clear-toggle')?.addEventListener('click', () => {
  mangaClearMode = true;
  document.getElementById('manga-clear-toggle').style.display = 'none';
  ['manga-clear-selected', 'manga-clear-all', 'manga-cancel-clear'].forEach((id) => { document.getElementById(id).style.display = 'inline-flex'; });
  renderMangaContinue();
});
document.getElementById('manga-clear-all')?.addEventListener('click', () => {
  localStorage.removeItem(MANGA_CONTINUE_KEY);
  mangaClearMode = false;
  document.getElementById('manga-clear-toggle').style.display = 'inline-flex';
  ['manga-clear-selected', 'manga-clear-all', 'manga-cancel-clear'].forEach((id) => { document.getElementById(id).style.display = 'none'; });
  renderMangaContinue();
});
document.getElementById('manga-cancel-clear')?.addEventListener('click', () => {
  mangaClearMode = false;
  document.getElementById('manga-clear-toggle').style.display = 'inline-flex';
  ['manga-clear-selected', 'manga-clear-all', 'manga-cancel-clear'].forEach((id) => { document.getElementById(id).style.display = 'none'; });
  document.querySelectorAll('[data-continue-key]').forEach((el) => { el.checked = false; });
  renderMangaContinue();
});
const readerBody = document.getElementById('reader-body');

function normalizeResults(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.data?.items)) return payload.data.items;
  if (Array.isArray(payload.data?.results)) return payload.data.results;
  return [];
}

function normalizePages(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.map((p) => (typeof p === 'string' ? p : p?.img || p?.url)).filter(Boolean);
  if (Array.isArray(payload.pages)) return payload.pages.map((p) => (typeof p === 'string' ? p : p?.img || p?.url)).filter(Boolean);
  if (Array.isArray(payload.images)) return payload.images;
  if (Array.isArray(payload.data?.pages)) return payload.data.pages.map((p) => (typeof p === 'string' ? p : p?.img || p?.url)).filter(Boolean);
  if (Array.isArray(payload.pageProps?.initialChapter?.images)) return payload.pageProps.initialChapter.images;
  return [];
}

function cardTitle(item) {
  return item?.title || item?.name || 'Unknown';
}

function cardImage(item) {
  return item?.image || item?.cover || item?.img || 'https://placehold.co/300x450/1a1a2e/e50914?text=No+Image';
}

function extractImageRaw(item) {
  if (!item) return '';
  return String(
    item?.image ||
    item?.cover ||
    item?.img ||
    item?.poster ||
    item?.thumbnail ||
    item?.coverImage ||
    item?.bannerImage ||
    '',
  ).trim();
}

function chapterLabel(ch) {
  if (ch?.name || ch?.title) return ch.name || ch.title;
  const c = ch?.chapter || ch?.chapterNumber || ch?.number || '';
  if (c) return `Chapter ${c}`;
  return ch?.title || 'Chapter';
}

// Extract a numeric chapter number robustly from mangak-style chapter objects.
// Prefers explicit number fields, then falls back to parsing numbers out of the
// name/title (handling "Vol. 5 Ch. 41", "Chapter 41", "Ch 41", etc.).
function chapterNum(ch) {
  if (!ch) return null;
  const direct = ch?.number ?? ch?.chapter ?? ch?.chapterNumber ?? ch?.numberValue;
  if (direct !== undefined && direct !== null && direct !== '') {
    const n = Number(String(direct).replace(/,/g, ''));
    if (Number.isFinite(n)) return n;
  }
  const text = String(ch?.name || ch?.title || '').trim();
  if (!text) return null;
  // Prefer a number explicitly tied to "chapter"/"ch".
  const chMatch = text.match(/[Cc]h(?:apter)?\.?\s*[#]?\s*(\d+(?:\.\d+)?)/);
  if (chMatch) {
    const n = Number(chMatch[1]);
    if (Number.isFinite(n)) return n;
  }
  // Otherwise take the last standalone number in the string.
  const nums = text.match(/(\d+(?:\.\d+)?)/g);
  if (nums && nums.length) {
    const n = Number(nums[nums.length - 1]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function chapterNumberValue(ch) {
  return String(ch?.chapter || ch?.chapterNumber || ch?.number || '').trim();
}

function chapterSortValue(ch, idx) {
  const n = chapterNum(ch);
  if (n !== null && Number.isFinite(n)) return n;
  return 1000000 + idx;
}

function providerSearchUrl(provider, q, page = 1, limit = PAGE_SIZE) {
  if (provider === 'mangak') return `${API_MANGA_BASE}/mangak/search/${encodeURIComponent(q)}?page=${page}&limit=${limit}`;
  return `${API_MANGA_BASE}/${provider}/${encodeURIComponent(q)}?page=${page}&limit=${limit}`;
}

function providerInfoUrl(provider, mangaId) {
  if (provider === 'mangak') return `${API_MANGA_BASE}/mangak/info/${encodeURIComponent(mangaId)}`;
  if (provider === 'mangadex') return `${API_MANGA_BASE}/mangadex/info/${encodeURIComponent(mangaId)}`;
  return `${API_MANGA_BASE}/${provider}/info?id=${encodeURIComponent(mangaId)}`;
}

function providerReadUrl(provider, chapterId) {
  if (provider === 'mangak') return chapterId;
  if (provider === 'mangadex') return `${API_MANGA_BASE}/mangadex/read/${encodeURIComponent(chapterId)}`;
  return `${API_MANGA_BASE}/${provider}/read?chapterId=${encodeURIComponent(chapterId)}`;
}

function getProviderReferer(provider, rawUrl) {
  if (provider === 'mangak') return 'https://mangak.io/';
  try {
    const u = new URL(rawUrl);
    const host = u.host.toLowerCase();
    if (host.includes('mangapill.com') || host.includes('readdetectiveconan.com')) return 'https://mangapill.com/';
    if (host.includes('mangadex.org')) return 'https://mangadex.org/';
    if (host.includes('mangahere.cc')) return 'https://mangahere.cc/';
    if (host.includes('mangakakalot.')) return 'https://www.mangakakalot.gg/';
    return `${u.protocol}//${u.host}/`;
  } catch {
    // fall through to provider defaults
  }

  if (provider === 'mangapill') return 'https://mangapill.com/';
  if (provider === 'mangahere') return 'https://mangahere.cc/';
  if (provider === 'mangadex') return 'https://mangadex.org/';
  if (provider === 'mangakakalot') return 'https://www.mangakakalot.gg/';
  return 'https://mangadex.org/';
}

function providerOrigin(provider) {
  if (provider === 'mangak') return 'https://mangak.io';
  if (provider === 'mangapill') return 'https://mangapill.com';
  if (provider === 'mangahere') return 'https://mangahere.cc';
  if (provider === 'mangadex') return 'https://mangadex.org';
  if (provider === 'mangakakalot') return 'https://www.mangakakalot.gg';
  return '';
}

function normalizeImageUrl(src, provider) {
  const raw = String(src || '').trim();
  if (!raw || raw.startsWith('data:')) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const host = u.host.toLowerCase();
      // MangaDex cover images should use uploads host. The website host often serves anti-hotlink placeholders.
      if (host === 'mangadex.org' && u.pathname.startsWith('/covers/')) {
        return `https://uploads.mangadex.org${u.pathname}${u.search || ''}`;
      }
      return raw;
    } catch {
      return raw;
    }
  }
  const origin = providerOrigin(provider);
  if (!origin) return raw;
  if (raw.startsWith('/')) return `${origin}${raw}`;
  return `${origin}/${raw}`;
}

function proxifyImageUrl(src, provider) {
  if (!src) return src;
  const normalized = normalizeImageUrl(src, provider);
  if (!normalized || normalized.startsWith('data:')) return normalized;
  const referer = getProviderReferer(provider, normalized);
  return `${API_UTILS_PROXY}?url=${encodeURIComponent(normalized)}&referer=${encodeURIComponent(referer)}&sv=${Date.now()}`;
}

function buildImageCandidates(src, provider) {
  const normalized = normalizeImageUrl(src, provider);
  if (!normalized) return [];
  const out = [];

  // MangaDex covers support multiple canonical sizes; try them first for better reliability/speed.
  if (provider === 'mangadex') {
    try {
      const u = new URL(normalized);
      const host = u.host.toLowerCase();
      if ((host === 'mangadex.org' || host === 'uploads.mangadex.org') && u.pathname.startsWith('/covers/')) {
        const base = `https://uploads.mangadex.org${u.pathname}`;
        const mdxVariants = [base, `${base}.512.jpg`, `${base}.256.jpg`];
        mdxVariants.forEach((v) => {
          if (v && !out.includes(v)) out.push(v);
        });
      }
    } catch {
      // ignore and continue with default candidates
    }
  }

  const proxied = provider === 'mangak' ? proxifyImageUrl(normalized, provider) : null;
  if (proxied && !out.includes(proxied)) out.push(proxied);
  if (normalized && !out.includes(normalized)) out.push(normalized);

  // For MangaDex covers, direct URL is usually best; proxy can be slower and unnecessary.
  if (provider !== 'mangadex') {
    const fallbackProxy = proxifyImageUrl(normalized, provider);
    if (fallbackProxy && !out.includes(fallbackProxy)) out.push(fallbackProxy);
  }
  return out;
}

function attachImageFallback(imgEl, candidates, placeholder) {
  const queue = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  let idx = 0;
  imgEl.onerror = () => {
    idx += 1;
    if (idx < queue.length) {
      imgEl.src = queue[idx];
      return;
    }
    imgEl.src = placeholder;
  };
}

async function fetchJson(url, timeoutMs = 14000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        msg = body?.message || body?.error || msg;
      } catch {
        // ignore non-json error body
      }
      throw new Error(msg);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Fetch one page of a mangak search query for the given provider.
async function fetchProviderPage(provider, q, page, limit) {
  const data = await fetchJson(providerSearchUrl(provider, q, page, limit), 15000);
  const rows = normalizeResults(data).map((r) => ({ ...r, provider }));
  return { rows, data };
}

// Determine whether mangak reported another page of results.
function hasNextPageFrom(data, rows, page, limit = PAGE_SIZE) {
  if (data?.data && typeof data.data === 'object') {
    if (typeof data.data.hasNextPage === 'boolean') return data.data.hasNextPage;
    if (typeof data.data.totalPages === 'number') return page < data.data.totalPages;
    if (typeof data.data.currentPage === 'number' && page < data.data.currentPage) return true;
  }
  // Fallback: a full page suggests there may be more.
  return rows.length >= limit;
}

// Seed the discover grid from multiple popular queries, deduplicated, up to PAGE_SIZE*x items.
async function discoverByProvider(provider) {
  const out = [];
  const seen = new Set();
  for (const q of DISCOVER_SEEDS) {
    if (out.length >= PAGE_SIZE) break;
    try {
      const { rows } = await fetchProviderPage(provider, q, 1, PAGE_SIZE);
      for (const row of rows) {
        if (row?.id && !seen.has(String(row.id))) {
          seen.add(String(row.id));
          out.push(row);
        }
      }
    } catch {
      // Ignore a failing seed and continue with the next one.
    }
  }
  return out;
}

function renderLoadMoreButton() {
  if (loadMoreBtn) {
    loadMoreBtn.remove();
    loadMoreBtn = null;
  }
  if (browseState.exhausted) return;
  loadMoreBtn = document.createElement('button');
  loadMoreBtn.className = 'load-more-btn';
  loadMoreBtn.type = 'button';
  loadMoreBtn.textContent = 'Load More';
  loadMoreBtn.onclick = loadMore;
  // Append after the grid inside the catalog section.
  const catalog = document.querySelector('.manga-catalog');
  if (catalog) catalog.appendChild(loadMoreBtn);
  else document.body.appendChild(loadMoreBtn);
}

function setLoadMoreLoading(loading) {
  loadMoreLoading = loading;
  if (loadMoreBtn) {
    loadMoreBtn.disabled = loading;
    loadMoreBtn.textContent = loading ? 'Loading...' : 'Load More';
  }
}

async function loadMore() {
  if (loadMoreLoading || browseState.exhausted) return;
  setLoadMoreLoading(true);
  try {
    if (browseState.mode === 'search') {
      await appendNextSearchPage();
    } else if (browseState.mode === 'genre') {
      await appendNextGenrePage();
    } else {
      await appendNextDiscoverPage();
    }
  } catch (err) {
    statusEl.textContent = `Load more failed: ${err.message || err}`;
  } finally {
    setLoadMoreLoading(false);
    if (browseState.exhausted && loadMoreBtn) {
      loadMoreBtn.textContent = 'No more results';
    }
  }
}

async function appendNextDiscoverPage() {
  const provider = selectedProvider;
  while (browseState.seedIdx < DISCOVER_SEEDS.length) {
    const q = DISCOVER_SEEDS[browseState.seedIdx];
    const rows = normalizeResults(
      await fetchJson(providerSearchUrl(provider, q, browseState.page, PAGE_SIZE), 15000),
    ).map((r) => ({ ...r, provider }));
    const fresh = [];
    for (const row of rows) {
      if (row?.id && !browseState.seenIds.has(String(row.id))) {
        browseState.seenIds.add(String(row.id));
        fresh.push(row);
      }
    }
    browseState.page += 1;
    const hasMoreInQuery = rows.length >= PAGE_SIZE;
    if (!hasMoreInQuery) {
      browseState.seedIdx += 1;
      browseState.page = 1;
    }
    if (fresh.length) {
      renderCards(rows, { append: true });
      statusEl.textContent = `${mangaGrid.querySelectorAll('.movie-card').length} manga loaded`;
      updateResultCount();
      return;
    }
    if (browseState.seedIdx >= DISCOVER_SEEDS.length && !fresh.length) {
      browseState.exhausted = true;
    }
  }
  browseState.exhausted = true;
}

async function loadDiscover() {
  errorEl.style.display = 'none';
  statusEl.textContent = 'Loading manga...';
  mangaGrid.innerHTML = '';
  setSearchUrl('');
  document.body.classList.remove('manga-search-mode');
  deactivateGenreChip();
  browseState = {
    mode: 'discover',
    query: '',
    seedIdx: 0,
    page: 1,
    seenIds: new Set(),
    exhausted: false,
  };

  try {
    const rows = await discoverByProvider(selectedProvider);
    rows.forEach((r) => {
      if (r?.id) browseState.seenIds.add(String(r.id));
    });

    renderCards(rows);
    // Exhausted if we couldn't even reach PAGE_SIZE unique titles across all seeds.
    browseState.exhausted = rows.length < PAGE_SIZE;
    statusEl.textContent = `${rows.length} manga loaded`;
    updateResultCount();
    renderLoadMoreButton();
  } catch (err) {
    errorEl.textContent = `Failed to load manga: ${err.message || err}`;
    errorEl.style.display = 'block';
    statusEl.textContent = '';
  }
}

function updateResultCount() {
  const countEl = document.querySelector('.manga-result-count');
  if (countEl) {
    countEl.textContent = `${mangaGrid.querySelectorAll('.movie-card').length} results`;
  }
}

function renderCards(items, opts = {}) {
  if (!opts.append) mangaGrid.innerHTML = '';
  for (const item of items) {
    const provider = item.provider || selectedProvider;
    const thumbCandidates = buildImageCandidates(cardImage(item), provider);
    const firstThumb = thumbCandidates[0] || cardImage(item);
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.innerHTML = `
      <img src="${firstThumb}" alt="${cardTitle(item)}" loading="lazy">
       <div class="movie-card-info">
         <h3 class="movie-card-title">${cardTitle(item)}</h3>
       </div>
    `;
    const img = card.querySelector('img');
    attachImageFallback(img, thumbCandidates, 'https://placehold.co/300x450/1a1a2e/e50914?text=No+Image');
    card.onclick = () => openMangaInfo(item, provider);
    mangaGrid.appendChild(card);
  }
}

// Update the address bar to reflect the active search (no reload), mirroring index.html.
function setSearchUrl(q) {
  try {
    const url = new URL(window.location.href);
    if (q && String(q).trim().length >= 2) {
      url.searchParams.set('search', String(q).trim());
    } else {
      url.searchParams.delete('search');
    }
    history.replaceState(null, '', url.toString());
  } catch {
    // Ignore URL updates that the browser rejects.
  }
}

async function runSearch() {
  const q = String(searchInput.value || '').trim();
  if (!q) return loadDiscover();

  errorEl.style.display = 'none';
  statusEl.textContent = `Searching "${q}"...`;
  mangaGrid.innerHTML = '';
  setSearchUrl(q);
  document.body.classList.add('manga-search-mode');
  deactivateGenreChip();

  browseState = {
    mode: 'search',
    query: q,
    seedIdx: 0,
    page: 1,
    seenIds: new Set(),
    exhausted: false,
  };

  try {
    const { rows, data } = await fetchProviderPage(selectedProvider, q, 1, PAGE_SIZE);
    const fresh = rows.filter((r) => r?.id);
    fresh.forEach((r) => browseState.seenIds.add(String(r.id)));

    renderCards(fresh);
    browseState.exhausted = !hasNextPageFrom(data, fresh, 1) && fresh.length < PAGE_SIZE;
    statusEl.textContent = `${fresh.length} results for "${q}"`;
    updateResultCount();
    renderLoadMoreButton();
  } catch (err) {
    errorEl.textContent = `Search failed: ${err.message || err}`;
    errorEl.style.display = 'block';
    statusEl.textContent = '';
  }
}

async function appendNextSearchPage() {
  const provider = selectedProvider;
  const q = browseState.query;
  browseState.page += 1;
  let rows;
  let data;
  try {
    ({ rows, data } = await fetchProviderPage(provider, q, browseState.page, PAGE_SIZE));
  } catch (err) {
    browseState.exhausted = true;
    throw err;
  }
  const fresh = [];
  for (const row of rows) {
    if (row?.id && !browseState.seenIds.has(String(row.id))) {
      browseState.seenIds.add(String(row.id));
      fresh.push(row);
    }
  }
  renderCards(fresh, { append: true });
  browseState.exhausted = !hasNextPageFrom(data, rows, browseState.page) && rows.length < PAGE_SIZE;
  statusEl.textContent = `${mangaGrid.querySelectorAll('.movie-card').length} results for "${q}"`;
  updateResultCount();
}

// Split the chapter list into easy-to-navigate ranges like mangak.io does
// (e.g. Chp 529-428, 427-328, ...). Sorted chapters come in ascending order;
// we group them by ~100 chapters and present the ranges newest-first so the
// tab labels always match the actual numbers inside each group.
function buildChapterChunks(chapters, chunkSize = 100) {
  const groups = [];
  for (let i = 0; i < chapters.length; i += chunkSize) {
    const slice = chapters.slice(i, i + chunkSize);
    const nums = slice.map((c) => chapterNum(c)).filter((n) => n !== null && Number.isFinite(n));
    const hi = nums.length ? Math.round(Math.max(...nums)) : null;
    const lo = nums.length ? Math.round(Math.min(...nums)) : null;
    groups.push({
      slug: `chunk-${groups.length}`,
      label: hi != null && lo != null
        ? (hi === lo ? `Chp ${lo}` : `Chp ${hi}-${lo}`)
        : (slice.length > 1 ? `Chapters ${i + 1}-${i + slice.length}` : `Chapter ${i + 1}`),
      items: slice,
    });
  }
  // Present the counts newest-first, matching mangak.io's range list.
  return groups.reverse();
}

// Render chapter buttons into #chapter-list with the shared open action.
function renderChapterList({ item, provider, title, chapters, highlightId }) {
  const list = document.getElementById('chapter-list');
  if (!list) return;
  list.innerHTML = '';
  if (!chapters.length) {
    list.innerHTML = '<p style="padding:8px;color:#bbb;">No chapters found.</p>';
    return;
  }
  for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex += 1) {
    const chapter = chapters[chapterIndex];
    const btn = document.createElement('button');
    const chLabel = chapterLabel(chapter);
    btn.className = 'chapter-item';
    if (highlightId && String(chapter.id) === String(highlightId)) btn.classList.add('active');
    btn.textContent = chLabel;
    btn.onclick = () => openChapter({
      provider,
      chapterId: chapter.id,
      mangaId: item.id,
      mangaSlug: provider === 'mangak' ? String(item.slug || '').replace(/^\/+|\/+$/g, '') : '',
      chapterSlug: provider === 'mangak' ? String(chapter.slug || '') : '',
      title: `${title} - ${chLabel}`,
      mangaTitle: title,
      image: extractImageRaw(item) || '',
      chapterNumber: chapterNumberValue(chapter),
      nextChapter: chapters[chapterIndex - 1] || null,
      previousChapter: chapters[chapterIndex + 1] || null,
      chapterList: chapters,
      chapterIndex,
    });
    list.appendChild(btn);
  }
}

async function openMangaInfo(item, provider) {
  const url = new URL(window.location.href);
  url.searchParams.set('mangaModal', '1');
  url.searchParams.set('mangaProvider', provider);
  if (item.id) url.searchParams.set('mangaId', String(item.id));
  if (item.slug) url.searchParams.set('mangaSlug', String(item.slug));
  url.searchParams.set('mangaTitle', cardTitle(item));
  const image = extractImageRaw(item);
  if (image) url.searchParams.set('mangaImage', String(image));
  const description = typeof item.description === 'string' ? item.description : (item.summary || '');
  if (description) url.searchParams.set('mangaDescription', String(description));
  window.history.replaceState({}, '', url);
  mangaModal.classList.add('active');
  document.body.classList.add('modal-open');
  mangaModalBody.innerHTML = '<p style="padding:20px">Loading manga info...</p>';
  try {
    // Mangak search already returns the complete title metadata; its info-by-ID
    // endpoint is not reliable for IDs returned by the search endpoint.
    const info = provider === 'mangak'
      ? item
      : await fetchJson(providerInfoUrl(provider, item.id), 16000);
    const title = cardTitle(info) || cardTitle(item);
    const imageRaw = extractImageRaw(info) || extractImageRaw(item);
    const imageDirect = normalizeImageUrl(imageRaw, provider);
    const posterCandidates = buildImageCandidates(imageDirect, provider);
    const thumbCandidates = buildImageCandidates(extractImageRaw(item), provider);
    const poster = posterCandidates[0] || thumbCandidates[0] || 'https://placehold.co/380x570/12162a/e50914?text=No+Image';
    let chaptersRaw = Array.isArray(info?.chapters) ? info.chapters : [];
    if (provider === 'mangak' && !chaptersRaw.length) {
      const chapterPayload = await fetchJson(`${API_MANGA_BASE}/mangak/chapters/${encodeURIComponent(item.id)}`, 16000);
      chaptersRaw = Array.isArray(chapterPayload?.chapters)
        ? chapterPayload.chapters
        : Array.isArray(chapterPayload?.data?.chapters) ? chapterPayload.data.chapters : [];
    }
    const descRaw = typeof info?.description === 'string' ? info.description : (info?.description?.en || info?.summary || '');
    const desc = String(descRaw || 'No description available.');
    const chapters = chaptersRaw
      .map((c, idx) => ({ c, idx, order: chapterSortValue(c, idx) }))
      .sort((a, b) => a.order - b.order || a.idx - b.idx)
      .map((x) => x.c);
    const showChapters = provider === 'mangak' ? chapters : chapters.slice(0, 180);
    const totalChapters = showChapters.length;
    const chunkSize = 100;
    const chunks = buildChapterChunks(showChapters, chunkSize);

    mangaModalBody.innerHTML = `
      <div class="modal-details">
        <div class="manga-modal-hero">
          <div class="manga-modal-banner" style="background-image:url('${poster}')"></div>
          <div class="manga-modal-overlay"></div>
        </div>

        <div class="manga-modal-details">
          <div class="manga-modal-poster-wrap">
            <img src="${poster}" alt="${title}" class="manga-modal-poster"
                 id="manga-modal-poster">
          </div>
          <div class="manga-modal-main">
            <h2 class="manga-modal-title">${title}</h2>
            <div class="manga-modal-meta">
              <span class="manga-provider-pill"><i class="fa-solid fa-layer-group"></i> ${provider}</span>
              <span class="manga-chapter-count"><i class="fa-solid fa-book-open"></i> ${totalChapters} chapters</span>
            </div>
            <p class="manga-desc" id="manga-desc">${desc}</p>
            ${desc.length > 220 ? '<div class="manga-desc-toggle" id="manga-desc-toggle">Read More <i class="fa-solid fa-chevron-down"></i></div>' : ''}
            <div class="manga-modal-actions">
              <button type="button" class="manga-start-read" id="manga-start-read"><i class="fa-solid fa-play"></i> Start Reading</button>
            </div>
          </div>
        </div>

        <div class="manga-chapters-section">
          <div class="manga-chunks-head">
            <h3 class="section-title" style="margin:0;">Chapters</h3>
            <div class="manga-chunks-controls">
              <button type="button" class="manga-sort-toggle" id="manga-sort-toggle" title="Toggle chapter order">
                <i class="fa-solid fa-arrow-down-wide-short" id="manga-sort-icon"></i><span id="manga-sort-label">Newest first</span>
              </button>
              ${chunks.length > 1 ? `<div class="manga-chunk-tabs" id="manga-chunk-tabs"></div>` : ''}
            </div>
          </div>
          <div class="chapter-list" id="chapter-list"></div>
        </div>
      </div>
    `;

    const posterEl = document.getElementById('manga-modal-poster');
    const posterFallbacks = [...posterCandidates, ...thumbCandidates];
    attachImageFallback(posterEl, posterFallbacks, 'https://placehold.co/380x570/12162a/e50914?text=No+Image');

    const descEl = document.getElementById('manga-desc');
    const descToggle = document.getElementById('manga-desc-toggle');
    if (descToggle) {
      descToggle.onclick = () => {
        const expanded = descEl.classList.toggle('expanded');
        descToggle.innerHTML = expanded
          ? 'Read Less <i class="fa-solid fa-chevron-up"></i>'
          : 'Read More <i class="fa-solid fa-chevron-down"></i>';
      };
    }

    const startReadBtn = document.getElementById('manga-start-read');
    if (startReadBtn && !showChapters.length) startReadBtn.style.display = 'none';

    // Sort state: false = newest first (descending, mangak default), true = oldest first (ascending).
    let sortAsc = false;
    let activeSlug = null;
    let startedChapterId = null;

    const chunkTabs = document.getElementById('manga-chunk-tabs');
    const sortToggle = document.getElementById('manga-sort-toggle');

    // Build the ordered list of chunks for the current sort direction.
    const orderedChunks = () => {
      // chunks is newest-first; reverse it for ascending.
      return sortAsc ? chunks.slice().reverse() : chunks;
    };

    const updateSortIcon = () => {
      if (!sortToggle) return;
      const icon = document.getElementById('manga-sort-icon');
      const label = document.getElementById('manga-sort-label');
      if (icon) icon.className = sortAsc ? 'fa-solid fa-arrow-up-wide-short' : 'fa-solid fa-arrow-down-wide-short';
      if (label) label.textContent = sortAsc ? 'Oldest first' : 'Newest first';
      sortToggle.setAttribute('aria-pressed', sortAsc ? 'true' : 'false');
    };

    // The chapters currently shown in the list (top to bottom), honoring sort order.
    const currentVisibleChapters = () => {
      const chunk = orderedChunks().find((c) => c.slug === activeSlug);
      if (!chunk) return sortAsc ? showChapters : showChapters.slice().reverse();
      return sortAsc ? chunk.items : chunk.items.slice().reverse();
    };

    const reorderActiveItems = () => {
      if (!activeSlug) return;
      const vis = currentVisibleChapters();
      renderChapterList({ item, provider, title, chapters: vis, highlightId: startedChapterId });
    };

    // Render the chunk tab buttons for the current sort direction.
    const renderChunkTabs = () => {
      if (!chunkTabs) return;
      chunkTabs.innerHTML = '';
      for (const chunk of orderedChunks()) {
        const tab = document.createElement('button');
        tab.className = 'manga-chunk-tab';
        tab.type = 'button';
        tab.textContent = chunk.label;
        tab.dataset.slug = chunk.slug;
        if (activeSlug === chunk.slug) tab.classList.add('active');
        tab.onclick = () => {
          activeSlug = chunk.slug;
          chunkTabs.querySelectorAll('.manga-chunk-tab').forEach((t) => t.classList.remove('active'));
          tab.classList.add('active');
          renderChapterList({ item, provider, title, chapters: sortAsc ? chunk.items : chunk.items.slice().reverse(), highlightId: startedChapterId });
        };
        chunkTabs.appendChild(tab);
      }
    };

    if (sortToggle) {
      sortToggle.addEventListener('click', () => {
        sortAsc = !sortAsc;
        updateSortIcon();
        renderChunkTabs();
        reorderActiveItems();
      });
    }

    // "Start Reading" jumps to the chapter currently at the top of the list and highlights it.
    const startReading = () => {
      if (!startReadBtn) return;
      const vis = currentVisibleChapters();
      const target = vis[0];
      if (!target) return;
      startedChapterId = target.id;
      reorderActiveItems();
      openChapter({
        provider,
        chapterId: target.id,
        mangaId: item.id,
        mangaSlug: provider === 'mangak' ? String(item.slug || '').replace(/^\/+|\/+$/g, '') : '',
        chapterSlug: provider === 'mangak' ? String(target.slug || '') : '',
        title: `${title} - ${chapterLabel(target)}`,
        mangaTitle: title,
        chapterNumber: chapterNumberValue(target),
      });
    };
    if (startReadBtn) startReadBtn.onclick = startReading;

    // Default to the first chunk in the current order and render it.
    const initialChunks = orderedChunks();
    const activeChunk = initialChunks[0] || null;
    activeSlug = activeChunk ? activeChunk.slug : null;
    updateSortIcon();
    renderChunkTabs();
    renderChapterList({ item, provider, title, chapters: currentVisibleChapters() });
  } catch (err) {
    mangaModalBody.innerHTML = `<p style="padding:20px;color:#ff9f9f;">Failed to load info: ${err.message || err}</p>`;
  }
}

async function getProviderChapterPages(provider, chapterId) {
  if (provider === 'mangak') {
    const payload = await fetchJson(chapterId, 20000);
    const pages = normalizePages(payload);
    if (!pages.length) throw new Error('No chapter pages found');
    return pages;
  }
  const payload = await fetchJson(providerReadUrl(provider, chapterId), 20000);
  const pages = normalizePages(payload);
  if (!pages.length) throw new Error('No chapter pages found');
  return pages;
}

function normalizeChapterNo(v) {
  return String(v || '').trim().replace(/^0+/, '') || '0';
}

function normalizeTitle(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function pickBestSearchResult(rows, wantedTitle) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const wanted = normalizeTitle(wantedTitle);
  const exact = rows.find((r) => normalizeTitle(r?.title || r?.name) === wanted);
  if (exact) return exact;
  const starts = rows.find((r) => normalizeTitle(r?.title || r?.name).startsWith(wanted));
  if (starts) return starts;
  const contains = rows.find((r) => normalizeTitle(r?.title || r?.name).includes(wanted));
  if (contains) return contains;
  return rows.find((r) => r?.id) || rows[0] || null;
}

function pickChapterByNumber(chapters, wanted) {
  if (!Array.isArray(chapters) || !chapters.length) return null;
  const exact = chapters.find((c) => normalizeChapterNo(c?.chapter || c?.chapterNumber || c?.number) === wanted);
  if (exact) return exact;

  const wantedNum = Number(wanted);
  if (!Number.isNaN(wantedNum)) {
    const sameNum = chapters.find((c) => {
      const n = Number(normalizeChapterNo(c?.chapter || c?.chapterNumber || c?.number));
      return !Number.isNaN(n) && n === wantedNum;
    });
    if (sameNum) return sameNum;
  }

  const inTitle = chapters.find((c) => String(c?.title || '').toLowerCase().includes(`chapter ${wanted}`));
  if (inTitle) return inTitle;

  return null;
}

async function findFallbackChapterByTitle(mangaTitle, chapterNumber) {
  const wanted = normalizeChapterNo(chapterNumber);

  for (const provider of READ_FALLBACK_PROVIDERS) {
    try {
      const search = normalizeResults(await fetchJson(providerSearchUrl(provider, mangaTitle), 14000));
      if (!search.length) continue;

      const first = pickBestSearchResult(search, mangaTitle);
      if (!first?.id) continue;

      const info = await fetchJson(providerInfoUrl(provider, first.id), 16000);
      const chapters = Array.isArray(info?.chapters) ? info.chapters : [];
      if (!chapters.length) continue;

      let picked = null;
      if (wanted !== '0') {
        picked = pickChapterByNumber(chapters, wanted);
        if (!picked?.id) continue;
      } else {
        picked = chapters[0] || null;
      }

      if (!picked?.id) continue;
      const pages = await getProviderChapterPages(provider, picked.id);
      return { provider, pages };
    } catch {
      continue;
    }
  }

  throw new Error('No readable chapter found in fallback providers');
}

function updateReaderUrl(state = {}) {
  const url = new URL(window.location.href);
  ['reader', 'provider', 'chapterId', 'mangaSlug', 'chapterSlug', 'title', 'mangaTitle', 'chapterNumber', 'page', 'readerMode']
    .forEach((key) => url.searchParams.delete(key));
  if (state.reader) {
    Object.entries(state).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value) !== '') url.searchParams.set(key, String(value));
    });
  }
  window.history.replaceState({}, '', url);
}

function renderReader(title, pages, sourceProvider, initialPage = 1, chapterNavigation = {}) {
  if (readerKeyHandler) {
    window.removeEventListener('keydown', readerKeyHandler);
    readerKeyHandler = null;
  }

  readerBody.innerHTML = `
    <div class="reader-shell">
      <button id="reader-exit-fs" class="reader-exit-fs" type="button" title="Exit Fullscreen">
        <i class="fa-solid fa-compress"></i>
      </button>
      <div class="reader-head">
        <h3 style="font-family:'Outfit',sans-serif;">${title}</h3>
        <span class="reader-meta"><span id="reader-page-indicator">1</span> / ${pages.length}${sourceProvider ? ` - ${sourceProvider.toUpperCase()}` : ''}</span>
      </div>
      <div class="reader-stage book-mode" id="reader-stage">
        <button class="reader-nav-zone left" id="reader-zone-prev" type="button" title="Previous page"></button>
        <button class="reader-nav-zone right" id="reader-zone-next" type="button" title="Next page"></button>
        <img id="reader-page-image" alt="${title}" loading="eager" referrerpolicy="no-referrer">
      </div>
      <div class="reader-footer">
        <div class="reader-dots">
          <span class="reader-dot" id="reader-dot-1"></span>
          <span class="reader-dot" id="reader-dot-2"></span>
          <span class="reader-dot" id="reader-dot-3"></span>
          <span class="reader-dot" id="reader-dot-4"></span>
        </div>
        <div class="reader-controls">
          <div class="reader-nav-main">
             <button id="reader-previous-chapter" class="reader-pill reader-chapter-btn" type="button">Previous Chapter</button>
             <button id="reader-prev" class="reader-pill" type="button">Prev</button>
            <label class="page-combo" for="reader-page-input">
              <input id="reader-page-input" class="reader-page-input" type="number" min="1" max="${pages.length}" value="1">
              <span>/ ${pages.length} Pages</span>
            </label>
             <button id="reader-next" class="reader-pill" type="button">Next</button>
             <button id="reader-next-chapter" class="reader-pill reader-chapter-btn" type="button">Next Chapter</button>
          </div>
           <div class="reader-mode-row">
             <div class="reader-zoom">
               <button id="reader-zoom-out" class="reader-pill" type="button">−</button>
               <span id="reader-zoom-value" class="reader-zoom-value">100%</span>
               <button id="reader-zoom-in" class="reader-pill" type="button">+</button>
               <button id="reader-zoom-reset" class="reader-pill" type="button">Reset</button>
             </div>
             <button id="reader-book-mode" class="manga-provider-btn reader-fit-btn active" type="button">Book</button>
             <button id="reader-fit-width" class="manga-provider-btn reader-fit-btn" type="button">Fit Width</button>
             <button id="reader-smooth-mode" class="manga-provider-btn reader-fit-btn" type="button">Smooth</button>
             <button id="reader-lock-controls" class="reader-pill reader-lock-btn" type="button" title="Lock reader controls" aria-label="Lock reader controls"><i class="fa-solid fa-lock-open"></i></button>
           </div>
        </div>
      </div>
    </div>
  `;

  const img = document.getElementById('reader-page-image');
  const stage = document.getElementById('reader-stage');
  const prevBtn = document.getElementById('reader-prev');
  const previousChapterBtn = document.getElementById('reader-previous-chapter');
  const nextBtn = document.getElementById('reader-next');
  const nextChapterBtn = document.getElementById('reader-next-chapter');
  const zonePrev = document.getElementById('reader-zone-prev');
  const zoneNext = document.getElementById('reader-zone-next');
  const pageInput = document.getElementById('reader-page-input');
  const pageIndicator = document.getElementById('reader-page-indicator');
  const exitFsBtn = document.getElementById('reader-exit-fs');
  const dots = [
    document.getElementById('reader-dot-1'),
    document.getElementById('reader-dot-2'),
    document.getElementById('reader-dot-3'),
    document.getElementById('reader-dot-4'),
  ];
  const bookModeBtn = document.getElementById('reader-book-mode');
  const fitWidthBtn = document.getElementById('reader-fit-width');
  const smoothModeBtn = document.getElementById('reader-smooth-mode');
  const zoomOutBtn = document.getElementById('reader-zoom-out');
  const zoomInBtn = document.getElementById('reader-zoom-in');
  const zoomResetBtn = document.getElementById('reader-zoom-reset');
  const zoomValue = document.getElementById('reader-zoom-value');
  const lockControlsBtn = document.getElementById('reader-lock-controls');
  const readerPanel = readerModal.querySelector('.modal-content');
  let pageIndex = 0;
  let fitMode = 'book';
  let zoom = 1;
  let wheelPageLockUntil = 0;
  let touchStartY = null;
  let controlsLocked = false;
  const preloaded = new Set();

  const refreshDots = () => {
    const ratio = pages.length > 1 ? pageIndex / (pages.length - 1) : 0;
    const active = Math.min(3, Math.max(0, Math.round(ratio * 3)));
    dots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx <= active);
    });
  };

  const preloadIndex = (idx) => {
    if (idx < 0 || idx >= pages.length) return;
    const src = proxifyImageUrl(pages[idx], sourceProvider);
    if (!src || preloaded.has(src)) return;
    preloaded.add(src);
    const preloadImg = new Image();
    preloadImg.decoding = 'async';
    preloadImg.src = src;
  };

  const preloadAround = (centerIdx) => {
    // Prefer near-forward pages, then backward for snappy next/prev navigation.
    [1, 2, -1, -2].forEach((offset) => preloadIndex(centerIdx + offset));
  };

  const setPage = (idx) => {
    const normalized = Number.isFinite(Number(idx)) ? Number(idx) : 0;
    pageIndex = Math.max(0, Math.min(pages.length - 1, normalized));
    const candidates = buildImageCandidates(pages[pageIndex], sourceProvider);
    const src = candidates[0] || pages[pageIndex];
    img.src = src;
    img.dataset.candidates = JSON.stringify(candidates);
    img.alt = `${title} - Page ${pageIndex + 1}`;
    pageIndicator.textContent = String(pageIndex + 1);
    pageInput.value = String(pageIndex + 1);
    prevBtn.disabled = pageIndex <= 0;
    nextBtn.disabled = pageIndex >= pages.length - 1;
    zonePrev.disabled = pageIndex <= 0;
    zoneNext.disabled = pageIndex >= pages.length - 1;
    refreshDots();
    preloadAround(pageIndex);
    if (fitMode === 'width') stage.scrollTop = 0;
    const url = new URL(window.location.href);
    if (url.searchParams.get('reader') === '1') {
      url.searchParams.set('page', String(pageIndex + 1));
      window.history.replaceState({}, '', url);
      const rows = readMangaContinue();
      const key = `${url.searchParams.get('provider')}:${url.searchParams.get('mangaSlug') || url.searchParams.get('mangaTitle')}`;
      const entry = rows.find((row) => row.key === key);
      if (entry) {
        entry.page = pageIndex + 1;
        entry.updatedAt = Date.now();
        localStorage.setItem(MANGA_CONTINUE_KEY, JSON.stringify(rows));
        renderMangaContinue();
      }
    }
  };

  const setFitMode = (mode) => {
    fitMode = mode === 'width' ? 'width' : 'book';
    stage.classList.toggle('book-mode', fitMode === 'book');
    stage.classList.toggle('fit-width', fitMode === 'width');
    bookModeBtn.classList.toggle('active', fitMode === 'book');
    fitWidthBtn.classList.toggle('active', fitMode === 'width');
  };

  const setSmoothMode = (enabled) => {
    stage.classList.toggle('smooth-mode', enabled);
    smoothModeBtn.classList.toggle('active', enabled);
    const url = new URL(window.location.href);
    if (url.searchParams.get('reader') === '1') {
      url.searchParams.set('readerMode', enabled ? 'smooth' : fitMode);
      window.history.replaceState({}, '', url);
    }
    let list = stage.querySelector('.reader-smooth-pages');
    if (enabled) {
      if (!list) {
        list = document.createElement('div');
        list.className = 'reader-smooth-pages';
        pages.forEach((page, index) => {
          const image = document.createElement('img');
          image.src = buildImageCandidates(page, sourceProvider)[0] || page;
          image.alt = `${title} - Page ${index + 1}`;
          image.dataset.page = String(index);
          list.appendChild(image);
        });
        stage.appendChild(list);
        list.addEventListener('click', (event) => {
          const image = event.target.closest('img[data-page]');
          if (image) setPage(Number(image.dataset.page));
        });
        const observer = new IntersectionObserver((entries) => {
          const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (visible) setPage(Number(visible.target.dataset.page));
        }, { root: stage, threshold: [0.5] });
        list.querySelectorAll('img').forEach((image) => observer.observe(image));
      }
      img.style.display = 'none';
      list.style.display = 'flex';
      setZoom(zoom);
    } else {
      if (list) list.style.display = 'none';
      img.style.display = '';
      stage.scrollTop = 0;
      setPage(pageIndex);
    }
  };

  const setZoom = (value) => {
    zoom = Math.max(0.5, Math.min(10, value));
    img.style.transform = `scale(${zoom})`;
    stage.classList.toggle('zoomed', zoom !== 1);
    const smoothPages = stage.querySelector('.reader-smooth-pages');
    if (smoothPages) {
      smoothPages.style.transform = `scale(${zoom})`;
      smoothPages.style.transformOrigin = 'top center';
      smoothPages.style.marginBottom = zoom > 1 ? `${Math.round((zoom - 1) * 100)}%` : '';
    }
    zoomValue.textContent = `${Math.round(zoom * 100)}%`;
    stage.style.overflow = zoom > 1 ? 'auto' : '';
  };

  img.onerror = () => {
    try {
      const cands = JSON.parse(img.dataset.candidates || '[]');
      const cur = img.src;
      const idx = cands.indexOf(cur);
      if (idx >= 0 && idx < cands.length - 1) {
        img.src = cands[idx + 1];
        return;
      }
    } catch {
      // ignore
    }
    img.style.minHeight = '120px';
    img.style.background = '#101010';
  };

  prevBtn.onclick = () => setPage(pageIndex - 1);
  previousChapterBtn.disabled = !chapterNavigation.previousChapter;
  previousChapterBtn.onclick = () => {
    const previous = chapterNavigation.previousChapter;
    if (!previous) return;
    const index = (chapterNavigation.base.chapterIndex || 0) + 1;
    openChapter({ ...chapterNavigation.base, chapterId: previous.id, chapterSlug: previous.slug || '', title: `${chapterNavigation.base.mangaTitle} - ${chapterLabel(previous)}`, chapterNumber: chapterNumberValue(previous), chapterIndex: index, nextChapter: chapterNavigation.base.chapterList?.[index - 1] || null, previousChapter: chapterNavigation.base.chapterList?.[index + 1] || null });
  };
  nextBtn.onclick = () => setPage(pageIndex + 1);
  nextChapterBtn.disabled = !chapterNavigation.nextChapter;
  nextChapterBtn.onclick = () => {
    const next = chapterNavigation.nextChapter;
    if (!next) return;
    const index = (chapterNavigation.base.chapterIndex || 0) - 1;
    openChapter({ ...chapterNavigation.base, chapterId: next.id, chapterSlug: next.slug || '', title: `${chapterNavigation.base.mangaTitle} - ${chapterLabel(next)}`, chapterNumber: chapterNumberValue(next), chapterIndex: index, nextChapter: chapterNavigation.base.chapterList?.[index - 1] || null, previousChapter: chapterNavigation.base.chapterList?.[index + 1] || null });
  };
  zonePrev.onclick = () => setPage(pageIndex - 1);
  zoneNext.onclick = () => setPage(pageIndex + 1);
  bookModeBtn.onclick = () => setFitMode('book');
  fitWidthBtn.onclick = () => setFitMode('width');
  smoothModeBtn.onclick = () => setSmoothMode(!stage.classList.contains('smooth-mode'));
  zoomOutBtn.onclick = () => setZoom(zoom - 0.25);
  zoomInBtn.onclick = () => setZoom(zoom + 0.25);
  zoomResetBtn.onclick = () => setZoom(1);
  lockControlsBtn.onclick = () => {
    controlsLocked = !controlsLocked;
    readerPanel?.classList.toggle('reader-controls-locked', controlsLocked);
    lockControlsBtn.innerHTML = `<i class="fa-solid fa-${controlsLocked ? 'lock' : 'lock-open'}"></i>`;
    lockControlsBtn.title = controlsLocked ? 'Unlock reader controls' : 'Lock reader controls';
    lockControlsBtn.setAttribute('aria-label', lockControlsBtn.title);
  };
  stage.addEventListener('wheel', (event) => {
    // Browser zoom gestures (Ctrl/Cmd + wheel) remain untouched. In fit-width
    // mode the page itself may be taller than the reader, so native scrolling
    // is intentionally preserved. Book mode treats each wheel direction as a
    // page turn instead of unexpectedly changing magnification.
    if (event.ctrlKey || event.metaKey || fitMode === 'width' || stage.classList.contains('smooth-mode')) return;
    event.preventDefault();
    const now = Date.now();
    if (now < wheelPageLockUntil || Math.abs(event.deltaY) < 2) return;
    wheelPageLockUntil = now + 360;
    setPage(pageIndex + (event.deltaY > 0 ? 1 : -1));
  }, { passive: false });
  stage.addEventListener('touchstart', (event) => {
    if (fitMode !== 'book' || stage.classList.contains('smooth-mode') || event.touches.length !== 1) return;
    touchStartY = event.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener('touchend', (event) => {
    if (fitMode !== 'book' || touchStartY === null) return;
    const distance = touchStartY - (event.changedTouches[0]?.clientY || touchStartY);
    touchStartY = null;
    if (Math.abs(distance) < 45) return;
    setPage(pageIndex + (distance > 0 ? 1 : -1));
  }, { passive: true });
  exitFsBtn.onclick = async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // ignore
      }
    }
  };
  pageInput.onchange = () => setPage(parseInt(pageInput.value || '1', 10) - 1);
  pageInput.onkeydown = (e) => {
    if (e.key === 'Enter') setPage(parseInt(pageInput.value || '1', 10) - 1);
  };

  readerKeyHandler = (e) => {
    if (!readerModal.classList.contains('active')) return;
    if (e.key === 'ArrowLeft') setPage(pageIndex - 1);
    if (e.key === 'ArrowRight') setPage(pageIndex + 1);
  };
  window.addEventListener('keydown', readerKeyHandler);
  setupFullscreenControlsAutoHide();

  setFitMode('book');
  setZoom(1);
  preloadIndex(0);
  preloadAround(0);
   setPage(Math.max(0, Number(initialPage || 1) - 1));
   if (new URLSearchParams(window.location.search).get('readerMode') === 'smooth') setSmoothMode(true);
}

function cleanupReaderHandler() {
  if (readerKeyHandler) {
    window.removeEventListener('keydown', readerKeyHandler);
    readerKeyHandler = null;
  }

  if (fsControlsHideTimer) {
    clearTimeout(fsControlsHideTimer);
    fsControlsHideTimer = null;
  }

  const readerPanel = readerModal?.querySelector('.modal-content');
  if (readerPanel) {
    readerPanel.classList.remove('fs-controls-visible');
    if (fsControlsMoveHandler) {
      readerPanel.removeEventListener('mousemove', fsControlsMoveHandler);
      fsControlsMoveHandler = null;
    }
    if (fsControlsTouchHandler) {
      readerPanel.removeEventListener('touchstart', fsControlsTouchHandler);
      fsControlsTouchHandler = null;
    }
  }

  if (fsControlsFullscreenChangeHandler) {
    document.removeEventListener('fullscreenchange', fsControlsFullscreenChangeHandler);
    fsControlsFullscreenChangeHandler = null;
  }
}

function setupFullscreenControlsAutoHide() {
  const readerPanel = readerModal?.querySelector('.modal-content');
  if (!readerPanel) return;

  if (fsControlsFullscreenChangeHandler) {
    document.removeEventListener('fullscreenchange', fsControlsFullscreenChangeHandler);
  }

  const showControls = () => {
    readerPanel.classList.add('fs-controls-visible');
    if (fsControlsHideTimer) clearTimeout(fsControlsHideTimer);
    fsControlsHideTimer = setTimeout(() => {
      if (document.fullscreenElement === readerPanel) {
        readerPanel.classList.remove('fs-controls-visible');
      }
    }, 1500);
  };

  fsControlsMoveHandler = () => {
    if (document.fullscreenElement === readerPanel) showControls();
  };
  fsControlsTouchHandler = () => {
    if (document.fullscreenElement === readerPanel) showControls();
  };

  readerPanel.addEventListener('mousemove', fsControlsMoveHandler);
  readerPanel.addEventListener('touchstart', fsControlsTouchHandler, { passive: true });

  fsControlsFullscreenChangeHandler = () => {
    if (document.fullscreenElement === readerPanel) {
      showControls();
    } else {
      readerPanel.classList.remove('fs-controls-visible');
      if (fsControlsHideTimer) {
        clearTimeout(fsControlsHideTimer);
        fsControlsHideTimer = null;
      }
    }
  };

  document.addEventListener('fullscreenchange', fsControlsFullscreenChangeHandler);
}

async function openChapter({ provider, chapterId, mangaSlug, chapterSlug, title, mangaTitle, chapterNumber, nextChapter = null, previousChapter = null, chapterList = null, chapterIndex = 0, image = '', resumePage = null }) {
  const currentParams = new URLSearchParams(window.location.search);
  const sameChapter = (chapterId && currentParams.get('chapterId') === chapterId)
    || (chapterSlug && currentParams.get('chapterSlug') === chapterSlug);
  const savedPage = resumePage || (sameChapter ? (currentParams.get('page') || '1') : '1');
  const continueEntry = {
    key: `${provider}:${mangaSlug || mangaTitle}`,
    provider, chapterId, mangaSlug, chapterSlug, title, mangaTitle, chapterNumber,
    chapterTitle: title, page: Number(savedPage) || 1,
    image: image || currentParams.get('mangaImage') || ''
  };
  saveMangaContinue(continueEntry);
  renderMangaContinue();
  updateReaderUrl({
    reader: '1', provider, chapterId, mangaSlug, chapterSlug, title, mangaTitle, chapterNumber,
    page: savedPage, readerMode: currentParams.get('readerMode') || 'book'
  });
  readerModal.classList.add('active');
  document.body.classList.add('modal-open');
  readerBody.innerHTML = '<p style="padding:20px">Loading chapter...</p>';

  try {
    const readId = provider === 'mangak'
      ? `${API_MANGA_BASE}/mangak/chapter-images/${encodeURIComponent(mangaSlug)}/${encodeURIComponent(chapterSlug)}`
      : chapterId;
    const pages = await getProviderChapterPages(provider, readId);
    renderReader(title, pages, provider, savedPage, { nextChapter, previousChapter, base: { provider, mangaSlug, mangaTitle, chapterId, chapterSlug, chapterList, chapterIndex, image } });
    return;
  } catch (primaryErr) {
    if (provider !== 'mangadex') {
      readerBody.innerHTML = `<p style="padding:20px;color:#ff9f9f;">Failed to load chapter: ${primaryErr.message || primaryErr}</p>`;
      return;
    }
  }

  readerBody.innerHTML = '<p style="padding:20px">MangaDex has no readable pages for this chapter. Trying fallback provider...</p>';

  try {
    const fallback = await findFallbackChapterByTitle(mangaTitle, chapterNumber);
    renderReader(title, fallback.pages, fallback.provider, savedPage);
  } catch (fallbackErr) {
    readerBody.innerHTML = `<p style="padding:20px;color:#ff9f9f;">Failed to load chapter from all providers: ${fallbackErr.message || fallbackErr}</p>`;
  }
}

function buildProviderToolbar() {
  providerToolbar.innerHTML = '';
  for (const p of PROVIDERS) {
    const btn = document.createElement('button');
    btn.className = `manga-provider-btn ${p.key === selectedProvider ? 'active' : ''}`;
    btn.textContent = p.label;
    btn.onclick = async () => {
      selectedProvider = p.key;
      buildProviderToolbar();
      await loadDiscover();
    };
    providerToolbar.appendChild(btn);
  }
}

async function toggleModalFullscreen(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  const panel = modal.querySelector('.modal-content');
  if (!panel) return;

  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await panel.requestFullscreen();
    }
  } catch {
    // Ignore if fullscreen is blocked by browser policy.
  }
}

document.getElementById('manga-modal-close').onclick = () => { 
  mangaModal.classList.remove('active'); 
  document.body.classList.remove('modal-open'); 
  const url = new URL(window.location.href);
  ['mangaModal', 'mangaProvider', 'mangaId', 'mangaSlug', 'mangaTitle', 'mangaImage', 'mangaDescription'].forEach((key) => url.searchParams.delete(key));
  window.history.replaceState({}, '', url);
};
document.getElementById('reader-modal-close').onclick = () => { 
  readerModal.classList.remove('active'); 
  document.body.classList.remove('modal-open'); 
  cleanupReaderHandler(); 
  updateReaderUrl();
};
const mangaModalFsBtn = document.getElementById('manga-modal-fs');
if (mangaModalFsBtn) mangaModalFsBtn.onclick = () => toggleModalFullscreen('manga-modal');
const readerModalFsBtn = document.getElementById('reader-modal-fs');
if (readerModalFsBtn) readerModalFsBtn.onclick = () => toggleModalFullscreen('reader-modal');
window.onclick = (e) => {
  if (e.target === mangaModal) { 
    mangaModal.classList.remove('active'); 
    document.body.classList.remove('modal-open'); 
  }
  if (e.target === readerModal) { 
    readerModal.classList.remove('active'); 
    document.body.classList.remove('modal-open'); 
    cleanupReaderHandler(); 
  }
};

// ----- Header search: expand/collapse + execute -----
const searchContainer = document.getElementById('search-container');
const searchCloseBtn = document.getElementById('search-close-btn');
const header = document.getElementById('main-header');

function isMobileSearchViewport() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function setSearchExpanded(expanded) {
  if (!searchContainer) return;
  const shouldExpand = !!expanded;
  searchContainer.classList.toggle('search-expanded', shouldExpand);
  searchContainer.classList.toggle('mobile-search-expanded', shouldExpand);
  searchBtn?.setAttribute('aria-expanded', shouldExpand ? 'true' : 'false');
  if (header) {
    header.classList.toggle('mobile-search-open', shouldExpand && isMobileSearchViewport());
  }
}

function syncSearchUi() {
  if (!searchContainer || !searchInput) return;
  const hasQuery = String(searchInput.value || '').trim().length > 0;
  const isActive = document.activeElement === searchInput || searchContainer.matches(':focus-within');
  setSearchExpanded(hasQuery || isActive);
}

searchBtn.addEventListener('click', (event) => {
  event.preventDefault();
  // First click expands the collapsed bar; subsequent clicks run the search.
  if (searchContainer && !searchContainer.classList.contains('search-expanded')) {
    setSearchExpanded(true);
    searchInput?.focus();
    return;
  }
  runSearch();
});

if (searchCloseBtn) {
  searchCloseBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (searchInput) searchInput.value = '';
    setSearchExpanded(false);
    if (searchInput) searchInput.blur();
    loadDiscover();
  });
}

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    runSearch();
  }
  if (e.key === 'Escape') {
    setSearchExpanded(false);
    if (searchInput) searchInput.blur();
  }
});
searchInput?.addEventListener('focus', () => setSearchExpanded(true));
searchInput?.addEventListener('input', () => {
  if (searchContainer && !searchContainer.classList.contains('search-expanded')) setSearchExpanded(true);
});
searchInput?.addEventListener('blur', () => {
  setTimeout(() => {
    if (!searchContainer) return;
    const hasQuery = String(searchInput.value || '').trim().length > 0;
    if (!searchContainer.matches(':focus-within') && !hasQuery) {
      setSearchExpanded(false);
    }
  }, 120);
});
window.addEventListener('resize', syncSearchUi);
window.addEventListener('orientationchange', syncSearchUi);
syncSearchUi();

// ----- Manga home: spotlight hero, curated sections, category chips -----
const mangaSpotlight = document.getElementById('manga-spotlight');
const mangaSpotlightLayout = document.getElementById('manga-spotlight-layout');
const mangaSpotlightDotsEl = document.getElementById('manga-spotlight-dots');
const mangaSpotlightBg = mangaSpotlight?.querySelector('.manga-spotlight-bg');
const mangaSectionsWrap = document.getElementById('manga-sections');
const mangaChipsEl = document.getElementById('manga-category-chips');
const MANGA_HERO_SLIDE_MS = 8000;
const MANGA_SECTION_LIMIT = 21;
const MANGA_EXCLUDED_GENRE_SLUGS = new Set(['adult', 'hentai', 'smut', 'soft-yaoi']);

let mangaHeroItems = [];
let mangaHeroIndex = 0;
let mangaHeroTimer = null;
let activeGenreChip = null;

function deactivateGenreChip() {
  if (activeGenreChip) {
    activeGenreChip.classList.remove('active');
    activeGenreChip = null;
  }
}

function mangaHeroBlurb(item) {
  return String(item.summary || item.description || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mangaHeroPills(item) {
  const stats = item.stats || {};
  const rating = Number(item.rating_avg ?? item.rating ?? 0) || 0;
  const parts = [];
  if (rating) parts.push(`<span class="meta-pill rating-pill"><i class="fa-solid fa-star"></i> ${rating.toFixed(1)}</span>`);
  if (stats.chapters_count) parts.push(`<span class="meta-pill" style="border-color:#4ade8033"><i class="fa-solid fa-book-open" style="color:#4ade80"></i> ${fmtNum(stats.chapters_count)} chapters</span>`);
  if (stats.bookmarks_count) parts.push(`<span class="meta-pill" style="border-color:#38bdf833"><i class="fa-solid fa-bookmark" style="color:#38bdf8"></i> ${fmtNum(stats.bookmarks_count)}</span>`);
  if (item.is_new) parts.push(`<span class="meta-pill" style="border-color:#facc1533"><i class="fa-solid fa-sparkles" style="color:#facc15"></i> New</span>`);
  (Array.isArray(item.genres) ? item.genres : []).slice(0, 3).forEach((g) => {
    const name = String(g?.name || g?.slug || '').trim();
    if (name) parts.push(`<span class="meta-pill" style="border-color:#a855f733"><i class="fa-solid fa-tags" style="color:#a855f7"></i> ${escapeHtml(name)}</span>`);
  });
  return parts.join('');
}

function mangaHeroImage(item) {
  const candidates = buildImageCandidates(cardImage(item), 'mangak');
  return { candidates, src: candidates[0] || cardImage(item) };
}

function readMangaNow(item) {
  const latest = (Array.isArray(item.latest_chapters) && item.latest_chapters.length) ? item.latest_chapters[0] : null;
  if (!latest) {
    openMangaInfo(item, 'mangak');
    return;
  }
  openChapter({
    provider: 'mangak',
    chapterId: latest.id,
    mangaId: item.id,
    mangaSlug: String(item.slug || '').replace(/^\/+|\/+$/g, ''),
    chapterSlug: String(latest.slug || ''),
    title: `${cardTitle(item)} - ${chapterLabel(latest)}`,
    mangaTitle: cardTitle(item),
    chapterNumber: chapterNumberValue(latest),
  });
}

function renderMangaSpotlight(slideIndex) {
  const item = mangaHeroItems[slideIndex];
  if (!item) return;
  mangaHeroIndex = (slideIndex + mangaHeroItems.length) % mangaHeroItems.length;
  const { candidates, src } = mangaHeroImage(item);
  if (mangaSpotlightBg) mangaSpotlightBg.style.backgroundImage = `url("${src}")`;
  if (mangaSpotlightLayout) {
    mangaSpotlightLayout.innerHTML = `
      <div class="manga-spotlight-copy">
        <div class="manga-spotlight-kicker"><i class="fa-solid fa-bolt"></i> Trending this week</div>
        <h2>${escapeHtml(cardTitle(item))}</h2>
        <div class="hero-meta">${mangaHeroPills(item)}</div>
        <p>${escapeHtml(mangaHeroBlurb(item)) || 'No synopsis available.'}</p>
        <div class="hero-btns">
          <button type="button" class="btn btn-watch-now" data-manga-hero-action="read"><i class="fa-solid fa-play"></i> Read now</button>
          <button type="button" class="btn btn-more-info" data-manga-hero-action="info"><i class="fa-solid fa-circle-info"></i> Details</button>
        </div>
      </div>
      <div class="manga-spotlight-poster">
        <img src="${src}" alt="${escapeHtml(cardTitle(item))}" loading="eager">
      </div>`;
    const posterImg = mangaSpotlightLayout.querySelector('.manga-spotlight-poster img');
    if (posterImg) attachImageFallback(posterImg, candidates, cardImage(item));
  }
  if (mangaSpotlightDotsEl) {
    mangaSpotlightDotsEl.innerHTML = '';
    mangaHeroItems.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `manga-spotlight-dot ${i === mangaHeroIndex ? 'active' : ''}`;
      dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
      dot.onclick = () => { resetMangaHeroTimer(); renderMangaSpotlight(i); };
      mangaSpotlightDotsEl.appendChild(dot);
    });
  }
}

function resetMangaHeroTimer() {
  if (mangaHeroTimer) clearInterval(mangaHeroTimer);
  mangaHeroTimer = setInterval(() => renderMangaSpotlight(mangaHeroIndex + 1), MANGA_HERO_SLIDE_MS);
}

function navigateMangaSpotlight(offset) {
  renderMangaSpotlight(mangaHeroIndex + offset);
  resetMangaHeroTimer();
}

async function loadMangaSpotlight() {
  if (!mangaSpotlightLayout || !mangaSpotlight) return;
  try {
    const data = await fetchJson(mangaBrowseUrl('views_today', '', 1, 24), 15000);
    const rows = normalizeResults(data).map((r) => ({ ...r, provider: 'mangak' }));
    mangaHeroItems = rows.filter((r) => r?.id && cardImage(r)).slice(0, 6);
    if (!mangaHeroItems.length) {
      mangaSpotlight.style.display = 'none';
      return;
    }
    resetMangaHeroTimer();
    renderMangaSpotlight(0);
  } catch {
    mangaSpotlight.style.display = 'none';
  }
}

// Section card rendering shared by Trending/Popular/New/Recently Updated.
function renderMangaCards(grid, items, opts = {}) {
  if (!opts.append) grid.innerHTML = '';
  for (const item of items) {
    const provider = 'mangak';
    const thumbCandidates = buildImageCandidates(cardImage(item), provider);
    const firstThumb = thumbCandidates[0] || cardImage(item);
    const stats = item.stats || {};
    const rating = Number(item.rating_avg ?? item.rating ?? 0) || 0;
    const status = String(item.status || '').trim();
    const latest = (Array.isArray(item.latest_chapters) && item.latest_chapters.length) ? item.latest_chapters[0] : null;
    const latestName = latest ? chapterLabel(latest) : null;
    const card = document.createElement('article');
    card.className = 'manga-card';
    card.setAttribute('aria-label', escapeHtml(cardTitle(item)));
    card.innerHTML = `
      <div class="manga-poster">
        <img src="${firstThumb}" alt="${escapeHtml(cardTitle(item))}" loading="lazy">
        <div class="manga-badge-row">
          ${status ? `<span class="manga-badge">${escapeHtml(status)}</span>` : ''}
          ${rating ? `<span class="manga-badge manga-rating"><i class="fa-solid fa-star"></i> ${rating.toFixed(1)}</span>` : ''}
        </div>
        <div class="manga-play-cue">
          <span>${stats.chapters_count ? `${fmtNum(stats.chapters_count)} chapters` : (latestName ? escapeHtml(latestName) : 'Open')}</span>
          <i class="fa-solid fa-book-open"></i>
        </div>
      </div>
      <div class="manga-card-info">
        <h3 class="manga-card-title">${escapeHtml(cardTitle(item))}</h3>
        <div class="manga-card-meta">
          ${item.is_new ? '<span style="color:#facc15">New</span>' : ''}
          ${item.is_hot ? '<span style="color:#ff5b63">Hot</span>' : ''}
          ${latestName ? `<span>${escapeHtml(latestName)}</span>` : ''}
          ${item.updated_at ? `<span>${fmtRelativeTime(item.updated_at)}</span>` : ''}
        </div>
      </div>`;
    const img = card.querySelector('img');
    attachImageFallback(img, thumbCandidates, 'https://placehold.co/300x450/1a1a2e/e50914?text=No+Image');
    card.onclick = () => openMangaInfo(item, provider);
    grid.appendChild(card);
  }
}

const MANGA_SECTIONS = [
  { key: 'trending', label: 'Trending', sort: 'views_today', sub: 'What everyone is reading right now.' },
  { key: 'popular', label: 'Popular', sort: 'views', sub: 'All-time favorites with the biggest fan bases.' },
  { key: 'new', label: 'New Manga', sort: 'newest', sub: 'Fresh titles added to the library.' },
  { key: 'updated', label: 'Recently Updated', sort: '', sub: 'Latest chapter drops around the clock.' },
];
const mangaSectionState = {};

async function loadMangaSection(section, opts = {}) {
  const grid = document.querySelector(`[data-manga-grid="${section.key}"]`);
  const btn = document.querySelector(`[data-manga-load-more="${section.key}"]`);
  const countEl = document.querySelector(`[data-manga-count="${section.key}"]`);
  if (!grid) return;
  const state = (mangaSectionState[section.key] = mangaSectionState[section.key] || { page: 1, seen: new Set(), exhausted: false });
  if (!opts.append) {
    if (state.exhausted && grid.querySelectorAll('.manga-card').length >= MANGA_SECTION_LIMIT) return;
    state.page = 1;
    grid.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const s = document.createElement('div');
      s.className = 'manga-skeleton';
      grid.appendChild(s);
    }
  } else {
    if (state.exhausted) return;
    state.page += 1;
  }
  if (btn) { btn.disabled = true; btn.textContent = opts.append ? 'Loading more...' : 'Loading...'; }

  try {
    const data = await fetchJson(mangaBrowseUrl(section.sort, '', state.page, MANGA_SECTION_LIMIT), 15000);
    const rows = normalizeResults(data).map((r) => ({ ...r, provider: selectedProvider }));
    const fresh = rows.filter((r) => r?.id && !state.seen.has(String(r.id)));
    if (section.key === 'trending') {
      fresh.sort((a, b) => {
        const aTime = Date.parse(a.updated_at || a.latest_updated_at || a.latest_chapter?.updated_at || '') || 0;
        const bTime = Date.parse(b.updated_at || b.latest_updated_at || b.latest_chapter?.updated_at || '') || 0;
        return bTime - aTime;
      });
    }
    fresh.forEach((r) => state.seen.add(String(r.id)));
    renderMangaCards(grid, fresh, { append: opts.append });
    state.exhausted = !hasNextPageFrom(data, rows, state.page, MANGA_SECTION_LIMIT) && rows.length < MANGA_SECTION_LIMIT;
    if (countEl) countEl.textContent = `${grid.querySelectorAll('.manga-card').length} titles`;
    if (btn) btn.hidden = state.exhausted;
  } catch {
    if (!opts.append) {
      grid.innerHTML = '<div class="manga-status"><div><i class="fa-solid fa-triangle-exclamation"></i><p>Could not load this section.</p></div></div>';
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Load More'; }
  }
}

document.querySelectorAll('[data-manga-load-more]').forEach((btn) => {
  const key = btn.dataset.mangaLoadMore;
  const section = MANGA_SECTIONS.find((s) => s.key === key);
  if (section) btn.addEventListener('click', () => loadMangaSection(section, { append: true }));
});

async function loadMangaGenres() {
  if (!mangaChipsEl) return;
  try {
    const payload = await fetchJson(`${API_MANGA_BASE}/mangak/genres?limit=100`, 15000);
    let genres = normalizeResults(payload);
    genres = genres
      .filter((g) => g?.slug && !MANGA_EXCLUDED_GENRE_SLUGS.has(String(g.slug).toLowerCase()))
      .sort((a, b) => String(a.name || a.slug || '').localeCompare(String(b.name || b.slug || '')));
    const frag = document.createDocumentFragment();
    for (const g of genres) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'manga-cat-chip';
      chip.dataset.slug = g.slug;
      chip.dataset.label = g.name || g.slug;
      chip.textContent = g.name || g.slug;
      chip.onclick = () => {
          if (activeGenreChip === chip) {
          deactivateGenreChip();
          document.body.classList.remove('manga-search-mode');
            loadDiscover();
            const clearedUrl = new URL(window.location.href);
            clearedUrl.searchParams.delete('genre');
            clearedUrl.searchParams.delete('genreName');
            window.history.replaceState({}, '', clearedUrl);
            return;
        }
        if (activeGenreChip) activeGenreChip.classList.remove('active');
        activeGenreChip = chip;
        chip.classList.add('active');
        const genreUrl = new URL(window.location.href);
        genreUrl.searchParams.set('genre', String(g.slug || ''));
        genreUrl.searchParams.set('genreName', String(g.name || g.slug || ''));
        window.history.replaceState({}, '', genreUrl);
        document.body.classList.add('manga-search-mode');
        runGenreBrowse(String(g.slug || ''), String(g.name || g.slug || ''));
      };
      frag.appendChild(chip);
    }
    mangaChipsEl.appendChild(frag);
    const savedGenre = new URLSearchParams(window.location.search).get('genre');
    const savedChip = savedGenre && [...mangaChipsEl.children].find((chip) => chip.dataset.slug === savedGenre);
    if (savedChip) savedChip.click();
  } catch {
    const tip = document.querySelector('.manga-cat-tip');
    if (tip) tip.textContent = 'Categories temporarily unavailable.';
  }
}

async function runGenreBrowse(slug, label) {
  errorEl.style.display = 'none';
  statusEl.textContent = `Loading ${label} titles...`;
  mangaGrid.innerHTML = '';
  setSearchUrl('');
  browseState = {
    mode: 'genre',
    query: '',
    genres: slug,
    seedIdx: 0,
    page: 1,
    seenIds: new Set(),
    exhausted: false,
  };
  try {
    const data = await fetchJson(mangaBrowseUrl('', slug, 1, PAGE_SIZE), 15000);
    const rows = normalizeResults(data).map((r) => ({ ...r, provider: selectedProvider }));
    const fresh = rows.filter((r) => r?.id);
    fresh.forEach((r) => browseState.seenIds.add(String(r.id)));
    renderCards(fresh);
    browseState.exhausted = !hasNextPageFrom(data, fresh, 1, PAGE_SIZE) && fresh.length < PAGE_SIZE;
    statusEl.textContent = `${mangaGrid.querySelectorAll('.movie-card').length} ${label.toLowerCase()} titles`;
    updateResultCount();
    renderLoadMoreButton();
    document.getElementById('manga-explore-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    errorEl.textContent = `Failed to load ${label} titles: ${err.message || err}`;
    errorEl.style.display = 'block';
    statusEl.textContent = '';
  }
}

async function appendNextGenrePage() {
  const slug = browseState.genres;
  const label = activeGenreChip?.dataset?.label || slug;
  browseState.page += 1;
  let data;
  try {
    data = await fetchJson(mangaBrowseUrl('', slug, browseState.page, PAGE_SIZE), 15000);
  } catch (err) {
    browseState.exhausted = true;
    throw err;
  }
  const rows = normalizeResults(data).map((r) => ({ ...r, provider: selectedProvider }));
  const fresh = [];
  for (const row of rows) {
    if (row?.id && !browseState.seenIds.has(String(row.id))) {
      browseState.seenIds.add(String(row.id));
      fresh.push(row);
    }
  }
  renderCards(fresh, { append: true });
  browseState.exhausted = !hasNextPageFrom(data, rows, browseState.page, PAGE_SIZE) && rows.length < PAGE_SIZE;
  statusEl.textContent = `${mangaGrid.querySelectorAll('.movie-card').length} ${label.toLowerCase()} titles`;
  updateResultCount();
}

document.getElementById('manga-spotlight-prev')?.addEventListener('click', () => navigateMangaSpotlight(-1));
document.getElementById('manga-spotlight-next')?.addEventListener('click', () => navigateMangaSpotlight(1));
mangaSpotlightLayout?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-manga-hero-action]');
  if (!btn) return;
  const item = mangaHeroItems[mangaHeroIndex];
  if (!item) return;
  if (btn.dataset.mangaHeroAction === 'read') readMangaNow(item);
  else openMangaInfo(item, 'mangak');
});

document.getElementById('cache-clear-btn')?.addEventListener('click', async () => {
  try {
    await window.StreamVerseStorage.clearCache();
    window.location.reload();
  } catch (error) {
    console.warn('Unable to clear all cache:', error);
  }
});

const mangaMobileMenuToggle = document.getElementById('mobile-menu-toggle');
const mangaMobileDropdown = document.getElementById('mobile-dropdown-menu');
mangaMobileMenuToggle?.addEventListener('click', () => {
  const open = mangaMobileDropdown?.classList.toggle('active') || false;
  mangaMobileMenuToggle.setAttribute('aria-expanded', String(open));
});
mangaMobileDropdown?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  mangaMobileDropdown.classList.remove('active');
  mangaMobileMenuToggle?.setAttribute('aria-expanded', 'false');
}));

buildProviderToolbar();
renderMangaContinue();

// Restore a search from the URL (?search=...) so refreshing keeps the same results,
// matching index.html behavior.
const initialSearchQuery = new URLSearchParams(window.location.search).get('search')?.trim() || '';
if (initialSearchQuery.length >= 2 && searchInput) {
  searchInput.value = initialSearchQuery;
  setSearchExpanded(true);
  runSearch();
} else {
  loadDiscover();
}

const readerParams = new URLSearchParams(window.location.search);
if (readerParams.get('reader') === '1' && (readerParams.get('chapterId') || readerParams.get('chapterSlug'))) {
  openChapter({
    provider: readerParams.get('provider') || 'mangak',
    chapterId: readerParams.get('chapterId') || '',
    mangaSlug: readerParams.get('mangaSlug') || '',
    chapterSlug: readerParams.get('chapterSlug') || '',
    title: readerParams.get('title') || 'Manga Reader',
    mangaTitle: readerParams.get('mangaTitle') || readerParams.get('title') || 'Manga',
    chapterNumber: readerParams.get('chapterNumber') || ''
  });
}

if (readerParams.get('mangaModal') === '1' && readerParams.get('mangaId')) {
  openMangaInfo({
    id: readerParams.get('mangaId'),
    slug: readerParams.get('mangaSlug') || '',
    title: readerParams.get('mangaTitle') || 'Manga',
    image: readerParams.get('mangaImage') || '',
    description: readerParams.get('mangaDescription') || ''
  }, readerParams.get('mangaProvider') || 'mangak');
}

// Kick off the manga home UI: spotlight hero, curated sections, and category chips.
loadMangaSpotlight();
MANGA_SECTIONS.forEach((section) => loadMangaSection(section));
loadMangaGenres();
