const RUNTIME_CONFIG = window.__STREAMVERSE_CONFIG__ || {};
const PROD_API = String(RUNTIME_CONFIG.PROD_API_BASE || 'https://stream-verse-jeet.duckdns.org/meta/tmdb');
const LOCAL_API = String(RUNTIME_CONFIG.LOCAL_API_BASE || 'http://localhost:3000/meta/tmdb');

function getCurrentApiSource() {
  return localStorage.getItem('api_source') || 'prod';
}

const currentSource = getCurrentApiSource();
const API_BASE = currentSource === 'local' ? LOCAL_API : PROD_API;
const ROOT_API = API_BASE.replace(/\/meta\/tmdb\/?$/, ''); // Strip specific meta route for manga
const API_MANGA_BASE = `${ROOT_API}/manga`;
const API_UTILS_PROXY = `${ROOT_API}/utils/proxy`;
const PROVIDERS = [
  { key: 'all', label: 'All' },
  { key: 'mangadex', label: 'MangaDex' },
  { key: 'mangapill', label: 'MangaPill' },
  { key: 'mangahere', label: 'MangaHere' },
  { key: 'mangakakalot', label: 'MangaKakalot' },
];

const READ_FALLBACK_PROVIDERS = ['mangapill', 'mangahere'];

let selectedProvider = 'all';
let readerKeyHandler = null;
let fsControlsHideTimer = null;
let fsControlsMoveHandler = null;
let fsControlsTouchHandler = null;
let fsControlsFullscreenChangeHandler = null;

const providerToolbar = document.getElementById('provider-toolbar');
const searchInput = document.getElementById('manga-search');
const searchBtn = document.getElementById('manga-search-btn');
const mangaGrid = document.getElementById('manga-grid');
const statusEl = document.getElementById('manga-status');
const errorEl = document.getElementById('manga-error');
const mangaModal = document.getElementById('manga-modal');
const mangaModalBody = document.getElementById('manga-modal-body');
const readerModal = document.getElementById('reader-modal');
const readerBody = document.getElementById('reader-body');

function normalizeResults(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.data?.results)) return payload.data.results;
  return [];
}

function normalizePages(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.map((p) => (typeof p === 'string' ? p : p?.img || p?.url)).filter(Boolean);
  if (Array.isArray(payload.pages)) return payload.pages.map((p) => (typeof p === 'string' ? p : p?.img || p?.url)).filter(Boolean);
  if (Array.isArray(payload.data?.pages)) return payload.data.pages.map((p) => (typeof p === 'string' ? p : p?.img || p?.url)).filter(Boolean);
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
  const c = ch?.chapter || ch?.chapterNumber || ch?.number || '';
  if (c) return `Chapter ${c}`;
  return ch?.title || 'Chapter';
}

function chapterNumberValue(ch) {
  return String(ch?.chapter || ch?.chapterNumber || ch?.number || '').trim();
}

function chapterSortValue(ch, idx) {
  const raw = String(ch?.chapter || ch?.chapterNumber || ch?.number || '').trim();
  const title = String(ch?.title || '');
  const candidate = raw || title;
  const match = candidate.match(/(\d+(\.\d+)?)/);
  if (match) return Number(match[1]);
  return 1000000 + idx;
}

function providerSearchUrl(provider, q) {
  return `${API_MANGA_BASE}/${provider}/${encodeURIComponent(q)}?page=1`;
}

function providerInfoUrl(provider, mangaId) {
  if (provider === 'mangadex') return `${API_MANGA_BASE}/mangadex/info/${encodeURIComponent(mangaId)}`;
  return `${API_MANGA_BASE}/${provider}/info?id=${encodeURIComponent(mangaId)}`;
}

function providerReadUrl(provider, chapterId) {
  if (provider === 'mangadex') return `${API_MANGA_BASE}/mangadex/read/${encodeURIComponent(chapterId)}`;
  return `${API_MANGA_BASE}/${provider}/read?chapterId=${encodeURIComponent(chapterId)}`;
}

