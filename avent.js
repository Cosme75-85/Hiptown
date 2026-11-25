// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Calendrier de l'Avent (clients de Bordeaux)
//  24 portes en 3D, une par jour du 1er au 24 décembre. Le serveur
//  (reservation/Avent.gs) vérifie le compte et le jour (heure de Paris),
//  tire le lot et ajoute les crédits gagnés à l'entreprise.
//  L'équipe Hiptown voit le calendrier en mode test (rien n'est enregistré)
//  et gère les lots et les gagnants (Gestion > Calendrier de l'Avent).
// ═══════════════════════════════════════════════════════

import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const BASE_URL = PORTAIL.reservationUrl;
const $ = id => document.getElementById(id);

// Ordre mélangé des portes, comme sur un vrai calendrier
const ORDER = [7, 15, 1, 22, 10, 18, 3, 12, 24, 5, 20, 9, 14, 2, 17, 11, 6, 21, 13, 4, 19, 8, 16, 23];
const ICONS = {
  credits: '<svg class="av-coin" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="34" r="22" fill="#e6c800"/><circle cx="32" cy="30" r="22" fill="#ffe700" stroke="#1e1847" stroke-width="3"/><circle cx="32" cy="30" r="15" fill="none" stroke="#1e1847" stroke-width="2" stroke-dasharray="3 4"/><path d="M38 23a9 9 0 1 0 0 14" fill="none" stroke="#1e1847" stroke-width="5" stroke-linecap="round"/></svg>',
  cinema: '<svg viewBox="0 0 64 64" aria-hidden="true"><g transform="rotate(-12 32 32)"><path d="M6 20h52v8a4 4 0 0 0 0 8v8H6v-8a4 4 0 0 0 0-8z" fill="#67dfcb" stroke="#1e1847" stroke-width="3" stroke-linejoin="round"/><path d="M44 21v22" stroke="#1e1847" stroke-width="2" stroke-dasharray="3 3"/><path d="M22 26l10 6-10 6z" fill="#1e1847"/></g></svg>',
  gift: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="26" width="44" height="30" rx="4" fill="#ff4d6d" stroke="#1e1847" stroke-width="3"/><rect x="7" y="18" width="50" height="11" rx="3" fill="#ff6f88" stroke="#1e1847" stroke-width="3"/><path d="M32 18v38" stroke="#ffe700" stroke-width="7"/><path d="M32 18c-6-10-18-8-14 0zM32 18c6-10 18-8 14 0z" fill="#ffe700" stroke="#1e1847" stroke-width="3" stroke-linejoin="round"/></svg>',
  coffee: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M24 8c-3 4 3 6 0 10M34 8c-3 4 3 6 0 10" stroke="#b7b0ff" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M12 24h34v14a14 14 0 0 1-14 14h-6a14 14 0 0 1-14-14z" fill="#fff" stroke="#1e1847" stroke-width="3"/><path d="M46 28h4a6 6 0 0 1 0 12h-5" fill="none" stroke="#1e1847" stroke-width="3"/><path d="M8 56h44" stroke="#1e1847" stroke-width="3" stroke-linecap="round"/></svg>',
  star: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6l7 17h18l-14 11 5 18-16-10-16 10 5-18L7 23h18z" fill="#b7b0ff" stroke="#1e1847" stroke-width="3" stroke-linejoin="round"/></svg>',
  lost: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 30h44v24a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4z" fill="#3a3270" stroke="#1e1847" stroke-width="3"/><path d="M8 22l40-10 3 10-40 10z" fill="#4b4290" stroke="#1e1847" stroke-width="3" stroke-linejoin="round"/><circle cx="25" cy="42" r="2.6" fill="#b7b0ff"/><circle cx="39" cy="42" r="2.6" fill="#b7b0ff"/><path d="M25 51q7-5 14 0" fill="none" stroke="#b7b0ff" stroke-width="3" stroke-linecap="round"/></svg>'
};
const DECO = [
  '<svg viewBox="0 0 40 40"><path d="M20 2l4 12h12l-10 8 4 13-10-8-10 8 4-13L4 14h12z" fill="currentColor"/></svg>',
  '<svg viewBox="0 0 40 40"><path d="M20 3v34M5 11l30 18M35 11L5 29" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  '<svg viewBox="0 0 40 40"><path d="M20 3l14 22h-8l10 12H4l10-12H6z" fill="currentColor"/></svg>',
  '<svg viewBox="0 0 40 40"><path d="M20 4a11 11 0 0 1 11 11v10l4 6H5l4-6V15A11 11 0 0 1 20 4z" fill="currentColor"/><circle cx="20" cy="35" r="4" fill="currentColor"/></svg>'
];

let state = null;         // réponse de getAdvent : { mode, today, lastOpenDay, opened: [...] }
let opened = {};          // jour -> { label, kind, credits, detail }
let busy = false;
let admin = null;         // réponse de getAdventAdmin
let editPrizes = [];      // lots en cours de modification

// ==================== OUTILS ====================

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const dayLabel = d => d + (d === 1 ? "er" : "") + " décembre";

async function call(action, payload) {
  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // évite une requête préalable (CORS)
    body: JSON.stringify({ action, idToken, payload })
  });
  return res.json();
}

/** Icône d'un lot : ticket pour le cinéma, tasse pour café / petit déjeuner, cadeau sinon. */
function iconFor(p) {
  if (p.kind === "credits") return ICONS.credits;
  if (p.kind === "none") return ICONS.star;
  if (p.kind === "lost") return ICONS.lost;
  const l = (p.label || "").toLowerCase();
  if (/cin[ée]ma|place|ticket|billet/.test(l)) return ICONS.cinema;
  if (/caf[ée]|th[ée]|d[ée]jeuner|boisson|chocolat/.test(l)) return ICONS.coffee;
  return ICONS.gift;
}

