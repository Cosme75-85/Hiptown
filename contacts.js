// ═══════════════════════════════════════════════════════
//  CONTACTS PAR VILLE ET PAR SITE
// ═══════════════════════════════════════════════════════
//  - Page Sites : une case carrée « Contacts » en première place de la grille de chaque ville.
//    Un clic ouvre la page Contacts de la ville (tous ses contacts, recherche, filtres).
//  - Page d'un site : une case carrée « Contacts » au-dessus des outils.
//    Un clic ouvre les contacts de ce site et ceux de toute la ville.
//  Les contacts sont rangés par catégorie (badges, ménage, plomberie...), comme dans le
//  tableau Google Sheets de l'équipe, qu'on peut importer en CSV (bouton « Importer un CSV »).
//
//  Firestore : contacts/{id} = { city, sites: [ids], name, firstName, lastName, company, category, subject,
//                                role, priority, phone, email, note, createdAt, updatedAt }
//  - city : ville (ex. "bordeaux") ; sites : sites de la ville (ex. ["nabo06", "nabo03"]),
//    liste vide = toute la ville (MULTISITE / HIPTOWN dans le tableau)
//  - anciens contacts : un champ « site » ("nabo06" ou "") au lieu de « sites »
//  Visibles seulement par l'équipe Hiptown (firestore.rules) :
//  - admin général : toutes les villes, ajoute / modifie / supprime partout
//  - admin de ville : sa ville seulement, ajoute / modifie / supprime
//  - équipe de site : les contacts de sa ville, en lecture seule

import { db } from "./firebase-config.js";
import {
  collection, getDocs, query, where, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, deleteField
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const FIELDS = [
  { key: "firstName", label: "Prénom",    max: 60,  placeholder: "Prénom" },
  { key: "lastName",  label: "Nom",       max: 60,  placeholder: "Nom" },
  { key: "company",   label: "Entreprise", max: 80, placeholder: "Ex. Solinet" },
  { key: "category",  label: "Catégorie", max: 80,  placeholder: "Ex. Ménage, Plomberie, Badges...", list: "contacts-categories" },
  { key: "subject",   label: "Objet",     max: 80,  placeholder: "Ex. Bailleur, Gestionnaire d'immeuble" },
  { key: "role",      label: "Rôle",      max: 80,  placeholder: "Ex. Directeur d'agence, technicien..." },
  { key: "phone",     label: "Téléphone", max: 30,  placeholder: "06 12 34 56 78", type: "tel" },
  { key: "email",     label: "E-mail",    max: 120, placeholder: "nom@exemple.fr", type: "email" },
  { key: "note",      label: "Notes",     max: 300, placeholder: "Numéro de client, horaires, code d'accès..." }
];
const PRIORITIES = ["", "0", "1", "2", "3"];
const NO_SUBJECT = "Sans catégorie";

let ctx = null;        // { all, readCities, editCities } selon le compte connecté ; null = pas de contacts
let contacts = [];     // contacts chargés : [{ id, city, sites, name, ... }]
let loaded = false;

// Page Contacts ouverte
const view = {
  city: null,          // ville affichée
  site: null,          // site affiché (page d'un site) ou null (toute la ville)
  filter: "all",       // page ville : "all", "" (toute la ville) ou un id de site
  subject: "",         // filtre par catégorie ("" = toutes)
  search: "",
  editing: null,       // null, "new", ou l'id du contact en cours de modification
  expanded: null,      // contact déplié (détails et boutons)
  importing: null,     // aperçu d'un import CSV : { rows, skipped }
  backTo: null         // section où revenir
};
let detailSite = null; // site ouvert dans la page « détail du site » (app.js)

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text == null ? "" : String(text);
  return d.innerHTML;
}

function canRead(city) { return !!ctx && !!city && ctx.readCities.includes(city); }
function canEdit(city) { return !!ctx && !!city && ctx.editCities.includes(city); }

function cityOfSite(site) {
  return Object.keys(PORTAIL.cities || {}).find(c => PORTAIL.cities[c].sites?.[site]) || null;
}
function siteLabel(city, site) {
  if (!site) return "Toute la ville";
  return PORTAIL.cities?.[city]?.sites?.[site] || site.toUpperCase();
}
function siteCode(site) { return site ? site.toUpperCase() : "Ville"; }
/** Sites d'un contact (liste vide = toute la ville), anciens contacts compris. */
function sitesOf(c) { return Array.isArray(c.sites) ? c.sites : (c.site ? [c.site] : []); }
function displayName(c) {
  return c.name || [c.firstName, c.lastName].filter(Boolean).join(" ") || c.company || "Sans nom";
}
function telHref(phone) { return "tel:" + String(phone).replace(/[^0-9+]/g, ""); }
function initials(c) {
  return displayName(c).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}
