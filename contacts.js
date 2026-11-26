// ═══════════════════════════════════════════════════════
//  CONTACTS PAR VILLE ET PAR SITE — case « Contacts » en haut de la page Sites
// ═══════════════════════════════════════════════════════
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

let ctx = null;        // { readCities, editCities } selon le compte connecté ; null = pas de case
let contacts = [];     // contacts chargés : [{ id, city, site, name, ... }]
let loaded = false;
let shownCity = null;  // ville affichée sur la page Sites
let open = false;      // case dépliée ?
let editing = null;    // null, "new", ou l'id du contact en cours de modification
let search = "";

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text == null ? "" : String(text);
  return d.innerHTML;
}

function canRead(city) { return !!ctx && !!city && ctx.readCities.includes(city); }
function canEdit(city) { return !!ctx && !!city && ctx.editCities.includes(city); }

function siteLabel(city, site) {
  if (!site) return "Toute la ville";
  return PORTAIL.cities?.[city]?.sites?.[site] || site.toUpperCase();
}

function telHref(phone) { return "tel:" + String(phone).replace(/[^0-9+]/g, ""); }

// ── Chargement ────────────────────────────────────────────

async function loadContacts() {
  loaded = false;
  contacts = [];
  if (!ctx) return;
  render();
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
  render();
}

// ── Affichage ─────────────────────────────────────────────

function render() {
  const box = document.getElementById("sites-contacts");
  if (!box) return;
  if (!canRead(shownCity)) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  const cityName = PORTAIL.cities?.[shownCity]?.name || shownCity;
  const mine = contacts.filter(c => c.city === shownCity);
  const count = loaded ? ` (${mine.length})` : "";

  let body = "";
  if (open) {
    if (!loaded) body = `<p class="profile-help">Chargement...</p>`;
    else body = renderBody(mine);
  }
  box.innerHTML = `
    <div class="contacts-box${open ? " open" : ""}">
      <button type="button" class="contacts-head" id="contacts-toggle" aria-expanded="${open}">
        <span class="contacts-icon">📇</span>
        <span class="contacts-title">Contacts</span>
        <span class="contacts-sub">${escapeHtml(cityName)}${count}</span>
        <span class="contacts-chevron">${open ? "▲" : "▼"}</span>
      </button>
      ${open ? `<div class="contacts-body">${body}</div>` : ""}
    </div>`;
  box.querySelector("#contacts-toggle").addEventListener("click", () => {
    open = !open;
    if (!open) editing = null;
    render();
  });
  if (open && loaded) bindBody(box, mine);
}

function matches(c) {
  if (!search) return true;
  const s = search.toLowerCase();
  return ["name", "role", "company", "phone", "email", "note"].some(k => String(c[k] || "").toLowerCase().includes(s))
    || siteLabel(c.city, c.site).toLowerCase().includes(s);
}

function renderBody(mine) {
  const edit = canEdit(shownCity);
  const list = mine.filter(matches);
  // Groupes : toute la ville d'abord, puis chaque site dans l'ordre de la page Sites
  const siteIds = Object.keys(PORTAIL.cities?.[shownCity]?.sites || {});
  const groups = ["", ...siteIds];
  list.forEach(c => { if (!groups.includes(c.site || "")) groups.push(c.site); });
  const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""), "fr");

  const groupsHtml = groups.map(site => {
    const items = list.filter(c => (c.site || "") === site).sort(byName);
    if (!items.length) return "";
    return `
      <div class="contacts-group">
        <div class="contacts-group-title">${escapeHtml(siteLabel(shownCity, site))}</div>
        ${items.map(c => editing === c.id ? renderForm(c) : renderCard(c, edit)).join("")}
      </div>`;
  }).join("");

  return `
    ${mine.length > 4 ? `<input class="profile-input contacts-search" id="contacts-search" placeholder="Rechercher un nom, un rôle, un site..." value="${escapeHtml(search)}"/>` : ""}
    ${edit && editing !== "new" ? `<button type="button" class="direct-btn contacts-add-btn" id="contacts-add">+ Ajouter un contact</button>` : ""}
    ${editing === "new" ? renderForm(null) : ""}
    ${groupsHtml || `<p class="profile-help">${mine.length ? "Aucun contact ne correspond à la recherche." : "Aucun contact pour l'instant."}</p>`}`;
}