let toastTimer;
function toast(msg) {
  const t = $("av-toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
}

// ==================== BANDEAU DU TABLEAU DE BORD ====================

function showBanner() {
  const b = $("avent-banner");
  if (!b || !state) return;
  const canOpenToday = state.mode === "player" && state.today >= 1 && state.today <= 24 && !opened[state.today];
  $("avent-banner-sub").textContent = state.mode === "test"
    ? "Aperçu de l'équipe : ouvrez les cases en mode test et gérez les lots."
    : canOpenToday ? "La case du " + dayLabel(state.today) + " vous attend !"
    : state.today > 24 ? "Retrouvez vos gains de décembre." : "Revenez demain pour la prochaine case.";
  b.classList.toggle("av-banner-new", canOpenToday);
  b.hidden = false;
}

async function load() {
  state = null;
  opened = {};
  $("avent-banner").hidden = true;
  if (!auth.currentUser) return;
  try {
    const res = await call("getAdvent");
    if (!res.success || !res.mode) return;
    state = res;
    (res.opened || []).forEach(p => { opened[p.day] = p; });
    // L'équipe voit toujours le bandeau, pour tester ; les clients seulement quand il est ouvert
    showBanner();
  } catch (err) {
    console.error("Calendrier de l'Avent indisponible", err);
  }
}

document.addEventListener("hiptown-dashboard", e => {
  close();
  const d = e.detail || {};
  // Pas en aperçu « voir comme un client » : le calendrier appartient à la personne connectée
  if (d.preview) { state = null; $("avent-banner").hidden = true; return; }
  load();
});
onAuthStateChanged(auth, user => { if (!user) { close(); state = null; $("avent-banner").hidden = true; } });

// ==================== CALENDRIER ====================

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const COLORS = ["#ffe700", "#67dfcb", "#b7b0ff", "#ffffff", "#ff4d6d"];

const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2.5" fill="currentColor"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.6"/></svg>';
const RARITY = {
  commun:     { label: "Commun",     confetti: 120, colors: COLORS },
  rare:       { label: "Rare",       confetti: 200, colors: ["#b7b0ff", "#67dfcb", "#ffffff", "#8b7fff"] },
  legendaire: { label: "Légendaire", confetti: 320, colors: ["#ffe700", "#ffd000", "#fff6a8", "#ffffff", "#ff4d6d"] },
  none:       { label: "",           confetti: 0,   colors: COLORS }
};
const noGain = p => !p || p.kind === "none" || p.kind === "lost";
const rarityOf = p => (p && RARITY[p.rarity]) ? p.rarity : (noGain(p) ? "none" : "commun");

/** Un battant de porte (gauche ou droite) : la face porte la moitié du décor commun aux deux. */
function leaf(side, d) {
  return '<div class="av-leaf av-leaf-' + side + '">'
    + '<div class="av-face"><div class="av-face-in">'
    + '<span class="av-deco">' + DECO[d % 4] + '</span><span class="av-n">' + d + '</span>'
    + '<span class="av-lock">' + LOCK + '</span></div><span class="av-knob"></span></div>'
    + '<div class="av-back"></div><div class="av-thick av-thick-out"></div><div class="av-thick av-thick-top"></div><div class="av-thick av-thick-bot"></div></div>';
}

function buildGrid() {
  $("av-grid").innerHTML = ORDER.map((d, i) => {
    const c = (d * 7 + i) % 5;
    return '<div class="av-cell av-c' + c + '" data-d="' + d + '" role="button" tabindex="0" aria-label="Case du ' + dayLabel(d) + '">'
      + '<div class="av-niche"><div class="av-slot"></div></div>'
      + leaf("l", d) + leaf("r", d) + '<span class="av-tag"></span></div>';
  }).join("");
}

/** État d'une case pour un client : ouverte, du jour, manquée ou à venir. */
function cellState(d) {
  if (opened[d]) return "open";
  if (!state || state.mode === "test") return "free";
  const t = state.today;
  if (d > t || t < 1) return "locked";
  if (t > state.lastOpenDay) return "missed";
  if (d === t) return "today";
  if (!state.catchUp) return "missed";
  // Rattrapage : seule la première case non ouverte est disponible
  for (let x = 1; x < d; x++) if (!opened[x]) return "locked";
  return "today";
}

function render() {
  $("av-grid").querySelectorAll(".av-cell").forEach(cell => {
    const d = +cell.dataset.d;
    const st = cellState(d);
    const p = opened[d];
    cell.classList.toggle("av-open", st === "open");
    cell.classList.toggle("av-today", st === "today" || (st === "free" && state && d === state.today));
    cell.classList.toggle("av-locked", st === "locked");
    cell.classList.toggle("av-missed", st === "missed");
    cell.dataset.rarity = p ? rarityOf(p) : "";
    cell.querySelector(".av-tag").textContent = st === "today" ? "Aujourd'hui" : st === "missed" ? "Manquée" : "";
    const slot = cell.querySelector(".av-slot");
    const html = p
      ? '<div class="av-inside"><span class="av-num">' + d + "</span>" + iconFor(p) + '<span class="av-lbl">' + escapeHtml(p.label) + "</span></div>"
      : "";
    if (slot.innerHTML !== html) slot.innerHTML = html;
  });
  const days = Object.keys(opened).map(Number).sort((a, b) => a - b);
  $("av-count").textContent = days.length + " / 24";
  const wins = days.filter(d => !noGain(opened[d]));
  $("av-gains").innerHTML = wins.map(d => {
    const p = opened[d], r = rarityOf(p);
    return '<li><span class="av-gd">' + d + '</span><span><span class="av-gt">' + escapeHtml(p.label) + "</span>"
      + (r !== "commun" ? ' <span class="av-chip av-chip-' + r + '">' + RARITY[r].label + "</span>" : "")
      + '<br><span class="av-gs">' + escapeHtml(p.detail || "") + "</span></span></li>";
  }).join("");
  $("av-nogain").hidden = wins.length > 0;
  const test = state && state.mode === "test";
  $("av-test-note").hidden = !test;
  $("av-gains-title").textContent = test ? "Gains du test (non enregistrés)" : "Mes gains";
  $("av-sound").textContent = soundOn ? "🔊 Son" : "🔇 Son coupé";
}

function open(withAdmin) {
  if (!$("av-grid").children.length) buildGrid();
  if (state && state.mode === "test") opened = {}; // le test repart de zéro à chaque ouverture
  render();
  $("avent").hidden = false;
  renderPartnersBand();
  document.body.classList.add("av-noscroll");
  startSnow();
  startMusic();
  unlockAudio(); loadCreaks();
  $("av-admin").hidden = !(state && state.mode === "test");
  if (state && state.mode === "test") { loadAdmin(); loadPartnersAdmin(); }
  if (withAdmin) setTimeout(() => $("av-admin").scrollIntoView({ behavior: "smooth" }), 50);
  // Intro animée une fois par jour (pas en arrivant par la gestion)
  else if (!introSeenToday()) playIntro();
}

function close() {
  if (!$("avent") || $("avent").hidden) return;
  stopIntro();
  $("avent").hidden = true;
  $("av-modal").hidden = true;
  document.body.classList.remove("av-noscroll");
  stopSnow();
  stopMusic();
  if (state) showBanner();
}

function shake(cell) {
  cell.classList.remove("av-shake");
  void cell.offsetWidth;
  cell.classList.add("av-shake");
  playLocked();
}

async function openDay(cell) {
  const d = +cell.dataset.d;
  if (opened[d]) return showPrize(opened[d], false);
  if (busy) return;
  playCreak(); // à chaque tentative, même sur une case fermée
  const st = cellState(d);
  if (st === "locked") {
    shake(cell);
    const first = state.today >= 1 && d <= state.today ? [...Array(d).keys()].map(x => x + 1).find(x => !opened[x]) : null;
    return toast(first && first < d ? "Ouvrez d'abord la case du " + dayLabel(first) + "." : "Patience ! Cette case s'ouvre le " + dayLabel(d) + ".");
  }
  if (st === "missed") {
    shake(cell);
    return toast(state.today > state.lastOpenDay ? "Le calendrier est terminé. Merci d'avoir joué !"
      : "Cette case était à ouvrir le " + dayLabel(d) + ". Rendez-vous sur la case du jour !");
  }
  if (busy) return;
  busy = true;
  unlockAudio();
  cell.classList.add("av-wait");
  try {
    const res = await call("openAdventDay", { day: d });
    if (!res.success) { shake(cell); return toast(res.message || "Case impossible à ouvrir, merci de réessayer."); }
    opened[d] = res.prize;
    cell.classList.remove("av-wait");
    render();
    playDoor();
    const r = cell.getBoundingClientRect();
    const rarity = rarityOf(res.prize);
    setTimeout(() => {
      burst(r.left + r.width / 2, r.top + r.height / 2, RARITY[rarity].confetti, RARITY[rarity].colors);
      if (res.prize.kind === "credits") {
        playCash();
        if (rarity !== "commun") setTimeout(() => playRarity(rarity), 650);
      } else playRarity(rarity);
      showPrize(res.prize, !res.already);
    }, 900);
    if (res.prize.kind === "credits" && state.mode !== "test") document.dispatchEvent(new CustomEvent("hiptown-credits-changed"));
  } catch (err) {
    toast("Connexion impossible, merci de réessayer.");
  } finally {
    busy = false;
    cell.classList.remove("av-wait");
  }
}

function showPrize(p, fresh) {
  const r = rarityOf(p);
  $("av-m-ico").innerHTML = iconFor(p);
  $("av-modal").dataset.rarity = r;
  $("av-m-rarity").textContent = RARITY[r].label;
  $("av-m-rarity").hidden = !RARITY[r].label;
  $("av-m-day").textContent = "Case du " + dayLabel(p.day) + (state.mode === "test" ? " · test" : "");
  $("av-m-title").textContent = (fresh && !noGain(p) ? (r === "legendaire" ? "Incroyable ! " : "Bravo ! ") : "") + p.label;
  $("av-m-text").textContent = p.detail || "";
  $("av-m-close").textContent = p.kind === "lost" ? "À demain !" : "Super, merci !";
  $("av-m-partner").textContent = p.partner ? "Offert par " + p.partner : "";
  $("av-m-partner").hidden = !p.partner;
  $("av-modal").hidden = false;
  $("av-m-close").focus();
}

// Relief : le plateau s'incline doucement en suivant la souris (ordinateur)
const stage = $("av-stage");
stage?.addEventListener("pointermove", e => {
  if (e.pointerType !== "mouse" || reduceMotion()) return;
  const b = stage.getBoundingClientRect();
  const x = (e.clientX - b.left) / b.width - 0.5, y = (e.clientY - b.top) / b.height - 0.5;
  stage.style.setProperty("--ry", (x * 26).toFixed(2) + "deg");
  stage.style.setProperty("--rx", (14 - y * 18).toFixed(2) + "deg");
});
stage?.addEventListener("pointerleave", () => { stage.style.removeProperty("--ry"); stage.style.removeProperty("--rx"); });

$("avent-banner")?.addEventListener("click", () => { unlockAudio(); open(false); });
$("open-gestion-avent")?.addEventListener("click", async e => {
  e.preventDefault();
  if (!state) await load();
  if (!state || state.mode !== "test") return toast("Réservé à l'équipe Hiptown de Bordeaux.");
  open(true);
});
$("av-close")?.addEventListener("click", close);
$("av-sound")?.addEventListener("click", () => {
  soundOn = !soundOn;
  try { localStorage.setItem("avent-son", soundOn ? "1" : "0"); } catch (err) { /* réglage non mémorisé */ }
  render();
  if (soundOn) { unlockAudio(); playRarity("commun"); }
});
$("av-grid")?.addEventListener("click", e => { const c = e.target.closest(".av-cell"); if (c) openDay(c); });
$("av-grid")?.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("av-cell")) { e.preventDefault(); openDay(e.target); }
});
$("av-m-close")?.addEventListener("click", () => { $("av-modal").hidden = true; });
$("av-modal")?.addEventListener("click", e => { if (e.target.id === "av-modal") e.currentTarget.hidden = true; });
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || $("avent").hidden) return;
  if (!$("av-intro").hidden) stopIntro();
  else if (!$("av-modal").hidden) $("av-modal").hidden = true; else close();
});

