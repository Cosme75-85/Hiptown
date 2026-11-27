// ═══════════════════════════════════════════════════════
//  CONTACTS PAR VILLE ET PAR SITE
// ═══════════════════════════════════════════════════════
//  - Page Sites : une case carrée « Contacts » en première place de la grille de chaque ville.
//    Un clic ouvre la page Contacts de la ville (tous ses contacts, recherche, filtres).
//  - Page d'un site : une case carrée « Contacts » au-dessus des outils.
//    Un clic ouvre les contacts de ce site (puis ceux de toute la ville).
//
//  Firestore : contacts/{id} = { city, site, name, role, company, phone, email, note, createdAt, updatedAt }
//  - city : ville du contact (ex. "bordeaux") ; site : site de la ville (ex. "nabo06") ou "" (toute la ville)
//  Visibles seulement par l'équipe Hiptown (firestore.rules) :
//  - admin général : toutes les villes, ajoute / modifie / supprime partout
//  - admin de ville : sa ville seulement, ajoute / modifie / supprime
//  - équipe de site : les contacts de sa ville, en lecture seule

import { db } from "./firebase-config.js";
import {
  collection, getDocs, query, where, doc, addDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const FIELDS = [
  { key: "name",    label: "Nom",       max: 80,  placeholder: "Prénom Nom" },
  { key: "role",    label: "Rôle",      max: 80,  placeholder: "Ex. Responsable de site, plombier..." },
  { key: "company", label: "Société",   max: 80,  placeholder: "Facultatif" },
  { key: "phone",   label: "Téléphone", max: 30,  placeholder: "06 12 34 56 78", type: "tel" },
  { key: "email",   label: "E-mail",    max: 120, placeholder: "nom@exemple.fr", type: "email" },
  { key: "note",    label: "Note",      max: 300, placeholder: "Horaires, code d'accès, remarque..." }
];

let ctx = null;        // { all, readCities, editCities } selon le compte connecté ; null = pas de contacts
let contacts = [];     // contacts chargés : [{ id, city, site, name, ... }]
let loaded = false;

// Page Contacts ouverte
const view = {
  city: null,          // ville affichée
  site: null,          // site affiché (page d'un site) ou null (toute la ville)
  filter: "all",       // page ville : "all", "" (toute la ville) ou un id de site
  search: "",
  editing: null,       // null, "new", ou l'id du contact en cours de modification
  expanded: null,      // contact déplié (détails et boutons)
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
function telHref(phone) { return "tel:" + String(phone).replace(/[^0-9+]/g, ""); }
function initials(name) {
  return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}
function countOf(city, site) {
  return contacts.filter(c => c.city === city && (site == null || (c.site || "") === site)).length;
}

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

function tileHtml(sub, count) {
  return `<span class="contacts-tile-badge">${loaded ? count : "…"}</span>
    <span class="contacts-tile-icon">📇</span>
    <span class="contacts-tile-title">Contacts</span>
    <span class="contacts-tile-sub">${escapeHtml(sub)}</span>`;
}

/** Page Sites : une case en première place de la grille de chaque ville visible. */
function drawTiles() {
  document.querySelectorAll("#sites-by-city .sites-city").forEach(group => {
    const city = group.dataset.city;
    let grid = group.querySelector(".sites-grid");
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
    tile.innerHTML = tileHtml(PORTAIL.cities?.[city]?.name || city, countOf(city, null));
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
  box.firstElementChild.innerHTML = tileHtml(siteCode(detailSite), countOf(city, detailSite));
}

// ── Page Contacts ─────────────────────────────────────────

function openContacts(city, site, backTo) {
  Object.assign(view, { city, site, filter: "all", search: "", editing: null, expanded: null, backTo });
  if (window.hideAll) window.hideAll();
  document.getElementById("step-contacts").hidden = false;
  document.getElementById("back-from-contacts").textContent = site ? siteCode(site) : "Sites";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeContacts() {
  if (window.hideAll) window.hideAll();
  (view.backTo || document.getElementById("step-hiptown-espaces")).hidden = false;
  view.editing = null;
  drawTiles(); drawSiteTile();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function matches(c) {
  const words = view.search.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  // Tous les champs du contact comptent pour la recherche (y compris ceux ajoutés plus tard)
  const text = Object.entries(c)
    .filter(([k, v]) => !["id", "city", "createdAt", "updatedAt"].includes(k) && typeof v !== "object")
    .map(([, v]) => String(v)).concat(siteLabel(c.city, c.site), siteCode(c.site))
    .join(" ").toLowerCase();
  return words.every(w => text.includes(w));
}

function render() {
  const page = document.getElementById("contacts-page");
  if (!page || !view.city) return;
  const { city, site } = view;
  const edit = canEdit(city);
  const cityName = PORTAIL.cities?.[city]?.name || city;
  document.getElementById("contacts-title").textContent = "📇 Contacts · " + (site ? siteCode(site) : cityName);

  const ofCity = contacts.filter(c => c.city === city);
  const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""), "fr");
  let groups;   // [{ title, items }]
  if (site) {
    // Page d'un site : ses contacts, puis ceux de toute la ville
    groups = [
      { title: siteLabel(city, site), items: ofCity.filter(c => c.site === site) },
      { title: "Toute la ville", items: ofCity.filter(c => !c.site) }
    ];
  } else {
    const siteIds = Object.keys(PORTAIL.cities?.[city]?.sites || {});
    const order = ["", ...siteIds];
    ofCity.forEach(c => { if (!order.includes(c.site || "")) order.push(c.site); });
    groups = order
      .filter(s => view.filter === "all" || view.filter === s)
      .map(s => ({ title: siteLabel(city, s), items: ofCity.filter(c => (c.site || "") === s) }));
  }
  groups.forEach(g => { g.items = g.items.filter(matches).sort(byName); });
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  // Filtres de la page ville : Tous, Ville, puis chaque site qui a des contacts
  let chips = "";
  if (!site && ofCity.length) {
    const used = [...new Set(ofCity.map(c => c.site || ""))]
      .sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
    chips = `<div class="contacts-chips">
      ${[["all", "Tous"], ...used.map(s => [s, siteCode(s)])].map(([id, label]) =>
        `<button type="button" class="contacts-chip${view.filter === id ? " on" : ""}" data-filter="${escapeHtml(id)}">${escapeHtml(label)}</button>`).join("")}
    </div>`;
  }

  page.innerHTML = `
    ${!loaded ? `<p class="profile-help">Chargement...</p>` : `
    <input class="profile-input contacts-search" id="contacts-search" type="search"
      placeholder="🔍 Nom, rôle, société, site, téléphone, e-mail, note..." value="${escapeHtml(view.search)}"/>
    ${chips}
    ${edit && view.editing !== "new" ? `<button type="button" class="contacts-add-btn" id="contacts-add">+ Ajouter un contact${site ? " à " + escapeHtml(siteCode(site)) : ""}</button>` : ""}
    ${view.editing === "new" ? renderForm(null) : ""}
    ${groups.filter(g => g.items.length).map(g => `
      <div class="contacts-group-title">${escapeHtml(g.title)}</div>
      ${g.items.map(c => view.editing === c.id ? renderForm(c) : renderRow(c, edit)).join("")}`).join("")}
    ${total ? "" : `<p class="contacts-empty">${ofCity.length && view.search ? "Aucun contact ne correspond à la recherche." : "Aucun contact pour l'instant."}</p>`}`}`;
  if (loaded) bind(page);
}

function renderRow(c, edit) {
  const open = view.expanded === c.id;
  const details = [c.role, c.company].filter(Boolean).join(" · ");
  return `
    <div class="contact-row${open ? " open" : ""}" data-id="${escapeHtml(c.id)}">
      <div class="contact-row-main">
        <div class="contact-avatar">${escapeHtml(initials(c.name))}</div>
        <div class="contact-who">
          <b>${escapeHtml(c.name)}</b>
          <span><span class="contact-tag">${escapeHtml(siteCode(c.site))}</span>${escapeHtml(details)}</span>
        </div>
        <div class="contact-quick">
          ${c.phone ? `<a href="${escapeHtml(telHref(c.phone))}" title="Appeler ${escapeHtml(c.phone)}" aria-label="Appeler">📞</a>` : ""}
          ${c.email ? `<a href="mailto:${escapeHtml(c.email)}" title="Écrire à ${escapeHtml(c.email)}" aria-label="Écrire">✉️</a>` : ""}
        </div>
      </div>
      ${open ? `
        <div class="contact-details">
          ${c.phone ? `<div>📞 <a href="${escapeHtml(telHref(c.phone))}">${escapeHtml(c.phone)}</a></div>` : ""}
          ${c.email ? `<div>✉️ <a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a></div>` : ""}
          <div>📍 ${escapeHtml(siteLabel(c.city, c.site))}</div>
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
  const v = c || { site: view.site || (view.filter !== "all" ? view.filter : "") };
  const city = view.city;
  const siteIds = Object.keys(PORTAIL.cities?.[city]?.sites || {});
  const options = [["", "Toute la ville"], ...siteIds.map(id => [id, siteLabel(city, id)])];
  if (v.site && !siteIds.includes(v.site)) options.push([v.site, v.site.toUpperCase() + " (site retiré)"]);
  return `
    <div class="contact-form" id="contact-form">
      <div class="contacts-group-title">${c ? "Modifier le contact" : "Nouveau contact"}</div>
      <label class="profile-label">Site</label>
      <select class="profile-input cf-site">
        ${options.map(([id, label]) => `<option value="${escapeHtml(id)}"${id === (v.site || "") ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}
      </select>
      ${FIELDS.map(f => `
        <label class="profile-label">${f.label}${f.key === "name" ? " *" : ""}</label>
        ${f.key === "note"
          ? `<textarea class="profile-input cf-${f.key}" maxlength="${f.max}" rows="2" placeholder="${escapeHtml(f.placeholder)}">${escapeHtml(v[f.key] || "")}</textarea>`
          : `<input class="profile-input cf-${f.key}" type="${f.type || "text"}" maxlength="${f.max}" placeholder="${escapeHtml(f.placeholder)}" value="${escapeHtml(v[f.key] || "")}"/>`}`).join("")}
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
    render();
  }));
  page.querySelector("#contacts-add")?.addEventListener("click", () => {
    view.editing = "new";
    render();
    document.querySelector("#contact-form .cf-name")?.focus();
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
}

function formMessage(text, isError) {
  const el = document.getElementById("contact-form-message");
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? "#dc2626" : "";
}

// ── Enregistrement ────────────────────────────────────────

async function saveContact(form) {
  const city = view.city;
  if (!canEdit(city)) return;
  const data = { city, site: form.querySelector(".cf-site").value || "" };
  FIELDS.forEach(f => { data[f.key] = form.querySelector(".cf-" + f.key).value.trim().slice(0, f.max); });
  if (!data.name) return formMessage("Le nom est obligatoire.", true);
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return formMessage("L'e-mail ne semble pas valide.", true);

  const btn = form.querySelector("#contact-save");
  btn.disabled = true;
  formMessage("Enregistrement...");
  try {
    if (view.editing && view.editing !== "new") {
      await updateDoc(doc(db, "contacts", view.editing), { ...data, updatedAt: serverTimestamp() });
      const i = contacts.findIndex(c => c.id === view.editing);
      if (i >= 0) contacts[i] = { ...contacts[i], ...data };
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
  if (!confirm(`Supprimer le contact « ${c.name} » ?`)) return;
  try {
    await deleteDoc(doc(db, "contacts", c.id));
    contacts = contacts.filter(x => x.id !== c.id);
    render();
  } catch (err) {
    console.error(err);
    alert("Impossible de supprimer ce contact. Réessaie plus tard.");
  }
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
  view.editing = null;
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
