// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Paramètres : fond du portail, couleur des cases, son et couleur des notifications
// ═══════════════════════════════════════════════════════

import { SOUNDS, DEFAULT_SOUND, setNotificationSound, playNotificationSound } from "./notif-sound.js";

// Couleurs de la charte Hiptown (v5, couleurs 2023) éclaircies à 20 %, comme le « gris chaud light » de la charte :
// vert d'eau #67DFCB, menthe #68DEA4, citron #FFE700, lavande #A781D7, gris chaud #D9D4CD.
// Les identifiants sont repris dans firestore.rules (isValidProfile) : garder les deux listes identiques.

// Fonds proposés. « sombre » : les titres et textes posés directement sur le fond passent en blanc.
export const BACKGROUNDS = [
  { id: "lavande",   label: "Par défaut",   swatch: "#f5f4ff" },
  { id: "blanc",     label: "Blanc",        swatch: "#ffffff" },
  { id: "gris",      label: "Gris chaud",   swatch: "#f6f5f4" },
  { id: "mauve",     label: "Lavande",      swatch: "#ede6f7" },
  { id: "citron",    label: "Citron",       swatch: "#fffacc" },
  { id: "vert-eau",  label: "Vert d'eau",   swatch: "#e1f9f5" },
  { id: "menthe",    label: "Menthe",       swatch: "#e1f8ed" },
  { id: "nuit",      label: "Nuit",         swatch: "#1e1847", sombre: true },
  { id: "coworking", label: "Coworking",    swatch: "#1e1847 url('fonds/coworking-violet.jpg') center / cover", sombre: true }
];

// Cases : fond des tuiles du tableau de bord. « Blanc » garde l'aspect d'origine.
export const CASES = [
  { id: "blanc",    label: "Blanc",      swatch: "#ffffff" },
  { id: "gris",     label: "Gris chaud", swatch: "#f6f5f4" },
  { id: "mauve",    label: "Lavande",    swatch: "#ede6f7" },
  { id: "citron",   label: "Citron",     swatch: "#fffacc" },
  { id: "vert-eau", label: "Vert d'eau", swatch: "#e1f9f5" },
  { id: "menthe",   label: "Menthe",     swatch: "#e1f8ed" }
];

// Couleur des notifications : pastilles (messages non lus, tuiles) et bandeau d'un visiteur à l'accueil.
// Rouge par défaut, puis les couleurs foncées de la charte Hiptown (pleine intensité).
// « texte » : couleur du texte posé dessus, lisible sur chaque fond.
export const NOTIF_COLORS = [
  { id: "rouge",    label: "Rouge",            swatch: "#dc2626" },
  { id: "navy",     label: "Bleu anthracite",  swatch: "#1e1847" },
  { id: "lavande",  label: "Lavande",          swatch: "#a781d7" },
  { id: "corail",   label: "Corail",           swatch: "#f47a5b" },
  { id: "vert-eau", label: "Vert d'eau",       swatch: "#67dfcb" },
  { id: "menthe",   label: "Menthe",           swatch: "#68dea4" }
];

// Un réglage = une liste de choix, un champ du profil, un attribut posé sur <body> (lu par style.css)
// (le son n'a pas d'attribut : il est passé à notif-sound.js)
const SETTINGS = {
  background: { choices: BACKGROUNDS, fallback: "lavande", attr: "fond",     listId: "settings-backgrounds", saved: "Fond enregistré ✓" },
  cases:      { choices: CASES,       fallback: "blanc",   attr: "cases",    listId: "settings-cases",       saved: "Couleur des cases enregistrée ✓" },
  sound:      { choices: SOUNDS,      fallback: DEFAULT_SOUND, attr: null,   listId: "settings-sounds",      saved: "Son des notifications enregistré ✓" },
  notifColor: { choices: NOTIF_COLORS, fallback: "rouge",  attr: "notif",    listId: "settings-notif-colors", saved: "Couleur des notifications enregistrée ✓" }
};

const STORAGE_PREFIX = "hiptown-reglages:";

function valid(key, id) {
  return SETTINGS[key].choices.some(c => c.id === id) ? id : SETTINGS[key].fallback;
}