// ==================== SONS (synthétisés, aucun fichier à charger) ====================
// Grincement de porte à l'ouverture, puis un son selon la rareté du lot :
// commun = carillon, rare = arpège scintillant, légendaire = fanfare avec cymbale.

let soundOn = true;
try { soundOn = localStorage.getItem("avent-son") !== "0"; } catch (err) { /* son par défaut */ }
let actx = null;

function unlockAudio() {
  if (!soundOn) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
  } catch (err) { actx = null; }
}

/** Note : fréquence (Hz), début et durée (s), forme d'onde, volume. */
function tone(freq, start, len, wave = "sine", vol = 0.18, glideTo = 0) {
  const t = actx.currentTime + start;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  let out = o;
  if (wave === "sawtooth" || wave === "square") {
    const f = actx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 2200;
    o.connect(f); out = f;
  }
  out.connect(g); g.connect(actx.destination);
  o.start(t); o.stop(t + len + 0.05);
}

/** Souffle filtré (grincement, cymbale). */
function noise(start, len, type, freq, vol, sweepTo = 0) {
  const t = actx.currentTime + start;
  const buf = actx.createBuffer(1, Math.ceil(actx.sampleRate * len), actx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  src.buffer = buf;
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = type === "bandpass" ? 6 : 0.7;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + len);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f); f.connect(g); g.connect(actx.destination);
  src.start(t);
}

const canPlay = () => soundOn && actx && actx.state !== "closed";

function playDoor() {
  if (!canPlay()) return;
  noise(0, 0.45, "bandpass", 500, 0.25, 1400);           // battants qui glissent
}

// Grincements enregistrés (La Sonothèque, remixés : trois extraits courts, égalisés et normalisés)
const CREAK_FILES = ["sons/avent-grincement-1.mp3", "sons/avent-grincement-2.mp3", "sons/avent-grincement-3.mp3"];
let creakBuffers = [], creakLoading = false, lastCreak = -1;

function loadCreaks() {
  if (creakLoading || !actx) return;
  creakLoading = true;
  CREAK_FILES.forEach(url => fetch(url)
    .then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(url)))
    .then(data => new Promise((ok, ko) => actx.decodeAudioData(data, ok, ko)))
    .then(buf => creakBuffers.push(buf))
    .catch(() => { /* le grincement synthétisé prend le relais */ }));
}

/** Un des extraits, jamais deux fois le même de suite, un peu plus aigu ou plus grave à chaque fois. */
function playCreakSample() {
  let i = Math.floor(Math.random() * creakBuffers.length);
  if (creakBuffers.length > 1 && i === lastCreak) i = (i + 1) % creakBuffers.length;
  lastCreak = i;
  const src = actx.createBufferSource(), g = actx.createGain();
  src.buffer = creakBuffers[i];
  src.playbackRate.value = 0.88 + Math.random() * 0.24;
  g.gain.value = 0.11 + Math.random() * 0.04; // léger : environ moitié moins fort que les sons de gain
  src.connect(g); g.connect(actx.destination);
  src.start(actx.currentTime + 0.005);
}

/**
 * Léger grincement de porte en bois, à chaque tentative d'ouverture : un vrai enregistrement
 * (sons/avent-grincement-*.mp3, varié à chaque clic), ou à défaut, tant qu'il n'est pas chargé,
 * ce grincement synthétisé.
 * Comme une vraie charnière : une suite de petits à-coups (le métal accroche puis glisse),
 * de plus en plus rapprochés puis qui ralentissent, et qui font résonner le bois de la porte
 * (trois résonances filtrées). Jamais tout à fait le même d'un clic à l'autre.
 */
