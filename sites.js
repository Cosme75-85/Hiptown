// ═══════════════════════════════════════════════════════
//  SITES DES VILLES — ajout et retrait par les admins de ville
// ═══════════════════════════════════════════════════════
//  Firestore : citySites/{ville} = { city, sites: { pama01: { name, address } }, order: [ids], updatedAt }
//  Tant qu'une ville n'a pas de document, ses sites sont ceux de config.js (PORTAIL.cities).
//  Dès que son admin enregistre la liste, ce document remplace la liste de config.js
//  pour cette ville (page Sites, gestion des comptes, inscription...).
//  Lecture publique (l'inscription montre les sites sans connexion) ; écriture :
//  l'admin général pour toutes les villes, l'admin de ville pour la sienne (firestore.rules).

import { db } from "./firebase-config.js";
import {
  collection, getDocs, doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const MAX_SITES = 60;
let ctx = null;          // { cities: villes que le compte peut modifier }
let shownCity = null;    // ville affichée sur la page Sites
let draft = null;        // liste en cours de modification : [{ id, name, address }]

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text == null ? "" : String(text);
  return d.innerHTML;
}

function labelOf(id, name) {
  return id.toUpperCase() + (name ? " — " + name : "");
}

/** Applique un document citySites à PORTAIL (config.js). */
function applyCityDoc(city, data) {
  const c = PORTAIL.cities?.[city];
  if (!c || !data || typeof data.sites !== "object") return;
  const ids = (Array.isArray(data.order) ? data.order : []).filter(id => data.sites[id]);
  Object.keys(data.sites).forEach(id => { if (!ids.includes(id)) ids.push(id); });
  PORTAIL.siteAddresses = PORTAIL.siteAddresses || {};
  Object.keys(c.sites || {}).forEach(id => { delete PORTAIL.siteAddresses[id]; });
  c.sites = {};
  ids.forEach(id => {
    const s = data.sites[id] || {};
    c.sites[id] = labelOf(id, s.name || "");
    if (s.address) PORTAIL.siteAddresses[id] = s.address;
  });
}

function sitesChanged() {
  if (window.rebuildSitesPage) window.rebuildSitesPage();
  document.dispatchEvent(new CustomEvent("hiptown-sites-changed"));
}

async function loadCitySites() {
  try {
    const snap = await getDocs(collection(db, "citySites"));
    snap.forEach(d => applyCityDoc(d.id, d.data()));
    if (!snap.empty) sitesChanged();
  } catch (err) {
    console.error("Sites des villes non chargés (liste de config.js utilisée)", err);
  }
}

// ── Bouton et formulaire sur la page Sites ────────────────

function canEdit(city) {
  return !!ctx && !!city && ctx.cities.includes(city);
}

function renderManage() {
  // Le formulaire est redessiné à chaque ajout ou retrait : on garde la page au même endroit
  // (la zone « Nouveau site » reste à la même hauteur à l'écran pour enchaîner les ajouts)
  const anchorTop = () => document.querySelector("#sites-manage .sites-editor-add")?.getBoundingClientRect().top;
  const before = anchorTop();
  const scrollY = window.scrollY;
  renderManageInner();
  window.scrollTo(0, scrollY);
  const after = anchorTop();
  if (before != null && after != null) window.scrollBy(0, after - before);
}

function renderManageInner() {
  const box = document.getElementById("sites-manage");
  if (!box) return;
  if (!canEdit(shownCity)) { box.hidden = true; box.innerHTML = ""; draft = null; return; }
  box.hidden = false;
  const cityName = PORTAIL.cities[shownCity].name;
  if (!draft) {
    box.innerHTML = `<button type="button" class="direct-btn" id="sites-manage-open">✏️ Ajouter ou retirer des sites (${escapeHtml(cityName)})</button>`;
    box.querySelector("#sites-manage-open").addEventListener("click", openEditor);
    return;
  }
  const code = PORTAIL.cities[shownCity].code || "";
  box.innerHTML = `
    <div class="sites-editor">
      <h3 class="sites-city-title">Sites de ${escapeHtml(cityName)}</h3>
      <p class="profile-help">Le nom et l'adresse sont facultatifs. L'adresse s'affiche aux clients quand ils choisissent leur site à l'inscription.</p>
      <div class="sites-editor-list">
        ${draft.length ? draft.map((s, i) => `
          <div class="sites-editor-row" data-i="${i}">
            <div class="sites-editor-code">${escapeHtml(s.id.toUpperCase())}</div>
            <input class="profile-input se-name" maxlength="60" placeholder="Nom (ex. Émergence)" value="${escapeHtml(s.name)}"/>
            <input class="profile-input se-address" maxlength="120" placeholder="Adresse" value="${escapeHtml(s.address)}"/>
            <button type="button" class="sites-editor-remove" title="Retirer ce site">Retirer</button>
          </div>`).join("") : `<p class="profile-help">Aucun site pour l'instant.</p>`}
      </div>
      <div class="sites-editor-add">
        <div class="sites-editor-code">Nouveau site</div>
        <input class="profile-input se-new-code" maxlength="6" placeholder="${escapeHtml(code)}01" value="${escapeHtml(nextCode())}"/>
        <input class="profile-input se-new-name" maxlength="60" placeholder="Nom (facultatif)"/>
        <input class="profile-input se-new-address" maxlength="120" placeholder="Adresse (facultatif)"/>
        <button type="button" class="direct-btn" id="sites-editor-add">+ Ajouter ce site</button>
      </div>
      <p class="profile-help" id="sites-editor-message"></p>
      <div class="sites-editor-actions">
        <button type="button" class="direct-btn" id="sites-editor-cancel">Annuler</button>
        <button type="button" class="direct-btn" id="sites-editor-save" style="background:var(--navy);color:#fff;">Enregistrer</button>
      </div>
    </div>`;

  box.querySelectorAll(".sites-editor-row").forEach(row => {
    const s = draft[Number(row.dataset.i)];
    row.querySelector(".se-name").addEventListener("input", e => { s.name = e.target.value; });
    row.querySelector(".se-address").addEventListener("input", e => { s.address = e.target.value; });
    row.querySelector(".sites-editor-remove").addEventListener("click", () => {
      if (!confirm(`Retirer ${s.id.toUpperCase()} ?\n\nLes comptes déjà rattachés à ce site le gardent, mais il n'apparaîtra plus dans les listes (page Sites, inscription, gestion des comptes).`)) return;
      draft.splice(draft.indexOf(s), 1);
      renderManage();
    });
  });
  box.querySelector("#sites-editor-add").addEventListener("click", addSite);
  box.querySelector("#sites-editor-cancel").addEventListener("click", () => { draft = null; renderManage(); });
  box.querySelector("#sites-editor-save").addEventListener("click", saveSites);
}