function countOf(city, site) {
  return contacts.filter(c => c.city === city && (site == null || sitesOf(c).includes(site))).length;
}
/** Catégorie d'un contact (titres verts du tableau : Badges, Ménage...), sinon son objet. */
function subjectOf(c) { return (c.category || "").trim() || (c.subject || "").trim() || NO_SUBJECT; }
const collator = new Intl.Collator("fr", { sensitivity: "base" });

// ── Chargement ────────────────────────────────────────────

async function loadContacts() {
  loaded = false;
  contacts = [];
  if (!ctx) return;
  try {
    // L'admin général lit tout ; les autres seulement leur ville (les règles l'exigent)
    const q = ctx.all ? collection(db, "contacts")
      : query(collection(db, "contacts"), where("city", "==", ctx.readCities[0]));
    const snap = await getDocs(q);
    contacts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("Contacts non chargés", err);
  }
  loaded = true;
  refreshAll();
}

function refreshAll() {
  drawTiles();
  drawSiteTile();
  if (!document.getElementById("step-contacts")?.hidden) render();
}

// ── Cases carrées « Contacts » ────────────────────────────

// Même gabarit qu'une case de site (.site-card) : même taille dans la grille
function tileHtml(count) {
  return `<span class="contacts-tile-badge">${loaded ? count : "…"}</span>
    <span class="contacts-tile-title">📇 Contacts</span>`;
}

/** Page Sites : une case en première place de la grille de chaque ville visible. */
function drawTiles() {
  document.querySelectorAll("#sites-by-city .sites-city").forEach(group => {
    const city = group.dataset.city;
    const grid = group.querySelector(".sites-grid");
    let tile = group.querySelector(".contacts-tile");
    if (!canRead(city)) { tile?.remove(); return; }
    if (!tile) {
      tile = document.createElement("button");
      tile.type = "button";
      tile.className = "contacts-tile";
      tile.addEventListener("click", () => openContacts(city, null, document.getElementById("step-hiptown-espaces")));
      grid.prepend(tile);
      group.querySelector(":scope > .profile-help")?.remove();   // « Aucun site pour l'instant. »
    }
    tile.innerHTML = tileHtml(countOf(city, null));
  });
}

/** Page d'un site : une case au-dessus des outils. */
function drawSiteTile() {
  const section = document.getElementById("step-site-detail");
  if (!section) return;
  let box = document.getElementById("site-detail-contacts");
  const city = detailSite ? cityOfSite(detailSite) : null;
  if (!canRead(city)) { box?.remove(); return; }
  if (!box) {
    box = document.createElement("div");
    box.id = "site-detail-contacts";
    box.className = "sites-grid site-detail-contacts";
    box.innerHTML = `<button type="button" class="contacts-tile"></button>`;
    box.firstElementChild.addEventListener("click", () => {
      const site = detailSite;
      openContacts(cityOfSite(site), site, section);
    });
    document.getElementById("site-detail-tools").before(box);
  }
  box.firstElementChild.innerHTML = tileHtml(countOf(city, detailSite));
}

// ── Page Contacts ─────────────────────────────────────────