function playCreak() {
  unlockAudio();
  if (!canPlay()) return;
  loadCreaks();
  if (creakBuffers.length) return playCreakSample();
  const sr = actx.sampleRate, len = 0.5 + Math.random() * 0.3, n = Math.ceil(sr * len);
  const buf = actx.createBuffer(1, n, sr), data = buf.getChannelData(0);
  const r0 = 18 + Math.random() * 10, peak = 70 + Math.random() * 70, top = 0.35 + Math.random() * 0.3;
  let phase = 0, wobble = 0;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    // Cadence des à-coups : monte jusqu'au milieu puis redescend, avec une légère hésitation
    const shape = x < top ? x / top : 1 - (x - top) / (1 - top);
    if (i % 256 === 0) wobble = wobble * 0.7 + (Math.random() - 0.5) * 0.6;
    const rate = r0 + (peak - r0) * Math.sin(shape * Math.PI / 2) * (1 + wobble * 0.25);
    phase += rate / sr;
    if (phase >= 1) {
      phase -= 1;
      const env = Math.min(1, x / 0.06) * Math.min(1, (1 - x) / 0.2);
      const amp = env * (0.55 + Math.random() * 0.45);
      for (let k = 0; k < 24 && i + k < n; k++) data[i + k] += amp * Math.exp(-k / 4) * (k ? (Math.random() - 0.5) : 1);
    }
  }
  const src = actx.createBufferSource();
  src.buffer = buf;
  const out = actx.createGain();
  out.gain.value = 1.1; // léger
  // Résonances du bois (grave, médium, aigu)
  [[420 + Math.random() * 160, 9, 1], [1050 + Math.random() * 300, 7, 0.7], [2300 + Math.random() * 500, 6, 0.35]].forEach(([fr, q, v]) => {
    const f = actx.createBiquadFilter(), g = actx.createGain();
    f.type = "bandpass"; f.frequency.value = fr; f.Q.value = q;
    g.gain.value = v;
    src.connect(f); f.connect(g); g.connect(out);
  });
  const soft = actx.createBiquadFilter(); // adoucit les clics trop secs
  soft.type = "lowpass"; soft.frequency.value = 3200; soft.Q.value = 0.5;
  out.connect(soft); soft.connect(actx.destination);
  src.start(actx.currentTime + 0.01);
}

function playLocked() {
  unlockAudio();
  if (!canPlay()) return;
  tone(160, 0, 0.08, "square", 0.08);
  tone(140, 0.1, 0.1, "square", 0.08);
}

/** « Ka-ching » de caisse enregistreuse : déclic, tiroir, clochette et pièces qui tintent. */
function playCash() {
  if (!canPlay()) return;
  noise(0, 0.03, "bandpass", 2500, 0.5);            // touche de la caisse
  noise(0.05, 0.03, "bandpass", 1800, 0.4);
  noise(0.1, 0.22, "bandpass", 700, 0.25, 300);     // tiroir qui s'ouvre
  [[2637, 0.18], [3951, 0.16], [5274, 0.07]].forEach(([f, v]) => tone(f, 0.16, 1.1, "sine", v)); // clochette « ching »
  [[3136, 0.12], [4699, 0.06]].forEach(([f, v]) => tone(f, 0.24, 0.9, "sine", v));
  [4186, 3520, 4978, 3729, 4435, 5588].forEach((f, i) => tone(f, 0.38 + i * 0.055 + Math.random() * 0.02, 0.12, "triangle", 0.05)); // pièces
}

function playRarity(r) {
  if (!canPlay()) return;
  if (r === "none") { tone(440, 0, 0.25, "triangle", 0.15, 330); return; }
  if (r === "commun") {
    tone(1047, 0, 0.5, "sine", 0.16);
    tone(1319, 0.12, 0.7, "sine", 0.14);
    return;
  }
  if (r === "rare") {
    [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, i * 0.08, 0.5, "triangle", 0.12));
    [2637, 3136, 3520].forEach((f, i) => tone(f, 0.45 + i * 0.06, 0.4, "sine", 0.05));
    return;
  }
  // Légendaire : roulement, fanfare en trois accords, cymbale et pluie d'étincelles
  for (let i = 0; i < 8; i++) noise(i * 0.045, 0.06, "bandpass", 180, 0.35);
  [[392, 494, 587], [523, 659, 784], [784, 988, 1175]].forEach((chord, i) =>
    chord.forEach(f => tone(f, 0.4 + i * 0.22, i === 2 ? 1.3 : 0.28, "sawtooth", 0.09)));
  noise(0.84, 1.4, "highpass", 6000, 0.22);
  [2093, 2637, 3136, 3951, 4186, 3520, 4699].forEach((f, i) => tone(f, 0.9 + i * 0.07, 0.35, "sine", 0.05));
}

// ==================== ANIMATIONS : CONFETTIS ET NEIGE ====================

let parts = [];
let confettiRunning = false;

function fit(c) { c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio; }

function burst(x, y, count = 140, colors = COLORS) {
  if (reduceMotion() || !count) return;
  const cv = $("av-confetti");
  fit(cv);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 9;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, r: Math.random() * 6, w: 5 + Math.random() * 6,
      h: 3 + Math.random() * 5, c: colors[i % colors.length], s: (Math.random() - 0.5) * 0.4, life: 120 + Math.random() * 60 });
  }
  if (!confettiRunning) { confettiRunning = true; requestAnimationFrame(confettiTick); }
}

function confettiTick() {
  const cv = $("av-confetti"), cx = cv.getContext("2d"), k = devicePixelRatio;
  cx.clearRect(0, 0, cv.width, cv.height);
  parts = parts.filter(p => p.life-- > 0);
  parts.forEach(p => {
    p.vy += 0.28; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.s;
    cx.save();
    cx.translate(p.x * k, p.y * k);
    cx.rotate(p.r);
    cx.globalAlpha = Math.min(1, p.life / 40);
    cx.fillStyle = p.c;
    cx.fillRect(-p.w * k / 2, -p.h * k / 2, p.w * k, p.h * Math.abs(Math.cos(p.r * 3)) * k);
    cx.restore();
  });
  if (parts.length) requestAnimationFrame(confettiTick);
  else { confettiRunning = false; cx.clearRect(0, 0, cv.width, cv.height); }
}

let flakes = [];
let snowFrame = 0;
function startSnow() {
  if (reduceMotion() || snowFrame) return;
  const sv = $("av-snow");
  fit(sv);
  flakes = Array.from({ length: 60 }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight,
    r: 0.8 + Math.random() * 2.4, v: 0.3 + Math.random() * 0.8, w: Math.random() * 6 }));
  const tick = () => {
    const sx = sv.getContext("2d"), k = devicePixelRatio;
    sx.clearRect(0, 0, sv.width, sv.height);
    sx.fillStyle = "rgba(255,255,255,.55)";
    flakes.forEach(f => {
      f.y += f.v; f.w += 0.01; f.x += Math.sin(f.w) * 0.3;
      if (f.y > innerHeight + 5) { f.y = -5; f.x = Math.random() * innerWidth; }
      sx.beginPath(); sx.arc(f.x * k, f.y * k, f.r * k, 0, 7); sx.fill();
    });
    snowFrame = requestAnimationFrame(tick);
  };
  tick();
}
function stopSnow() { cancelAnimationFrame(snowFrame); snowFrame = 0; }
addEventListener("resize", () => { if (snowFrame) { stopSnow(); startSnow(); } });

// ==================== GESTION DES LOTS ET DES GAGNANTS (équipe) ====================

function adminMessage(text, isError) {
  const m = $("av-admin-msg");
  m.textContent = text || "";
  m.style.color = isError ? "#fca5a5" : "#86efac";
  m.hidden = !text;
}

async function loadAdmin() {
  adminMessage("Chargement…");
  try {
    const res = await call("getAdventAdmin");
    if (!res.success) return adminMessage(res.message, true);
    admin = res;
    editPrizes = res.prizes.map(p => ({ ...p, days: (p.days || []).join(", ") }));
    adminMessage("");
    renderAdmin();
  } catch (err) {
    adminMessage("Connexion impossible, merci de réessayer.", true);
  }
}

