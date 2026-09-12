const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Jeet/Videos/fewfwewfd/api.consumet.org/node_modules/playwright');
const origin = 'http://localhost:3005';
const api = 'http://localhost:3000/meta/tmdb';
const live = process.env.LIVE_TMDB === '1';
const fixture = {
    tmdb_id: '125988', season_number: 3,
    episodes: [6.987, 6.6, 6.45, 8, null, 10, 0, 7.5].map((vote_average, i) => ({
        id: 7173957 + i, show_id: 125988, season_number: 3, episode_number: i + 1,
        name: i === 0 || i === 4 ? 'A Long Episode Title That Wraps in the Player Menu' : `Episode ${i + 1}`, overview: 'Episode-specific description.',
        vote_average, vote_count: i === 3 ? 0 : 77,
    })),
};

for (const width of [1440, 320, 390, 473]) {
    test(`${live ? 'live' : 'fixture'} Silo episode modal and player menu at ${width}px`, { timeout: 120000 }, async () => {
        const browser = await chromium.launch();
        try {
            const context = await browser.newContext({ viewport: { width, height: width < 769 ? 844 : 1000 }, isMobile: width < 769, hasTouch: width < 769 });
            const season = live ? await (await fetch(`${api}/info/125988?type=tv&season=3&details=true`)).json() : fixture;
            const rated = season.episodes.filter(ep => typeof ep.vote_average === 'number' && ep.vote_count > 0);
            const expected = rated.map(ep => (Math.round(ep.vote_average * 10) / 10).toFixed(1));
            const info = live ? await (await fetch(`${api}/info/125988?type=tv`)).json() : {
                id: '125988', title: 'Silo', type: 'tv', media_type: 'tv', rating: 9.9,
                seasons: [{ season: 3, name: 'Season 3', episodes: fixture.episodes.map(ep => ({
                    id: `125988-s3e${ep.episode_number}`, episode: ep.episode_number, title: ep.name,
                })) }],
            };
            const requests = [];
            await context.route('**/*', route => {
                const url = new URL(route.request().url());
                if (url.pathname.includes('/meta/tmdb') && url.searchParams.has('season')) requests.push(url.href);
                if (!live && url.pathname.includes('/meta/tmdb')) {
                    return route.fulfill({ json: url.searchParams.has('season') ? fixture : url.pathname.includes('/info') ? info : { results: [] } });
                }
                // Playback/provider extraction is unrelated to checking the episode menu.
                if (url.pathname.includes('/watch') || url.pathname.includes('/movies/') || url.pathname.includes('/anime/')) return route.fulfill({ json: { sources: [], results: [] } });
                return route.continue();
            });
            const page = await context.newPage();
            await page.goto(origin, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => typeof openDetails === 'function');
            await page.evaluate(info => openDetails('125988', 'tv', '', info), info);
            await page.locator('#modal-season-select').click();
            await page.locator('.modal-season-option[data-season="3"]').click();
            await page.waitForFunction(n => document.querySelectorAll('#modal-episodes-list .episode-rating').length === n, expected.length);
            const values = async selector => (await page.locator(selector).allTextContents()).map(text => text.trim());
            const checkRings = async selector => {
                const badges = page.locator(selector);
                for (let i = 0; i < await badges.count(); i++) {
                    const badge = badges.nth(i);
                    // Metadata can rebuild the live menu while Playwright is waiting for stability.
                    for (let attempt = 0; ; attempt++) {
                        try { await badge.scrollIntoViewIfNeeded(); break; }
                        catch (error) {
                            if (attempt >= 2 || !error.message.includes('not attached to the DOM')) throw error;
                        }
                    }
                    const label = `TMDB episode rating: ${expected[i]}/10 from ${rated[i].vote_count} votes`;
                    assert.equal(await badge.getAttribute('aria-label'), label);
                    assert.equal(await badge.getAttribute('title'), label);
                    const geometry = await badge.evaluate(node => {
                        const r = node.getBoundingClientRect();
                        const css = getComputedStyle(node);
                        const center = getComputedStyle(node, '::before');
                        const value = node.querySelector('.episode-rating-value').getBoundingClientRect();
                        const row = node.closest('.modal-episode-item, .ep-item');
                        const isModal = !!node.closest('.modal-episode-item');
                        const bounds = row.getBoundingClientRect();
                        const title = row.querySelector('strong, .ep-item-title').getBoundingClientRect();
                        const statusesFit = [...row.querySelectorAll('.modal-episode-current, .modal-episode-seen')].every(el => {
                            const b = el.getBoundingClientRect();
                            return b.left >= bounds.left && b.right <= bounds.right && b.top >= bounds.top && b.bottom <= bounds.bottom;
                        });
                        const overlaps = [...row.querySelectorAll('strong, .modal-episode-number, .modal-episode-seen, .modal-episode-current, .modal-episode-play, .modal-episode-progress, .ep-item-title, .ep-item-desc, .ep-progress, .ep-mark-seen-btn, .filler-badge, .ep-item-play-btn')].filter(el => {
                            const b = el.getBoundingClientRect();
                            return b.width > 0 && b.height > 0 && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
                        }).map(el => el.className);
                        const pill = row.querySelector('.ep-mark-seen-btn');
                        const pillRect = pill ? pill.getBoundingClientRect() : null;
                        return {
                            isModal, position: css.position, width: r.width, height: r.height, radius: css.borderRadius,
                            valueWidth: value.width, valueHeight: value.height,
                            background: css.backgroundImage, center: center.backgroundColor,
                            inset: center.top, centerRadius: center.borderRadius,
                            contained: r.left >= Math.max(0, bounds.left) && r.right <= Math.min(innerWidth, bounds.right) && r.top >= bounds.top && r.bottom <= bounds.bottom,
                            textFits: value.left >= r.left + 3 && value.right <= r.right - 3 && value.top >= r.top + 3 && value.bottom <= r.bottom - 3,
                            titleFits: title.top >= bounds.top && title.bottom <= bounds.bottom,
                            titleWidth: title.width,
                            statusesFit,
                            topGap: r.top - bounds.top, rightGap: bounds.right - r.right,
                            pillGap: pillRect ? pillRect.left - r.right : null,
                            pillAlign: pillRect ? Math.abs((r.top + r.bottom - pillRect.top - pillRect.bottom) / 2) : null,
                            pillRightGap: pillRect ? bounds.right - pillRect.right : null,
                            overlaps,
                        };
                    });
                    assert.equal(geometry.width, width < 769 ? 36 : 40);
                    // The absolute ::before fill must be anchored to the ring itself.
                    assert.equal(geometry.position, 'relative');
                    if (geometry.isModal) {
                        if (width < 769) {
                            // Mobile mirrors the desktop layout: the ring sits inline in the
                            // episode row, never pinned to a corner, and
                            // never overflows the row.
                            assert.ok(geometry.topGap >= 0 && geometry.rightGap >= 0, JSON.stringify(geometry));
                        }
                    } else {
                        // Player menu: the ring hugs the left edge of the mark-as-seen pill.
                        assert.ok(geometry.pillGap >= 0 && geometry.pillGap <= 16, JSON.stringify(geometry));
                        assert.ok(geometry.pillAlign <= 6, JSON.stringify(geometry));
                        assert.ok(geometry.pillRightGap >= 0 && geometry.pillRightGap <= 24, JSON.stringify(geometry));
                    }
                    assert.equal(geometry.height, geometry.width);
                    assert.equal(geometry.radius, '50%');
                    assert.match(geometry.background, /conic-gradient\(.*245, 158, 11/);
                    assert.equal(geometry.center, 'rgba(10, 10, 10, 0.88)');
                    assert.equal(geometry.inset, '2px');
                    assert.equal(geometry.centerRadius, '50%');
                    assert.equal(geometry.contained, true, JSON.stringify(geometry));
                    assert.equal(geometry.textFits, true, JSON.stringify(geometry));
                    assert.equal(geometry.titleFits, true, JSON.stringify(geometry));
                    if (width < 769) assert.ok(geometry.titleWidth >= 60, JSON.stringify(geometry));
                    assert.equal(geometry.statusesFit, true, JSON.stringify(geometry));
                    assert.deepEqual(geometry.overlaps, [], JSON.stringify(geometry));
                }
                await badges.first().scrollIntoViewIfNeeded();
            };
            assert.deepEqual(await values('#modal-episodes-list .episode-rating'), expected);
            if (!live) {
                // Exercise the existing status styles alongside a rating without changing history.
                await page.locator('.modal-episode-row').first().evaluate(row => {
                    row.insertAdjacentHTML('beforeend', '<span class="modal-episode-current">Currently watching</span><span class="modal-episode-seen">Seen</span>');
                    row.closest('.modal-episode-item').querySelector('.modal-episode-progress span').style.width = '43%';
                });
            }
            await checkRings('#modal-episodes-list .episode-rating');
            if (width < 769) {
                const rows = await page.locator('.modal-episode-item').evaluateAll(nodes => nodes.map(row => {
                    const r = row.getBoundingClientRect();
                    const play = row.querySelector('.modal-episode-play').getBoundingClientRect();
                    const copy = row.querySelector('.modal-episode-copy').getBoundingClientRect();
                    return { visible: play.width > 0 && play.height > 0,
                        centered: Math.abs((play.top + play.bottom - r.top - r.bottom) / 2) < 1,
                        gutter: copy.right < play.left, rightGap: r.right - play.right };
                }));
                for (const row of rows) {
                    assert.ok(row.visible && row.centered && row.gutter && row.rightGap < 24, JSON.stringify(row));
                }
            }
            await page.locator('#modal-episodes-list').scrollIntoViewIfNeeded();
            if (live) await page.waitForFunction(() => {
                const img = document.querySelector('.modal-episode-thumb img');
                return img?.complete;
            });
            await page.locator('.modal-episodes-section').evaluate(el => el.scrollIntoView({ block: 'start' }));
            await page.screenshot({ path: `C:/Users/Jeet/AppData/Local/Temp/opencode/ratings-${live ? 'live' : 'fixture'}-home-${width}.png` });
            const watchUrl = await page.locator('.modal-episode-item').first().getAttribute('data-watch-url');
            const play = page.locator('.modal-episode-item').first().locator('.modal-episode-play');
            if (width > 768) {
                await play.click({ force: true });
                await page.waitForURL(`${origin}${watchUrl}`);
            } else {
                await play.tap();
                await page.waitForURL(`${origin}${watchUrl}`);
            }
            await page.waitForFunction(() => typeof buildEpPanel === 'function' && document.querySelectorAll('#ep-panel .ep-item').length > 0, null, { timeout: 60000 });
            // Playback is isolated, so open via the production menu action rather than waiting for media controls.
            await page.evaluate(() => toggleEpPanel());
            await page.locator('#ep-panel.open').waitFor();
            await page.locator('.ep-season-tabs button').filter({ hasText: 'Season 3' }).click();
            await page.waitForFunction(n => document.querySelectorAll('#ep-panel .ep-item:not([hidden]) .episode-rating').length === n, expected.length);
            assert.deepEqual(await values('#ep-panel .ep-item:not([hidden]) .episode-rating'), expected);
            if (!live) {
                await page.locator('#ep-panel .ep-item:not([hidden])').nth(1).locator('.ep-mark-seen-btn').click();
                await page.locator('#ep-panel .ep-item:not([hidden])').first().evaluate(row => {
                    row.querySelector('.ep-progress-fill').style.setProperty('--ep-progress', '43%');
                    row.querySelector('.ep-progress-label').textContent = '43%';
                });
                await page.locator('#ep-panel .ep-item:not([hidden])').last().evaluate(row => {
                    row.insertAdjacentHTML('beforeend', '<span class="filler-badge filler">Filler</span>');
                });
            }
            await checkRings('#ep-panel .ep-item:not([hidden]) .episode-rating');
            if (!live) {
                assert.equal(await page.locator('#ep-panel .ep-item:not([hidden])').nth(1).locator('.ep-mark-seen-btn').getAttribute('aria-pressed'), 'true');
            }
            if (width < 769) {
                const layouts = await page.locator('#ep-panel .ep-item:not([hidden])').evaluateAll(nodes => nodes.map(row => {
                    const title = row.querySelector('.ep-item-title').getBoundingClientRect();
                    const progress = row.querySelector('.ep-progress').getBoundingClientRect();
                    const r = row.getBoundingClientRect();
                    const play = row.querySelector('.ep-item-play-btn').getBoundingClientRect();
                    const controls = [...row.querySelectorAll('.ep-mark-seen-btn, .filler-badge, .episode-rating, .ep-item-desc, .ep-item-play-btn')];
                    return {
                        titleWidth: title.width,
                        playVisible: play.width > 0 && play.height > 0,
                        playCentered: Math.abs((play.top + play.bottom - r.top - r.bottom) / 2) < 1,
                        playRightGap: r.right - play.right,
                        clear: [title, progress].every(t => controls.every(node => {
                            const b = node.getBoundingClientRect();
                            return t.right <= b.left || t.left >= b.right || t.bottom <= b.top || t.top >= b.bottom;
                        })),
                    };
                }));
                for (const layout of layouts) {
                    assert.ok(layout.titleWidth >= 60 && layout.clear && layout.playVisible && layout.playCentered && layout.playRightGap < 24, JSON.stringify(layout));
                }
            }
            await page.screenshot({ path: `C:/Users/Jeet/AppData/Local/Temp/opencode/ratings-${live ? 'live' : 'fixture'}-player-${width}.png` });
            const overflowing = await page.locator('.episode-rating:visible').evaluateAll(nodes => nodes.some(node => {
                const r = node.getBoundingClientRect();
                return r.left < 0 || r.right > innerWidth;
            }));
            assert.equal(overflowing, false);
            assert.ok(requests.every(url => !url.includes('/episode/')));
            console.log(JSON.stringify({ width, live, expected, seasonRequests: requests.length }));
        } finally { await browser.close(); }
    });
}