function getProviderReferer(provider, rawUrl) {
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
  return `${API_UTILS_PROXY}?url=${encodeURIComponent(normalized)}&referer=${encodeURIComponent(referer)}`;
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

  if (normalized && !out.includes(normalized)) out.push(normalized);

  // For MangaDex covers, direct URL is usually best; proxy can be slower and unnecessary.
  if (provider !== 'mangadex') {
    const proxied = proxifyImageUrl(normalized, provider);
    if (proxied && !out.includes(proxied)) out.push(proxied);
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

async function discoverByProvider(provider) {
  const seedQueries = ['one piece', 'naruto', 'bleach'];
  const timeout = provider === 'mangakakalot' ? 5500 : provider === 'mangadex' ? 6500 : 7500;
  const tasks = seedQueries.map(async (q) => {
    const data = await fetchJson(providerSearchUrl(provider, q), timeout);
    const rows = normalizeResults(data);
    if (!rows.length) throw new Error('empty');
    return rows.map((r) => ({ ...r, provider }));
  });

  try {
    // Return as soon as the first successful non-empty response arrives.
    return await Promise.any(tasks);
  } catch {
    return [];
  }
}

async function loadDiscover() {
  errorEl.style.display = 'none';
  statusEl.textContent = 'Loading manga...';
  mangaGrid.innerHTML = '';

  try {
    let rows = [];

    if (selectedProvider === 'all') {
      const picks = ['mangadex', 'mangapill', 'mangahere', 'mangakakalot'];
      const settled = await Promise.allSettled(picks.map((p) => discoverByProvider(p)));
      const merged = [];
      for (const hit of settled) {
        if (hit.status === 'fulfilled') merged.push(...hit.value.slice(0, 8));
      }
      const seen = new Set();
      rows = merged.filter((item) => {
        const key = `${item.provider}:${item.id}`;
        if (!item?.id || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 36);
    } else {
      rows = (await discoverByProvider(selectedProvider)).slice(0, 36);
    }

    renderCards(rows);
    statusEl.textContent = `${rows.length} manga loaded`;
  } catch (err) {
    errorEl.textContent = `Failed to load manga: ${err.message || err}`;
    errorEl.style.display = 'block';
    statusEl.textContent = '';
  }
}

function renderCards(items) {
  mangaGrid.innerHTML = '';
  for (const item of items) {
    const provider = item.provider || selectedProvider;
    const thumbCandidates = buildImageCandidates(cardImage(item), provider);
    const firstThumb = thumbCandidates[0] || cardImage(item);
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.innerHTML = `
      <img src="${firstThumb}" alt="${cardTitle(item)}" loading="lazy">
      <span class="quality-badge">${provider.toUpperCase()}</span>
      <div class="movie-card-info">
        <h3 class="movie-card-title">${cardTitle(item)}</h3>
        <div class="manga-card-meta">Provider: ${provider}</div>
      </div>
    `;
    const img = card.querySelector('img');
    attachImageFallback(img, thumbCandidates, 'https://placehold.co/300x450/1a1a2e/e50914?text=No+Image');
    card.onclick = () => openMangaInfo(item, provider);
    mangaGrid.appendChild(card);
  }
}

async function runSearch() {
  const q = String(searchInput.value || '').trim();
  if (!q) return loadDiscover();

  errorEl.style.display = 'none';
  statusEl.textContent = `Searching "${q}"...`;
  mangaGrid.innerHTML = '';

  try {
    let rows = [];
    if (selectedProvider === 'all') {
      const picks = ['mangadex', 'mangapill', 'mangahere', 'mangakakalot'];
      const settled = await Promise.allSettled(
        picks.map(async (p) => normalizeResults(await fetchJson(providerSearchUrl(p, q), 12000)).map((r) => ({ ...r, provider: p })))
      );
      for (const hit of settled) {
        if (hit.status === 'fulfilled') rows.push(...hit.value);
      }
    } else {
      rows = normalizeResults(await fetchJson(providerSearchUrl(selectedProvider, q), 12000))
        .map((r) => ({ ...r, provider: selectedProvider }));
    }

    rows = rows.filter((r) => r?.id).slice(0, 60);
    renderCards(rows);
    statusEl.textContent = `${rows.length} results for "${q}"`;
  } catch (err) {
    errorEl.textContent = `Search failed: ${err.message || err}`;
    errorEl.style.display = 'block';
    statusEl.textContent = '';
  }
}

async function openMangaInfo(item, provider) {
  mangaModal.style.display = 'block';
  mangaModalBody.innerHTML = '<p style="padding:20px">Loading manga info...</p>';
  try {
    const info = await fetchJson(providerInfoUrl(provider, item.id), 16000);
    const title = cardTitle(info) || cardTitle(item);
    const imageRaw = extractImageRaw(info) || extractImageRaw(item);
    const imageDirect = normalizeImageUrl(imageRaw, provider);
    const posterCandidates = buildImageCandidates(imageDirect, provider);
    const thumbCandidates = buildImageCandidates(extractImageRaw(item), provider);
    const poster = posterCandidates[0] || thumbCandidates[0] || 'https://placehold.co/380x570/12162a/e50914?text=No+Image';
    const descRaw = typeof info?.description === 'string' ? info.description : (info?.description?.en || '');
    const desc = String(descRaw || 'No description available.');
    const chaptersRaw = Array.isArray(info?.chapters) ? info.chapters : [];
    const chapters = chaptersRaw
      .map((c, idx) => ({ c, idx, order: chapterSortValue(c, idx) }))
      .sort((a, b) => a.order - b.order || a.idx - b.idx)
      .map((x) => x.c);

    mangaModalBody.innerHTML = `
      <div class="modal-details">
        <div class="manga-info-top">
          <img src="${poster}" alt="${title}" class="manga-poster"
               id="manga-modal-poster">
          <div class="manga-info-text">
            <h2>${title}</h2>
            <div class="manga-provider-pill">Provider: ${provider}</div>
            <p class="manga-desc">${desc}</p>
          </div>
        </div>
        <h3 class="section-title" style="margin-top:18px;">Chapters</h3>
        <div class="chapter-list" id="chapter-list"></div>
      </div>
    `;

    const list = document.getElementById('chapter-list');
    const posterEl = document.getElementById('manga-modal-poster');
    const posterFallbacks = [...posterCandidates, ...thumbCandidates];
    attachImageFallback(posterEl, posterFallbacks, 'https://placehold.co/380x570/12162a/e50914?text=No+Image');

    const show = chapters.slice(0, 180);
    if (!show.length) {
      list.innerHTML = '<p style="padding:8px;color:#bbb;">No chapters found.</p>';
      return;
    }

    for (const chapter of show) {
      const btn = document.createElement('button');
      const chLabel = chapterLabel(chapter);
      btn.className = 'chapter-item';
      btn.textContent = chLabel;
      btn.onclick = () => openChapter({
        provider,
        chapterId: chapter.id,
        title: `${title} - ${chLabel}`,
        mangaTitle: title,
        chapterNumber: chapterNumberValue(chapter),
      });
      list.appendChild(btn);
    }
  } catch (err) {
    mangaModalBody.innerHTML = `<p style="padding:20px;color:#ff9f9f;">Failed to load info: ${err.message || err}</p>`;
  }
}

async function getProviderChapterPages(provider, chapterId) {
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

function renderReader(title, pages, sourceProvider) {
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
            <button id="reader-prev" class="reader-pill" type="button">Prev</button>
            <label class="page-combo" for="reader-page-input">
              <input id="reader-page-input" class="reader-page-input" type="number" min="1" max="${pages.length}" value="1">
              <span>/ ${pages.length} Pages</span>
            </label>
            <button id="reader-next" class="reader-pill" type="button">Next</button>
          </div>
          <div class="reader-mode-row">
            <button id="reader-book-mode" class="manga-provider-btn reader-fit-btn active" type="button">Book</button>
            <button id="reader-fit-width" class="manga-provider-btn reader-fit-btn" type="button">Fit Width</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const img = document.getElementById('reader-page-image');
  const stage = document.getElementById('reader-stage');
  const prevBtn = document.getElementById('reader-prev');
  const nextBtn = document.getElementById('reader-next');
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
  let pageIndex = 0;
  let fitMode = 'book';
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
  };

  const setFitMode = (mode) => {
    fitMode = mode === 'width' ? 'width' : 'book';
    stage.classList.toggle('book-mode', fitMode === 'book');
    stage.classList.toggle('fit-width', fitMode === 'width');
    bookModeBtn.classList.toggle('active', fitMode === 'book');
    fitWidthBtn.classList.toggle('active', fitMode === 'width');
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
  nextBtn.onclick = () => setPage(pageIndex + 1);
  zonePrev.onclick = () => setPage(pageIndex - 1);
  zoneNext.onclick = () => setPage(pageIndex + 1);
  bookModeBtn.onclick = () => setFitMode('book');
  fitWidthBtn.onclick = () => setFitMode('width');
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
    if (readerModal.style.display !== 'block') return;
    if (e.key === 'ArrowLeft') setPage(pageIndex - 1);
    if (e.key === 'ArrowRight') setPage(pageIndex + 1);
  };
  window.addEventListener('keydown', readerKeyHandler);
  setupFullscreenControlsAutoHide();

  setFitMode('book');
  preloadIndex(0);
  preloadAround(0);
  setPage(0);
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

async function openChapter({ provider, chapterId, title, mangaTitle, chapterNumber }) {
  readerModal.style.display = 'block';
  readerBody.innerHTML = '<p style="padding:20px">Loading chapter...</p>';

  try {
    const pages = await getProviderChapterPages(provider, chapterId);
    renderReader(title, pages, provider);
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
    renderReader(title, fallback.pages, fallback.provider);
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

document.getElementById('manga-modal-close').onclick = () => { mangaModal.style.display = 'none'; };
document.getElementById('reader-modal-close').onclick = () => { readerModal.style.display = 'none'; cleanupReaderHandler(); };
const mangaModalFsBtn = document.getElementById('manga-modal-fs');
if (mangaModalFsBtn) mangaModalFsBtn.onclick = () => toggleModalFullscreen('manga-modal');
const readerModalFsBtn = document.getElementById('reader-modal-fs');
if (readerModalFsBtn) readerModalFsBtn.onclick = () => toggleModalFullscreen('reader-modal');
window.onclick = (e) => {
  if (e.target === mangaModal) mangaModal.style.display = 'none';
  if (e.target === readerModal) { readerModal.style.display = 'none'; cleanupReaderHandler(); }
};

searchBtn.addEventListener('click', runSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runSearch();
});

buildProviderToolbar();
loadDiscover();