/** Applique un réglage à toute la page. */
function applySetting(key, id) {
  const { attr, fallback, choices } = SETTINGS[key];
  id = valid(key, id);
  if (key === "sound") { setNotificationSound(id); return; }
  if (id === fallback) delete document.body.dataset[attr];
  else document.body.dataset[attr] = id;
  if (key === "background") {
    document.body.classList.toggle("fond-sombre", !!choices.find(c => c.id === id).sombre);
  }
}

// Copie locale des réglages, par compte : ils s'affichent tout de suite au chargement,
// et restent sur cet appareil même si l'enregistrement en ligne échoue.
function remembered(uid) {
  try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + uid)) || {}; } catch (e) { return {}; }
}
function remember(uid, values) {
  try { localStorage.setItem(STORAGE_PREFIX + uid, JSON.stringify(values)); } catch (e) { /* stockage indisponible */ }
}

/** Réglages d'un compte : ceux enregistrés sur le profil, sinon la copie locale. */
function settingsOf(uid, profile) {
  const local = remembered(uid);
  const values = {};
  for (const key of Object.keys(SETTINGS)) {
    const saved = profile && profile[key];
    values[key] = valid(key, SETTINGS[key].choices.some(c => c.id === saved) ? saved : local[key]);
  }
  remember(uid, values);
  return values;
}

/** Applique les réglages du compte connecté (sans compte : réglages par défaut). */
export function applyUserSettings(uid, profile) {
  const values = uid ? settingsOf(uid, profile) : {};
  for (const key of Object.keys(SETTINGS)) applySetting(key, values[key]);
}

/**
 * Branche la page « Paramètres ».
 * @param {Object} options
 * @param {() => {uid: string, profile: Object}} options.getContext  compte connecté
 * @param {(fields: Object) => Promise<void>} options.save  enregistre les champs modifiés du profil
 * @param {() => void} options.onClose  retour au tableau de bord
 */
export function initSettingsPage({ getContext, save, onClose }) {
  const $ = id => document.getElementById(id);
  const message = $("settings-message");

  function showMessage(text, isError) {
    message.textContent = text;
    message.style.color = isError ? "#dc2626" : "#166534";
    message.hidden = !text;
  }

  function markSelected(key, id) {
    $(SETTINGS[key].listId).querySelectorAll(".fond-choice").forEach(btn => {
      btn.setAttribute("aria-pressed", btn.dataset.choice === id ? "true" : "false");
    });
    // Choix actuel affiché sur la ligne de la rubrique, même repliée
    const choice = SETTINGS[key].choices.find(c => c.id === id);
    $(SETTINGS[key].listId + "-current").textContent = choice ? (choice.icon ? choice.icon + " " : "") + choice.label : "";
  }

  for (const [key, setting] of Object.entries(SETTINGS)) {
    const list = $(setting.listId);
    list.innerHTML = setting.choices.map(c => `
      <button type="button" class="fond-choice" data-choice="${c.id}" aria-pressed="false">
        ${c.icon ? `<span class="fond-swatch son-swatch" aria-hidden="true">${c.icon}</span>`
                 : `<span class="fond-swatch fond-swatch-${key}-${c.id}" style="background:${c.swatch};"></span>`}
        <span class="fond-label">${c.label}</span>
      </button>`).join("");

    list.addEventListener("click", async (e) => {
      const btn = e.target.closest(".fond-choice");
      if (!btn) return;
      const id = btn.dataset.choice;
      const { uid } = getContext();
      applySetting(key, id);
      if (key === "sound") playNotificationSound(id); // écoute du son choisi
      markSelected(key, id);
      remember(uid, { ...remembered(uid), [key]: id });
      showMessage("", false);
      try {
        await save({ [key]: id });
        showMessage(setting.saved, false);
      } catch (err) {
        console.error("Paramètres : enregistrement impossible", err);
        showMessage("Réglage gardé sur cet appareil, mais pas encore enregistré sur votre compte.", true);
      }
    });
  }

  $("back-from-settings").addEventListener("click", onClose);

  return {
    open() {
      const { uid, profile } = getContext();
      const values = settingsOf(uid, profile);
      for (const key of Object.keys(SETTINGS)) markSelected(key, values[key]);
      showMessage("", false);
      // Rubriques repliées à chaque ouverture de la page
      $("step-settings").querySelectorAll("details").forEach(d => { d.open = false; });
      window.hideAllAuth();
      $("step-settings").hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
}