function message(text, isError) {
  const el = document.getElementById("sites-editor-message");
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? "#dc2626" : "";
}

/** Code suivant de la ville (ex. PAMA14 après PAMA13). */
function nextCode() {
  const code = PORTAIL.cities[shownCity].code || "";
  const nums = (draft || []).map(s => parseInt(s.id.slice(code.length), 10)).filter(n => !isNaN(n));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return code + String(n).padStart(2, "0");
}

function openEditor() {
  const sites = PORTAIL.cities[shownCity].sites || {};
  draft = Object.keys(sites).map(id => ({
    id,
    name: sites[id].split(" — ").slice(1).join(" — "),
    address: PORTAIL.siteAddresses?.[id] || ""
  }));
  renderManage();
}

function addSite() {
  const box = document.getElementById("sites-manage");
  const code = (PORTAIL.cities[shownCity].code || "").toUpperCase();
  const value = box.querySelector(".se-new-code").value.trim().toUpperCase();
  if (!new RegExp("^" + code + "[0-9]{2}$").test(value)) {
    return message(`Le code doit être ${code} suivi de deux chiffres (ex. ${code}01).`, true);
  }
  const id = value.toLowerCase();
  const otherCity = Object.keys(PORTAIL.cities).find(c => c !== shownCity && PORTAIL.cities[c].sites?.[id]);
  if (draft.some(s => s.id === id) || otherCity) return message(`${value} existe déjà.`, true);
  if (draft.length >= MAX_SITES) return message(`Maximum ${MAX_SITES} sites par ville.`, true);
  draft.push({
    id,
    name: box.querySelector(".se-new-name").value.trim(),
    address: box.querySelector(".se-new-address").value.trim()
  });
  draft.sort((a, b) => a.id.localeCompare(b.id));
  renderManage();
  message(`${value} ajouté. Tu peux en ajouter d'autres, puis enregistrer.`);
  document.querySelector("#sites-manage .se-new-name")?.focus({ preventScroll: true });
}

async function saveSites() {
  const city = shownCity;
  const sites = {};
  draft.forEach(s => {
    sites[s.id] = { name: s.name.trim().slice(0, 60), address: s.address.trim().slice(0, 120) };
  });
  const data = { city, sites, order: draft.map(s => s.id), updatedAt: serverTimestamp() };
  const btn = document.getElementById("sites-editor-save");
  btn.disabled = true;
  message("Enregistrement...");
  try {
    await setDoc(doc(db, "citySites", city), data);
    applyCityDoc(city, data);
    const scrollY = window.scrollY;
    sitesChanged();
    // Le formulaire reste ouvert sur la même ville, au même endroit
    shownCity = city;
    openEditor();
    window.scrollTo(0, scrollY);
    message("Sites enregistrés.");
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    message("Impossible d'enregistrer les sites. Réessaie plus tard.", true);
  }
}

// ── Contexte du compte connecté ───────────────────────────

document.addEventListener("hiptown-dashboard", e => {
  const { space, scope } = e.detail;
  draft = null;
  if (space !== "hiptown" || e.detail.preview || (scope && scope.siteIds)) {
    ctx = null;                                  // client, aperçu, ou équipe de site : lecture seule
  } else {
    ctx = { cities: scope ? [scope.city] : Object.keys(PORTAIL.cities || {}) };
  }
  renderManage();
});

document.addEventListener("hiptown-sites-city", e => {
  if (e.detail !== shownCity) draft = null;
  shownCity = e.detail;
  renderManage();
});

loadCitySites();