function openContacts(city, site, backTo) {
  Object.assign(view, { city, site, filter: "all", subject: "", search: "", editing: null, expanded: null, importing: null, backTo });
  if (window.hideAll) window.hideAll();
  document.getElementById("step-contacts").hidden = false;
  document.getElementById("back-from-contacts").textContent = site ? siteCode(site) : "Sites";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeContacts() {
  if (window.hideAll) window.hideAll();
  (view.backTo || document.getElementById("step-hiptown-espaces")).hidden = false;
  view.editing = null; view.importing = null;
  drawTiles(); drawSiteTile();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/** Recherche : chaque mot doit se trouver dans un des champs du contact (tous les champs comptent). */
function matches(c) {
  const norm = t => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const words = norm(view.search).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const sites = sitesOf(c);
  const text = norm(Object.entries(c)
    .filter(([k, v]) => !["id", "city", "createdAt", "updatedAt", "sites", "site"].includes(k) && typeof v !== "object")
    .map(([, v]) => String(v))
    .concat(sites.length ? sites.flatMap(s => [siteCode(s), siteLabel(c.city, s)]) : ["Toute la ville", "multisite"])
    .concat(c.priority !== undefined && c.priority !== "" ? ["P" + c.priority, "priorité " + c.priority] : [])
    .join(" "));
  return words.every(w => text.includes(w));
}

function byPriorityThenName(a, b) {
  const pa = a.priority === "" || a.priority == null ? 9 : Number(a.priority);
  const pb = b.priority === "" || b.priority == null ? 9 : Number(b.priority);
  return pa - pb || collator.compare(displayName(a), displayName(b));
}

function render() {
  const page = document.getElementById("contacts-page");
  if (!page || !view.city) return;
  const { city, site } = view;
  const edit = canEdit(city);
  const cityName = PORTAIL.cities?.[city]?.name || city;
  document.getElementById("contacts-title").textContent = "📇 Contacts · " + (site ? siteCode(site) : cityName);

  const ofCity = contacts.filter(c => c.city === city);
  // Page d'un site : ses contacts et ceux de toute la ville ; page ville : filtre par site
  const inScope = ofCity.filter(c => {
    const s = sitesOf(c);
    if (site) return !s.length || s.includes(site);
    if (view.filter === "all") return true;
    return view.filter === "" ? !s.length : s.includes(view.filter);
  });
  const shown = inScope.filter(c => (!view.subject || subjectOf(c) === view.subject) && matches(c));

  // Un groupe par catégorie, dans l'ordre alphabétique (« Sans catégorie » à la fin)
  const subjects = [...new Set(shown.map(subjectOf))]
    .sort((a, b) => (a === NO_SUBJECT) - (b === NO_SUBJECT) || collator.compare(a, b));
  // Bandeau de catégorie bien visible (comme les lignes vertes du tableau de l'équipe)
  const groupsHtml = subjects.map(sub => {
    const items = shown.filter(c => subjectOf(c) === sub).sort(byPriorityThenName);
    return `
    <div class="contacts-category">
      <div class="contacts-category-head"><span>${escapeHtml(sub)}</span><span class="contacts-category-count">${items.length}</span></div>
      ${items.map(c => view.editing === c.id ? renderForm(c) : renderRow(c, edit)).join("")}
    </div>`;
  }).join("");

  // Filtres par site (page ville) : Tous, Ville, puis chaque site qui a des contacts
  let chips = "";
  if (!site && ofCity.length) {
    const used = [...new Set(ofCity.flatMap(c => sitesOf(c).length ? sitesOf(c) : [""]))]
      .sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
    chips = `<div class="contacts-chips">
      ${[["all", "Tous"], ...used.map(s => [s, siteCode(s)])].map(([id, label]) =>
        `<button type="button" class="contacts-chip${view.filter === id ? " on" : ""}" data-filter="${escapeHtml(id)}">${escapeHtml(label)}</button>`).join("")}
    </div>`;
  }
  const allSubjects = [...new Set(inScope.map(subjectOf))].sort((a, b) => collator.compare(a, b));
  const subjectSelect = allSubjects.length > 1 ? `
    <select class="profile-input contacts-subject" id="contacts-subject" aria-label="Catégorie">
      <option value="">Toutes les catégories (${inScope.length})</option>
      ${allSubjects.map(s => `<option value="${escapeHtml(s)}"${view.subject === s ? " selected" : ""}>${escapeHtml(s)} (${inScope.filter(c => subjectOf(c) === s).length})</option>`).join("")}
    </select>` : "";

  page.innerHTML = `
    ${!loaded ? `<p class="profile-help">Chargement...</p>` : `
    <input class="profile-input contacts-search" id="contacts-search" type="search"
      placeholder="🔍 Nom, entreprise, catégorie, rôle, site..." value="${escapeHtml(view.search)}"/>
    ${chips}
    ${subjectSelect}
    ${edit && !view.editing && !view.importing ? `
      <div class="contacts-tools">
        <button type="button" class="contacts-add-btn" id="contacts-add">+ Ajouter un contact${site ? " à " + escapeHtml(siteCode(site)) : ""}</button>
        ${site ? "" : `<label class="contacts-import-btn" title="Fichier CSV exporté de Google Sheets (Fichier > Télécharger > CSV)">
          📥 Importer un CSV<input type="file" id="contacts-import" accept=".csv,text/csv" hidden/></label>`}
      </div>` : ""}
    ${view.importing ? renderImport() : ""}
    ${view.editing === "new" ? renderForm(null) : ""}
    ${groupsHtml}
    ${shown.length ? "" : `<p class="contacts-empty">${inScope.length ? "Aucun contact ne correspond à la recherche." : "Aucun contact pour l'instant."}</p>`}`}`;
  if (loaded) bind(page);
}

function renderRow(c, edit) {
  const open = view.expanded === c.id;
  const sites = sitesOf(c);
  const details = [c.role, c.company].filter(Boolean).join(" · ");
  const tags = (sites.length ? sites.map(siteCode) : ["Ville"])
    .map(t => `<span class="contact-tag">${escapeHtml(t)}</span>`).join("");
  const prio = c.priority !== undefined && c.priority !== "" ? `<span class="contact-prio p${escapeHtml(c.priority)}" title="Priorité ${escapeHtml(c.priority)}">P${escapeHtml(c.priority)}</span>` : "";
  return `
    <div class="contact-row${open ? " open" : ""}" data-id="${escapeHtml(c.id)}">
      <div class="contact-row-main">
        <div class="contact-avatar">${escapeHtml(initials(c))}</div>
        <div class="contact-who">
          <b>${escapeHtml(displayName(c))}${prio}</b>
          <span>${tags}${escapeHtml(details)}</span>
        </div>
        <div class="contact-quick">
          ${c.phone ? `<a href="${escapeHtml(telHref(c.phone))}" title="Appeler ${escapeHtml(c.phone)}" aria-label="Appeler">📞</a>` : ""}
          ${c.email ? `<a href="mailto:${escapeHtml(c.email)}" title="Écrire à ${escapeHtml(c.email)}" aria-label="Écrire">✉️</a>` : ""}
        </div>
      </div>
      ${open ? `
        <div class="contact-details">
          ${c.company ? `<div>🏢 ${escapeHtml(c.company)}</div>` : ""}
          ${c.category ? `<div>📂 ${escapeHtml(c.category)}</div>` : ""}
          ${c.subject ? `<div>🏷️ ${escapeHtml(c.subject)}</div>` : ""}
          ${c.phone ? `<div>📞 <a href="${escapeHtml(telHref(c.phone))}">${escapeHtml(c.phone)}</a></div>` : ""}
          ${c.email ? `<div>✉️ <a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a></div>` : ""}
          <div>📍 ${escapeHtml(sites.length ? sites.map(s => siteLabel(c.city, s)).join(", ") : "Toute la ville")}</div>
          ${prio ? `<div>⭐ Priorité ${escapeHtml(c.priority)}</div>` : ""}
          ${c.note ? `<div class="contact-note">📝 ${escapeHtml(c.note)}</div>` : ""}
          ${edit ? `
            <div class="contact-actions">
              <button type="button" class="contact-edit">Modifier</button>
              <button type="button" class="sites-editor-remove contact-delete">Supprimer</button>
            </div>` : ""}
        </div>` : ""}
    </div>`;
}

function renderForm(c) {
  const city = view.city;
  const v = c ? { ...c } : { sites: view.site ? [view.site] : (view.filter && view.filter !== "all" ? [view.filter] : []) };
  if (c && !c.firstName && !c.lastName && c.name) v.firstName = c.name;   // anciens contacts : nom en un seul champ
  const chosen = sitesOf(v);
  const siteIds = Object.keys(PORTAIL.cities?.[city]?.sites || {});
  chosen.forEach(s => { if (!siteIds.includes(s)) siteIds.push(s); });
  const categories = [...new Set(contacts.filter(x => x.city === city).map(x => x.category).filter(Boolean))].sort(collator.compare);
  return `
    <div class="contact-form" id="contact-form">
      <div class="contacts-group-title">${c ? "Modifier le contact" : "Nouveau contact"}</div>
      <div class="contact-form-grid">
        ${FIELDS.map(f => `
          <div class="cf-field cf-field-${f.key}">
            <label class="profile-label">${f.label}</label>
            ${f.key === "note"
              ? `<textarea class="profile-input cf-${f.key}" maxlength="${f.max}" rows="2" placeholder="${escapeHtml(f.placeholder)}">${escapeHtml(v[f.key] || "")}</textarea>`
              : `<input class="profile-input cf-${f.key}" type="${f.type || "text"}" maxlength="${f.max}" placeholder="${escapeHtml(f.placeholder)}" value="${escapeHtml(v[f.key] || "")}"${f.list ? ` list="${f.list}"` : ""}/>`}
          </div>`).join("")}
        <div class="cf-field">
          <label class="profile-label">Priorité</label>
          <select class="profile-input cf-priority">
            ${PRIORITIES.map(p => `<option value="${p}"${String(v.priority ?? "") === p ? " selected" : ""}>${p === "" ? "—" : p}</option>`).join("")}
          </select>
        </div>
      </div>
      <datalist id="contacts-categories">${categories.map(s => `<option value="${escapeHtml(s)}">`).join("")}</datalist>
      <label class="profile-label">Sites <span class="profile-help">(aucun coché = toute la ville)</span></label>
      <div class="cf-sites">
        ${siteIds.map(id => `<label class="cf-site-check"><input type="checkbox" value="${escapeHtml(id)}"${chosen.includes(id) ? " checked" : ""}/> ${escapeHtml(siteCode(id))}</label>`).join("")}
      </div>
      <p class="profile-help" id="contact-form-message"></p>
      <div class="sites-editor-actions">
        <button type="button" class="direct-btn" id="contact-cancel">Annuler</button>
        <button type="button" class="direct-btn" id="contact-save" style="background:var(--navy);color:#fff;">Enregistrer</button>
      </div>
    </div>`;
}

function bind(page) {
  const searchInput = page.querySelector("#contacts-search");
  searchInput?.addEventListener("input", e => {
    view.search = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const again = document.getElementById("contacts-search");
    if (again) { again.focus(); again.setSelectionRange(pos, pos); }
  });
  page.querySelectorAll(".contacts-chip").forEach(chip => chip.addEventListener("click", () => {
    view.filter = chip.dataset.filter;
    view.subject = "";
    render();
  }));
  page.querySelector("#contacts-subject")?.addEventListener("change", e => { view.subject = e.target.value; render(); });
  page.querySelector("#contacts-add")?.addEventListener("click", () => {
    view.editing = "new";
    render();
    document.querySelector("#contact-form .cf-firstName")?.focus();
  });
  page.querySelector("#contacts-import")?.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (file) readImport(file);
  });
  page.querySelectorAll(".contact-row").forEach(row => {
    const c = contacts.find(x => x.id === row.dataset.id);
    if (!c) return;
    row.querySelector(".contact-row-main").addEventListener("click", e => {
      if (e.target.closest("a")) return;                 // appel ou e-mail direct
      view.expanded = view.expanded === c.id ? null : c.id;
      render();
    });
    row.querySelector(".contact-edit")?.addEventListener("click", () => { view.editing = c.id; render(); });
    row.querySelector(".contact-delete")?.addEventListener("click", () => removeContact(c));
  });
  const form = page.querySelector("#contact-form");
  if (form) {
    form.querySelector("#contact-cancel").addEventListener("click", () => { view.editing = null; render(); });
    form.querySelector("#contact-save").addEventListener("click", () => saveContact(form));
  }
  const imp = page.querySelector("#contacts-import-box");
  if (imp) {
    imp.querySelector("#import-cancel").addEventListener("click", () => { view.importing = null; render(); });
    imp.querySelector("#import-go").addEventListener("click", () => runImport(imp));
  }
}

