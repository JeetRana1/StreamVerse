const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(`${__dirname}/player.html`, 'utf8');
function extract(name) {
    const start = html.indexOf(`        function ${name}(`);
    assert.ok(start >= 0, name);
    return html.slice(start, html.indexOf('\n        }', start) + 10);
}
function harness() {
    const frames = [], writes = [], observed = [], listeners = {};
    function media(width = 1920, height = 1080) {
        const styles = new Map(), events = {};
        return {
            videoWidth: width, videoHeight: height, events,
            addEventListener: (name, fn) => { events[name] = fn; },
            style: {
                getPropertyValue: name => styles.get(name),
                setProperty: (name, value) => { styles.set(name, value); writes.push([name, value]); },
            },
        };
    }
    const c = vm.createContext({
        USE_ANDROID_VIDEO_LAYOUT: true,
        video: media(), playerWrap: { clientWidth: 844, clientHeight: 390 },
        fitModes: [{ value: 'contain' }, { value: 'cover' }, { value: 'fill' }], fitIndex: 0,
        videoLayoutFrame: 0, videoLayoutObserver: null,
        window: { devicePixelRatio: 2.75, addEventListener: (name, fn) => { listeners[name] = fn; } },
        document: { addEventListener: (name, fn) => { listeners[name] = fn; } },
        ResizeObserver: class {
            constructor(fn) { this.callback = fn; }
            observe(el) { observed.push(el); }
        },
        requestAnimationFrame: fn => frames.push(fn),
    });
    for (const name of ['getVideoSurfaceRect', 'syncVideoSurfaceLayout', 'scheduleVideoSurfaceLayout', 'bindVideoSurfaceLayout']) {
        vm.runInContext(extract(name), c);
    }
    return { c, frames, writes, observed, listeners, media };
}

test('contain, cover and stretch stay centered on physical pixels through rotation and fractional DPR', () => {
    const { c } = harness();
    for (const [w, h] of [[844, 390], [390, 844], [915, 412], [873, 393]]) {
        for (const [vw, vh] of [[1920, 1080], [1920, 800], [720, 1280]]) {
            for (const dpr of [1, 2, 2.625, 2.75, 3]) {
                for (const fit of ['contain', 'cover', 'fill']) {
                    const r = c.getVideoSurfaceRect(w, h, vw, vh, fit, dpr);
                    const round = fit === 'contain' ? Math.floor : Math.ceil;
                    const bw = round(w * dpr) / dpr, bh = round(h * dpr) / dpr;
                    for (const value of Object.values(r)) assert.ok(Math.abs(value * dpr - Math.round(value * dpr)) < 1e-8);
                    assert.ok(Math.abs(r.left - (bw - r.width) / 2) <= 1 / dpr);
                    assert.ok(Math.abs(r.top - (bh - r.height) / 2) <= 1 / dpr);
                    if (fit === 'contain') assert.ok(r.width <= w && r.height <= h && r.left >= 0 && r.top >= 0);
                    if (fit === 'cover') assert.ok(r.width >= w && r.height >= h && r.left <= 0 && r.top <= 0);
                    if (fit === 'fill') {
                        assert.deepEqual({ ...r }, { left: 0, top: 0, width: bw, height: bh });
                        assert.ok(r.width >= w && r.height >= h, 'stretch must cover the final physical pixel');
                    }
                    if (fit !== 'fill') assert.ok(Math.abs(r.width - r.height * vw / vh) <= (1 + vw / vh) / dpr);
                }
            }
        }
    }
    assert.equal(c.getVideoSurfaceRect(844, 390, 0, 0, 'contain'), null);
});

test('layout responds to fullscreen, viewport and rendition changes without perpetual style writes', () => {
    const { c, frames, writes, observed, listeners, media } = harness();
    c.bindVideoSurfaceLayout();
    assert.equal(writes.length, 4);
    c.syncVideoSurfaceLayout();
    c.video.events.loadedmetadata({ currentTarget: c.video });
    assert.equal(writes.length, 4);
    c.playerWrap.clientWidth = 390;
    c.playerWrap.clientHeight = 844;
    listeners.resize(); listeners.fullscreenchange(); c.videoLayoutObserver.callback();
    assert.equal(frames.length, 1);
    frames.shift()();
    assert.equal(c.videoLayoutFrame, 0);
    assert.ok(writes.length > 4);
    const oldVideo = c.video;
    c.video = media(1920, 800);
    c.bindVideoSurfaceLayout();
    assert.equal(observed.length, 1);
    const before = writes.length;
    oldVideo.events.resize({ currentTarget: oldVideo });
    assert.equal(writes.length, before);
    c.fitIndex = 2;
    c.video.events.resize({ currentTarget: c.video });
    assert.equal(c.video.style.getPropertyValue('--video-surface-left'), '0px');
    assert.equal(c.video.style.getPropertyValue('--video-surface-top'), '0px');
    c.USE_ANDROID_VIDEO_LAYOUT = false;
    const after = writes.length;
    c.fitIndex = 0; c.syncVideoSurfaceLayout();
    assert.equal(writes.length, after);
});

test('Android fit changes never capture a canvas or activate the source-switch mask', () => {
    const c = vm.createContext({
        USE_ANDROID_VIDEO_LAYOUT: true,
        calls: 0,
        captureVideoFrameToOverlay: () => assert.fail('fit changes must not read back the video'),
    });
    vm.runInContext('function applyFitMode() { calls++; }' + extract('applyFitModeWithFrame'), c);
    for (let i = 0; i < 12; i++) c.applyFitModeWithFrame();
    assert.equal(c.calls, 12);
});
