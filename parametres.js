// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Paramètres (premier réglage : le fond du portail)
// ═══════════════════════════════════════════════════════

// Fonds proposés : couleurs de la charte et illustration du coworking.
// « sombre » : les titres et liens posés directement sur le fond passent en blanc.
// Liste reprise dans firestore.rules (isValidProfile) : garder les deux identiques.
export const BACKGROUNDS = [
  { id: "lavande",   label: "Lavande",   swatch: "#f5f4ff" },
  { id: "blanc",     label: "Blanc",     swatch: "#ffffff" },
  { id: "menthe",    label: "Menthe",    swatch: "#e3f8f4" },
  { id: "soleil",    label: "Soleil",    swatch: "#fffbd6" },
  { id: "nuit",      label: "Nuit",      swatch: "#1e1847", sombre: true },
  { id: "coworking", label: "Coworking", swatch: "#1e1847", image: "fonds/coworking-violet.jpg", sombre: true }
];
export const DEFAULT_BACKGROUND = "lavande";

const STORAGE_PREFIX = "hiptown-fond:";

function findBackground(id) {
  return BACKGROUNDS.find(b => b.id === id) || BACKGROUNDS.find(b => b.id === DEFAULT_BACKGROUND);
}

/** Applique un fond à toute la page (attributs lus par style.css). */
export function applyBackground(id) {
  const bg = findBackground(id);
  const body = document.body;
  if (bg.id === DEFAULT_BACKGROUND) delete body.dataset.fond;
  else body.dataset.fond = bg.id;
  body.classList.toggle("fond-sombre", !!bg.sombre);
}

// Copie locale du choix, par compte : le fond s'affiche tout de suite au chargement,
// et le choix reste sur cet appareil même si l'enregistrement en ligne échoue.
export function rememberedBackground(uid) {
  try { return localStorage.getItem(STORAGE_PREFIX + uid) || ""; } catch (e) { return ""; }
}
function rememberBackground(uid, id) {
  try { localStorage.setItem(STORAGE_PREFIX + uid, id); } catch (e) { /* stockage indisponible */ }
}

/** Fond d'un compte : celui enregistré sur le profil, sinon la copie locale. */
export function backgroundOf(uid, profile) {
  const saved = profile && profile.background;
  if (saved && BACKGROUNDS.some(b => b.id === saved)) {
    rememberBackground(uid, saved);
    return saved;
  }
  return rememberedBackground(uid) || DEFAULT_BACKGROUND;
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
  const list = $("settings-backgrounds");
  const message = $("settings-message");

  list.innerHTML = BACKGROUNDS.map(b => `
    <button type="button" class="fond-choice" data-fond-id="${b.id}" aria-pressed="false">
      <span class="fond-swatch fond-swatch-${b.id}" style="background-color:${b.swatch};"></span>
      <span class="fond-label">${b.label}</span>
    </button>`).join("");

  function showMessage(text, isError) {
    message.textContent = text;
    message.style.color = isError ? "#dc2626" : "#166534";
    message.hidden = !text;
  }

  function markSelected(id) {
    list.querySelectorAll(".fond-choice").forEach(btn => {
      btn.setAttribute("aria-pressed", btn.dataset.fondId === id ? "true" : "false");
    });
  }

  list.addEventListener("click", async (e) => {
    const btn = e.target.closest(".fond-choice");
    if (!btn) return;
    const id = btn.dataset.fondId;
    const { uid } = getContext();
    applyBackground(id);
    markSelected(id);
    rememberBackground(uid, id);
    showMessage("", false);
    try {
      await save({ background: id });
      showMessage("Fond enregistré ✓", false);
    } catch (err) {
      console.error("Paramètres : enregistrement du fond impossible", err);
      showMessage("Fond gardé sur cet appareil, mais pas encore enregistré sur votre compte.", true);
    }
  });

  $("back-from-settings").addEventListener("click", onClose);

  return {
    open() {
      const { uid, profile } = getContext();
      markSelected(backgroundOf(uid, profile));
      showMessage("", false);
      window.hideAllAuth();
      $("step-settings").hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
}
