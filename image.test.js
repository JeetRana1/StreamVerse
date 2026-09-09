const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cover = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx269-test.jpg';

for (const file of ['script.js', 'anime-script.js']) {
    test(`${file}: history artwork accepts AniList without weakening host checks`, () => {
        const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
        const start = source.indexOf('function isTmdbImageUrl(');
        const end = source.indexOf('function coverUrl(', start);
        assert.ok(start >= 0 && end > start);
        const context = vm.createContext({ URL, window: { location: { href: 'http://localhost:3005/' } }, IMG_BASE: 'https://image.tmdb.org/t/p/' });
        vm.runInContext(source.slice(start, end), context);
        assert.equal(context.imgUrl(cover), cover);
        assert.equal(context.imgUrl(cover.replace('https:', '')), cover);
        assert.equal(context.imgUrl('/poster.jpg'), 'https://image.tmdb.org/t/p/w500/poster.jpg');
        for (const invalid of ['', 'javascript:alert(1)', 'https://anilist.co.evil.test/cover.jpg', 'https://anilist.co@evil.test/cover.jpg']) {
            assert.ok(context.imgUrl(invalid).includes('placehold.co'));
        }
    });
}

test('player saves AniList coverImage artwork and retains existing saved URLs', () => {
    const html = fs.readFileSync(path.join(__dirname, 'player.html'), 'utf8');
    const start = html.indexOf('        function isTmdbImageUrl(');
    const end = html.indexOf('        function updatePauseMediaPoster(', start);
    const context = vm.createContext({ URL, location: { href: 'http://localhost:3005/' } });
    vm.runInContext(html.slice(start, end), context);
    assert.equal(context.resolveMediaPosterUrl({ coverImage: { extraLarge: cover } }), cover);
    assert.equal(context.resolveMediaPosterUrl({ image: cover }), cover);
    assert.equal(context.resolveMediaPosterUrl({}, cover), cover);
});
