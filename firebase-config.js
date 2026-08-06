// ═══════════════════════════════════════════════════════
//  FIREBASE — Configuration
//  Remplace les valeurs ci-dessous par celles de TON projet
//  (Console Firebase → ⚙️ Paramètres du projet → Tes applications → SDK config)
// ═══════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
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
export const auth = getAuth(app);
export const db   = getFirestore(app);
