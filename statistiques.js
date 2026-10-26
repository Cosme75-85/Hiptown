// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Statistiques de clics (phase de test)
//  1. Chaque clic d'un client (salle de réunion ou coworking) sur une case
//     marquée data-stat est compté sur sa fiche clickStats/{uid} (Firestore).
//     L'équipe Hiptown n'est pas comptée.
//  2. Gestion > Statistiques : clics par compte, et clics sur la réservation
//     des salles, y compris les visiteurs du lien public (reservation/Stats.gs).
// ═══════════════════════════════════════════════════════

import { auth, db } from "./firebase-config.js";
import {
  collection, query, where, getDocs, doc, setDoc, deleteDoc, increment, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { call } from "./salles.js";

const $ = id => document.getElementById(id);

// ==================== COMPTAGE DES CLICS ====================

let tracked = null; // { uid, space, site, siteId } du client connecté

document.addEventListener("hiptown-dashboard", e => {
  const d = e.detail || {};
  tracked = (d.space === "salle" || d.space === "coworking")
    ? { uid: d.uid, space: d.space, site: d.place?.site || null, siteId: d.place?.siteId || null }
    : null;
});

document.addEventListener("click", e => {
  const el = e.target.closest("[data-stat]");
  if (!el || !tracked || auth.currentUser?.uid !== tracked.uid) return;
  const id = el.dataset.stat;
  if (!/^[a-z0-9-]{1,40}$/.test(id)) return;
  // Un clic non compté ne gêne jamais le client : aucune erreur affichée
  setDoc(doc(db, "clickStats", tracked.uid), {
    space: tracked.space, site: tracked.site, siteId: tracked.siteId,
    counts: { [id]: increment(1) },
    updatedAt: serverTimestamp()
  }, { merge: true }).catch(err => console.warn("Statistiques :", err));
});

// ==================== PAGE GESTION > STATISTIQUES ====================

// Cases des pages intérieures (les cases de l'accueil prennent le titre de leur tuile, app.js)
const SUB_LABELS = {
  "salles-book":            "Salle de réunion › Réserver une salle",
  "salles-mine":            "Salle de réunion › Mes réservations",
  "salles-usage":           "Salle de réunion › Utilisation des salles",
  "salles-tarifs":          "Salle de réunion › Tarifs",
  "salles-credits":         "Salle de réunion › Utilisation des crédits",
  "mesinfos-contrat":       "Mes informations › Mon contrat",
  "mesinfos-factures":      "Mes informations › Mes factures",
  "infocowork-equipements": "Informations du coworking › Équipements et espaces",
  "infocowork-services":    "Informations du coworking › Mes services",
  "infocowork-livret":      "Informations du coworking › Livret d'accueil"
};
const SPACE_LABELS = { salle: "Salle de réunion", coworking: "Coworking" };

function labelOf(id) {
  return SUB_LABELS[id] || (window.tileTitle && window.tileTitle(id)) || id;
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function frDate(dateString) {
  const [y, m, d] = String(dateString).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function showMessage(text, isError) {
  const m = $("stats-message");
  m.textContent = text;
  m.style.color = isError ? "#dc2626" : "#166534";
  m.hidden = !text;
}

/** Même périmètre que les comptes (règles Firestore) : ville ou sites de l'admin connecté. */
function statsQuery(scope) {
  const filters = [];
  if (scope && scope.city) filters.push(where("site", "==", scope.city));
  if (scope && scope.siteIds) {
    if (!scope.siteIds.length) return null;
    filters.push(where("siteId", "in", scope.siteIds.slice(0, 30)));
  }
  return query(collection(db, "clickStats"), ...filters);
}

let panel = { scope: null, canReset: false, accounts: [] };

export async function renderStatsPanel(scope, canReset) {
  panel = { scope, canReset, accounts: [] };
  $("stats-reset").hidden = !canReset;
  showMessage("");
  await Promise.all([refreshAccounts(), refreshBooking()]);
}

// ── Clics par compte client ──

async function refreshAccounts() {
  const box = $("stats-accounts");
  box.innerHTML = '<p style="color:#94a3b8;padding:12px;">Chargement…</p>';
  try {
    const q = statsQuery(panel.scope);
    const [snap, users] = await Promise.all([
      q ? getDocs(q) : Promise.resolve({ docs: [] }),
      window.listManagedAccounts ? window.listManagedAccounts().catch(() => []) : []
    ]);
    const byUid = Object.fromEntries(users.map(u => [u.uid, u]));
    panel.accounts = snap.docs.map(d => {
      const u = byUid[d.id] || {};
      const data = d.data();
      const counts = data.counts || {};
      return {
        uid: d.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Compte supprimé",
        company: u.companyName || "",
        space: SPACE_LABELS[data.space] || data.space || "",
        counts,
        total: Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0)
      };
    }).sort((a, b) => b.total - a.total);
  } catch (err) {
    console.error(err);
    box.innerHTML = '<p style="color:#dc2626;padding:12px;">Lecture impossible. Les règles Firestore sont-elles publiées ?</p>';
    return;
  }
  renderAccounts();
}

/** Cases cliquées au moins une fois, de la plus cliquée à la moins cliquée. */
function caseColumns() {
  const totals = {};
  panel.accounts.forEach(a => Object.entries(a.counts).forEach(([id, n]) => { totals[id] = (totals[id] || 0) + (Number(n) || 0); }));
  return Object.keys(totals).sort((a, b) => totals[b] - totals[a]).map(id => ({ id, label: labelOf(id), total: totals[id] }));
}

function renderAccounts() {
  const box = $("stats-accounts");
  if (!panel.accounts.length) {
    box.innerHTML = '<p style="color:#94a3b8;padding:12px;">Aucun clic pour l\'instant.</p>';
    return;
  }
  const cols = caseColumns();
  const head = "<tr><th>Compte</th><th>Total</th>" + cols.map(c => `<th>${escapeHtml(c.label)}</th>`).join("") + "</tr>";
  const rows = panel.accounts.map(a =>
    `<tr><td><b>${escapeHtml(a.name)}</b><br><span class="stats-sub">${escapeHtml([a.company, a.space].filter(Boolean).join(" · "))}</span></td>`
    + `<td><b>${a.total}</b></td>`
    + cols.map(c => `<td>${Number(a.counts[c.id]) || ""}</td>`).join("") + "</tr>").join("");
  const foot = `<tr class="stats-total"><td>Tous les comptes (${panel.accounts.length})</td>`
    + `<td>${cols.reduce((s, c) => s + c.total, 0)}</td>` + cols.map(c => `<td>${c.total}</td>`).join("") + "</tr>";
  box.innerHTML = `<div class="stats-scroll"><table class="stats-table"><thead>${head}</thead><tbody>${rows}${foot}</tbody></table></div>`;
}

/** Fichier pour Excel ou Google Sheets : une ligne par compte, une colonne par case. */
function downloadCsv() {
  const cols = caseColumns();
  const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Compte", "Entreprise", "Espace", "Total", ...cols.map(c => c.label)].map(cell).join(";")];
  panel.accounts.forEach(a => lines.push([a.name, a.company, a.space, a.total, ...cols.map(c => Number(a.counts[c.id]) || 0)].map(cell).join(";")));
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `clics-par-compte-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// ── Réservation des salles (outil de réservation, lien public et portail) ──

async function refreshBooking() {
  const box = $("stats-booking");
  box.innerHTML = '<p style="color:#94a3b8;padding:12px;">Chargement…</p>';
  let res;
  try {
    res = await call("getBookingStats");
  } catch (err) {
    console.error(err);
    res = { success: false, message: "Outil de réservation injoignable, merci de réessayer." };
  }
  if (!res.success) {
    box.innerHTML = `<p style="color:#dc2626;padding:12px;">${escapeHtml(res.message || "Statistiques indisponibles : l'outil de réservation est-il à jour ?")}</p>`;
    return;
  }
  if (!res.days.length) {
    box.innerHTML = '<p style="color:#94a3b8;padding:12px;">Aucun clic pour l\'instant.</p>';
    return;
  }

  const names = Object.fromEntries(res.spaces.map(s => [s.id, s.name]));
  const both = v => (v?.portal || 0) + (v?.external || 0);
  const split = v => `<b>${both(v)}</b><br><span class="stats-sub">${v?.external || 0} ext. · ${v?.portal || 0} portail</span>`;
  const add = (a, b) => ({ portal: (a.portal || 0) + (b?.portal || 0), external: (a.external || 0) + (b?.external || 0) });

  // Totaux depuis le début, et par salle
  let visits = {}, people = {}, opens = {}, sent = {};
  const rooms = {};
  res.days.forEach(d => {
    visits = add(visits, d.visits);
    people = add(people, d.people);
    Object.entries(d.rooms || {}).forEach(([id, r]) => {
      const room = rooms[id] || (rooms[id] = { open: {}, sent: {} });
      room.open = add(room.open, r.open);
      room.sent = add(room.sent, r.sent);
      opens = add(opens, r.open);
      sent = add(sent, r.sent);
    });
  });
  const since = frDate(res.days[res.days.length - 1].date);

  const summary = `<div class="stats-scroll"><table class="stats-table"><thead><tr>
      <th>Depuis le ${escapeHtml(since)}</th><th>Arrivées sur la page</th><th>Personnes qui ont cliqué pour réserver</th>
      <th>Fenêtres « Réserver » ouvertes</th><th>Demandes envoyées</th></tr></thead>
    <tbody><tr><td>Total</td><td>${split(visits)}</td><td>${split(people)}</td><td>${split(opens)}</td><td>${split(sent)}</td></tr></tbody></table></div>`;

  const roomRows = Object.entries(rooms).sort((a, b) => both(b[1].open) - both(a[1].open)).map(([id, r]) =>
    `<tr><td>${escapeHtml(names[id] || id)}</td><td>${split(r.open)}</td><td>${split(r.sent)}</td></tr>`).join("");
  const byRoom = roomRows ? `<h4 class="stats-h4">Par salle</h4><div class="stats-scroll"><table class="stats-table">
    <thead><tr><th>Salle</th><th>Fenêtres « Réserver » ouvertes</th><th>Demandes envoyées</th></tr></thead>
    <tbody>${roomRows}</tbody></table></div>` : "";

  const dayRows = res.days.slice(0, 60).map(d => {
    const dayOpens = Object.values(d.rooms || {}).reduce((acc, r) => add(acc, r.open), {});
    const daySent  = Object.values(d.rooms || {}).reduce((acc, r) => add(acc, r.sent), {});
    return `<tr><td>${escapeHtml(frDate(d.date))}</td><td>${split(d.visits)}</td><td>${split(d.people)}</td><td>${split(dayOpens)}</td><td>${split(daySent)}</td></tr>`;
  }).join("");
  const byDay = `<h4 class="stats-h4">Jour par jour</h4><div class="stats-scroll"><table class="stats-table">
    <thead><tr><th>Jour</th><th>Arrivées</th><th>Personnes</th><th>Fenêtres ouvertes</th><th>Demandes</th></tr></thead>
    <tbody>${dayRows}</tbody></table></div>`;

  box.innerHTML = summary + byRoom + byDay;
}

// ── Remise à zéro (admin général, au lancement de la phase de test) ──

async function resetAll() {
  if (!panel.canReset) return;
  if (!confirm("Remettre tous les compteurs à zéro ? Les clics par compte et ceux de l'outil de réservation seront effacés.")) return;
  const btn = $("stats-reset");
  btn.disabled = true;
  try {
    const snap = await getDocs(collection(db, "clickStats"));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    const res = await call("resetBookingStats");
    showMessage(res.success ? "Compteurs remis à zéro." : res.message, !res.success);
  } catch (err) {
    console.error(err);
    showMessage("Remise à zéro impossible, merci de réessayer.", true);
  }
  btn.disabled = false;
  await Promise.all([refreshAccounts(), refreshBooking()]);
}

$("stats-csv")?.addEventListener("click", downloadCsv);
$("stats-refresh")?.addEventListener("click", () => renderStatsPanel(panel.scope, panel.canReset));
$("stats-reset")?.addEventListener("click", resetAll);
