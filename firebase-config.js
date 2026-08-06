// ═══════════════════════════════════════════════════════
//  FIREBASE — Configuration
//  Remplace les valeurs ci-dessous par celles de TON projet
//  (Console Firebase → ⚙️ Paramètres du projet → Tes applications → SDK config)
// ═══════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "COLLE_ICI_TA_CLE_API",
  authDomain: "TON-PROJET.firebaseapp.com",
  projectId: "TON-PROJET",
  storageBucket: "TON-PROJET.appspot.com",
  messagingSenderId: "COLLE_ICI",
  appId: "COLLE_ICI"
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
