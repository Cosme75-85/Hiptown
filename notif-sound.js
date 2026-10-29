// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Son des notifications
//  Joué quand le portail est ouvert : visiteur à l'accueil (accueil-visites.js) et nouveau
//  message (messagerie.js). Choisi dans « Paramètres » (parametres.js, champ sound du profil).
//  Les sons sont synthétisés (Web Audio) : aucun fichier à charger.
//  Les notifications du téléphone, portail fermé, gardent le son réglé sur le téléphone.
// ═══════════════════════════════════════════════════════

// Notes de chaque son : [fréquence en Hz, début en s, durée en s] (note pure),
// ou pour les cris d'animaux { start, len, wave, path: [[instant, fréquence], ...] (glissé de la voix),
// filter: [type, fréquence, Q] (timbre), vib: [vitesse, profondeur en Hz], trem: vitesse (voix qui tremble),
// noise: true (souffle), gain }.
// Les identifiants sont repris dans firestore.rules (isValidProfile) : garder les deux listes identiques.
export const SOUNDS = [
  { id: "carillon", label: "Carillon", icon: "🎐", notes: [[784, 0, .5], [1047, .16, .7]] },
  { id: "ding",     label: "Ding",     icon: "🔔", notes: [[1319, 0, .6]] },
  { id: "pop",      label: "Pop",      icon: "💬", notes: [[660, 0, .12], [880, .09, .16]] },
  { id: "trio",     label: "Mélodie",  icon: "🎵", notes: [[659, 0, .3], [784, .14, .3], [988, .28, .55]] },
  { id: "oiseau",   label: "Oiseau",   icon: "🐦", notes: [
    { start: 0,   len: .09, path: [[0, 2600], [.09, 4200]] },
    { start: .13, len: .09, path: [[0, 2600], [.09, 4200]] },
    { start: .26, len: .22, path: [[0, 3800], [.08, 4400], [.22, 2400]] }
  ] },
  { id: "chat",     label: "Chat",     icon: "🐱", notes: [
    { start: 0, len: .75, wave: "sawtooth", path: [[0, 420], [.25, 720], [.5, 650], [.75, 380]],
      filter: ["bandpass", 1300, 4], vib: [6, 12], gain: 2.4 }
  ] },
  { id: "chien",    label: "Chien",    icon: "🐶", notes: [
    { start: 0,   len: .16, wave: "sawtooth", path: [[0, 340], [.16, 150]], filter: ["lowpass", 1100, 2], gain: 1 },
    { start: 0,   len: .08, noise: true, filter: ["bandpass", 900, 1], gain: .5 },
    { start: .26, len: .18, wave: "sawtooth", path: [[0, 320], [.18, 140]], filter: ["lowpass", 1100, 2], gain: 1 },
    { start: .26, len: .08, noise: true, filter: ["bandpass", 900, 1], gain: .5 }
  ] },
  { id: "canard",   label: "Canard",   icon: "🦆", notes: [
    { start: 0,   len: .17, wave: "sawtooth", path: [[0, 260], [.17, 210]], filter: ["bandpass", 1100, 3], gain: 2.2 },
    { start: .24, len: .2,  wave: "sawtooth", path: [[0, 250], [.2, 190]],  filter: ["bandpass", 1100, 3], gain: 2.2 }
  ] },
  { id: "grenouille", label: "Grenouille", icon: "🐸", notes: [
    { start: 0,   len: .32, wave: "square", path: [[0, 140], [.32, 110]], filter: ["lowpass", 700, 3], trem: 28, gain: .8 },
    { start: .42, len: .32, wave: "square", path: [[0, 150], [.32, 115]], filter: ["lowpass", 700, 3], trem: 28, gain: .8 }
  ] },
  { id: "vache",    label: "Vache",    icon: "🐮", notes: [
    { start: 0, len: 1.1, wave: "sawtooth", path: [[0, 120], [.2, 165], [.8, 150], [1.1, 105]],
      filter: ["lowpass", 650, 4], vib: [5, 3], gain: 1 }
  ] },
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
    sound.notes.forEach(note => playNote(ctx, t0, Array.isArray(note)
      ? { path: [[0, note[0]]], start: note[1], len: note[2] } : note));
  } catch (err) { /* son indisponible */ }
}

function playNote(ctx, t0, n) {
  const at = t0 + n.start;
  const end = at + n.len;
  // Source : bruit blanc (souffle) ou oscillateur dont la fréquence suit path
  let src;
  if (n.noise) {
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * n.len), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    src = ctx.createBufferSource();
    src.buffer = buffer;
  } else {
    src = ctx.createOscillator();
    src.type = n.wave || "sine";
    n.path.forEach(([t, f], i) => {
      if (i === 0) src.frequency.setValueAtTime(f, at);
      else src.frequency.linearRampToValueAtTime(f, at + t);
    });
    if (n.vib) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = n.vib[0];
      depth.gain.value = n.vib[1];
      lfo.connect(depth).connect(src.frequency);
      lfo.start(at); lfo.stop(end + 0.05);
    }
  }
  let node = src;
  if (n.filter) {
    const filter = ctx.createBiquadFilter();
    [filter.type, filter.frequency.value, filter.Q.value] = n.filter;
    node = node.connect(filter);
  }
  // Enveloppe : attaque courte, puis extinction
  const level = 0.35 * (n.gain || 1);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(level, at + Math.min(0.02, n.len / 4));
  env.gain.setValueAtTime(level, Math.max(at + 0.02, end - n.len * 0.4));
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  node = node.connect(env);
  if (n.trem) {
    const trem = ctx.createGain();
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    trem.gain.value = 0.5;
    lfo.frequency.value = n.trem;
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(trem.gain);
    lfo.start(at); lfo.stop(end + 0.05);
    node = node.connect(trem);
  }
  node.connect(ctx.destination);
  src.start(at);
  src.stop(end + 0.05);
}
