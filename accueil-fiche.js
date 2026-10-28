// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Case de l'entreprise sur l'accueil visiteurs
//  (page publique https://cosme75-85.github.io/Hiptown-Accueil-1/)
// ═══════════════════════════════════════════════════════
//  - accueil/{id}              : nom, ville, site, logo, visible (l'entreprise a choisi d'apparaître),
//                                locked (code d'accès demandé), personnes ({id, name, firstName?,
//                                lastName?, role?}), lisibles par tous
//                                (id = companyId pour une entreprise du portail ; « m-… » pour une case
//                                ajoutée à la main par l'équipe d'une ville, voir accueil-gestion.js)
//  - accueilEmails/{id}        : adresse qui reçoit les visites (email), celle de chaque personne
//                                (people : {id de la personne: e-mail}) et code d'accès (pin), jamais publics
//                                (lus par Apps Script, reservation/Accueil.gs)
//  La case est créée toute seule : à la connexion d'un salarié coworking, et quand
//  l'équipe ouvre « Gestion des entreprises » ou valide un compte coworking. Elle reste
//  masquée (visible: false) tant que l'entreprise n'a pas choisi de s'afficher (Mon profil).
//  Une fois affichée, l'entreprise choisit son logo, son e-mail, ses personnes et son code d'accès.
//  Une case ajoutée à la main par l'équipe (manual: true) est toujours affichée ; l'équipe la règle.

import { db } from "./firebase-config.js";
import {
  collection, query, where, getDocs, doc, getDoc, setDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const LOGO_MAX_WIDTH = 320;      // px : largeur maximale du logo sur la case
const LOGO_MAX_HEIGHT = 160;     // px
const MAX_LOGO_LENGTH = 150000;  // caractères, même limite que firestore.rules
const MAX_EMAIL_LENGTH = 120;
const SAFE_LOGO = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN = /^[0-9]{4}$/;
const MAX_PEOPLE = 30;           // même limite que firestore.rules

export function isSafeLogo(logo) {
  return typeof logo === "string" && logo.length <= MAX_LOGO_LENGTH && SAFE_LOGO.test(logo);
}

/**
 * Crée la case si elle n'existe pas encore, et tient le nom à jour (équipe seulement).
 * @param {string} companyId
 * @param {{name: string, city?: string|null, siteId?: string|null}} fields  ville et site des salariés
 * @param {{asAdmin?: boolean}} options  un salarié ne peut que créer la case, pas la renommer
 */
export async function ensureAccueilCard(companyId, { name, city = null, siteId = null }, { asAdmin = false } = {}) {
  if (!companyId || !name || !city) return; // sans ville, la case n'apparaîtrait sur aucune page
  const ref = doc(db, "accueil", companyId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { name, city, siteId: siteId || null, logo: "", manual: false, visible: false, updatedAt: serverTimestamp() });
    return;
  }
  const current = snap.data();
  if (!asAdmin) return;
  const changes = {};
  if (current.name !== name) changes.name = name;
  if (!current.city) changes.city = city;
  if (!current.siteId && siteId) changes.siteId = siteId;
  if (Object.keys(changes).length) {
    await setDoc(ref, { ...changes, updatedAt: serverTimestamp() }, { merge: true });
  }
}

/** Cases d'une ville (page « Gestion > Accueil visiteurs »), par ordre alphabétique. */
export async function listAccueilCards(city) {
  const snap = await getDocs(query(collection(db, "accueil"), where("city", "==", city)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "fr", { sensitivity: "base" }));
}

/** Partie privée d'une case : adresse de l'entreprise ("" si aucune), celles des personnes, code d'accès. */
export async function getAccueilPrivate(id) {
  const snap = await getDoc(doc(db, "accueilEmails", id));
  const data = snap.exists() ? snap.data() : {};
  return { email: data.email || "", people: data.people || {}, pin: data.pin || "" };
}

/**
 * Enregistre la partie privée d'une case (la case doit exister : les règles lisent sa ville).
 * Seuls les champs donnés changent.
 * @param {{email?: string, people?: Object<string, string>, pin?: string}} fields
 */
export async function setAccueilPrivate(id, fields) {
  // mergeFields : chaque champ donné est remplacé en entier (une personne retirée perd aussi son adresse)
  await setDoc(doc(db, "accueilEmails", id), { ...fields, updatedAt: serverTimestamp() },
    { mergeFields: [...Object.keys(fields), "updatedAt"] });
}

/**
 * Crée ou modifie une case ajoutée à la main par l'équipe d'une ville.
 * @returns {Promise<string>} identifiant de la case
 */
