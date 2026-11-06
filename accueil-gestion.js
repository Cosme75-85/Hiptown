// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Gestion > Accueil visiteurs
//  L'équipe d'une ville ajoute, modifie et retire les entreprises affichées sur la page
//  publique d'accueil de sa ville (lien dans PORTAIL.accueilPages, config.js).
//  Les entreprises qui ont un compte sur le portail ont leur case toute seule (accueil-fiche.js) et
//  peuvent tout régler elles-mêmes dans Mon profil. Ici, l'équipe règle aussi toutes les cases :
//  contact général (e-mail, téléphone), salariés (e-mail, téléphone) et code d'accès, obligatoire
//  dès qu'un téléphone est donné.
// ═══════════════════════════════════════════════════════

import {
  listAccueilCards, getAccueilPrivate, setAccueilPrivate, saveManualAccueilCard,
  deleteAccueilCard, resizeLogo, isSafeLogo, isValidEmail, isValidPin, newPersonId,
  cleanPhone, isValidPhone, saveAccueilSettings
} from "./accueil-fiche.js";

const MAX_PEOPLE = 30; // même limite que firestore.rules


const $ = id => document.getElementById(id);

let cities = [];      // villes que l'admin connecté gère
let city = null;      // ville affichée
let editing = null;   // case en cours de modification (null = nouvelle)
let formLogo = "";
let formPeople = [];  // [{id, name, role, email, phone, orig}] (orig : la personne telle qu'enregistrée)

function escapeHtml(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function showMessage(id, text, isError) {
  const el = $(id);
  el.textContent = text;
  el.style.color = isError ? "#dc2626" : "#166534";
  el.hidden = !text;
}

const cityName = c => PORTAIL.cities?.[c]?.name || c;
const sitesOf = c => PORTAIL.cities?.[c]?.sites || {};

/**
 * Affiche la page pour les villes de l'admin connecté.
 * @param {string[]} visibleCities  toutes les villes pour l'admin général, la sienne sinon
 */
export async function renderAccueilPanel(visibleCities) {
  cities = visibleCities;
  if (!cities.includes(city)) city = cities[0] || null;
  const select = $("accueil-city");
  select.innerHTML = cities.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(cityName(c))}</option>`).join("");
  select.value = city;
  $("accueil-city-row").hidden = cities.length < 2;
  closeForm();
  showMessage("accueil-gestion-message", "");
  await refresh();
}

async function refresh() {
  renderLink();
  const list = $("accueil-list");
  if (!city) {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = `<p style="color:#94a3b8;padding:12px;">Chargement…</p>`;
  try {
    const cards = await listAccueilCards(city);
    const privates = await Promise.all(cards.map(c => getAccueilPrivate(c.id).catch(() => ({ email: "", people: {}, pin: "" }))));
    list.innerHTML = "";
    if (!cards.length) {
      list.innerHTML = `<p style="color:#94a3b8;padding:12px;">Aucune entreprise sur la page de ${escapeHtml(cityName(city))} pour le moment.</p>`;
      return;
    }
    cards.forEach((c, i) => list.appendChild(cardRow(c, privates[i])));
  } catch (err) {
    console.error(err);
    list.innerHTML = `<p style="color:#dc2626;padding:12px;">Impossible de charger les entreprises.</p>`;
  }
}

function renderLink() {
  const url = (PORTAIL.accueilPages || {})[city] || "";
  $("accueil-link").textContent = url || "Pas encore de page d'accueil pour cette ville.";
  $("accueil-link-open").hidden = !url;
  $("accueil-link-open").href = url || "#";
  $("accueil-link-copy").hidden = !url;
}

/** Personnes affichées sous une case (choisies par l'équipe ou, pour une entreprise du portail, par elle-même). */
function peopleOf(c) {
  return Array.isArray(c.people) ? c.people : [];
}

function cardRow(c, priv) {
  const sites = sitesOf(city);
  const people = peopleOf(c);
  const details = [
    c.manual ? "" : (c.visible === true ? "compte portail · affichée" : "compte portail · masquée"),
    c.siteId ? (sites[c.siteId] || c.siteId) : "",
    priv.email || "pas d'e-mail : l'équipe Hiptown est prévenue",
    people.length ? people.length + (people.length > 1 ? " personnes" : " personne") : "",
    c.general ? "contact général" : "",
    (c.generalPhone || people.some(p => p.hasPhone)) ? "téléphones protégés par code" : "",
    c.locked ? "code pour les messages" : ""
  ].filter(Boolean).join(" · ");
  const logo = isSafeLogo(c.logo) ? `<img src="${escapeHtml(c.logo)}" alt="" style="width:44px;height:44px;object-fit:contain;border-radius:8px;background:#fff;"/>`
    : `<span class="company-badge" style="width:44px;height:44px;font-size:13px;">${escapeHtml((c.name || "?").slice(0, 2).toUpperCase())}</span>`;
  const row = document.createElement("div");
  row.className = "info-card";
  row.innerHTML = `
    <div class="info-item" style="gap:12px;">
      ${logo}
      <span style="flex:1;min-width:0;">
        <b>${escapeHtml(c.name)}</b><br>
        <span style="font-size:11px;color:#94a3b8;">${escapeHtml(details)}</span>
      </span>
      <button class="direct-btn" type="button" data-act="edit" style="margin-top:0;width:auto;padding:6px 12px;font-size:12px;">Modifier</button>
      ${c.manual ? `<button class="direct-btn" type="button" data-act="delete" style="margin-top:0;width:auto;padding:6px 12px;font-size:12px;color:#dc2626;">Retirer</button>` : ""}
    </div>`;
  row.querySelector('[data-act="edit"]').addEventListener("click", () => openForm(c, priv));
  row.querySelector('[data-act="delete"]')?.addEventListener("click", async () => {
    if (!confirm(`Retirer « ${c.name} » de la page d'accueil ?`)) return;
    try {
      await deleteAccueilCard(c.id);
      showMessage("accueil-gestion-message", `« ${c.name} » est retirée de la page.`, false);
      await refresh();
    } catch (err) {
      console.error(err);
      showMessage("accueil-gestion-message", "Suppression impossible. Réessayez.", true);
    }
  });
  return row;
}

