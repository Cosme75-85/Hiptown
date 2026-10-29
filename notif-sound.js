// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Son des notifications
//  Joué quand le portail est ouvert : visiteur à l'accueil (accueil-visites.js) et nouveau
//  message (messagerie.js). Choisi dans « Paramètres » (parametres.js, champ sound du profil).
//  Les sons sont synthétisés (Web Audio) : aucun fichier à charger.
//  Les notifications du téléphone, portail fermé, gardent le son réglé sur le téléphone.
// ═══════════════════════════════════════════════════════

// Notes de chaque son : [fréquence en Hz, début en s, durée en s]
// Les identifiants sont repris dans firestore.rules (isValidProfile) : garder les deux listes identiques.
export const SOUNDS = [
  { id: "carillon", label: "Carillon", icon: "🎐", notes: [[784, 0, .5], [1047, .16, .7]] },
  { id: "ding",     label: "Ding",     icon: "🔔", notes: [[1319, 0, .6]] },
  { id: "pop",      label: "Pop",      icon: "💬", notes: [[660, 0, .12], [880, .09, .16]] },
  { id: "trio",     label: "Mélodie",  icon: "🎵", notes: [[659, 0, .3], [784, .14, .3], [988, .28, .55]] },
  { id: "aucun",    label: "Aucun son", icon: "🔕", notes: [] }
];
export const DEFAULT_SOUND = "carillon";

let current = DEFAULT_SOUND;
let audio = null;

function context() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audio) audio = new Ctx();
  if (audio.state === "suspended") audio.resume().catch(() => {});
  return audio;
}

// Les navigateurs n'autorisent le son qu'après un geste : on prépare l'audio au premier toucher
document.addEventListener("pointerdown", () => { try { context(); } catch (e) { /* pas de son */ } }, { once: true, capture: true });

/** Son choisi par le compte connecté (parametres.js). */
export function setNotificationSound(id) {
  current = SOUNDS.some(s => s.id === id) ? id : DEFAULT_SOUND;
}

/** Joue un son (par défaut celui du compte). Sans effet si le navigateur bloque le son. */
export function playNotificationSound(id = current) {
  const sound = SOUNDS.find(s => s.id === id);
  if (!sound || !sound.notes.length) return;
  try {
    const ctx = context();
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.02;
    sound.notes.forEach(([freq, start, length]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + start);
      gain.gain.exponentialRampToValueAtTime(0.35, t0 + start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + length);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + length + 0.05);
    });
  } catch (err) { /* son indisponible */ }
}
