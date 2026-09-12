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