function renderFormLogo() {
  const preview = $("accueil-form-logo-preview");
  preview.innerHTML = "";
  if (formLogo) {
    const img = document.createElement("img");
    img.src = formLogo;
    img.alt = "Logo";
    preview.appendChild(img);
  } else {
    preview.textContent = "Pas encore de logo";
  }
  $("accueil-form-logo-remove").hidden = !formLogo;
}

function renderFormPeople() {
  const box = $("accueil-form-people");
  box.innerHTML = "";
  formPeople.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "accueil-person";
    row.innerHTML = `
      <input type="text" class="profile-input" data-field="name" maxlength="80" placeholder="Nom *" aria-label="Nom"/>
      <input type="text" class="profile-input" data-field="role" maxlength="60" placeholder="Fonction" aria-label="Fonction"/>
      <input type="email" class="profile-input accueil-person-email" data-field="email" maxlength="120" placeholder="E-mail (facultatif)" aria-label="E-mail"/>
      <input type="tel" class="profile-input accueil-person-email" data-field="phone" maxlength="24" placeholder="Téléphone (facultatif)" aria-label="Téléphone"/>
      <button class="profile-link" type="button">Retirer</button>`;
    row.querySelectorAll("input").forEach(input => {
      input.value = p[input.dataset.field] || "";
      input.addEventListener("input", () => { p[input.dataset.field] = input.value; });
    });
    row.querySelector("button").addEventListener("click", () => {
      formPeople.splice(i, 1);
      renderFormPeople();
    });
    box.appendChild(row);
  });
  $("accueil-form-person-add").hidden = formPeople.length >= MAX_PEOPLE;
}

function openForm(card, priv) {
  priv = priv || { email: "", people: {}, pin: "", phone: "", phones: {} };
  editing = card || null;
  const portalCard = !!(card && !card.manual);
  $("accueil-form-title").textContent = card ? `Modifier « ${card.name} »` : "Nouvelle entreprise";
  $("accueil-form-name").value = card ? card.name : "";
  $("accueil-form-name").disabled = portalCard; // nom tenu par Gestion des entreprises

  const sites = sitesOf(city);
  const siteSelect = $("accueil-form-site");
  siteSelect.innerHTML = `<option value="">Tous les sites de ${escapeHtml(cityName(city))}</option>`
    + Object.keys(sites).map(id => `<option value="${escapeHtml(id)}">${escapeHtml(sites[id])}</option>`).join("");
  siteSelect.value = card && card.siteId ? card.siteId : "";
  siteSelect.disabled = portalCard;
  $("accueil-form-site-row").hidden = !Object.keys(sites).length;

  formLogo = card && isSafeLogo(card.logo) ? card.logo : "";
  renderFormLogo();
  $("accueil-form-email").value = priv.email || "";
  $("accueil-form-portal").hidden = !portalCard;
  if (portalCard) {
    $("accueil-form-visible").checked = card.visible === true;
    $("accueil-form-portal-status").textContent =
      "Compte du portail : ses salariés peuvent aussi changer ces réglages dans Mon profil.";
  }
  formPeople = (card && Array.isArray(card.people) ? card.people : []).map(p => ({
    id: p.id, name: p.name || "", role: p.role || "", email: priv.people[p.id] || "",
    phone: (priv.phones || {})[p.id] || "", orig: p
  }));
  renderFormPeople();
  $("accueil-form-pin").value = card ? priv.pin || "" : "";
  $("accueil-form-locked").checked = !!(card && card.locked === true);
  $("accueil-form-general").checked = !!(card && card.general === true);
  $("accueil-form-phone").value = card ? priv.phone || "" : "";
  showMessage("accueil-form-message", "");
  $("accueil-form").hidden = false;
  $("accueil-add").hidden = true;
  $("accueil-form-name").focus();
}

function closeForm() {
  editing = null;
  $("accueil-form").hidden = true;
  $("accueil-add").hidden = false;
}

