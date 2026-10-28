// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Gestion > Accueil visiteurs
//  L'équipe d'une ville ajoute, modifie et retire les entreprises affichées sur la page
//  publique d'accueil de sa ville (lien dans PORTAIL.accueilPages, config.js).
//  Les entreprises qui ont un compte sur le portail ont leur case toute seule (accueil-fiche.js) :
//  ici, on ne change que leur logo, leurs e-mails, leurs personnes et leur code PIN.
// ═══════════════════════════════════════════════════════

import {
  listAccueilCards, getAccueilEmails, setAccueilEmails, saveManualAccueilCard,
  setAccueilCardDetails, deleteAccueilCard, resizeLogo, isSafeLogo, isValidEmail, newPersonId
} from "./accueil-fiche.js";

const MAX_PEOPLE = 30; // même limite que firestore.rules

// Entreprises qui étaient écrites à la main dans la page de Bordeaux (config.js de Hiptown-Accueil-1),
// avec leurs codes et leurs contacts : « Importer les anciennes entreprises » les crée ici, une seule fois.
const PAGE_COMPANIES = {
  bordeaux: { siteId: "nabo06", companies: [ // la page de Bordeaux est celle d'Émergence
    { name: "Espace Temps", pin: "6874", logo: "Logo_espace_temps.png", people: ["Martin Vernay", "Victor Morin"] },
    { name: "Scaleway", pin: "5489", logo: "Logo_scaleway.png", people: ["Amnay"] },
    { name: "Synergie Bois", pin: "1520", logo: "Logo_synergie_bois.png", people: ["Loïc Lambert"] },
    { name: "Yes Sign", pin: "0801", logo: "Logo Yes sign.png", people: ["Agnès Bertoni", "Christelle Barraud"] },
    { name: "La BAF", pin: "2654", logo: "Logo_la_BAF.png", people: ["Victor", "Titouan"] },
    { name: "AB Tasty", pin: "6688", logo: "Logo_ab_tasty.png", people: ["Jules Vienne", "Angélique de Taddéo"] },
    { name: "Caisse d'Épargne", pin: "2073", logo: "Logo_caisse_epargne.png", people: [] },
  ] },
};

const $ = id => document.getElementById(id);

let cities = [];      // villes que l'admin connecté gère
let city = null;      // ville affichée
let editing = null;   // case en cours de modification (null = nouvelle)
let formLogo = "";
let formPeople = [];  // [{id, name, role, email}]
let cards = [];       // cases de la ville affichée

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
    cards = await listAccueilCards(city);
    const emails = await Promise.all(cards.map(c => getAccueilEmails(c.id).catch(() => ({ email: "", people: {} }))));
    renderImport();
    list.innerHTML = "";
    if (!cards.length) {
      list.innerHTML = `<p style="color:#94a3b8;padding:12px;">Aucune entreprise sur la page de ${escapeHtml(cityName(city))} pour le moment.</p>`;
      return;
    }
    cards.forEach((c, i) => list.appendChild(cardRow(c, emails[i])));
  } catch (err) {
    console.error(err);
    list.innerHTML = `<p style="color:#dc2626;padding:12px;">Impossible de charger les entreprises.</p>`;
  }
}