function formMessage(text, isError) {
  const el = document.getElementById("contact-form-message");
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? "#dc2626" : "";
}

// ── Enregistrement ────────────────────────────────────────

function cleanContact(raw) {
  const data = {};
  FIELDS.forEach(f => { data[f.key] = String(raw[f.key] || "").trim().slice(0, f.max); });
  data.priority = PRIORITIES.includes(String(raw.priority ?? "")) ? String(raw.priority ?? "") : "";
  data.sites = (raw.sites || []).slice(0, 20);
  data.name = ([data.firstName, data.lastName].filter(Boolean).join(" ") || data.company).slice(0, 80);
  return data;
}

async function saveContact(form) {
  const city = view.city;
  if (!canEdit(city)) return;
  const raw = { sites: [...form.querySelectorAll(".cf-sites input:checked")].map(i => i.value) };
  FIELDS.forEach(f => { raw[f.key] = form.querySelector(".cf-" + f.key).value; });
  raw.priority = form.querySelector(".cf-priority").value;
  const data = { city, ...cleanContact(raw) };
  if (!data.name) return formMessage("Indique au moins un prénom, un nom ou une entreprise.", true);
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return formMessage("L'e-mail ne semble pas valide.", true);

  const btn = form.querySelector("#contact-save");
  btn.disabled = true;
  formMessage("Enregistrement...");
  try {
    if (view.editing && view.editing !== "new") {
      await updateDoc(doc(db, "contacts", view.editing), { ...data, site: deleteField(), updatedAt: serverTimestamp() });
      const i = contacts.findIndex(c => c.id === view.editing);
      if (i >= 0) { contacts[i] = { ...contacts[i], ...data }; delete contacts[i].site; }
      view.expanded = view.editing;
    } else {
      const ref = await addDoc(collection(db, "contacts"), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      contacts.push({ id: ref.id, ...data });
      view.expanded = ref.id;
    }
    view.editing = null;
    render();
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    formMessage("Impossible d'enregistrer le contact. Réessaie plus tard.", true);
  }
}

async function removeContact(c) {
  if (!canEdit(c.city)) return;
  if (!confirm(`Supprimer le contact « ${displayName(c)} » ?`)) return;
  try {
    await deleteDoc(doc(db, "contacts", c.id));
    contacts = contacts.filter(x => x.id !== c.id);
    render();
  } catch (err) {
    console.error(err);
    alert("Impossible de supprimer ce contact. Réessaie plus tard.");
  }
}

// ── Import CSV (export Google Sheets) ─────────────────────
// Colonnes reconnues (en-têtes du tableau de l'équipe) : Catégorie, Prénom, Nom, Entreprise, Objet, Rôle,
// Priorité, E-mail 1, Site, Phone 1 - Value, Notes. Site : NABO06, plusieurs sites séparés par
// une virgule ou un retour à la ligne, ou MULTISITE / HIPTOWN / vide = toute la ville.
// Les lignes de titre (une seule case remplie, ex. « Badges ») donnent la catégorie des lignes suivantes.

function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const sep = (text.split("\n")[0].match(/;/g) || []).length > (text.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  const rows = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

const HEADERS = {
  firstName: ["prenom", "first name", "given name"],
  lastName:  ["nom", "last name", "family name"],
  company:   ["entreprise", "societe", "company", "organization name"],
  category:  ["categorie", "category", "groupe"],
  subject:   ["objet"],
  role:      ["role", "fonction", "poste", "title"],
  priority:  ["priorite", "priority"],
  email:     ["e-mail 1", "e-mail", "email", "mail", "e-mail 1 - value"],
  sites:     ["site", "sites"],
  phone:     ["phone 1 - value", "telephone", "tel", "phone", "mobile"],
  note:      ["notes", "note", "remarque"]
};
const norm = t => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function readImport(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCsv(String(reader.result || ""));
    const head = (rows.shift() || []).map(norm);
    const col = {};
    Object.entries(HEADERS).forEach(([key, names]) => {
      const i = head.findIndex(h => names.includes(h));
      if (i >= 0) col[key] = i;
    });
    if (col.firstName == null && col.lastName == null && col.company == null) {
      alert("Ce fichier ne ressemble pas au tableau des contacts : il faut au moins une colonne Prénom, Nom ou Entreprise.");
      return;
    }
    const city = view.city;
    const siteIds = Object.keys(PORTAIL.cities?.[city]?.sites || {});
    const existing = new Set(contacts.filter(c => c.city === city).map(c => norm(displayName(c)) + "|" + String(c.phone || "").replace(/\D/g, "")));
    const out = []; let skipped = 0, title = "";
    rows.forEach(r => {
      const filled = r.filter(c => c.trim());
      if (filled.length <= 1) { title = (filled[0] || "").trim(); return; }   // ligne de titre (« Badges ») = catégorie

      const get = k => (col[k] != null ? String(r[col[k]] || "").trim() : "");
      let email = get("email"), note = get("note");
      // « Nom » = case e-mail vide dans Google Sheets ; autre texte qui n'est pas un e-mail : gardé dans les notes
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (email && norm(email) !== "nom") note = [note, "E-mail indiqué dans le tableau : " + email].filter(Boolean).join("\n");
        email = "";
      }
      const sites = get("sites").split(/[\n,;/]+/).map(s => s.trim().toLowerCase()).filter(s => siteIds.includes(s));
      const data = cleanContact({
        firstName: get("firstName"), lastName: get("lastName"), company: get("company"),
        category: get("category") || title, subject: get("subject"),
        role: get("role"), priority: get("priority").replace(/\D/g, ""), email, phone: get("phone"), note, sites
      });
      if (!data.name) { skipped++; return; }
      const key = norm(data.name) + "|" + data.phone.replace(/\D/g, "");
      if (existing.has(key)) { skipped++; return; }                      // déjà dans l'appli
      existing.add(key);
      out.push(data);
    });
    view.importing = { rows: out, skipped, fileName: file.name };
    render();
  };
  reader.readAsText(file, "utf-8");
}