function renderAdmin() {
  $("av-public").checked = !!admin.public;
  $("av-public-label").textContent = admin.public
    ? "Visible par les clients de Bordeaux" + (admin.today ? "" : " (à partir du 1er décembre)")
    : "Caché aux clients : seule l'équipe Hiptown voit le calendrier";
  $("av-admin-stats").textContent = admin.players + " participant" + (admin.players > 1 ? "s" : "") + " · "
    + admin.openings + " case" + (admin.openings > 1 ? "s" : "") + " ouverte" + (admin.openings > 1 ? "s" : "")
    + " · " + (admin.lost || 0) + " perdue" + (admin.lost > 1 ? "s" : "");
  renderOdds();
  $("av-prizes").innerHTML = editPrizes.map((p, i) => {
    const stock = p.quantity > 0
      ? (p.given || 0) + " gagné(s) sur " + p.quantity + (p.availableToday != null && admin.today ? " · " + p.availableToday + " dispo aujourd'hui" : "")
      : (p.given || 0) + " gagné(s) · sans limite de stock";
    return '<div class="av-prize" data-i="' + i + '">'
      + '<label class="av-f av-f-wide">Nom du lot<input data-k="label" maxlength="60" value="' + escapeHtml(p.label) + '"></label>'
      + '<label class="av-f">Type<select data-k="kind"><option value="credits"' + (p.kind === "credits" ? " selected" : "") + '>Crédits de salle</option>'
      + '<option value="gift"' + (p.kind === "gift" ? " selected" : "") + ">Cadeau</option></select></label>"
      + (p.kind === "credits" ? '<label class="av-f av-f-num">Crédits<input data-k="credits" type="number" min="1" max="500" value="' + (p.credits || 1) + '"></label>' : "")
      + '<label class="av-f av-f-num">Quantité<input data-k="quantity" type="number" min="0" max="10000" value="' + (p.quantity || 0) + '"></label>'
      + '<label class="av-f">Rareté (son)<select data-k="rarity">'
      + [["", "Auto : " + (RARITY[p.autoRarity] || RARITY.commun).label.toLowerCase()], ["commun", "Commun"], ["rare", "Rare"], ["legendaire", "Légendaire"]]
        .map(([v, l]) => '<option value="' + v + '"' + ((p.rarity || "") === v ? " selected" : "") + ">" + l + "</option>").join("") + "</select></label>"
      + '<label class="av-f">Partenaire<select data-k="partnerId"><option value="">Aucun (Hiptown)</option>'
      + editPartners.filter(x => x.id).map(x => '<option value="' + escapeHtml(x.id) + '"' + (p.partnerId === x.id ? " selected" : "") + ">" + escapeHtml(x.name) + "</option>").join("")
      + "</select></label>"
      + '<label class="av-f av-f-num">Chance %<input data-k="chance" type="number" min="0" max="100" step="0.5" placeholder="0" value="' + (p.chance || "") + '"></label>'
      + '<label class="av-f">Jours (vide = tous)<input data-k="days" placeholder="ex. 24 ou 6, 13, 20" value="' + escapeHtml(p.days) + '"></label>'
      + '<label class="av-f av-f-wide">Texte au gagnant<input data-k="detail" maxlength="140" placeholder="' + (p.kind === "credits" ? "Ajoutés aux crédits de votre entreprise pour ce mois-ci." : "L'équipe Hiptown vous contacte pour vous le remettre.") + '" value="' + escapeHtml(p.detail || "") + '"></label>'
      + '<div class="av-prize-foot"><span>' + stock + "</span>"
      + (p.given > 0 ? "" : '<button type="button" class="av-link" data-del="' + i + '">Supprimer</button>') + "</div></div>";
  }).join("");

  $("av-winners").innerHTML = admin.winners.length
    ? admin.winners.map(w => '<li><label><input type="checkbox" data-uid="' + escapeHtml(w.uid) + '" data-day="' + w.day + '"' + (w.delivered ? " checked" : "") + "> remis</label>"
      + "<span><b>" + escapeHtml(w.label) + "</b> · case du " + dayLabel(w.day) + "<br>"
      + escapeHtml([w.name, w.company, w.email].filter(Boolean).join(" · ")) + "</span></li>").join("")
    : '<li class="av-empty">Aucun cadeau gagné pour l\'instant.</li>';
  $("av-credits").innerHTML = admin.credits.length
    ? admin.credits.map(c => "<li><span>" + escapeHtml(c.company) + "</span><b>+" + c.credits + " crédit" + (c.credits > 1 ? "s" : "") + "</b></li>").join("")
    : '<li class="av-empty">Aucun crédit gagné pour l\'instant.</li>';
}

$("av-prizes")?.addEventListener("input", e => {
  const row = e.target.closest(".av-prize");
  if (!row || !e.target.dataset.k) return;
  const p = editPrizes[+row.dataset.i];
  const k = e.target.dataset.k;
  p[k] = ["credits", "quantity", "chance"].includes(k) ? Number(e.target.value) : e.target.value;
  if (k === "kind") renderAdmin();
  else if (k === "chance") renderOdds();
});
$("av-prizes")?.addEventListener("click", e => {
  const del = e.target.closest("[data-del]");
  if (!del) return;
  editPrizes.splice(+del.dataset.del, 1);
  renderAdmin();
});
$("av-add-prize")?.addEventListener("click", () => {
  editPrizes.push({ id: "", label: "", kind: "gift", credits: 0, quantity: 1, chance: 0, days: "", detail: "", given: 0 });
  renderAdmin();
  $("av-prizes").lastElementChild?.querySelector("input")?.focus();
});
$("av-save-prizes")?.addEventListener("click", async () => {
  const prizes = editPrizes.map(p => ({
    id: p.id, label: p.label, kind: p.kind, credits: p.kind === "credits" ? Number(p.credits) || 0 : 0,
    quantity: Number(p.quantity) || 0, chance: Number(p.chance) || 0, rarity: p.rarity || "", partnerId: p.partnerId || "", detail: p.detail || "",
    days: String(p.days || "").split(/[^0-9]+/).filter(Boolean).map(Number)
  }));
  adminMessage("Enregistrement…");
  try {
    const res = await call("saveAdventPrizes", { prizes });
    if (!res.success) return adminMessage(res.message, true);
    admin = res;
    editPrizes = res.prizes.map(p => ({ ...p, days: (p.days || []).join(", ") }));
    renderAdmin();
    adminMessage("Lots enregistrés.");
    // Lots liés aux partenaires : bandeau et intro mis à jour
    call("getAdventPartners").then(r => { if (r.success && state) { state.partners = r.partners; renderPartnersBand(); } }).catch(() => {});
  } catch (err) {
    adminMessage("Connexion impossible, merci de réessayer.", true);
  }
});
$("av-winners")?.addEventListener("change", async e => {
  const box = e.target;
  if (!box.dataset.uid) return;
  box.disabled = true;
  try {
    const res = await call("setAdventDelivered", { uid: box.dataset.uid, day: Number(box.dataset.day), delivered: box.checked });
    if (!res.success) { box.checked = !box.checked; adminMessage(res.message, true); }
  } catch (err) {
    box.checked = !box.checked;
    adminMessage("Connexion impossible, merci de réessayer.", true);
  } finally {
    box.disabled = false;
  }
});

/** Total des % des lots et % de cases perdues (le reste jusqu'à 100 %). */
function renderOdds() {
  const total = Math.round(editPrizes.reduce((sum, p) => sum + (Number(p.chance) || 0), 0) * 10) / 10;
  const lost = Math.max(0, Math.round((100 - total) * 10) / 10);
  const box = $("av-odds");
  box.classList.toggle("av-odds-bad", total > 100);
  box.innerHTML = '<span><b>' + total + ' %</b> lots</span><span>+</span><span><b>' + lost + ' %</b> perdu</span><span>=</span><span><b>'
    + Math.max(100, total) + ' %</b></span>'
    + (total > 100 ? '<em>Le total des lots dépasse 100 % : baissez des pourcentages.</em>' : '<em>Le % « perdu » se calcule tout seul.</em>');
}

