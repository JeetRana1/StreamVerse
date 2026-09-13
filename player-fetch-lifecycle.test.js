const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const html = fs.readFileSync(require('node:path').join(__dirname,'player.html'),'utf8');
const wrapper = html.slice(html.indexOf('        let fetchSourcesRunning = false;'),html.indexOf('        async function fetchSourcesForCurrentEpisode('));
function setup(work) {
    const timers = [];
    const context = vm.createContext({console, setTimeout:fn=>timers.push(fn),fetchSourcesForCurrentEpisode:work});
    vm.runInContext(wrapper,context);
    return {context,timers,fetch:()=>vm.runInContext('fetchSources(null)',context),running:()=>vm.runInContext('fetchSourcesRunning',context)};
}
test('Archive early return releases the fetch guard before the next episode',async()=>{
    let calls=0;
    const state=setup(async()=>{ calls++; return; });
    await state.fetch();
    assert.equal(state.running(),false);
    await state.fetch();
    assert.equal(calls,2);
});
test('fetch errors release the guard and queued navigation runs once for the latest selection',async()=>{
    let reject, calls=0, episode=4;
    const fetched=[];
    const state=setup(()=>{ calls++; fetched.push(episode); return calls===1 ? new Promise((_,r)=>{reject=r;}) : Promise.resolve(); });
    const first=state.fetch();
    episode=5; await state.fetch();
    episode=6; await state.fetch();
    reject(new Error('extraction failed'));
    await assert.rejects(first,/extraction failed/);
    assert.equal(state.running(),false);
    assert.equal(state.timers.length,1);
    await state.timers.shift()();
    assert.deepEqual(fetched,[4,6]);
    assert.equal(state.running(),false);
});
test('anikoto subtitle tracks use the Megaplay origin referer on CDN hosts',()=>{
    function extractSubFn() {
        const match = /        function normalizeSubtitleEntries\(/.exec(html);
        assert.ok(match);
        const end = html.indexOf('\n        }', match.index) + '\n        }'.length;
        return html.slice(match.index, end);
    }
    const normalize = vm.runInNewContext(`(${extractSubFn()})`, {
        MAX_EXTERNAL_SUBTITLE_TRACKS: 6,
        URL,
        location: { href: 'https://example.test/player.html' },
    });
    const track = { url: 'https://fetch.nexabloom.top/anime/abc/def/subtitles/eng-2.vtt', lang: 'English' };
    const rows = normalize([track], 'anikoto', 'https://anikoto.cz');
    assert.equal(rows[0].referer, 'https://megaplay.buzz/');
    const passthrough = normalize([
        { ...track, url: 'https://fetch.nexabloom.top/anime/abc/def/subtitles/eng-2.vtt', referer: 'https://megaplay.buzz/' },
        { url: 'https://subs.example/x.vtt', lang: 'English' },
    ], 'anikoto', 'https://anikoto.cz');
    assert.equal(passthrough[0].referer, 'https://megaplay.buzz/');
    assert.equal(passthrough[1].referer, 'https://anikoto.cz');
    const other = normalize([{ url: 'https://subs.example/x.vtt', lang: 'English' }], 'tv', 'https://provider.test');
    assert.equal(other[0].referer, 'https://provider.test');
});
