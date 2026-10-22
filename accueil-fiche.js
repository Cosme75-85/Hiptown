// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Case de l'entreprise sur l'accueil visiteurs
//  (page publique https://cosme75-85.github.io/Hiptown-Accueil-1/)
// ═══════════════════════════════════════════════════════
//  - accueil/{companyId}       : nom, site et logo, lisibles par tous
//  - accueilEmails/{companyId} : adresse qui reçoit les visites, jamais publique
//                                (lue par Apps Script, reservation/Accueil.gs)
//  La case est créée toute seule : à la connexion d'un salarié coworking, et quand
//  l'équipe ouvre « Gestion des entreprises » ou valide un compte coworking.

import { db } from "./firebase-config.js";
import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const LOGO_MAX_WIDTH = 320;      // px : largeur maximale du logo sur la case
const LOGO_MAX_HEIGHT = 160;     // px
const MAX_LOGO_LENGTH = 150000;  // caractères, même limite que firestore.rules
const MAX_EMAIL_LENGTH = 120;
const SAFE_LOGO = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isSafeLogo(logo) {
  return typeof logo === "string" && logo.length <= MAX_LOGO_LENGTH && SAFE_LOGO.test(logo);
}

/**
 * Crée la case si elle n'existe pas encore, et tient le nom à jour (équipe seulement).
 * @param {string} companyId
 * @param {{name: string, siteId?: string|null}} fields
 * @param {{asAdmin?: boolean}} options  un salarié ne peut que créer la case, pas la renommer
 */
export async function ensureAccueilCard(companyId, { name, siteId = null }, { asAdmin = false } = {}) {
  if (!companyId || !name) return;
  const ref = doc(db, "accueil", companyId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { name, siteId: siteId || null, logo: "", updatedAt: serverTimestamp() });
    return;
  }
  const current = snap.data();
  if (!asAdmin) return;
  const changes = {};
  if (current.name !== name) changes.name = name;
  if (!current.siteId && siteId) changes.siteId = siteId;
  if (Object.keys(changes).length) {
    await setDoc(ref, { ...changes, updatedAt: serverTimestamp() }, { merge: true });
  }
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
 * Branche le bloc « Ma case à l'accueil visiteurs » de la page « Mon profil ».
 * @param {() => {profile: Object, space: string, company: Object|null}} getContext
 */
export function initAccueilFiche(getContext) {
  const $ = id => document.getElementById(id);
  const box = $("accueil-fiche");
  if (!box) return { open() {} };
  const preview = $("accueil-logo-preview");
  const logoInput = $("accueil-logo-input");
  const removeBtn = $("accueil-logo-remove");
  const emailInput = $("accueil-email");
  const message = $("accueil-message");
  const saveBtn = $("accueil-save");
  emailInput.maxLength = MAX_EMAIL_LENGTH;

  let logo = "";
  let companyId = null;

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

  /** Affiche le bloc pour un salarié coworking, pré-rempli depuis Firestore. */
  async function open() {
    const { profile, space, company } = getContext();
    companyId = space === "coworking" && company ? company.id : null;
    box.hidden = !companyId;
    if (!companyId) return;
    showMessage("", false);
    logo = "";
    emailInput.value = "";
    renderLogo();
    try {
      await ensureAccueilCard(companyId, { name: company.name || companyId, siteId: profile.siteId || null });
      const [card, mail] = await Promise.all([
        getDoc(doc(db, "accueil", companyId)),
        getDoc(doc(db, "accueilEmails", companyId))
      ]);
      logo = isSafeLogo(card.data()?.logo) ? card.data().logo : "";
      emailInput.value = mail.exists() ? (mail.data().email || "") : "";
      renderLogo();
    } catch (err) {
      console.error(err);
      showMessage("Impossible de charger la case de l'accueil.", true);
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
    saveBtn.disabled = true;
    try {
      await Promise.all([
        setDoc(doc(db, "accueil", companyId), { logo, updatedAt: serverTimestamp() }, { merge: true }),
        setDoc(doc(db, "accueilEmails", companyId), { email, updatedAt: serverTimestamp() })
      ]);
      showMessage("Case de l'accueil enregistrée ✓", false);
    } catch (err) {
      console.error(err);
      showMessage("Enregistrement impossible. Réessayez.", true);
    } finally {
      saveBtn.disabled = false;
    }
  });

  return { open };
}