$("av-public")?.addEventListener("change", async e => {
  const box = e.target;
  box.disabled = true;
  try {
    const res = await call("setAdventPublic", { public: box.checked });
    if (!res.success) { box.checked = !box.checked; return adminMessage(res.message, true); }
    admin.public = res.public;
    renderAdmin();
    adminMessage(res.public ? "Le calendrier est visible par les clients." : "Le calendrier est caché aux clients.");
  } catch (err) {
    box.checked = !box.checked;
    adminMessage("Connexion impossible, merci de réessayer.", true);
  } finally {
    box.disabled = false;
  }
});

// ==================== INTRO ANIMÉE ET PARTENAIRES ====================
// À l'ouverture du calendrier (une fois par jour et par appareil) : un paquet cadeau s'ouvre
// sur « Hiptown Bordeaux présente le Calendrier de l'Avent », puis les partenaires défilent
// (logo, nom, phrase, lien), et un dernier écran les réunit avant d'ouvrir le calendrier.
// Le bouton « Passer » arrête tout ; « Intro » dans la barre la rejoue.

let introRun = 0;   // numéro de l'intro en cours (une intro arrêtée ne continue pas)

function introSeenToday() {
  try { return localStorage.getItem("avent-intro") === new Date().toDateString(); } catch (err) { return false; }
}

function partnerLogo(p, cls) {
  return p.logo
    ? '<img class="' + cls + '" src="' + escapeHtml(p.logo) + '" alt="' + escapeHtml(p.name) + '">'
    : '<span class="' + cls + ' av-logo-letter">' + escapeHtml((p.name || "?").trim().charAt(0).toUpperCase()) + "</span>";
}

function partnerLink(p, label) {
  return p.url ? '<a class="av-pa-link" href="' + escapeHtml(p.url) + '" target="_blank" rel="noopener">' + label + "</a>" : "";
}

async function playIntro() {
  const run = ++introRun;
  const box = $("av-intro");
  const partners = (state && state.partners) || [];
  const wait = ms => new Promise(r => setTimeout(r, reduceMotion() ? Math.min(ms, 400) : ms));
  const alive = () => run === introRun && !box.hidden;
  const scene = (html, cls) => { $("av-intro-stage").className = "av-intro-stage " + cls; $("av-intro-stage").innerHTML = html; };
  try { localStorage.setItem("avent-intro", new Date().toDateString()); } catch (err) { /* rejouée demain */ }
  box.hidden = false;
  $("av-intro-dots").innerHTML = "";

  // 1. Le paquet tombe, rebondit et s'ouvre
  scene('<div class="av-gift"><div class="av-gift-glow"></div>'
    + '<svg class="av-gift-box" viewBox="0 0 200 150"><rect x="20" y="40" width="160" height="105" rx="10" fill="#ffe700"/><rect x="88" y="40" width="24" height="105" fill="#ff4d6d"/><rect x="20" y="40" width="160" height="14" fill="rgba(0,0,0,.12)"/></svg>'
    + '<svg class="av-gift-lid" viewBox="0 0 200 70"><path d="M100 30c-14-28-52-26-40 0zM100 30c14-28 52-26 40 0z" fill="#ff4d6d" stroke="#1e1847" stroke-width="4"/><rect x="10" y="28" width="180" height="38" rx="9" fill="#67dfcb"/><rect x="88" y="28" width="24" height="38" fill="#ff4d6d"/></svg>'
    + '</div><p class="av-intro-kicker">Hiptown Bordeaux présente</p>', "av-s-gift");
  await wait(1500); if (!alive()) return;
  $("av-intro-stage").classList.add("av-s-open");
  playRarity("rare");
  const r = $("av-intro-stage").getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height * 0.45, 160, RARITY.legendaire.colors);
  await wait(900); if (!alive()) return;

  // 2. Le titre
  const title = "Le Calendrier de l'Avent";
  let n = 0; // lettres animées une à une, mot par mot (un mot ne se coupe jamais)
  scene('<p class="av-intro-kicker">Hiptown Bordeaux présente</p><h2 class="av-intro-title">'
    + title.split(" ").map(w => '<span class="av-word">' + [...w].map(c => '<span style="animation-delay:' + (n++ * 0.035).toFixed(3) + 's">' + escapeHtml(c) + "</span>").join("") + "</span>").join(" ")
    + '</h2><p class="av-intro-sub">24 cases · 24 jours de cadeaux · du 1er au 24 décembre</p>', "av-s-title");
  await wait(2600); if (!alive()) return;

  // 3. Les partenaires en bandeau qui défile, chacun avec ses lots à gagner, puis on ouvre le calendrier
  scene((partners.length
    ? '<p class="av-intro-kicker">Avec nos partenaires</p><h2 class="av-intro-title av-intro-title-static av-intro-title-sm">Des cadeaux à gagner chez eux</h2>'
      + '<div class="av-band av-band-intro"></div>'
    : '<p class="av-intro-kicker">Hiptown Bordeaux</p><h2 class="av-intro-title av-intro-title-static">À vous de jouer !</h2>')
    + '<button type="button" class="av-btn av-intro-go" id="av-intro-go">Ouvrir mon calendrier</button>', "av-s-band");
  if (partners.length) fillBand($("av-intro-stage").querySelector(".av-band"), partners);
  $("av-intro-go").addEventListener("click", stopIntro);
  $("av-intro-go").focus();
}

/** Carte d'un partenaire dans le bandeau : logo, nom, phrase, lots à gagner chez lui, lien. */
function partnerCard(p) {
  const prizes = p.prizes || [];
  return '<div class="av-band-card">' + partnerLogo(p, "av-pa-logo") + '<h3 class="av-pa-name">' + escapeHtml(p.name) + "</h3>"
    + (p.text ? '<p class="av-pa-text">' + escapeHtml(p.text) + "</p>" : "")
    + (prizes.length ? '<div class="av-band-prizes"><span>À gagner</span>' + prizes.map(x =>
        '<b class="av-band-prize av-band-' + escapeHtml(x.rarity || "commun") + '">' + escapeHtml(x.label)
        + (x.quantity > 0 ? " <small>×" + x.quantity + "</small>" : "") + "</b>").join("") + "</div>" : "")
    + partnerLink(p, "Découvrir") + "</div>";
}

/**
 * Remplit un bandeau de partenaires. S'ils tiennent tous dans la largeur, ils restent immobiles,
 * centrés ; sinon ils défilent en boucle (la liste est doublée pour un défilement sans à-coup),
 * et le défilement s'arrête sous le doigt ou la souris.
 */
function fillBand(band, partners) {
  band.classList.remove("av-band-fit", "av-band-move");
  band.innerHTML = '<div class="av-band-track">' + partners.map(partnerCard).join("") + "</div>";
  const track = band.firstChild;
  requestAnimationFrame(() => {
    if (track.scrollWidth <= band.clientWidth + 2) { band.classList.add("av-band-fit"); return; }
    track.insertAdjacentHTML("beforeend", '<div class="av-band-copy" aria-hidden="true">' + partners.map(partnerCard).join("") + "</div>");
    track.querySelectorAll(".av-band-copy a").forEach(a => { a.tabIndex = -1; });
    track.style.animationDuration = Math.max(12, partners.length * 5) + "s";
    band.classList.add("av-band-move");
  });
}

/** Bandeau des partenaires sous le calendrier. */
function renderPartnersBand() {
  const partners = (state && state.partners) || [];
  $("av-partners-section").hidden = !partners.length;
  if (partners.length) fillBand($("av-partners-band"), partners);
}