function renderCard(c, edit) {
  return `
    <div class="contact-card" data-id="${escapeHtml(c.id)}">
      <div class="contact-main">
        <div class="contact-name">${escapeHtml(c.name)}</div>
        ${c.role || c.company ? `<div class="contact-role">${escapeHtml([c.role, c.company].filter(Boolean).join(" · "))}</div>` : ""}
        <div class="contact-links">
          ${c.phone ? `<a href="${escapeHtml(telHref(c.phone))}">📞 ${escapeHtml(c.phone)}</a>` : ""}
          ${c.email ? `<a href="mailto:${escapeHtml(c.email)}">✉️ ${escapeHtml(c.email)}</a>` : ""}
        </div>
        ${c.note ? `<div class="contact-note">${escapeHtml(c.note)}</div>` : ""}
      </div>
      ${edit ? `
        <div class="contact-actions">
          <button type="button" class="contact-edit">Modifier</button>
          <button type="button" class="sites-editor-remove contact-delete">Supprimer</button>
        </div>` : ""}
    </div>`;
}

function renderForm(c) {
  const v = c || { site: "" };
  const siteIds = Object.keys(PORTAIL.cities?.[shownCity]?.sites || {});
  const options = [["", "Toute la ville"], ...siteIds.map(id => [id, siteLabel(shownCity, id)])];
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

function bindBody(box, mine) {
  const searchInput = box.querySelector("#contacts-search");
  if (searchInput) {
    searchInput.addEventListener("input", e => {
      search = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const again = document.getElementById("contacts-search");
      if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    });
  }
  box.querySelector("#contacts-add")?.addEventListener("click", () => {
    editing = "new";
    render();
    document.querySelector("#contact-form .cf-name")?.focus();
  });
  box.querySelectorAll(".contact-card").forEach(card => {
    const c = mine.find(x => x.id === card.dataset.id);
    if (!c) return;
    card.querySelector(".contact-edit")?.addEventListener("click", () => { editing = c.id; render(); });
    card.querySelector(".contact-delete")?.addEventListener("click", () => removeContact(c));
  });
  const form = box.querySelector("#contact-form");
  if (form) {
    form.querySelector("#contact-cancel").addEventListener("click", () => { editing = null; render(); });
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
  const city = shownCity;
  if (!canEdit(city)) return;
  const data = { city, site: form.querySelector(".cf-site").value || "" };
  FIELDS.forEach(f => { data[f.key] = form.querySelector(".cf-" + f.key).value.trim().slice(0, f.max); });
  if (!data.name) return formMessage("Le nom est obligatoire.", true);
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return formMessage("L'e-mail ne semble pas valide.", true);

  const btn = form.querySelector("#contact-save");
  btn.disabled = true;
  formMessage("Enregistrement...");
  try {
    if (editing && editing !== "new") {
      await updateDoc(doc(db, "contacts", editing), { ...data, updatedAt: serverTimestamp() });
      const i = contacts.findIndex(c => c.id === editing);
      if (i >= 0) contacts[i] = { ...contacts[i], ...data };
    } else {
      const ref = await addDoc(collection(db, "contacts"), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      contacts.push({ id: ref.id, ...data });
    }
    editing = null;
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

// ── Contexte du compte connecté ───────────────────────────

document.addEventListener("hiptown-dashboard", e => {
  const { space, scope } = e.detail;
  editing = null; search = ""; open = false;
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
  loadContacts();
});

document.addEventListener("hiptown-sites-city", e => {
  if (e.detail !== shownCity) { editing = null; search = ""; }
  shownCity = e.detail;
  render();
});

// Sites ajoutés ou renommés (sites.js) : les noms des sites dans la case sont mis à jour
document.addEventListener("hiptown-sites-changed", render);
