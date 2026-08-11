// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Outils Administrateur
// ═══════════════════════════════════════════════════════

import { app, db } from "./firebase-config.js";
import {
  collection, query, where, getDocs, doc, updateDoc, deleteDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  initializeApp, deleteApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/**
 * Liste tous les comptes en attente de validation.
 */
export async function listPendingUsers() {
  const q = query(collection(db, "users"), where("status", "==", "pending"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

/**
 * Liste tous les comptes (pour la page de gestion complète).
 */
export async function listAllUsers() {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

/**
 * Valide un compte en attente : lui attribue un rôle réel
 * (et une entreprise si rôle "coworking").
 */
export async function approveUser(uid, role, companyId = null) {
  await updateDoc(doc(db, "users", uid), {
    role,
    companyId,
    status: "approved",
    approvedAt: serverTimestamp()
  });
}

/**
 * Refuse un compte en attente.
 */
export async function rejectUser(uid) {
  await updateDoc(doc(db, "users", uid), { status: "rejected" });
}

/**
 * Change le rôle ou l'entreprise d'un utilisateur déjà approuvé.
 */
export async function updateUserAccess(uid, { role, companyId, status }) {
  const patch = {};
  if (role !== undefined) patch.role = role;
  if (companyId !== undefined) patch.companyId = companyId;
  if (status !== undefined) patch.status = status;
  await updateDoc(doc(db, "users", uid), patch);
}

export async function deleteUserDoc(uid) {
  await deleteDoc(doc(db, "users", uid));
  // Remarque : ceci supprime la fiche Firestore, pas le compte Auth
  // (la suppression d'un compte Auth par un autre utilisateur nécessite
  // Cloud Functions + Admin SDK côté serveur, hors périmètre de cette V1).
}

/**
 * Crée directement un compte déjà approuvé (typiquement un compte admin,
 * ou un compte coworking pour un client que tu inscris toi-même).
 * Utilise une seconde instance Firebase "jetable" pour ne pas déconnecter
 * l'admin en cours de session (limitation connue du SDK client Firebase).
 */
export async function adminCreateAccount(email, password, role, companyId = null, firstName = "", lastName = "") {
  const tempApp = initializeApp(app.options, "temp-" + Date.now());
  const tempAuth = getAuth(tempApp);
  try {
    const cred = await createUserWithEmailAndPassword(tempAuth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), {
      email,
      firstName,
      lastName,
      requestedRole: role,
      role,
      companyId,
      status: "approved",
      createdAt: serverTimestamp(),
      approvedAt: serverTimestamp()
    });
    return cred.user.uid;
  } finally {
    await deleteApp(tempApp);
  }
}

/**
 * Liste les entreprises (remplace PORTAIL.clients codé en dur).
 */
export async function listCompanies() {
  const snap = await getDocs(collection(db, "companies"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createCompany(id, data) {
  await setDoc(doc(db, "companies", id), data);
}

export async function updateCompany(id, data) {
  await updateDoc(doc(db, "companies", id), data);
}