function stopIntro() {
  introRun++;
  const box = $("av-intro");
  if (box) box.hidden = true;
}

$("av-intro-skip")?.addEventListener("click", stopIntro);
$("av-replay")?.addEventListener("click", () => { unlockAudio(); playIntro(); });
$("av-pa-replay")?.addEventListener("click", () => { unlockAudio(); $("avent").scrollTop = 0; playIntro(); });

// ---- Gestion des partenaires (équipe) ----
let editPartners = [];

function partnersMessage(text, isError) {
  const m = $("av-pa-msg");
  m.textContent = text || "";
  m.style.color = isError ? "#fca5a5" : "#86efac";
  m.hidden = !text;
}

async function loadPartnersAdmin() {
  try {
    const res = await call("getAdventPartners");
    if (!res.success) return partnersMessage(res.message, true);
    editPartners = res.partners.map(p => ({ ...p }));
    renderPartnersAdmin();
    if (admin) renderAdmin();
  } catch (err) {
    partnersMessage("Connexion impossible, merci de réessayer.", true);
  }
}

function renderPartnersAdmin() {
  $("av-partners").innerHTML = editPartners.length ? editPartners.map((p, i) =>
    '<div class="av-prize av-pa-row" data-i="' + i + '">'
    + '<div class="av-pa-logo-edit">' + partnerLogo(p, "av-pa-mini") + '<label class="av-link av-pa-file">Logo…<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-logo hidden></label>'
    + (p.logo ? '<button type="button" class="av-link" data-nologo>Retirer</button>' : "") + "</div>"
    + '<label class="av-f">Nom<input data-k="name" maxlength="60" value="' + escapeHtml(p.name) + '"></label>'
    + '<label class="av-f av-f-wide">Phrase de présentation<input data-k="text" maxlength="160" placeholder="ex. -10 % pour les clients Hiptown" value="' + escapeHtml(p.text || "") + '"></label>'
    + '<label class="av-f av-f-wide">Lien (site, Instagram…)<input data-k="url" maxlength="300" placeholder="https://" value="' + escapeHtml(p.url || "") + '"></label>'
    + '<div class="av-prize-foot"><span>' + (i + 1) + "e dans l'intro</span><span>"
    + (i > 0 ? '<button type="button" class="av-link av-link-soft" data-up="' + i + '">Monter</button> ' : "")
    + '<button type="button" class="av-link" data-delp="' + i + '">Supprimer</button></span></div></div>'
  ).join("") : '<p class="av-empty">Aucun partenaire : l\'intro présente seulement le calendrier.</p>';
}

/** Réduit une image à 240 px au plus et la compresse pour tenir dans 9 Ko (une propriété du script). */
function shrinkLogo(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      for (const max of [240, 180, 128, 96]) {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        for (const q of [0.85, 0.7, 0.55]) {
          let url = c.toDataURL("image/webp", q);
          if (!url.startsWith("data:image/webp")) url = c.toDataURL("image/png");
          if (url.length <= 8800) return resolve(url);
        }
      }
      reject(new Error("Logo trop détaillé : essayez une image plus simple."));
    };
    img.onerror = () => reject(new Error("Image illisible."));
    img.src = URL.createObjectURL(file);
  });
}

$("av-partners")?.addEventListener("input", e => {
  const row = e.target.closest(".av-pa-row");
  if (row && e.target.dataset.k) editPartners[+row.dataset.i][e.target.dataset.k] = e.target.value;
});
$("av-partners")?.addEventListener("change", async e => {
  if (!e.target.hasAttribute("data-logo") || !e.target.files[0]) return;
  const i = +e.target.closest(".av-pa-row").dataset.i;
  try {
    editPartners[i].logo = await shrinkLogo(e.target.files[0]);
    editPartners[i].logoChanged = true;
    renderPartnersAdmin();
    partnersMessage("Logo prêt : pensez à enregistrer.");
  } catch (err) {
    partnersMessage(err.message, true);
  }
});
$("av-partners")?.addEventListener("click", e => {
  const t = e.target;
  if (t.dataset.delp !== undefined) editPartners.splice(+t.dataset.delp, 1);
  else if (t.dataset.up !== undefined) { const i = +t.dataset.up; [editPartners[i - 1], editPartners[i]] = [editPartners[i], editPartners[i - 1]]; }
  else if (t.hasAttribute("data-nologo")) { const p = editPartners[+t.closest(".av-pa-row").dataset.i]; p.logo = ""; p.logoChanged = true; }
  else return;
  renderPartnersAdmin();
});
$("av-add-partner")?.addEventListener("click", () => {
  editPartners.push({ id: "", name: "", text: "", url: "", logo: "", logoChanged: true });
  renderPartnersAdmin();
  $("av-partners").lastElementChild?.querySelector("input[data-k=name]")?.focus();
});
$("av-save-partners")?.addEventListener("click", async () => {
  partnersMessage("Enregistrement…");
  try {
    // Les logos inchangés ne sont pas renvoyés (le serveur garde ceux qu'il a)
    const partners = editPartners.map(p => ({ id: p.id, name: p.name, text: p.text, url: p.url, ...(p.logoChanged ? { logo: p.logo || "" } : {}) }));
    const res = await call("saveAdventPartners", { partners });
    if (!res.success) return partnersMessage(res.message, true);
    editPartners = res.partners.map(p => ({ ...p }));
    if (state) state.partners = res.partners;
    renderPartnersAdmin();
    if (admin) renderAdmin();
    renderPartnersBand();
    partnersMessage("Partenaires enregistrés.");
  } catch (err) {
    partnersMessage("Connexion impossible, merci de réessayer.", true);
  }
});

// ---- Partenaires fictifs pour tester l'intro (logos dessinés ici, aucune vraie marque) ----
const TEST_PARTNERS = [
  { name: "Ciné Lumière (test)", text: "Partenaire fictif : une place offerte pour une achetée.", bg: "#1e1847", fg: "#ffe700", shape: "star", letters: "CL" },
  { name: "Bistro Garonne (test)", text: "Partenaire fictif : le café offert aux clients Hiptown.", bg: "#ff4d6d", fg: "#ffffff", shape: "circle", letters: "BG" },
  { name: "Atelier Sucré (test)", text: "Partenaire fictif : -15 % sur les gâteaux de Noël.", bg: "#b7b0ff", fg: "#1e1847", shape: "heart", letters: "AS" },
  { name: "Vélo Express (test)", text: "Partenaire fictif : une révision de vélo offerte.", bg: "#67dfcb", fg: "#1e1847", shape: "wheel", letters: "VE" },
  { name: "Fleurs & Co (test)", text: "Partenaire fictif : un bouquet pour l'accueil de votre bureau.", bg: "#ffe700", fg: "#1e1847", shape: "flower", letters: "F&C" }
];
const TEST_SHAPES = {
  star: '<path d="M60 14l13 27 30 4-22 21 5 30-26-14-26 14 5-30-22-21 30-4z" fill="FG" opacity=".25"/>',
  circle: '<circle cx="60" cy="60" r="40" fill="none" stroke="FG" stroke-width="6" opacity=".35"/>',
  heart: '<path d="M60 96S20 72 20 44a20 20 0 0 1 40-6 20 20 0 0 1 40 6c0 28-40 52-40 52z" fill="FG" opacity=".25"/>',
  wheel: '<circle cx="60" cy="60" r="38" fill="none" stroke="FG" stroke-width="5" opacity=".35"/><path d="M60 22v76M22 60h76M33 33l54 54M87 33L33 87" stroke="FG" stroke-width="3" opacity=".3"/>',
  flower: '<g fill="FG" opacity=".25"><circle cx="60" cy="34" r="16"/><circle cx="86" cy="60" r="16"/><circle cx="60" cy="86" r="16"/><circle cx="34" cy="60" r="16"/></g>'
};

