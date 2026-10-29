// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Visites à l'accueil (clients coworking et contacts de l'équipe)
//  Quand un visiteur se présente sur la page d'accueil visiteurs pour l'entreprise du client,
//  l'outil de réservation (reservation/Accueil.gs) écrit accueilVisits/{id} : un bandeau
//  s'affiche en haut du portail, en temps réel, jusqu'à ce que le client clique « C'est noté ».
//  Seules les visites du jour sont affichées.
// ═══════════════════════════════════════════════════════

import { auth, db } from "./firebase-config.js";
import { playNotificationSound } from "./notif-sound.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, doc, query, where, onSnapshot, updateDoc, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const box = document.getElementById("accueil-visits");
let stop = null;
let known = null; // visites déjà affichées (null : premier chargement, sans son)

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Date du jour à Paris (même format que le champ day écrit par Accueil.gs). */
function parisDay() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function timeOf(v) {
  const d = v && v.toDate ? v.toDate() : null;
  return d ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).replace(":", "h") : "";
}

function render(visits, uid) {
  const today = parisDay();
  const open = visits.filter(v => v.day === today && !(v.seenBy || []).includes(uid))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  box.hidden = !open.length;
  // Son pour une visite qui vient d'arriver ; nombre d'attentes pour la pastille de l'icône (messagerie.js)
  if (known && open.some(v => !known.has(v.id))) playNotificationSound();
  known = new Set(open.map(v => v.id));
  document.dispatchEvent(new CustomEvent("hiptown-visits", { detail: { count: open.length } }));
  box.innerHTML = open.map(v => `
    <div class="accueil-visit" role="alert">
      <div class="accueil-visit-text">
        <div class="accueil-visit-title">🔔 <b>${esc(v.visitor)}</b> vous attend à l'accueil</div>
        <div class="accueil-visit-meta">${[v.forWho ? "Pour " + esc(v.forWho) : "", timeOf(v.createdAt) ? "arrivé(e) à " + timeOf(v.createdAt) : ""].filter(Boolean).join(" · ")}</div>
        ${v.note ? `<div class="accueil-visit-note">« ${esc(v.note)} »</div>` : ""}
      </div>
      <button type="button" class="accueil-visit-ok" data-id="${esc(v.id)}">C'est noté</button>
    </div>`).join("");
}

function watch(uid) {
  if (stop) { stop(); stop = null; }
  if (!box) return;
  box.hidden = true;
  known = null;
  document.dispatchEvent(new CustomEvent("hiptown-visits", { detail: { count: 0 } }));
  if (!uid) return;
  // Un seul filtre (pas d'index composé à créer) : Accueil.gs efface les visites des jours passés
  const q = query(collection(db, "accueilVisits"), where("uids", "array-contains", uid));
  stop = onSnapshot(q, snap => {
    render(snap.docs.map(d => ({ id: d.id, ...d.data() })), uid);
  }, err => console.error("Visites à l'accueil indisponibles", err));
}

box?.addEventListener("click", async e => {
  const btn = e.target.closest(".accueil-visit-ok");
  const uid = auth.currentUser?.uid;
  if (!btn || !uid) return;
  btn.disabled = true;
  try {
    await updateDoc(doc(db, "accueilVisits", btn.dataset.id), { seenBy: arrayUnion(uid) });
  } catch (err) {
    console.error("Visite non marquée comme vue", err);
    btn.disabled = false;
  }
});

document.addEventListener("hiptown-dashboard", e => {
  const d = e.detail || {};
  watch(d.space === "coworking" || d.space === "hiptown" ? d.uid : null);
});

onAuthStateChanged(auth, user => { if (!user) watch(null); });
