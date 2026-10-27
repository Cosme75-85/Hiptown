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
// Un nouvel onglet (ou l'app rouverte) reprend le dernier compte connecté,
// gardé à part sur l'appareil. indexedDBLocalPersistence ne sert qu'à reprendre,
// une seule fois, les connexions faites avant ce changement.
const TAB_USER_KEY  = "firebase:authUser:" + firebaseConfig.apiKey + ":[DEFAULT]";
const LAST_USER_KEY = "hiptown_dernier_compte";

try {
  if (!sessionStorage.getItem(TAB_USER_KEY)) {
    const last = localStorage.getItem(LAST_USER_KEY);
    if (last) sessionStorage.setItem(TAB_USER_KEY, last);
  }
} catch (e) { /* stockage indisponible : connexion classique */ }

export const auth = initializeAuth(app, {
  persistence: [browserSessionPersistence, indexedDBLocalPersistence]
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
