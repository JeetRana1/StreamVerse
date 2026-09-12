const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

function load(file, names, globals = {}) {
    const source = fs.readFileSync(`${__dirname}/${file}`, 'utf8');
    const context = vm.createContext(globals);
    for (const name of names) {
        const match = new RegExp(`^( *)function ${name}\\(`, 'm').exec(source);
        assert.ok(match, name);
        const end = source.indexOf(`\n${match[1]}}`, match.index);
        vm.runInContext(source.slice(match.index, end + match[1].length + 2), context);
    }
    return context;
}

for (const file of ['script.js', 'player.html']) {
    test(`${file}: circular badge formats episode scores out of ten, never series scores`, () => {
        const { renderEpisodeRatingBadge: badge } = load(file, ['renderEpisodeRatingBadge']);
        for (const [average, percent] of [[6.987, 70], [6.6, 66], [6.45, 65], [7.5, 75], [10, 100], [0, 0]]) {
            const html = badge({ vote_average: average, vote_count: 77 });
            const score = (percent / 10).toFixed(1);
            assert.ok(html.includes(` ${score}</span></span>`));
            assert.ok(html.includes(`style="--rating-progress:${percent}"`));
            for (const attr of ['aria-label', 'title']) {
                assert.ok(html.includes(`${attr}="TMDB episode rating: ${score}/10 from 77 votes"`));
            }
            assert.match(html, /class="episode-rating-value" aria-hidden="true"><i class="fa-solid fa-star"/);
        }
        for (const average of [null, undefined, NaN, Infinity, -1, 10.1, '7', '']) {
            assert.equal(badge({ vote_average: average, vote_count: 20 }), '');
        }
        for (const count of [0, null, undefined, NaN, Infinity, -1, 0.5, '10']) {
            assert.equal(badge({ vote_average: 8, vote_count: count }), '');
        }
        assert.equal(badge({ rating: 8.2, vote_count: 999 }), '');
        assert.equal(badge(null), '');
    });
}

const raw = { id: 7173957, show_id: 125988, season_number: 3, episode_number: 1, name: 'Who Are You?', vote_average: 6.987, vote_count: 77 };
test('homepage normalization and repeated merges preserve raw votes and playback ID; reject mismatches', () => {
    const c = load('script.js', ['getModalEpisodeNumber', 'getModalEpisodeTitle', 'extractModalSeasonEpisodes', 'normalizeModalDetailedEpisode', 'mergeModalSeasonEpisodeDetails']);
    const season = { _tmdbId: '125988', seasonNo: 3, episodes: [{ id: '125988-s3e1', episode: 1 }] };
    for (const count of [77, 0, null]) {
        c.mergeModalSeasonEpisodeDetails(season, { tmdb_id: '125988', episodes: [{ ...raw, vote_count: count }] });
        assert.equal(season.episodes[0].id, '125988-s3e1');
        assert.equal(season.episodes[0]._tmdbRating.vote_count, count);
        assert.equal(season.episodes[0].vote_average, 6.987);
    }
    for (const change of [{ show_id: 7 }, { season_number: 0 }, { season_number: null }, { episode_number: null }]) {
        c.mergeModalSeasonEpisodeDetails(season, { tmdb_id: '125988', episodes: [{ ...raw, ...change }] });
        assert.equal(season.episodes[0]._tmdbRating, null);
    }
    season.episodes = [{ id: 'provider-bonus', episode: 1 }];
    c.mergeModalSeasonEpisodeDetails(season, { tmdb_id: '125988', episodes: [raw] });
    assert.equal(season.episodes[0]._tmdbRating, null);
});

test('player cache and menu normalization retain votes; only exact TMDB identities get ratings', () => {
    const c = load('player.html', ['mergeTmdbSeasonEpisodeDetails', 'normalizeAndSortMenuEpisodes', 'getVerifiedEpisodeRating'], {
        TMDB_ID: '125988', MEDIA_NAMESPACE: 'tmdb', tmdbSeasonEpisodeDetailCache: new Map(),
        currentMediaInfo: { seasons: [{ season: 3, episodes: [{ id: '125988-s3e1', episode: 1 }] }] },
        pickEpisodeTitle: values => values.find(Boolean), getEpisodeMetadataTitle: ep => ep.name,
        isGenericEpisodeTitle: () => true, normalizeTitleForMatch: s => s,
        getEpisodeOrdinalForMenu: ep => ep.episode,
    });
    c.mergeTmdbSeasonEpisodeDetails({ tmdb_id: '125988', episodes: [raw] }, 3);
    const ep = c.normalizeAndSortMenuEpisodes(c.currentMediaInfo.seasons[0].episodes)[0];
    assert.equal(ep.id, '125988-s3e1');
    assert.equal(ep.vote_count, 77);
    assert.equal(c.getVerifiedEpisodeRating(ep, 3, 1).vote_average, 6.987);
    assert.equal(c.getVerifiedEpisodeRating({ id: 'provider-s3e1' }, 3, 1), null);
    assert.equal(c.getVerifiedEpisodeRating(ep, 0, 1), null);
    assert.equal(c.getVerifiedEpisodeRating(ep, 3, 2), null);
    c.MEDIA_NAMESPACE = 'anilist';
    assert.equal(c.getVerifiedEpisodeRating(ep, 3, 1), null);
    c.MEDIA_NAMESPACE = 'tmdb';
    c.mergeTmdbSeasonEpisodeDetails({ tmdb_id: '125988', episodes: [{ ...raw, season_number: 0, vote_count: 0 }] }, 0);
    assert.equal(c.getVerifiedEpisodeRating({ id: '125988-s0e1' }, 0, 1).vote_count, 0);
    assert.equal(c.getVerifiedEpisodeRating({ id: 'bonus1' }, 0, 1), null);
    c.mergeTmdbSeasonEpisodeDetails({ tmdb_id: '7', episodes: [raw] }, 3);
    assert.equal(c.getVerifiedEpisodeRating(ep, 3, 1), null);
});
