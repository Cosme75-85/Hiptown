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
  credits: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="34" r="22" fill="#e6c800"/><circle cx="32" cy="30" r="22" fill="#ffe700" stroke="#1e1847" stroke-width="3"/><circle cx="32" cy="30" r="15" fill="none" stroke="#1e1847" stroke-width="2" stroke-dasharray="3 4"/><path d="M38 23a9 9 0 1 0 0 14" fill="none" stroke="#1e1847" stroke-width="5" stroke-linecap="round"/></svg>',
  cinema: '<svg viewBox="0 0 64 64" aria-hidden="true"><g transform="rotate(-12 32 32)"><path d="M6 20h52v8a4 4 0 0 0 0 8v8H6v-8a4 4 0 0 0 0-8z" fill="#67dfcb" stroke="#1e1847" stroke-width="3" stroke-linejoin="round"/><path d="M44 21v22" stroke="#1e1847" stroke-width="2" stroke-dasharray="3 3"/><path d="M22 26l10 6-10 6z" fill="#1e1847"/></g></svg>',
  gift: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="26" width="44" height="30" rx="4" fill="#ff4d6d" stroke="#1e1847" stroke-width="3"/><rect x="7" y="18" width="50" height="11" rx="3" fill="#ff6f88" stroke="#1e1847" stroke-width="3"/><path d="M32 18v38" stroke="#ffe700" stroke-width="7"/><path d="M32 18c-6-10-18-8-14 0zM32 18c6-10 18-8 14 0z" fill="#ffe700" stroke="#1e1847" stroke-width="3" stroke-linejoin="round"/></svg>',
  coffee: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M24 8c-3 4 3 6 0 10M34 8c-3 4 3 6 0 10" stroke="#b7b0ff" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M12 24h34v14a14 14 0 0 1-14 14h-6a14 14 0 0 1-14-14z" fill="#fff" stroke="#1e1847" stroke-width="3"/><path d="M46 28h4a6 6 0 0 1 0 12h-5" fill="none" stroke="#1e1847" stroke-width="3"/><path d="M8 56h44" stroke="#1e1847" stroke-width="3" stroke-linecap="round"/></svg>',
  star: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6l7 17h18l-14 11 5 18-16-10-16 10 5-18L7 23h18z" fill="#b7b0ff" stroke="#1e1847" stroke-width="3" stroke-linejoin="round"/></svg>'
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

function buildGrid() {
  $("av-grid").innerHTML = ORDER.map((d, i) => {
    const c = (d * 7 + i) % 5;
    return '<div class="av-cell av-c' + c + '" data-d="' + d + '" role="button" tabindex="0" aria-label="Case du ' + dayLabel(d) + '">'
      + '<div class="av-slot"></div>'
      + '<div class="av-door"><div class="av-face"><span class="av-deco">' + DECO[d % 4] + '</span><span class="av-n">' + d + '</span><span class="av-knob"></span></div>'
      + '<div class="av-back"></div><div class="av-edge"></div></div></div>';
  }).join("");
}

function render() {
  const today = state ? state.today : 0;
  const test = state && state.mode === "test";
  $("av-grid").querySelectorAll(".av-cell").forEach(cell => {
    const d = +cell.dataset.d;
    const p = opened[d];
    cell.classList.toggle("av-open", !!p);
    cell.classList.toggle("av-today", d === today);
    cell.classList.toggle("av-locked", !test && d > today);
    const slot = cell.querySelector(".av-slot");
    slot.innerHTML = p
      ? '<div class="av-inside"><span class="av-num">' + d + "</span>" + iconFor(p) + '<span class="av-lbl">' + escapeHtml(p.label) + "</span></div>"
      : "";
  });
  const days = Object.keys(opened).map(Number).sort((a, b) => a - b);
  $("av-count").textContent = days.length + " / 24";
  const wins = days.filter(d => opened[d].kind !== "none");
  $("av-gains").innerHTML = wins.map(d => {
    const p = opened[d];
    return '<li><span class="av-gd">' + d + '</span><span><span class="av-gt">' + escapeHtml(p.label) + '</span><br><span class="av-gs">'
      + escapeHtml(p.detail || "") + "</span></span></li>";
  }).join("");
  $("av-nogain").hidden = wins.length > 0;
  $("av-test-note").hidden = !test;
  $("av-gains-title").textContent = test ? "Gains du test (non enregistrés)" : "Mes gains";
}

function open(withAdmin) {
  if (!$("av-grid").children.length) buildGrid();
  if (state && state.mode === "test") opened = {}; // le test repart de zéro à chaque ouverture
  render();
  $("avent").hidden = false;
  document.body.classList.add("av-noscroll");
  startSnow();
  $("av-admin").hidden = !(state && state.mode === "test");
  if (state && state.mode === "test") loadAdmin();
  if (withAdmin) setTimeout(() => $("av-admin").scrollIntoView({ behavior: "smooth" }), 50);
}

function close() {
  if (!$("avent") || $("avent").hidden) return;
  $("avent").hidden = true;
  $("av-modal").hidden = true;
  document.body.classList.remove("av-noscroll");
  stopSnow();
  if (state) showBanner();
}