async function saveForm() {
  const name = $("accueil-form-name").value.trim();
  const email = $("accueil-form-email").value.trim().toLowerCase();
  if (!name) return showMessage("accueil-form-message", "Le nom de l'entreprise est obligatoire.", true);
  if (email && !isValidEmail(email)) return showMessage("accueil-form-message", "L'adresse e-mail n'est pas valide.", true);
  const pin = $("accueil-form-pin").value.trim();
  if (pin && !isValidPin(pin)) return showMessage("accueil-form-message", "Le code d'accès doit faire 4 chiffres.", true);
  const phone = cleanPhone($("accueil-form-phone").value);
  const general = $("accueil-form-general").checked;
  const locked = $("accueil-form-locked").checked;
  if (phone && !isValidPhone(phone)) return showMessage("accueil-form-message", "Le téléphone de l'entreprise n'est pas valide.", true);
  const filled = formPeople.map(p => ({
    ...p, name: p.name.trim(), role: p.role.trim(), email: p.email.trim().toLowerCase(), phone: cleanPhone(p.phone)
  })).filter(p => p.name || p.role || p.email || p.phone);
  if (filled.some(p => !p.name)) return showMessage("accueil-form-message", "Chaque personne doit avoir un nom.", true);
  const wrong = filled.find(p => p.email && !isValidEmail(p.email));
  if (wrong) return showMessage("accueil-form-message", `L'e-mail de ${wrong.name} n'est pas valide.`, true);
  const wrongPhone = filled.find(p => p.phone && !isValidPhone(p.phone));
  if (wrongPhone) return showMessage("accueil-form-message", `Le téléphone de ${wrongPhone.name} n'est pas valide.`, true);
  // Un numéro n'est donné qu'avec le code d'accès : le code est alors obligatoire
  if (!pin && (phone || filled.some(p => p.phone))) {
    return showMessage("accueil-form-message", "Choisissez un code d'accès à 4 chiffres : il protège les téléphones.", true);
  }
  if (!pin && locked) return showMessage("accueil-form-message", "Choisissez le code d'accès à 4 chiffres.", true);
  const people = filled.map(p => {
    const person = { id: p.id || newPersonId(), name: p.name, role: p.role, hasPhone: !!p.phone };
    // Personne ajoutée par l'entreprise (Mon profil) et pas renommée : on garde son prénom et son nom
    if (p.orig && p.orig.name === p.name && p.orig.firstName != null) {
      person.firstName = p.orig.firstName;
      person.lastName = p.orig.lastName || "";
    }
    return person;
  });
  const peopleEmails = {};
  const peoplePhones = {};
  filled.forEach((p, i) => {
    if (p.email) peopleEmails[people[i].id] = p.email;
    if (p.phone) peoplePhones[people[i].id] = p.phone;
  });

  const btn = $("accueil-form-save");
  btn.disabled = true;
  try {
    let id;
    if (editing && !editing.manual) {
      id = editing.id;
      await saveAccueilSettings(id, {
        logo: formLogo, visible: $("accueil-form-visible").checked, locked, general,
        generalPhone: general && !!phone, people
      });
      await setAccueilPrivate(id, { email, people: peopleEmails, pin, phone, phones: peoplePhones });
    } else {
      id = await saveManualAccueilCard(editing ? editing.id : null,
        { name, city, siteId: $("accueil-form-site").value || null, logo: formLogo, people, locked,
          general, generalPhone: general && !!phone });
      // après la case : les règles lisent sa ville
      await setAccueilPrivate(id, { email, people: peopleEmails, pin, phone, phones: peoplePhones });
    }
    showMessage("accueil-gestion-message", `« ${name} » est enregistrée.`, false);
    closeForm();
    await refresh();
  } catch (err) {
    console.error(err);
    showMessage("accueil-form-message", "Enregistrement impossible. Réessayez.", true);
  } finally {
    btn.disabled = false;
  }
}

$("accueil-city")?.addEventListener("change", async e => {
  city = e.target.value;
  closeForm();
  await refresh();
});
$("accueil-add")?.addEventListener("click", () => openForm(null, null));
$("accueil-form-person-add")?.addEventListener("click", () => {
  formPeople.push({ id: null, name: "", role: "", email: "", phone: "" });
  renderFormPeople();
  $("accueil-form-people").lastElementChild?.querySelector("input")?.focus();
});
$("accueil-form-cancel")?.addEventListener("click", closeForm);
$("accueil-form-save")?.addEventListener("click", saveForm);
$("accueil-form-logo-input")?.addEventListener("change", async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    formLogo = await resizeLogo(file);
    renderFormLogo();
    showMessage("accueil-form-message", "");
  } catch (err) {
    showMessage("accueil-form-message", err.message, true);
  }
});
$("accueil-form-logo-remove")?.addEventListener("click", () => {
  formLogo = "";
  renderFormLogo();
});
$("accueil-link-copy")?.addEventListener("click", async () => {
  const url = (PORTAIL.accueilPages || {})[city];
  try {
    await navigator.clipboard.writeText(url);
    showMessage("accueil-gestion-message", "Lien copié ✓", false);
  } catch (err) {
    showMessage("accueil-gestion-message", "Copie impossible : sélectionnez le lien à la main.", true);
  }
});
