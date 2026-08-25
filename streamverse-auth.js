(function () {
    'use strict';

    const LOCAL_KEY = 'sv_continue_watching';
    const state = { user: null, ready: false };

    function collection() {
        if (!state.user || !window.firebaseDb) return null;
        return window.firebaseDb.collection('users').doc(state.user.uid).collection('continueWatching');
    }

    async function syncLocalToCloud() {
        const ref = collection();
        if (!ref) return;
        let local = {};
        try { local = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch (_) { }
        if (!Array.isArray(local)) return;
        await Promise.all(local.map(async (item) => {
            const docRef = ref.doc(`${item.type || 'movie'}_${item.id}`);
            const existing = await docRef.get();
            const cloudItem = existing.exists ? existing.data() : null;
            if (!cloudItem || Number(item.lastUpdated || 0) >= Number(cloudItem.lastUpdated || 0)) {
                await docRef.set({ ...item, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
            }
        }));
    }

    async function loadCloudToLocal() {
        const ref = collection();
        if (!ref) return;
        const snapshot = await ref.get();
        const cloud = snapshot.docs.map((doc) => doc.data()).filter((item) => item?.id);
        if (cloud.length) localStorage.setItem(LOCAL_KEY, JSON.stringify(cloud.sort((a, b) => Number(b.lastUpdated || 0) - Number(a.lastUpdated || 0))));
        window.dispatchEvent(new CustomEvent('streamverse-auth-ready', { detail: { user: state.user, items: cloud } }));
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
    };

    function updateAuthButton() {
        const button = document.getElementById('streamverse-auth-button');
        const menu = document.getElementById('account-menu');
        const settings = document.getElementById('account-settings');
        const logout = document.getElementById('account-logout');
        if (!button) return;
        const activeUser = state.user || window.firebaseAuth?.currentUser || null;
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
            logout && (logout.onclick = async () => { button.disabled = true; menu?.classList.remove('open'); await signOut(); state.user = null; updateAuthButton(); button.disabled = false; });
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
        state.user = user;
        state.ready = true;
        window.dispatchEvent(new CustomEvent('streamverse-auth-changed', { detail: { user } }));
        updateAuthButton();
        // Do not block the signed-in UI while Firestore reconciles local data.
        try { if (user) { await syncLocalToCloud(); await loadCloudToLocal(); } } catch (error) { console.warn('[auth] sync failed:', error); }
    });
    document.addEventListener('DOMContentLoaded', updateAuthButton);
})();
