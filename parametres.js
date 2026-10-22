// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Paramètres : fond du portail et couleur des cases
// ═══════════════════════════════════════════════════════

// Couleurs pâles de la charte Hiptown (v5, couleurs 2023 ; voir reservation/Index.html)
// Les identifiants sont repris dans firestore.rules (isValidProfile) : garder les deux listes identiques.

// Fonds proposés. « sombre » : les titres et textes posés directement sur le fond passent en blanc.
export const BACKGROUNDS = [
  { id: "lavande",   label: "Lavande",      swatch: "#f5f4ff" },
  { id: "gris",      label: "Gris chaud",   swatch: "#f6f5f4" },
  { id: "blanc",     label: "Blanc",        swatch: "#ffffff" },
  { id: "citron",    label: "Citron",       swatch: "#fff4a2" },
  { id: "vert-eau",  label: "Vert d'eau",   swatch: "#b9efe4" },
  { id: "menthe",    label: "Menthe",       swatch: "#aaffcf" },
  { id: "nuit",      label: "Nuit",         swatch: "#1e1847", sombre: true },
  { id: "coworking", label: "Coworking",    swatch: "#1e1847 url('fonds/coworking-violet.jpg') center / cover", sombre: true }
];

// Cases : fond des tuiles du tableau de bord. « Blanc » garde l'aspect d'origine.
export const CASES = [
  { id: "blanc",    label: "Blanc",      swatch: "#ffffff" },
  { id: "gris",     label: "Gris chaud", swatch: "#f6f5f4" },
  { id: "citron",   label: "Citron",     swatch: "#fff4a2" },
  { id: "vert-eau", label: "Vert d'eau", swatch: "#b9efe4" },
  { id: "menthe",   label: "Menthe",     swatch: "#aaffcf" }
];

// Un réglage = une liste de choix, un champ du profil, un attribut posé sur <body> (lu par style.css)
const SETTINGS = {
  background: { choices: BACKGROUNDS, fallback: "lavande", attr: "fond",     listId: "settings-backgrounds", saved: "Fond enregistré ✓" },
  cases:      { choices: CASES,       fallback: "blanc",   attr: "cases",    listId: "settings-cases",       saved: "Couleur des cases enregistrée ✓" }
};

const STORAGE_PREFIX = "hiptown-reglages:";

function valid(key, id) {
  return SETTINGS[key].choices.some(c => c.id === id) ? id : SETTINGS[key].fallback;
}

/** Applique un réglage à toute la page. */
function applySetting(key, id) {
  const { attr, fallback, choices } = SETTINGS[key];
  id = valid(key, id);
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
  }

  for (const [key, setting] of Object.entries(SETTINGS)) {
    const list = $(setting.listId);
    list.innerHTML = setting.choices.map(c => `
      <button type="button" class="fond-choice" data-choice="${c.id}" aria-pressed="false">
        <span class="fond-swatch fond-swatch-${key}-${c.id}" style="background:${c.swatch};"></span>
        <span class="fond-label">${c.label}</span>
      </button>`).join("");

    list.addEventListener("click", async (e) => {
      const btn = e.target.closest(".fond-choice");
      if (!btn) return;
      const id = btn.dataset.choice;
      const { uid } = getContext();
      applySetting(key, id);
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
      window.hideAllAuth();
      $("step-settings").hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
}