const nameKey = name => String(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Entreprises de l'ancienne page qui ne sont pas encore ici. */
function missingPageCompanies() {
  const known = new Set(cards.map(c => nameKey(c.name)));
  return (PAGE_COMPANIES[city]?.companies || []).filter(c => !known.has(nameKey(c.name)));
}

function renderImport() {
  const missing = missingPageCompanies();
  const btn = $("accueil-import");
  btn.hidden = !missing.length;
  btn.textContent = `📥 Importer les anciennes entreprises de la page (${missing.length})`;
}

/** Logo de l'ancienne page (même dossier que la page), réduit comme un logo choisi à la main. */
async function pageLogo(file) {
  try {
    const res = await fetch(new URL(encodeURIComponent(file), PORTAIL.accueilPages[city]));
    if (!res.ok) return "";
    return await resizeLogo(await res.blob());
  } catch (err) {
    console.error("Logo non importé", file, err);
    return "";
  }
}

async function importPageCompanies() {
  const missing = missingPageCompanies();
  if (!missing.length) return;
  if (!confirm(`Importer ${missing.length} entreprise(s) de l'ancienne page (${missing.map(c => c.name).join(", ")}) ?`)) return;
  const btn = $("accueil-import");
  btn.disabled = true;
  showMessage("accueil-gestion-message", "Import en cours…", false);
  try {
    for (const c of missing) {
      const people = c.people.map(name => ({ id: newPersonId(), name, role: "" }));
      const id = await saveManualAccueilCard(null, {
        name: c.name, city, siteId: PAGE_COMPANIES[city].siteId,
        logo: await pageLogo(c.logo), people, pin: c.pin
      });
    }
    showMessage("accueil-gestion-message",
      `${missing.length} entreprise(s) importée(s). Ajoutez les e-mails pour que les visites leur parviennent.`, false);
  } catch (err) {
    console.error(err);
    showMessage("accueil-gestion-message", "Import interrompu. Réessayez : les entreprises déjà importées ne seront pas recréées.", true);
  } finally {
    btn.disabled = false;
    await refresh();
  }
}

function renderLink() {
  const url = (PORTAIL.accueilPages || {})[city] || "";
  $("accueil-link").textContent = url || "Pas encore de page d'accueil pour cette ville.";
  $("accueil-link-open").hidden = !url;
  $("accueil-link-open").href = url || "#";
  $("accueil-link-copy").hidden = !url;
}

function cardRow(c, emails) {
  const sites = sitesOf(city);
  const people = Array.isArray(c.people) ? c.people : [];
  const details = [
    c.siteId ? (sites[c.siteId] || c.siteId) : "",
    emails.email || "pas d'e-mail : l'équipe Hiptown est prévenue",
    people.length ? people.length + (people.length > 1 ? " personnes" : " personne") : "",
    c.pin ? "code PIN" : "",
    c.manual ? "" : "compte portail"
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
  row.querySelector('[data-act="edit"]').addEventListener("click", () => openForm(c, emails));
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

function openForm(card, emails) {
  emails = emails || { email: "", people: {} };
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
  $("accueil-form-email").value = emails.email || "";
  formPeople = (card && Array.isArray(card.people) ? card.people : []).map(p => ({
    id: p.id, name: p.name || "", role: p.role || "", email: emails.people[p.id] || ""
  }));
  renderFormPeople();
  $("accueil-form-pin").value = card && card.pin ? card.pin : "";
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
  if (pin && !/^[0-9]{4}$/.test(pin)) return showMessage("accueil-form-message", "Le code PIN doit faire 4 chiffres.", true);
  const filled = formPeople.map(p => ({ ...p, name: p.name.trim(), role: p.role.trim(), email: p.email.trim().toLowerCase() }))
    .filter(p => p.name || p.role || p.email);
  if (filled.some(p => !p.name)) return showMessage("accueil-form-message", "Chaque personne doit avoir un nom.", true);
  const wrong = filled.find(p => p.email && !isValidEmail(p.email));
  if (wrong) return showMessage("accueil-form-message", `L'e-mail de ${wrong.name} n'est pas valide.`, true);
  const people = filled.map(p => ({ id: p.id || newPersonId(), name: p.name, role: p.role }));
  const peopleEmails = {};
  filled.forEach((p, i) => { if (p.email) peopleEmails[people[i].id] = p.email; });

  const btn = $("accueil-form-save");
  btn.disabled = true;
  try {
    let id;
    if (editing && !editing.manual) {
      id = editing.id;
      await setAccueilCardDetails(id, { logo: formLogo, people, pin });
    } else {
      id = await saveManualAccueilCard(editing ? editing.id : null,
        { name, city, siteId: $("accueil-form-site").value || null, logo: formLogo, people, pin });
    }
    await setAccueilEmails(id, email, peopleEmails); // après la case : les règles lisent sa ville
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
  formPeople.push({ id: null, name: "", role: "", email: "" });
  renderFormPeople();
  $("accueil-form-people").lastElementChild?.querySelector("input")?.focus();
});
$("accueil-import")?.addEventListener("click", importPageCompanies);
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