async function openDay(cell) {
  const d = +cell.dataset.d;
  if (opened[d]) return showPrize(opened[d], false);
  const test = state.mode === "test";
  if (!test && d > state.today) {
    cell.classList.remove("av-shake");
    void cell.offsetWidth;
    cell.classList.add("av-shake");
    return toast("Patience ! Cette case s'ouvre le " + dayLabel(d) + ".");
  }
  if (busy) return;
  busy = true;
  cell.classList.add("av-wait");
  try {
    const res = await call("openAdventDay", { day: d });
    if (!res.success) return toast(res.message || "Case impossible à ouvrir, merci de réessayer.");
    opened[d] = res.prize;
    render();
    const r = cell.getBoundingClientRect();
    setTimeout(() => {
      if (res.prize.kind !== "none") burst(r.left + r.width / 2, r.top + r.height / 2);
      showPrize(res.prize, !res.already);
    }, 650);
    if (res.prize.kind === "credits" && !test) document.dispatchEvent(new CustomEvent("hiptown-credits-changed"));
  } catch (err) {
    toast("Connexion impossible, merci de réessayer.");
  } finally {
    busy = false;
    cell.classList.remove("av-wait");
  }
}

function showPrize(p, fresh) {
  $("av-m-ico").innerHTML = iconFor(p);
  $("av-m-day").textContent = "Case du " + dayLabel(p.day) + (state.mode === "test" ? " · test" : "");
  $("av-m-title").textContent = (fresh && p.kind !== "none" ? "Bravo ! " : "") + p.label;
  $("av-m-text").textContent = p.detail || "";
  $("av-modal").hidden = false;
  $("av-m-close").focus();
}

$("avent-banner")?.addEventListener("click", () => open(false));
$("open-gestion-avent")?.addEventListener("click", async e => {
  e.preventDefault();
  if (!state) await load();
  if (!state || state.mode !== "test") return toast("Réservé à l'équipe Hiptown de Bordeaux.");
  open(true);
});
$("av-close")?.addEventListener("click", close);
$("av-grid")?.addEventListener("click", e => { const c = e.target.closest(".av-cell"); if (c) openDay(c); });
$("av-grid")?.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("av-cell")) { e.preventDefault(); openDay(e.target); }
});
$("av-m-close")?.addEventListener("click", () => { $("av-modal").hidden = true; });
$("av-modal")?.addEventListener("click", e => { if (e.target.id === "av-modal") e.currentTarget.hidden = true; });
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || $("avent").hidden) return;
  if (!$("av-modal").hidden) $("av-modal").hidden = true; else close();
});

// ==================== ANIMATIONS : CONFETTIS ET NEIGE ====================

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const COLORS = ["#ffe700", "#67dfcb", "#b7b0ff", "#ffffff", "#ff4d6d"];
let parts = [];
let confettiRunning = false;

function fit(c) { c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio; }

function burst(x, y) {
  if (reduceMotion()) return;
  const cv = $("av-confetti");
  fit(cv);
  for (let i = 0; i < 140; i++) {
    const a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 9;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, r: Math.random() * 6, w: 5 + Math.random() * 6,
      h: 3 + Math.random() * 5, c: COLORS[i % 5], s: (Math.random() - 0.5) * 0.4, life: 120 + Math.random() * 60 });
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
    + admin.openings + " case" + (admin.openings > 1 ? "s" : "") + " ouverte" + (admin.openings > 1 ? "s" : "");
  $("av-prizes").innerHTML = editPrizes.map((p, i) => {
    const stock = p.quantity > 0
      ? (p.given || 0) + " gagné(s) sur " + p.quantity + (p.chance > 0 ? " · " + p.chance + " % de chance par case" : "") + (p.availableToday != null && admin.today ? " · " + p.availableToday + " dispo aujourd'hui" : "")
      : (p.given || 0) + " gagné(s) · illimité (lot de consolation)";
    return '<div class="av-prize" data-i="' + i + '">'
      + '<label class="av-f av-f-wide">Nom du lot<input data-k="label" maxlength="60" value="' + escapeHtml(p.label) + '"></label>'
      + '<label class="av-f">Type<select data-k="kind"><option value="credits"' + (p.kind === "credits" ? " selected" : "") + '>Crédits de salle</option>'
      + '<option value="gift"' + (p.kind === "gift" ? " selected" : "") + ">Cadeau</option></select></label>"
      + (p.kind === "credits" ? '<label class="av-f av-f-num">Crédits<input data-k="credits" type="number" min="1" max="500" value="' + (p.credits || 1) + '"></label>' : "")
      + '<label class="av-f av-f-num">Quantité<input data-k="quantity" type="number" min="0" max="10000" value="' + (p.quantity || 0) + '"></label>'
      + '<label class="av-f av-f-num">Chance %<input data-k="chance" type="number" min="0" max="100" step="0.5" placeholder="stock" value="' + (p.chance || "") + '"></label>'
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
    quantity: Number(p.quantity) || 0, chance: Number(p.chance) || 0, detail: p.detail || "",
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
