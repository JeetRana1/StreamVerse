(function () {
    'use strict';

    const LOCAL_KEY = 'sv_continue_watching';
    const PENDING_KEY_PREFIX = 'sv_pending_merge_local_';
    const state = { user: null, ready: false, reconcilePromise: Promise.resolve() };

    function pendingKeyFor(uid) {
        return `${PENDING_KEY_PREFIX}${uid || 'guest'}`;
    }

    function pendingKey() {
        return pendingKeyFor(state.user?.uid);
    }

    function readPendingItems() {
        let items = [];
        try { items = JSON.parse(localStorage.getItem(pendingKey()) || '[]'); } catch (_) { }
        return Array.isArray(items) ? items.filter((item) => item?.id) : [];
    }

    function collection() {
        if (!state.user || !window.firebaseDb) return null;
        return window.firebaseDb.collection('users').doc(state.user.uid).collection('continueWatching');
    }

    function readLocalItems() {
        let local = {};
        try { local = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch (_) { }
        return Array.isArray(local) ? local.filter((item) => item?.id) : [];
    }

    function itemKey(item) {
        return `${item?.type || 'movie'}_${item?.id}`;
    }

    function newestItem(first, second) {
        return Number(second?.lastUpdated || 0) > Number(first?.lastUpdated || 0) ? second : first;
    }

    function itemFingerprint(item) {
        return JSON.stringify(Object.keys(item || {}).sort().filter((key) => key !== 'updatedAt').map((key) => [key, item[key]]));
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    }

    function itemPoster(item) {
        const value = item?.poster || item?.posterUrl || item?.image || item?.poster_path || '';
        if (!value) return 'https://placehold.co/160x240/171923/e50914?text=No+Poster';
        return /^https?:\/\//i.test(value) ? value : `https://image.tmdb.org/t/p/w342${value}`;
    }

    function ensureMergeModalStyles() {
        if (document.getElementById('streamverse-merge-modal-styles')) return;
        const style = document.createElement('style');
        style.id = 'streamverse-merge-modal-styles';
        style.textContent = `
          .lg-17, .lg-17 *, .lg-17 *::before, .lg-17 *::after { box-sizing: border-box; margin: 0; padding: 0; }
          .lg-17 { --accent: oklch(.66 .19 285); font-family: 'Segoe UI', system-ui, sans-serif; position: relative; width: 100%; min-height: 100vh; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 40px 20px; background: #0c0a18; }
          .lg-17__mesh { display: none; }
          .lg-17__card { position: relative; z-index: 2; width: min(820px, 100%); padding: 0; border-radius: 25px; color: #fff; background: rgba(10,11,15,.78); border: 1px solid rgba(255,255,255,.2); box-shadow: 0 26px 80px rgba(0,0,0,.66), inset 0 1px rgba(255,255,255,.14); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); }
          .sv-merge-backdrop { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 20px; background: rgba(3,4,8,.72); backdrop-filter: blur(14px); }
          .sv-merge-root { position: fixed; inset: 0; z-index: 10000; }
          .sv-merge-backdrop.lg-17 { display: flex !important; min-height: 100vh; padding: 20px; background: rgba(3,4,8,.72); }
          .sv-merge-modal { position: relative !important; display: flex !important; flex-direction: column !important; justify-content: flex-start !important; width: min(820px, 100%) !important; height: min(860px, calc(100vh - 40px)); overflow: hidden; }
          .sv-merge-modal::-webkit-scrollbar { display: none; }
          .sv-merge-scroll { flex: 1 1 auto; min-height: 0; overflow-x: hidden; overflow-y: auto; padding-bottom: 92px; scrollbar-width: thin; scrollbar-color: rgba(142,177,241,.72) transparent; }
          .sv-merge-scroll::-webkit-scrollbar { width: 7px; height: 7px; background: transparent; }
          .sv-merge-scroll::-webkit-scrollbar-track { background: transparent; }
          .sv-merge-scroll::-webkit-scrollbar-button, .sv-merge-scroll::-webkit-scrollbar-corner { display: none; width: 0; height: 0; background: transparent; }
          .sv-merge-scroll::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 999px; background: rgba(142,177,241,.72); background-clip: padding-box; }
          .sv-merge-modal::-webkit-scrollbar { width: 7px; height: 7px; background: transparent; }
          .sv-merge-modal::-webkit-scrollbar-track { background: transparent; }
          .sv-merge-modal::-webkit-scrollbar-button,
          .sv-merge-modal::-webkit-scrollbar-button:single-button,
          .sv-merge-modal::-webkit-scrollbar-button:start,
          .sv-merge-modal::-webkit-scrollbar-button:end { display: none; width: 0; height: 0; background: transparent; }
          .sv-merge-modal::-webkit-scrollbar-corner { background: transparent; }
          .sv-merge-modal::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 999px; background: rgba(142,177,241,.72); background-clip: padding-box; }
          .sv-merge-modal::-webkit-scrollbar-thumb:hover { background: rgba(181,207,255,.95); background-clip: padding-box; }
          .sv-merge-modal > .sv-merge-header { position: static !important; inset: auto !important; display: block !important; flex: 0 0 auto !important; width: auto !important; height: auto !important; padding: 32px 34px 22px; border-bottom: 1px solid rgba(255,255,255,.12); background: transparent; transform: none !important; }
          .sv-merge-copy { flex: 0 0 auto; padding: 30px 34px 4px; }
          .sv-merge-copy h2 { margin: 0 0 8px; font: 500 28px/1.2 "Space Grotesk", sans-serif; letter-spacing: -.04em; }
          .sv-merge-copy p { margin: 0; color: rgba(255,255,255,.62); font-size: 14px; line-height: 1.5; }
          .sv-merge-kicker { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: #a9c7ff; font-size: 10px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
          .sv-merge-kicker::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: #7eb0ff; box-shadow: 0 0 14px #7eb0ff; }
          .sv-merge-header h2 { margin: 0 0 8px; font: 600 26px/1.2 "Space Grotesk", system-ui, sans-serif; letter-spacing: -.02em; }
          .sv-merge-header p { margin: 0; color: rgba(245,244,255,.68); font-size: 14px; line-height: 1.5; }
          .sv-merge-list { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: max-content !important; align-content: start !important; flex: 0 0 auto !important; height: auto !important; min-height: 0 !important; gap: 18px 14px; overflow: visible; padding: 24px 30px 30px; }
          .sv-merge-item { min-width: 0; padding: 8px; border: 1px solid rgba(255,255,255,.2); border-radius: 16px; background: rgba(255,255,255,.055); transition: transform .2s ease, border-color .2s ease, background .2s ease; }
          .sv-merge-item:hover { transform: translateY(-3px); border-color: rgba(171,202,255,.38); background: rgba(255,255,255,.09); }
          .sv-merge-item img { display: block; width: 100%; aspect-ratio: 2/3; object-fit: cover; border-radius: 10px; background: #20222d; box-shadow: 0 8px 18px rgba(0,0,0,.3); }
          .sv-merge-item strong { display: block; overflow: hidden; margin: 9px 2px 0; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
          .sv-merge-item span { display: block; overflow: hidden; margin: 4px 2px 1px; color: #a9d2ff; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
          .sv-merge-modal > .sv-merge-actions { position: absolute !important; right: 34px; bottom: 30px; z-index: 4; display: flex !important; justify-content: flex-end; gap: 10px; width: auto !important; height: auto !important; padding: 0; border: 0; background: transparent !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; transform: none !important; }
          .sv-merge-actions button { min-height: 42px; padding: 0 18px; border: 1px solid rgba(255,255,255,.2); border-radius: 12px; background: rgba(255,255,255,.08); color: #fff; cursor: pointer; font: 600 13px inherit; }
          .sv-merge-actions .sv-merge-confirm { position: relative; overflow: hidden; padding: 11px 26px; border: 1px solid rgba(255,93,89,.58); border-radius: 14px; background: rgba(255,54,61,.16); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); color: #ffaaa5; font-size: .92rem; font-weight: 800; box-shadow: 0 10px 25px rgba(190,24,45,.2), inset 0 1px rgba(255,255,255,.16); transition: transform .25s ease, background .25s ease, color .25s ease, border-color .25s ease, box-shadow .25s ease, filter .25s ease; }
          .sv-merge-actions .sv-merge-confirm::before { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.24), transparent); transition: left .5s; }
          .sv-merge-actions .sv-merge-confirm:hover::before { left: 100%; }
          .sv-merge-actions .sv-merge-confirm:hover { background: rgba(255,70,76,.29); color: #fff; transform: translateY(-3px); border-color: #ff7771; filter: brightness(1.1); box-shadow: 0 12px 30px rgba(214,31,54,.38), inset 0 1px rgba(255,255,255,.24); }
          .sv-merge-actions button:hover { filter: brightness(1.12); }
          .sv-merge-retry-button { display: grid; width: 42px; height: 42px; margin-right: 8px; place-items: center; border: 1px solid rgba(255,93,89,.58); border-radius: 14px; background: rgba(255,54,61,.16); color: #ffaaa5; cursor: pointer; box-shadow: 0 8px 20px rgba(190,24,45,.18), inset 0 1px rgba(255,255,255,.14); transition: .25s ease; }
          .sv-merge-retry-button:hover { transform: translateY(-2px); border-color: #ff7771; background: rgba(255,70,76,.29); color: #fff; }
          @media (max-width: 520px) { .sv-merge-copy { padding: 22px 20px 2px; } .sv-merge-copy h2 { font-size: 22px; } .sv-merge-scroll { padding-bottom: 82px; } .sv-merge-list { grid-template-columns: repeat(3, minmax(80px, 1fr)); gap: 12px 8px; padding: 18px 20px 24px; } .sv-merge-item { padding: 6px; border-radius: 12px; } .sv-merge-modal > .sv-merge-actions { right: 20px; bottom: 20px; } .sv-merge-actions button { flex: 1; padding: 0 10px; } }
        `;
        document.head.appendChild(style);
    }

    function showMergePrompt(local, cloud) {
        ensureMergeModalStyles();
        const localKeys = new Set(local.map(itemKey));
        const cloudKeys = new Set(cloud.map(itemKey));
        const items = [...new Map([...local, ...cloud].map((item) => [itemKey(item), item])).values()];
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'sv-merge-root';
            backdrop.innerHTML = `<section class="lg-17 sv-merge-backdrop" role="dialog" aria-modal="true" aria-label="Library sync">
              <div class="lg-17__mesh" aria-hidden="true"></div><form class="lg-17__card sv-merge-modal" novalidate>
              <div class="sv-merge-scroll"><div class="sv-merge-copy"><div class="sv-merge-kicker">Library sync</div><h2>Keep your library in sync?</h2><p>We found ${items.length} saved title${items.length === 1 ? '' : 's'} on this device and in your StreamVerse account. Choose whether to combine them and keep everything together.</p></div>
              <div class="sv-merge-list">${items.map((item) => { const key = itemKey(item); const source = localKeys.has(key) && cloudKeys.has(key) ? 'On device + account' : localKeys.has(key) ? 'On this device' : 'In your account'; return `<article class="sv-merge-item"><img src="${escapeHtml(itemPoster(item))}" alt="" loading="lazy"><strong title="${escapeHtml(item.title || item.name || 'Untitled')}">${escapeHtml(item.title || item.name || 'Untitled')}</strong><span>${source}</span></article>`; }).join('')}</div></div>
              <div class="sv-merge-actions"><button type="button" data-merge-skip>Not now</button><button type="button" class="sv-merge-confirm" data-merge-confirm>Merge and keep all</button></div>
              </form></section>`;
            const finish = (merge) => { backdrop.remove(); resolve(merge); };
            backdrop.querySelector('[data-merge-confirm]').addEventListener('click', () => finish(true));
            backdrop.querySelector('[data-merge-skip]').addEventListener('click', () => finish(false));
            document.body.appendChild(backdrop);
        });
    }

    async function reconcileLocalAndCloud() {
        const ref = collection();
        if (!ref) return;
        const local = readLocalItems();
        if (!local.length && readPendingItems().length) {
            updateAuthButton();
            window.dispatchEvent(new CustomEvent('streamverse-auth-ready', { detail: { user: state.user, items: [] } }));
            return;
        }
        const snapshot = await ref.get();
        const cloud = snapshot.docs.map((doc) => doc.data()).filter((item) => item?.id);
        const localMap = new Map(local.map((item) => [itemKey(item), item]));
        const cloudMap = new Map(cloud.map((item) => [itemKey(item), item]));
        const needsPrompt = local.some((item) => {
            const cloudItem = cloudMap.get(itemKey(item));
            return !cloudItem || itemFingerprint(item) !== itemFingerprint(cloudItem);
        }) || cloud.some((item) => !localMap.has(itemKey(item)));
        let finalItems = cloud;
        if (needsPrompt && (local.length || cloud.length)) {
            const shouldMerge = await showMergePrompt(local, cloud);
            if (shouldMerge) {
                finalItems = [...new Map([...cloud, ...local].map((item) => [itemKey(item), item])).values()]
                    .map((item) => newestItem(localMap.get(itemKey(item)), cloudMap.get(itemKey(item))) || item);
                await Promise.all(finalItems.map((item) => ref.doc(itemKey(item)).set({ ...item, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })));
            } else {
                // Declining means this signed-in session should show no continue-watching data.
                if (local.length) localStorage.setItem(pendingKey(), JSON.stringify(local));
                finalItems = [];
                localStorage.removeItem(LOCAL_KEY);
            }
        }
        finalItems = finalItems.sort((a, b) => Number(b.lastUpdated || 0) - Number(a.lastUpdated || 0));
        if (finalItems.length) localStorage.setItem(LOCAL_KEY, JSON.stringify(finalItems));
        else if (needsPrompt) localStorage.removeItem(LOCAL_KEY);
        updateAuthButton();
        window.dispatchEvent(new CustomEvent('streamverse-auth-ready', { detail: { user: state.user, items: finalItems } }));
    }

    async function reopenMergePrompt() {
        const local = readPendingItems();
        const ref = collection();
        if (!local.length || !ref) return;
        const snapshot = await ref.get();
        const cloud = snapshot.docs.map((doc) => doc.data()).filter((item) => item?.id);
        const shouldMerge = await showMergePrompt(local, cloud);
        if (!shouldMerge) return;
        const localMap = new Map(local.map((item) => [itemKey(item), item]));
        const cloudMap = new Map(cloud.map((item) => [itemKey(item), item]));
        const merged = [...new Map([...cloud, ...local].map((item) => [itemKey(item), item])).values()]
            .map((item) => newestItem(localMap.get(itemKey(item)), cloudMap.get(itemKey(item))) || item)
            .sort((a, b) => Number(b.lastUpdated || 0) - Number(a.lastUpdated || 0));
        await Promise.all(merged.map((item) => ref.doc(itemKey(item)).set({ ...item, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })));
        localStorage.setItem(LOCAL_KEY, JSON.stringify(merged));
        localStorage.removeItem(pendingKey());
        updateAuthButton();
        window.dispatchEvent(new CustomEvent('streamverse-auth-ready', { detail: { user: state.user, items: merged } }));
    }

    async function signInGoogle() {
        const provider = new firebase.auth.GoogleAuthProvider();
        await window.firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        return window.firebaseAuth.signInWithPopup(provider);
    }

    async function signInEmail(email, password) {
        await window.firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        return window.firebaseAuth.signInWithEmailAndPassword(email, password);
    }
    async function signUpEmail(email, password, displayName) {
        await window.firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        const result = await window.firebaseAuth.createUserWithEmailAndPassword(email, password);
        if (displayName && result.user) await result.user.updateProfile({ displayName });
        return result;
    }
    async function resetPassword(email) {
        const host = window.location.hostname || 'localhost';
        const apiBase = `${window.location.protocol}//${host}:3000`;
        const response = await fetch(`${apiBase}/auth/password-reset`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Unable to send password reset email');
        return result;
    }
    async function signOut() { return window.firebaseAuth.signOut(); }

    async function saveItem(item) {
        const ref = collection();
        if (!ref || !item?.id) return;
        await ref.doc(`${item.type || 'movie'}_${item.id}`).set({ ...item, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }

    window.StreamVerseAuth = {
        state,
        signInGoogle,
        signInEmail,
        signUpEmail,
        resetPassword,
        signOut,
        saveItem,
        getUser: () => state.user,
        whenReady: () => state.reconcilePromise,
    };

    function updateAuthButton() {
        const button = document.getElementById('streamverse-auth-button');
        const menu = document.getElementById('account-menu');
        const settings = document.getElementById('account-settings');
        const logout = document.getElementById('account-logout');
        if (!button) return;
        const activeUser = state.user || window.firebaseAuth?.currentUser || null;
        const wrap = button.closest('.account-menu-wrap');
        let retryButton = document.getElementById('streamverse-merge-retry-button');
        const headerActions = document.querySelector('.header-actions');
        if (activeUser && readPendingItems().length && headerActions) {
            ensureMergeModalStyles();
            if (!retryButton) {
                retryButton = document.createElement('button');
                retryButton.id = 'streamverse-merge-retry-button';
                retryButton.className = 'sv-merge-retry-button';
                retryButton.type = 'button';
                retryButton.title = 'Review library sync';
                retryButton.setAttribute('aria-label', 'Review library sync');
                retryButton.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i>';
                retryButton.addEventListener('click', async () => {
                    retryButton.disabled = true;
                    try { await reopenMergePrompt(); } catch (error) { console.warn('[auth] merge review failed:', error); }
                    retryButton.disabled = false;
                });
                const mobileMenu = document.getElementById('mobile-menu-toggle');
                headerActions.insertBefore(retryButton, mobileMenu || wrap);
            }
            retryButton.hidden = false;
        } else if (retryButton) {
            retryButton.remove();
        }
        if (!state.ready && window.firebaseAuth) {
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span class="auth-label">Checking account...</span>';
            button.onclick = null;
            return;
        }
        button.disabled = false;
        if (activeUser) {
            state.user = activeUser;
            const label = activeUser.displayName || activeUser.email || 'Account';
            const initials = label.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
            let localPhoto = '';
            try { localPhoto = localStorage.getItem('streamverse_local_profile_photo') || ''; } catch (_) { }
            const photoUrl = String(localPhoto || activeUser.photoURL || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
            button.classList.add('is-signed-in');
            button.innerHTML = `${photoUrl ? `<img class="auth-avatar" src="${photoUrl}" alt="">` : `<span class="auth-avatar">${initials}</span>`}<span class="auth-label">${label}</span><i class="fa-solid fa-chevron-down auth-chevron"></i>`;
            button.title = 'Sign out';
            button.onclick = () => { menu?.classList.toggle('open'); menu?.setAttribute('aria-hidden', String(!menu.classList.contains('open'))); };
            settings && (settings.onclick = () => { menu?.classList.remove('open'); location.href = '/settings.html'; });
            logout && (logout.onclick = async () => { button.disabled = true; menu?.classList.remove('open'); await signOut(); updateAuthButton(); button.disabled = false; });
        } else {
            button.classList.remove('is-signed-in');
            button.innerHTML = '<i class="fa-regular fa-user"></i><span class="auth-label">Login / Signup</span>';
            button.title = 'Login or create an account';
            button.onclick = () => { location.href = '/login.html'; };
            menu?.classList.remove('open');
        }
    }

    document.addEventListener('click', (event) => {
        const wrap = document.querySelector('.account-menu-wrap');
        const menu = document.getElementById('account-menu');
        if (menu && wrap && !wrap.contains(event.target)) menu.classList.remove('open');
    });

    if (!window.firebase || !window.streamVerseFirebaseConfig?.apiKey) return;
    if (!firebase.apps.length) firebase.initializeApp(window.streamVerseFirebaseConfig);
    window.firebaseAuth = firebase.auth();
    window.firebaseDb = firebase.firestore();
    window.firebaseAuth.onAuthStateChanged(async (user) => {
        const previousUser = state.user;
        let restoredItems = [];
        if (!user && previousUser) {
            try { restoredItems = JSON.parse(localStorage.getItem(pendingKeyFor(previousUser.uid)) || '[]'); } catch (_) { restoredItems = []; }
            if (!Array.isArray(restoredItems)) restoredItems = [];
            if (restoredItems.length) localStorage.setItem(LOCAL_KEY, JSON.stringify(restoredItems));
            localStorage.removeItem(pendingKeyFor(previousUser.uid));
        }
        state.user = user;
        state.ready = true;
        window.dispatchEvent(new CustomEvent('streamverse-auth-changed', { detail: { user } }));
        updateAuthButton();
        state.reconcilePromise = user ? reconcileLocalAndCloud().catch((error) => console.warn('[auth] sync failed:', error)) : Promise.resolve();
        if (!user && restoredItems.length) {
            window.dispatchEvent(new CustomEvent('streamverse-auth-ready', { detail: { user: null, items: restoredItems } }));
        }
    });
    document.addEventListener('DOMContentLoaded', updateAuthButton);
})();
