// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Authentification
// ═══════════════════════════════════════════════════════

import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Crée un compte client (rôle "salle" ou "coworking").
 * Le compte est créé avec le statut "pending" : il ne pourra
 * pas accéder à son espace tant qu'un admin ne l'aura pas validé.
 *
 * @param {string} email
 * @param {string} password
 * @param {"salle"|"coworking"} requestedRole
 * @param {string} [companyNameHint] - nom d'entreprise indiqué par le client (aide l'admin à valider, pas encore officiel)
 * @param {string} firstName
 * @param {string} lastName
 * @param {string} birthDate - format YYYY-MM-DD (issu d'un <input type="date">)
 */
export async function signUp(email, password, requestedRole, companyNameHint = "", firstName = "", lastName = "", birthDate = "") {
  if (requestedRole !== "salle" && requestedRole !== "coworking") {
    throw new Error("Rôle d'inscription invalide.");
  }
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, "users", cred.user.uid), {
    email,
    firstName,
    lastName,
    birthDate,
    requestedRole,          // ce que le client a demandé
    role: null,             // rôle réel, attribué par l'admin à la validation
    status: "pending",      // pending | approved | rejected
    companyId: null,
    companyNameHint,
    createdAt: serverTimestamp()
  });
  return cred.user;
}

/**
 * Connecte un utilisateur existant.
 */
export async function logIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logOut() {
  await signOut(auth);
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

/**
 * Récupère le profil Firestore (rôle, statut, entreprise) d'un utilisateur.
 */
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

/**
 * Écoute les changements de connexion. Le callback reçoit :
 * - (null, null) si personne n'est connecté
 * - (user, profile) sinon, où profile = { role, status, companyId, ... }
 */
export function watchAuthState(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) { callback(null, null); return; }
    const profile = await getUserProfile(user.uid);
    callback(user, profile);
  });
}