/** Dessine un logo fictif (SVG) puis le convertit en image compacte, comme un logo envoyé. */
function testLogo(t) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 120 120">'
    + '<rect width="120" height="120" rx="26" fill="' + t.bg + '"/>' + TEST_SHAPES[t.shape].replace(/FG/g, t.fg)
    + '<text x="60" y="' + (t.letters.length > 2 ? 70 : 74) + '" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="' + (t.letters.length > 2 ? 30 : 40) + '" fill="' + t.fg + '">'
    + t.letters.replace("&", "&amp;") + "</text></svg>";
  const blob = new Blob([svg], { type: "image/svg+xml" });
  return shrinkLogo(blob);
}

$("av-test-partners")?.addEventListener("click", async () => {
  partnersMessage("Création des logos de test…");
  try {
    for (const t of TEST_PARTNERS) {
      if (editPartners.some(p => p.name === t.name)) continue;
      editPartners.push({ id: "", name: t.name, text: t.text, url: "", logo: await testLogo(t), logoChanged: true });
    }
    renderPartnersAdmin();
    partnersMessage("5 partenaires fictifs ajoutés : enregistrez, puis « Revoir l'intro ». Pensez à les supprimer avant d'ouvrir aux clients.");
  } catch (err) {
    partnersMessage(err.message, true);
  }
});

// Téléphone : le plateau suit l'inclinaison de l'appareil quand le navigateur la donne sans
// demander d'autorisation (Android) ; sinon il se balance tout seul (animation CSS).
addEventListener("deviceorientation", e => {
  if (!stage || $("avent").hidden || reduceMotion() || e.gamma == null || e.beta == null) return;
  const ry = Math.max(-20, Math.min(20, e.gamma * 0.6));
  const rx = Math.max(0, Math.min(26, 12 + (e.beta - 45) * 0.4));
  stage.classList.add("av-tilting");
  stage.style.setProperty("--ry", ry.toFixed(2) + "deg");
  stage.style.setProperty("--rx", rx.toFixed(2) + "deg");
});

// ==================== MUSIQUE DE NOËL (boîte à musique synthétisée) ====================
// « Jingle Bells » (James Lord Pierpont, 1857 : domaine public), jouée par le navigateur,
// sans fichier ni droits. Elle démarre à l'ouverture du calendrier, s'arrête en le quittant
// ou quand l'onglet est caché, et le bouton « Musique » la coupe (choix mémorisé).

let musicOn = true;
try { musicOn = localStorage.getItem("avent-musique") !== "0"; } catch (err) { /* musique par défaut */ }
let music = null; // { gain, timer, next, step }

const N = { C3: 131, F3: 175, G3: 196, C5: 523, D5: 587, E5: 659, F5: 698, G5: 784 };
// [note, temps] ; 1 temps = une noire
const JINGLE = [
  ["E5", 1], ["E5", 1], ["E5", 2], ["E5", 1], ["E5", 1], ["E5", 2], ["E5", 1], ["G5", 1], ["C5", 1.5], ["D5", 0.5], ["E5", 4],
  ["F5", 1], ["F5", 1], ["F5", 1.5], ["F5", 0.5], ["F5", 1], ["E5", 1], ["E5", 1], ["E5", 0.5], ["E5", 0.5], ["E5", 1], ["D5", 1], ["D5", 1], ["E5", 1], ["D5", 2], ["G5", 2],
  ["E5", 1], ["E5", 1], ["E5", 2], ["E5", 1], ["E5", 1], ["E5", 2], ["E5", 1], ["G5", 1], ["C5", 1.5], ["D5", 0.5], ["E5", 4],
  ["F5", 1], ["F5", 1], ["F5", 1.5], ["F5", 0.5], ["F5", 1], ["E5", 1], ["E5", 1], ["E5", 0.5], ["E5", 0.5], ["G5", 1], ["G5", 1], ["F5", 1], ["D5", 1], ["C5", 4],
  [null, 4]
];
// Basse : une note par mesure de 4 temps
const JINGLE_BASS = ["C3", "C3", "C3", "C3", "F3", "C3", "G3", "G3", "C3", "C3", "C3", "C3", "F3", "C3", "G3", "C3", null];
const BEAT = 60 / 108;          // tempo calme
const MUSIC_VOLUME = 0.2;       // en fond : bien plus bas que les sons des cases

function ensureAudio() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    return true;
  } catch (err) { actx = null; return false; }
}

/** Note de boîte à musique : attaque nette, extinction lente, une harmonique claire. */
function musicNote(freq, t, len, vol) {
  [[1, vol], [2, vol * 0.25], [3.01, vol * 0.08]].forEach(([mult, v]) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = "sine";
    o.frequency.value = freq * mult;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(music.gain);
    o.start(t); o.stop(t + len + 0.05);
  });
}

function scheduleMusic() {
  if (!music) return;
  const ahead = actx.currentTime + 0.6;
  while (music.next < ahead) {
    const [note, beats] = JINGLE[music.step];
    if (music.beat % 4 === 0) {
      const bass = JINGLE_BASS[(music.beat / 4) % JINGLE_BASS.length];
      if (bass) musicNote(N[bass], music.next, BEAT * 3.5, 0.05);
    }
    if (note) musicNote(N[note], music.next, Math.max(0.6, beats * BEAT * 1.4), 0.07);
    music.next += beats * BEAT;
    music.beat = (music.beat + beats) % 68;
    music.step = (music.step + 1) % JINGLE.length;
    if (music.step === 0) music.beat = 0;
  }
}

function startMusic() {
  if (music || !musicOn || !ensureAudio()) return;
  const gain = actx.createGain();
  gain.gain.setValueAtTime(0.0001, actx.currentTime);
  gain.gain.exponentialRampToValueAtTime(MUSIC_VOLUME, actx.currentTime + 2.5); // fondu d'entrée doux
  gain.connect(actx.destination);
  music = { gain, next: actx.currentTime + 0.3, step: 0, beat: 0, timer: 0 };
  scheduleMusic();
  music.timer = setInterval(scheduleMusic, 200);
}

function stopMusic() {
  if (!music) return;
  const m = music;
  music = null;
  clearInterval(m.timer);
  try {
    m.gain.gain.cancelScheduledValues(actx.currentTime);
    m.gain.gain.setValueAtTime(m.gain.gain.value || MUSIC_VOLUME, actx.currentTime);
    m.gain.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.4);
    setTimeout(() => m.gain.disconnect(), 600);
  } catch (err) { /* déjà arrêtée */ }
}

function renderMusicButton() {
  const b = $("av-music");
  if (!b) return;
  b.textContent = musicOn ? "🎵 Musique" : "🎵 Musique coupée";
  b.setAttribute("aria-pressed", musicOn ? "true" : "false");
}

$("av-music")?.addEventListener("click", () => {
  musicOn = !musicOn;
  try { localStorage.setItem("avent-musique", musicOn ? "1" : "0"); } catch (err) { /* réglage non mémorisé */ }
  renderMusicButton();
  if (musicOn) startMusic(); else stopMusic();
});
document.addEventListener("visibilitychange", () => {
  if (!$("avent") || $("avent").hidden) return;
  if (document.hidden) stopMusic(); else startMusic();
});
renderMusicButton();
