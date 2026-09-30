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
 * Périmètre des requêtes, qui doit correspondre aux règles Firestore :
 *  - null : admin général, tous les comptes
 *  - { city } : admin de ville, les comptes de sa ville
 *  - { city, siteIds } : employé, les comptes des sites qu'il gère
 * Retourne null si le périmètre est vide (employé sans site).
 */
function usersQuery(scope, ...filters) {
  const scoped = [];
  if (scope && scope.city) scoped.push(where("site", "==", scope.city));
  if (scope && scope.siteIds) {
    if (!scope.siteIds.length) return null;
    scoped.push(where("siteId", "in", scope.siteIds.slice(0, 30)));
  }
  return query(collection(db, "users"), ...scoped, ...filters);
}

async function runUsersQuery(q) {
  if (!q) return [];
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

/**
 * Liste les comptes en attente de validation du périmètre.
 */
export async function listPendingUsers(scope = null) {
  return runUsersQuery(usersQuery(scope, where("status", "==", "pending")));
}

/**
 * Liste tous les comptes du périmètre (pour la page de gestion complète).
 */
export async function listAllUsers(scope = null) {
  return runUsersQuery(usersQuery(scope));
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

/**
 * Corrige la fiche d'un compte (nom, entreprise, rôle, statut, site...).
 * Remarque : l'e-mail modifié ici est celui de la fiche ; l'e-mail de
 * connexion (Firebase Auth) ne peut être changé que par l'utilisateur.
 */
export async function updateUser(uid, fields) {
  await updateDoc(doc(db, "users", uid), fields);
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
export async function adminCreateAccount(email, password, role, companyId = null, firstName = "", lastName = "", site = null, extra = {}) {
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
      site,
      ...extra,               // adminLevel, siteIds (employé) ou siteId (client)
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
 * Liste les commandes de petit-déjeuner pas encore vues par un admin.
 * Triées par date de création, les plus récentes en premier.
 */
export async function listUnseenBreakfastOrders() {
  const q = query(collection(db, "breakfastOrders"), where("seen", "==", false));
  const snap = await getDocs(q);
  const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  orders.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  return orders;
}

export async function markBreakfastOrderSeen(orderId) {
  await updateDoc(doc(db, "breakfastOrders", orderId), { seen: true });
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