export async function saveManualAccueilCard(id, { name, city, siteId = null, logo = "", people = [], locked = false }) {
  const cardId = id || "m-" + slugOf(name) + "-" + Date.now().toString(36);
  await setDoc(doc(db, "accueil", cardId),
    { name, city, siteId: siteId || null, logo, people, locked, manual: true, updatedAt: serverTimestamp() }, { merge: true });
  return cardId;
}

/** Change seulement le logo d'une case (entreprise du portail : son nom et son site suivent le portail). */
export async function setAccueilLogo(id, logo) {
  await setDoc(doc(db, "accueil", id), { logo, updatedAt: serverTimestamp() }, { merge: true });
}

/** Identifiant d'une nouvelle personne d'une case. */
export function newPersonId() {
  return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Retire une case ajoutée à la main (l'adresse d'abord : ses règles lisent la ville sur la case). */
export async function deleteAccueilCard(id) {
  await deleteDoc(doc(db, "accueilEmails", id));
  await deleteDoc(doc(db, "accueil", id));
}

function slugOf(name) {
  return String(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "entreprise";
}

export function isValidEmail(email) {
  return EMAIL.test(email);
}

export function isValidPin(pin) {
  return PIN.test(pin);
}

/**
 * Réduit le logo choisi (proportions gardées) à LOGO_MAX_WIDTH × LOGO_MAX_HEIGHT.
 * PNG pour garder la transparence ; JPEG sur fond blanc si le PNG est trop lourd.
 */
export async function resizeLogo(file) {
  if (!file || !file.type.startsWith("image/")) throw new Error("Merci de choisir une image.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Image illisible. Essayez un logo au format PNG ou JPEG."));
      image.src = url;
    });
    const ratio = Math.min(1, LOGO_MAX_WIDTH / img.naturalWidth, LOGO_MAX_HEIGHT / img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let logo = canvas.toDataURL("image/png");
    if (logo.length > MAX_LOGO_LENGTH) {
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      logo = canvas.toDataURL("image/jpeg", 0.85);
    }
    if (logo.length > MAX_LOGO_LENGTH) throw new Error("Logo trop lourd, essayez-en un autre.");
    return logo;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Branche le bloc « Accueil visiteurs » de la page « Mon profil » (salarié coworking) :
 * l'entreprise choisit d'apparaître, puis son logo, son e-mail, ses personnes et son code d'accès.
 * @param {() => {profile: Object, space: string, company: Object|null}} getContext
 */
export function initAccueilFiche(getContext) {
  const $ = id => document.getElementById(id);
  const box = $("accueil-fiche");
  if (!box) return { open() {} };
  const details = $("accueil-details");
  const preview = $("accueil-logo-preview");
  const logoInput = $("accueil-logo-input");
  const removeBtn = $("accueil-logo-remove");
  const emailInput = $("accueil-email");
  const visibleInput = $("accueil-visible");
  const lockedInput = $("accueil-locked");
  const pinInput = $("accueil-pin");
  const peopleBox = $("accueil-people");
  const personAddBtn = $("accueil-person-add");
  const message = $("accueil-message");
  const saveBtn = $("accueil-save");
  emailInput.maxLength = MAX_EMAIL_LENGTH;

  let logo = "";
  let companyId = null;
  let people = []; // [{id, firstName, lastName, email}]

  function showMessage(text, isError) {
    message.textContent = text;
    message.style.color = isError ? "#dc2626" : "#166534";
    message.hidden = !text;
  }

  function renderLogo() {
    preview.innerHTML = "";
    if (logo) {
      const img = document.createElement("img");
      img.src = logo;
      img.alt = "Logo";
      preview.appendChild(img);
    } else {
      preview.textContent = "Pas encore de logo";
    }
    removeBtn.hidden = !logo;
  }

  function renderDetails() {
    details.hidden = !visibleInput.checked;
    pinInput.hidden = !lockedInput.checked;
  }

  function renderPeople() {
    peopleBox.innerHTML = "";
    people.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "accueil-person";
      row.innerHTML = `
        <input type="text" class="profile-input" data-field="firstName" maxlength="40" placeholder="Prénom *" aria-label="Prénom"/>
        <input type="text" class="profile-input" data-field="lastName" maxlength="40" placeholder="Nom" aria-label="Nom"/>
        <input type="email" class="profile-input accueil-person-email" data-field="email" maxlength="120" placeholder="E-mail *" aria-label="E-mail"/>
        <button class="profile-link" type="button">Retirer</button>`;
      row.querySelectorAll("input").forEach(input => {
        input.value = p[input.dataset.field] || "";
        input.addEventListener("input", () => { p[input.dataset.field] = input.value; });
      });
      row.querySelector("button").addEventListener("click", () => {
        people.splice(i, 1);
        renderPeople();
      });
      peopleBox.appendChild(row);
    });
    personAddBtn.hidden = people.length >= MAX_PEOPLE;
  }

  visibleInput.addEventListener("change", renderDetails);
  lockedInput.addEventListener("change", () => {
    renderDetails();
    if (lockedInput.checked) pinInput.focus();
  });
  personAddBtn.addEventListener("click", () => {
    people.push({ id: null, firstName: "", lastName: "", email: "" });
    renderPeople();
    peopleBox.lastElementChild?.querySelector("input")?.focus();
  });

  /** Affiche le bloc pour un salarié coworking, pré-rempli depuis Firestore. */
  async function open() {
    const { profile, space, company } = getContext();
    companyId = space === "coworking" && company ? company.id : null;
    box.hidden = !companyId;
    if (!companyId) return;
    showMessage("", false);
    logo = "";
    emailInput.value = "";
    visibleInput.checked = false;
    lockedInput.checked = false;
    pinInput.value = "";
    people = [];
    renderLogo();
    renderDetails();
    renderPeople();
    try {
      await ensureAccueilCard(companyId, { name: company.name || companyId, city: profile.site || null, siteId: profile.siteId || null });
      const [cardSnap, priv] = await Promise.all([getDoc(doc(db, "accueil", companyId)), getAccueilPrivate(companyId)]);
      const card = cardSnap.data() || {};
      logo = isSafeLogo(card.logo) ? card.logo : "";
      emailInput.value = priv.email;
      visibleInput.checked = card.visible === true;
      lockedInput.checked = card.locked === true;
      pinInput.value = priv.pin;
      people = (Array.isArray(card.people) ? card.people : []).map(p => ({
        id: p.id,
        firstName: p.firstName != null ? p.firstName : (p.name || ""),
        lastName: p.lastName || "",
        email: priv.people[p.id] || ""
      }));
      renderLogo();
      renderDetails();
      renderPeople();
    } catch (err) {
      console.error(err);
      showMessage("Impossible de charger l'accueil visiteurs.", true);
    }
  }

  logoInput.addEventListener("change", async () => {
    const file = logoInput.files[0];
    logoInput.value = "";
    if (!file) return;
    try {
      logo = await resizeLogo(file);
      renderLogo();
      showMessage("", false);
    } catch (err) {
      showMessage(err.message, true);
    }
  });

  removeBtn.addEventListener("click", () => {
    logo = "";
    renderLogo();
  });

  saveBtn.addEventListener("click", async () => {
    if (!companyId) return;
    const email = emailInput.value.trim().toLowerCase();
    if (email && !EMAIL.test(email)) return showMessage("L'adresse e-mail n'est pas valide.", true);
    const locked = lockedInput.checked;
    const pin = pinInput.value.trim();
    if (locked && !PIN.test(pin)) return showMessage("Le code d'accès doit faire 4 chiffres.", true);
    const filled = people
      .map(p => ({ ...p, firstName: p.firstName.trim(), lastName: p.lastName.trim(), email: p.email.trim().toLowerCase() }))
      .filter(p => p.firstName || p.lastName || p.email);
    const incomplete = filled.find(p => !p.firstName || !EMAIL.test(p.email));
    if (incomplete) {
      return showMessage(incomplete.firstName
        ? `Il manque un e-mail valide pour ${incomplete.firstName}.` : "Chaque personne doit avoir un prénom.", true);
    }
    const cardPeople = filled.map(p => ({
      id: p.id || newPersonId(), firstName: p.firstName, lastName: p.lastName,
      name: (p.firstName + " " + p.lastName).trim().slice(0, 80)
    }));
    const peopleEmails = {};
    filled.forEach((p, i) => { peopleEmails[cardPeople[i].id] = p.email; });

    saveBtn.disabled = true;
    try {
      await setDoc(doc(db, "accueil", companyId),
        { logo, visible: visibleInput.checked, locked, people: cardPeople, updatedAt: serverTimestamp() }, { merge: true });
      await setAccueilPrivate(companyId, { email, people: peopleEmails, pin: locked ? pin : "" });
      people = filled.map((p, i) => ({ ...p, id: cardPeople[i].id }));
      renderPeople();
      showMessage(visibleInput.checked ? "Accueil visiteurs enregistré ✓" : "Enregistré ✓ Votre entreprise n'apparaît pas à l'accueil.", false);
    } catch (err) {
      console.error(err);
      showMessage("Enregistrement impossible. Réessayez.", true);
    } finally {
      saveBtn.disabled = false;
    }
  });

  return { open };
}