function renderImport() {
  const { rows, skipped, fileName } = view.importing;
  const cityName = PORTAIL.cities?.[view.city]?.name || view.city;
  return `
    <div class="contact-form" id="contacts-import-box">
      <div class="contacts-group-title">Importer « ${escapeHtml(fileName)} »</div>
      <p class="contacts-import-sum"><b>${rows.length}</b> contact${rows.length > 1 ? "s" : ""} à ajouter à ${escapeHtml(cityName)}${skipped ? ` · ${skipped} ignoré${skipped > 1 ? "s" : ""} (déjà présents ou sans nom)` : ""}.</p>
      <div class="contacts-import-list">
        ${rows.slice(0, 200).map(c => `<div>${escapeHtml(c.name)} <span>${escapeHtml([c.category || c.subject, c.sites.length ? c.sites.map(siteCode).join(", ") : "Ville"].filter(Boolean).join(" · "))}</span></div>`).join("")}
      </div>
      <p class="profile-help" id="import-message"></p>
      <div class="sites-editor-actions">
        <button type="button" class="direct-btn" id="import-cancel">Annuler</button>
        <button type="button" class="direct-btn" id="import-go" style="background:var(--navy);color:#fff;"${rows.length ? "" : " disabled"}>Importer ${rows.length}</button>
      </div>
    </div>`;
}

