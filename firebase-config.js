// ═══════════════════════════════════════════════════════
//  FIREBASE — Configuration
//  Remplace les valeurs ci-dessous par celles de TON projet
//  (Console Firebase → ⚙️ Paramètres du projet → Tes applications → SDK config)
// ═══════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeAuth, browserSessionPersistence, indexedDBLocalPersistence, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAxHXtIFK5xJGIni9pDVdTZ19cryCM7IJw",
  authDomain: "erp-hiptown.firebaseapp.com",
  projectId: "erp-hiptown",
  storageBucket: "erp-hiptown.firebasestorage.app",
  messagingSenderId: "614182429640",
  appId: "1:614182429640:web:fcffc87ba6fe234e3e96fd"
};

export const app  = initializeApp(firebaseConfig);

// ── Un compte par onglet ──
// La connexion est gardée dans l'onglet (sessionStorage) : on peut être connecté
// à des comptes différents dans plusieurs onglets du même navigateur.
// À la première ouverture (navigateur ou app rouverts), on reprend le dernier
// compte connecté, gardé à part sur l'appareil. Si le portail est déjà ouvert
// ailleurs, le nouvel onglet arrive sur l'écran de connexion pour choisir son compte.
// indexedDBLocalPersistence ne sert qu'à reprendre les connexions faites avant ce changement.
const TAB_USER_KEY  = "firebase:authUser:" + firebaseConfig.apiKey + ":[DEFAULT]";
const LAST_USER_KEY = "hiptown_dernier_compte";
const TABS_CHANNEL  = "hiptown_onglets";

// Demande aux autres onglets ouverts du portail de se signaler.
function anotherTabOpen() {
  return new Promise(resolve => {
    let ch;
    try { ch = new BroadcastChannel(TABS_CHANNEL); } catch (e) { resolve(false); return; }
    const done = found => { clearTimeout(timer); ch.close(); resolve(found); };
    const timer = setTimeout(() => done(false), 250);
    ch.onmessage = e => { if (e.data === "present") done(true); };
    ch.postMessage("qui");
  });
}

let resumeLast = false;
try {
  if (!sessionStorage.getItem(TAB_USER_KEY)) resumeLast = !(await anotherTabOpen());
  if (resumeLast) {
    const last = localStorage.getItem(LAST_USER_KEY);
    if (last) sessionStorage.setItem(TAB_USER_KEY, last);
  }
} catch (e) { /* stockage indisponible : connexion classique */ }

// Cet onglet répond désormais aux nouveaux onglets.
try {
  const tabs = new BroadcastChannel(TABS_CHANNEL);
  tabs.onmessage = e => { if (e.data === "qui") tabs.postMessage("present"); };
} catch (e) { /* navigateur ancien */ }

export const auth = initializeAuth(app, {
  persistence: resumeLast
    ? [browserSessionPersistence, indexedDBLocalPersistence]
    : [browserSessionPersistence]
});

let tabUid = null;
onAuthStateChanged(auth, user => {
  try {
    if (user) {
      localStorage.setItem(LAST_USER_KEY, JSON.stringify(user.toJSON()));
    } else if (tabUid) {
      // Déconnexion dans cet onglet : un nouvel onglet ne doit plus rouvrir ce compte
      // (les autres onglets déjà ouverts gardent le leur).
      const last = JSON.parse(localStorage.getItem(LAST_USER_KEY) || "null");
      if (last && last.uid === tabUid) localStorage.removeItem(LAST_USER_KEY);
    }
  } catch (e) { /* stockage indisponible */ }
  tabUid = user ? user.uid : null;
});
export const db   = getFirestore(app);
