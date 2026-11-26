// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Authentification
// ═══════════════════════════════════════════════════════

import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  sendEmailVerification,
  reload
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, setDoc, getDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Crée un compte client (rôle "salle" ou "coworking").
 * Le compte est créé avec le statut "pending".
 *  - coworking : il attend qu'un admin le valide ;
 *  - salle de réunion : on lui envoie un e-mail de vérification, et le compte
 *    se valide tout seul dès que l'adresse est vérifiée (voir activateMeetingRoomAccount).
 *
 * @param {string} email
 * @param {string} password
 * @param {"salle"|"coworking"} requestedRole
 * @param {string} companyNameHint - nom de l'entreprise du client (obligatoire, affiché sur son profil)
 * @param {string} firstName
 * @param {string} lastName
 * @param {string} birthDate - format YYYY-MM-DD (issu d'un <input type="date">)
 */
export async function signUp(email, password, requestedRole, companyNameHint = "", firstName = "", lastName = "", birthDate = "", place = {}) {
  if (requestedRole !== "salle" && requestedRole !== "coworking") {
    throw new Error("Rôle d'inscription invalide.");
  }
  if (!companyNameHint.trim()) {
    throw new Error("Le nom de l'entreprise est obligatoire.");
  }
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, "users", cred.user.uid), {
    email: email.toLowerCase(), // Firebase Auth enregistre l'e-mail en minuscules
    firstName,
    lastName,
    birthDate,
    requestedRole,          // ce que le client a demandé
    role: null,             // rôle réel, attribué par l'admin à la validation
    status: "pending",      // pending | approved | rejected
    companyId: null,
    companyNameHint,
    site: place.site || PORTAIL.defaultSite, // ville Hiptown (voir config.js PORTAIL.cities)
    siteId: place.siteId || null,            // site choisi par le client (ex. "nabo06")
    createdAt: serverTimestamp()
  });
  if (requestedRole === "salle") {
    await sendVerificationEmail().catch(err => console.error("E-mail de vérification non envoyé", err));
  }
  await notifyAccountRequest(cred.user);
  return cred.user;
}

/**
 * Prévient l'équipe Hiptown de la nouvelle demande (e-mail à l'équipe de la ville
 * + notification aux admins, voir reservation/Messagerie.gs). Ne bloque jamais l'inscription.
 */
async function notifyAccountRequest(user) {
  if (!PORTAIL.reservationUrl) return;
  try {
    const idToken = await user.getIdToken();
    await fetch(PORTAIL.reservationUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // évite une requête préalable (CORS)
      body: JSON.stringify({ action: "notifyAccountRequest", idToken })
    });
  } catch (err) {
    console.error("Équipe non prévenue de la demande de compte", err);
  }
}

/**
 * Envoie (ou renvoie) l'e-mail « Vérifiez votre adresse » de Firebase.
 * Le lien du mail ramène sur le portail, où le compte se valide tout seul.
 */
export async function sendVerificationEmail() {
  const user = auth.currentUser;
  if (!user) throw new Error("Vous n'êtes plus connecté. Reconnectez-vous.");
  auth.languageCode = "fr";
  const portalUrl = location.origin + location.pathname;
  await sendEmailVerification(user, { url: portalUrl });
}

/**
 * Compte « salle de réunion » en attente : si l'adresse e-mail est vérifiée,
 * le compte se valide lui-même (rôle "salle"), sans passer par l'équipe.
 * Les règles Firestore n'autorisent ce passage que pour une demande « salle »
 * encore en attente, avec un e-mail vérifié par Firebase.
 * Renvoie true si le compte vient d'être validé.
 */
export async function activateMeetingRoomAccount() {
  const user = auth.currentUser;
  if (!user) return false;
  await reload(user);                 // l'état « vérifié » peut avoir changé dans un autre onglet
  if (!user.emailVerified) return false;
  await user.getIdToken(true);        // jeton à jour, pour que Firestore voie l'e-mail vérifié
  await updateDoc(doc(db, "users", user.uid), {
    role: "salle",
    status: "approved",
    approvedAt: serverTimestamp(),
    autoApproved: true
  });
  return true;
}

/**
 * Met à jour le profil personnalisable de l'utilisateur connecté.
 * Les règles Firestore n'autorisent que ces champs (voir firestore.rules).
 *
 * @param {string} uid
 * @param {{ nickname?: string, photo?: string, companyNameHint?: string, jobTitle?: string, city?: string }} fields
 */
export async function updateMyProfile(uid, fields) {
  await updateDoc(doc(db, "users", uid), fields);
}

/**
 * Connecte un utilisateur existant.
 */
export async function logIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logOut() {
  // Retire cet appareil des notifications du compte (messagerie.js), 3 secondes au plus
  if (typeof window.hiptownBeforeLogout === "function") {
    await Promise.race([
      window.hiptownBeforeLogout().catch(() => {}),
      new Promise(resolve => setTimeout(resolve, 3000))
    ]);
  }
  await signOut(auth);
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

/**
 * Change le mot de passe de l'utilisateur connecté.
 * Firebase exige une connexion récente pour cette opération : on vérifie
 * donc d'abord le mot de passe actuel, puis on enregistre le nouveau.
 */
export async function changeMyPassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error("Vous n'êtes plus connecté. Reconnectez-vous.");
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
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