async function runImport(box) {
  const city = view.city;
  if (!canEdit(city) || !view.importing) return;
  const btn = box.querySelector("#import-go");
  const msg = box.querySelector("#import-message");
  btn.disabled = true; box.querySelector("#import-cancel").disabled = true;
  const rows = view.importing.rows;
  let done = 0, failed = 0;
  for (const data of rows) {
    try {
      const full = { city, ...data };
      const ref = await addDoc(collection(db, "contacts"), { ...full, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      contacts.push({ id: ref.id, ...full });
      done++;
    } catch (err) {
      console.error(err);
      failed++;
    }
    msg.textContent = `Import en cours... ${done + failed} / ${rows.length}`;
  }
  view.importing = null;
  render();
  drawTiles();
  if (failed) alert(`${done} contacts importés, ${failed} n'ont pas pu être enregistrés.`);
}

// ── Branchements ──────────────────────────────────────────

document.getElementById("back-from-contacts")?.addEventListener("click", closeContacts);

// Clic sur un site (app.js remplit la page du site) : on note le site pour sa case Contacts
document.getElementById("sites-by-city")?.addEventListener("click", e => {
  const card = e.target.closest(".site-card");
  if (!card) return;
  detailSite = card.dataset.site;
  drawSiteTile();
});

document.addEventListener("hiptown-dashboard", e => {
  const { space, scope } = e.detail;
  view.editing = null; view.importing = null;
  const allCities = Object.keys(PORTAIL.cities || {});
  if (space !== "hiptown" || e.detail.preview) {
    ctx = null;                                                   // client ou aperçu : pas de contacts
  } else if (!scope) {
    ctx = { all: true, readCities: allCities, editCities: allCities };   // admin général
  } else if (scope.siteIds) {
    ctx = { readCities: [scope.city], editCities: [] };           // équipe de site : lecture seule
  } else {
    ctx = { readCities: [scope.city], editCities: [scope.city] }; // admin de ville
  }
  refreshAll();
  loadContacts();
});

// Page Sites reconstruite (sites ajoutés ou renommés, sites.js) : on remet les cases
document.addEventListener("hiptown-sites-changed", refreshAll);
document.addEventListener("hiptown-sites-city", drawTiles);
