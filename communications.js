// ═══════════════════════════════════════════════════════
//  PORTAIL HIPTOWN — Barre de communication (haut du tableau de bord)
//  Chaque ville a ses propres communications (jusqu'à 10), vues par l'équipe
//  et les clients de la ville. Tous les comptes admin Hiptown d'une ville les
//  modifient avec le bouton « Modifier » de la barre (l'admin général : toutes les villes).
// ═══════════════════════════════════════════════════════
//  communications/{ville}-{0…9} : un document par communication. L'identifiant
//  limite chaque ville à 10 communications (firestore.rules).

import { db } from "./firebase-config.js";
import {
  collection, query, where, getDocs, doc, setDoc, deleteDoc, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const MAX_COMMS = 10;
const MAX_BUTTONS = 3;
// Format affiché aux admins : l'image est montrée en 3:1, recadrée au centre si besoin.
// Sans titre ni texte, l'image remplit toute la barre (même hauteur, toute la largeur) : format plus allongé.
const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 400;
const FULL_WIDTH = 1450;
const FULL_HEIGHT = 300;
const MAX_IMAGE_LENGTH = 500000; // caractères, même limite que firestore.rules
const SAFE_IMAGE = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;
const SAFE_URL = /^(https?:\/\/|mailto:|tel:)[^\s"'<>]+$/i;
const AUDIENCES = { hiptown: "Équipe Hiptown", coworking: "Clients coworking", salle: "Clients salles de réunion" };
const AUTOPLAY_MS = 5000;

const $ = id => document.getElementById(id);
const cityName = c => PORTAIL.cities?.[c]?.name || c;

let ctx = null;       // { space, city, canEdit, cities } du compte connecté
let bannerCity = null; // ville affichée dans la barre
let items = [];       // communications de la ville affichée (barre)
let autoplay = null;

let editCity = null;  // ville en cours de modification
let editItems = [];
let editing = null;   // communication du formulaire (null = nouvelle)
let formImage = "";

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

const isSafeImage = img => typeof img === "string" && img.length <= MAX_IMAGE_LENGTH && SAFE_IMAGE.test(img);
const isSafeUrl = url => typeof url === "string" && url.length <= 500 && SAFE_URL.test(url);

// ═══════════════════════════════════════════════════════
//  « AJOUTER À L'AGENDA » : jour, heures (heure de Paris) et lieu facultatifs.
//  Si le jour est rempli, la communication montre un bouton qui ouvre Google Agenda,
//  Outlook, ou télécharge un fichier .ics (Apple Calendrier et autres agendas).
// ═══════════════════════════════════════════════════════
const AGENDA_DAY = /^\d{4}-\d{2}-\d{2}$/;
const AGENDA_TIME = /^\d{2}:\d{2}$/;
const hasAgenda = c => !!c && AGENDA_DAY.test(c.agendaDay || "");

/** Décalage (en minutes) de l'heure de Paris par rapport à UTC, à une date donnée (été/hiver). */
function parisOffset(utcMs) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  }).formatToParts(new Date(utcMs)).map(p => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return Math.round((asUtc - utcMs) / 60000);
}

/** « 2026-11-20 » + « 09:30 » à Paris → Date (instant exact). */
function parisDate(day, time) {
  const [y, m, d] = day.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  return new Date(guess - parisOffset(guess - parisOffset(guess) * 60000) * 60000);
}

const pad = n => String(n).padStart(2, "0");
const utcStamp = date => `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
const dayStamp = day => day.replace(/-/g, "");
function nextDay(day) {
  const [y, m, d] = day.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** Début / fin de l'événement. Sans heure : toute la journée. Sans heure de fin : 1 heure. */
function agendaTimes(c) {
  if (!AGENDA_TIME.test(c.agendaStart || "")) return { allDay: true, day: c.agendaDay, end: nextDay(c.agendaDay) };
  const start = parisDate(c.agendaDay, c.agendaStart);
  let end = AGENDA_TIME.test(c.agendaEnd || "") ? parisDate(c.agendaDay, c.agendaEnd) : null;
  if (!end || end <= start) end = new Date(start.getTime() + 3600000);
  return { allDay: false, start, end };
}

function agendaDetails(c) {
  return [c.text, "Hiptown " + cityName(c.city)].filter(Boolean).join("\n\n");
}

function googleUrl(c) {
  const t = agendaTimes(c);
  const dates = t.allDay ? `${dayStamp(t.day)}/${dayStamp(t.end)}` : `${utcStamp(t.start)}/${utcStamp(t.end)}`;
  const q = new URLSearchParams({ action: "TEMPLATE", text: c.title || "Événement Hiptown", dates, details: agendaDetails(c), location: c.agendaPlace || "" });
  return "https://calendar.google.com/calendar/render?" + q.toString();
}

function outlookUrl(c, host) {
  const t = agendaTimes(c);
  const q = new URLSearchParams({
    path: "/calendar/action/compose", rru: "addevent",
    subject: c.title || "Événement Hiptown", body: agendaDetails(c), location: c.agendaPlace || "",
    startdt: t.allDay ? t.day : t.start.toISOString(),
    enddt: t.allDay ? t.end : t.end.toISOString(),
    allday: t.allDay ? "true" : "false"
  });
  return `https://${host}/calendar/0/deeplink/compose?` + q.toString();
}

const icsText = text => String(text || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

function downloadIcs(c) {
  const t = agendaTimes(c);
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Hiptown//Portail//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${c.id || "communication"}-${dayStamp(c.agendaDay)}@portail.hiptown`,
    `DTSTAMP:${utcStamp(new Date())}`,
    t.allDay ? `DTSTART;VALUE=DATE:${dayStamp(t.day)}` : `DTSTART:${utcStamp(t.start)}`,
    t.allDay ? `DTEND;VALUE=DATE:${dayStamp(t.end)}` : `DTEND:${utcStamp(t.end)}`,
    `SUMMARY:${icsText(c.title || "Événement Hiptown")}`,
    `DESCRIPTION:${icsText(agendaDetails(c))}`,
    c.agendaPlace ? `LOCATION:${icsText(c.agendaPlace)}` : "",
    "END:VEVENT", "END:VCALENDAR"
  ].filter(Boolean);
  const blob = new Blob([lines.join("\r\n") + "\r\n"], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (c.title || "evenement-hiptown").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 50) + ".ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Étiquette affichée quand l'équipe n'a pas écrit de « Date ou étiquette » : « jeu. 20 nov. · 9 h 30 ». */
function agendaLabel(c) {
  const [y, m, d] = c.agendaDay.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const hour = t => { const [h, min] = t.split(":"); return `${+h} h${min === "00" ? "" : " " + min}`; };
  if (!AGENDA_TIME.test(c.agendaStart || "")) return day;
  return `${day} · ${hour(c.agendaStart)}${AGENDA_TIME.test(c.agendaEnd || "") ? " – " + hour(c.agendaEnd) : ""}`;
}

// ── Petit menu « Ajouter à l'agenda » (posé sur la page, pour ne pas être coupé par la barre) ──
let calMenu = null;
function closeCalMenu() {
  if (calMenu) { calMenu.remove(); calMenu = null; }
}
function openCalMenu(button, c) {
  const reopen = calMenu && calMenu.dataset.for === c.id;
  closeCalMenu();
  if (reopen) return;
  calMenu = document.createElement("div");
  calMenu.className = "cal-menu";
  calMenu.dataset.for = c.id;
  calMenu.setAttribute("role", "menu");
  calMenu.innerHTML = `
    <a role="menuitem" href="${escapeHtml(googleUrl(c))}" target="_blank" rel="noopener">Google Agenda</a>
    <a role="menuitem" href="${escapeHtml(outlookUrl(c, "outlook.office.com"))}" target="_blank" rel="noopener">Outlook (compte pro)</a>
    <a role="menuitem" href="${escapeHtml(outlookUrl(c, "outlook.live.com"))}" target="_blank" rel="noopener">Outlook.com / Hotmail</a>
    <button role="menuitem" type="button">Apple Calendrier / autre agenda</button>`;
  calMenu.querySelector("button").addEventListener("click", () => { downloadIcs(c); closeCalMenu(); });
  calMenu.querySelectorAll("a").forEach(a => a.addEventListener("click", () => setTimeout(closeCalMenu, 0)));
  document.body.appendChild(calMenu);
  const r = button.getBoundingClientRect();
  const w = calMenu.offsetWidth, h = calMenu.offsetHeight;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
  const top = r.bottom + 6 + h > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6;
  calMenu.style.left = left + "px";
  calMenu.style.top = top + "px";
}
document.addEventListener("click", e => {
  if (calMenu && !calMenu.contains(e.target) && !e.target.closest(".comm-cal-btn")) closeCalMenu();
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closeCalMenu(); });
window.addEventListener("scroll", closeCalMenu, { passive: true });
window.addEventListener("resize", closeCalMenu);

/** Communications d'une ville, dans l'ordre choisi par l'équipe. */
async function listCommunications(city) {
  const snap = await getDocs(query(collection(db, "communications"), where("city", "==", city)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// ═══════════════════════════════════════════════════════
//  BARRE (tableau de bord)
// ═══════════════════════════════════════════════════════

const banner = $("events-banner");
const track = $("events-track");
const dotsEl = $("events-dots");
const dashboard = $("step-dashboard");

function visibleFor(c, space) {
  const audience = Array.isArray(c.audience) && c.audience.length ? c.audience : Object.keys(AUDIENCES);
  return audience.includes(space);
}

/** La barre suit le tableau de bord : affichée avec lui, s'il y a quelque chose à montrer. */
function syncBanner() {
  const show = !!ctx && !dashboard.hidden && (items.length > 0 || ctx.canEdit);
  if (banner.hidden === !show) return;
  banner.hidden = !show;
}
new MutationObserver(syncBanner).observe(dashboard, { attributes: true, attributeFilter: ["hidden"] });

function cardHtml(c, i) {
  const img = isSafeImage(c.image)
    ? `<img src="${c.image}" alt="${escapeHtml(c.title)}" loading="lazy"/>`
    : "";
  const buttons = (c.buttons || []).filter(b => b && b.label && isSafeUrl(b.url))
    .map(b => `<a class="comm-btn" href="${escapeHtml(b.url)}" target="_blank" rel="noopener">${escapeHtml(b.label)}</a>`).join("")
    + (hasAgenda(c) ? `<button class="comm-btn comm-cal-btn" type="button" data-cal="${i}" aria-haspopup="menu">📅 Ajouter à l'agenda</button>` : "");
  const date = c.date || (hasAgenda(c) ? agendaLabel(c) : "");
  const hasText = c.title || date || c.text;
  // Sans titre ni texte, l'image prend toute la largeur de la barre (pas de colonne vide à côté)
  const full = img && !c.title && !c.text;
  return `
    <div class="comm-card${full ? " comm-card-full" : ""}">
      ${img ? `<div class="comm-img">${img}</div>` : ""}
      ${hasText || buttons ? `<div class="comm-info${img ? "" : " comm-info-only"}">
        <div class="comm-main">
          ${c.title ? `<div class="comm-title">${escapeHtml(c.title)}</div>` : ""}
          ${c.text ? `<div class="comm-text">${escapeHtml(c.text)}</div>` : ""}
        </div>
        ${date || buttons ? `<div class="comm-side">
          ${date ? `<div class="event-date">${escapeHtml(date)}</div>` : ""}
          ${buttons ? `<div class="comm-btns">${buttons}</div>` : ""}
        </div>` : ""}
      </div>` : ""}
    </div>`;
}

function renderBanner() {
  clearInterval(autoplay);
  $("events-label").textContent = ctx && ctx.cities.length > 1 && bannerCity
    ? `📣 Communications · ${cityName(bannerCity)}` : "📣 Communications";
  $("events-edit").hidden = !(ctx && ctx.canEdit);
  dotsEl.innerHTML = "";
  if (!items.length) {
    track.innerHTML = `<p class="comm-empty">Aucune communication pour le moment. Cliquez sur « Modifier » pour en ajouter.</p>`;
    syncBanner();
    return;
  }
  closeCalMenu();
  track.innerHTML = items.map(cardHtml).join("");
  track.querySelectorAll(".comm-cal-btn").forEach(b =>
    b.addEventListener("click", () => openCalMenu(b, items[+b.dataset.cal])));
  if (items.length > 1) {
    items.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "events-dot" + (i === 0 ? " active" : "");
      dot.setAttribute("aria-label", `Communication ${i + 1}`);
      dot.addEventListener("click", () => goTo(i));
      dotsEl.appendChild(dot);
    });
    autoplay = setInterval(() => {
      if (banner.hidden || calMenu || track.matches(":hover")) return;
      goTo((currentIndex() + 1) % items.length);
    }, AUTOPLAY_MS);
  }
  track.scrollLeft = 0;
  syncBanner();
}

function currentIndex() {
  return Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
}

function goTo(i) {
  track.scrollTo({ left: i * track.clientWidth, behavior: "smooth" });
}

track.addEventListener("scroll", () => {
  closeCalMenu();
  const i = currentIndex();
  dotsEl.querySelectorAll(".events-dot").forEach((d, j) => d.classList.toggle("active", i === j));
}, { passive: true });

async function loadBanner() {
  if (!ctx || !bannerCity) { items = []; renderBanner(); return; }
  try {
    const all = await listCommunications(bannerCity);
    items = all.filter(c => visibleFor(c, ctx.space));
  } catch (err) {
    console.error("Communications non chargées", err);
    items = [];
  }
  renderBanner();
}

document.addEventListener("hiptown-dashboard", e => {
  const { space, place } = e.detail;
  const city = place.site || null;
  const isTeam = space === "hiptown";
  // Admin général : pas de ville, il choisit la ville à modifier
  const cities = isTeam && !city ? Object.keys(PORTAIL.cities || {}) : (city ? [city] : []);
  ctx = { space, city, canEdit: isTeam && cities.length > 0, cities };
  bannerCity = city || (cities.includes(bannerCity) ? bannerCity : (PORTAIL.defaultSite || cities[0] || null));
  items = [];
  loadBanner();
});

// ═══════════════════════════════════════════════════════
//  PAGE « MODIFIER LES COMMUNICATIONS » (équipe Hiptown)
// ═══════════════════════════════════════════════════════

async function openEditor() {
  if (!ctx || !ctx.canEdit) return;
  editCity = bannerCity;
  const select = $("comm-city");
  select.innerHTML = ctx.cities.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(cityName(c))}</option>`).join("");
  select.value = editCity;
  $("comm-city-row").hidden = ctx.cities.length < 2;
  $("comm-format").textContent = `${IMAGE_WIDTH} × ${IMAGE_HEIGHT} px`;
  closeForm();
  showMessage("comm-message", "");
  window.hideAllAuth();
  $("step-communications").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
  await refreshEditor();
}

async function refreshEditor() {
  const list = $("comm-list");
  $("comm-city-name").textContent = cityName(editCity);
  list.innerHTML = `<p style="color:#94a3b8;padding:12px;">Chargement…</p>`;
  try {
    editItems = await listCommunications(editCity);
  } catch (err) {
    console.error(err);
    list.innerHTML = `<p style="color:#dc2626;padding:12px;">Impossible de charger les communications.</p>`;
    return;
  }
  $("comm-count").textContent = `${editItems.length} / ${MAX_COMMS}`;
  $("comm-add").disabled = editItems.length >= MAX_COMMS;
  $("comm-add").textContent = editItems.length >= MAX_COMMS
    ? `Maximum atteint (${MAX_COMMS} communications)` : "+ Ajouter une communication";
  list.innerHTML = "";
  if (!editItems.length) {
    list.innerHTML = `<p style="color:#94a3b8;padding:12px;">Aucune communication pour ${escapeHtml(cityName(editCity))}.</p>`;
    return;
  }
  editItems.forEach((c, i) => list.appendChild(editRow(c, i)));
}

function audienceLabel(c) {
  const a = Array.isArray(c.audience) && c.audience.length ? c.audience : Object.keys(AUDIENCES);
  return a.length === Object.keys(AUDIENCES).length ? "Visible par tous" : "Visible par : " + a.map(k => AUDIENCES[k]).join(", ");
}

function editRow(c, i) {
  const thumb = isSafeImage(c.image)
    ? `<img src="${c.image}" alt="" class="comm-thumb"/>`
    : `<span class="comm-thumb comm-thumb-empty">📣</span>`;
  const nbButtons = (c.buttons || []).length;
  const details = [c.date || (hasAgenda(c) ? agendaLabel(c) : ""), hasAgenda(c) ? "📅 Agenda" : "", audienceLabel(c), nbButtons ? `${nbButtons} bouton${nbButtons > 1 ? "s" : ""}` : ""]
    .filter(Boolean).join(" · ");
  const small = "margin-top:0;width:auto;padding:6px 10px;font-size:12px;";
  const row = document.createElement("div");
  row.className = "info-card";
  row.innerHTML = `
    <div class="info-item" style="gap:10px;flex-wrap:wrap;">
      ${thumb}
      <span style="flex:1;min-width:140px;">
        <b>${escapeHtml(c.title || "(sans titre)")}</b><br>
        <span style="font-size:11px;color:#94a3b8;">${escapeHtml(details)}</span>
      </span>
      <span style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="direct-btn" type="button" data-act="up" style="${small}" ${i === 0 ? "disabled" : ""} aria-label="Monter">↑</button>
        <button class="direct-btn" type="button" data-act="down" style="${small}" ${i === editItems.length - 1 ? "disabled" : ""} aria-label="Descendre">↓</button>
        <button class="direct-btn" type="button" data-act="edit" style="${small}">Modifier</button>
        <button class="direct-btn" type="button" data-act="delete" style="${small}color:#dc2626;">Supprimer</button>
      </span>
    </div>`;
  row.querySelector('[data-act="up"]').addEventListener("click", () => move(i, -1));
  row.querySelector('[data-act="down"]').addEventListener("click", () => move(i, 1));
  row.querySelector('[data-act="edit"]').addEventListener("click", () => openForm(c));
  row.querySelector('[data-act="delete"]').addEventListener("click", async () => {
    if (!confirm(`Supprimer la communication « ${c.title || "sans titre"} » ?`)) return;
    try {
      await deleteDoc(doc(db, "communications", c.id));
      showMessage("comm-message", "Communication supprimée.", false);
      await afterChange();
    } catch (err) {
      console.error(err);
      showMessage("comm-message", "Suppression impossible. Réessayez.", true);
    }
  });
  return row;
}

/** Échange une communication avec sa voisine (ordre d'affichage dans la barre). */
async function move(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= editItems.length) return;
  const reordered = editItems.slice();
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
  try {
    const batch = writeBatch(db);
    reordered.forEach((c, k) => {
      if (c.order !== k) batch.set(doc(db, "communications", c.id), { order: k, updatedAt: serverTimestamp() }, { merge: true });
    });
    await batch.commit();
    await afterChange();
  } catch (err) {
    console.error(err);
    showMessage("comm-message", "Changement d'ordre impossible. Réessayez.", true);
  }
}

async function afterChange() {
  await refreshEditor();
  if (editCity === bannerCity) await loadBanner();
}

// ── Formulaire ──

function renderFormImage(info) {
  const preview = $("comm-form-image-preview");
  preview.innerHTML = "";
  if (formImage) {
    const img = document.createElement("img");
    img.src = formImage;
    img.alt = "Aperçu";
    preview.appendChild(img);
  } else {
    preview.textContent = `Pas d'image · format ${IMAGE_WIDTH} × ${IMAGE_HEIGHT} px`;
  }
  $("comm-form-image-remove").hidden = !formImage;
  const infoEl = $("comm-form-image-info");
  infoEl.textContent = info ? info.text : "";
  infoEl.style.color = info && info.warn ? "#b45309" : "";
  infoEl.hidden = !info;
}

function buttonRow(b) {
  const row = document.createElement("div");
  row.className = "comm-btn-row";
  row.innerHTML = `
    <input type="text" class="profile-input comm-btn-label" maxlength="30" placeholder="Texte du bouton (ex. Réserver)"/>
    <input type="url" class="profile-input comm-btn-url" maxlength="500" placeholder="Lien (https://…)"/>
    <button class="profile-link" type="button">Retirer ce bouton</button>`;
  row.querySelector(".comm-btn-label").value = b ? b.label : "";
  row.querySelector(".comm-btn-url").value = b ? b.url : "";
  row.querySelector("button").addEventListener("click", () => { row.remove(); syncButtonAdd(); });
  return row;
}

function syncButtonAdd() {
  $("comm-form-btn-add").hidden = $("comm-form-buttons").children.length >= MAX_BUTTONS;
}

function openForm(c) {
  editing = c || null;
  $("comm-form-title").textContent = c ? "Modifier la communication" : "Nouvelle communication";
  $("comm-form-name").value = c ? c.title || "" : "";
  $("comm-form-date").value = c ? c.date || "" : "";
  $("comm-form-text").value = c ? c.text || "" : "";
  $("comm-form-agenda-day").value = c && hasAgenda(c) ? c.agendaDay : "";
  $("comm-form-agenda-start").value = c && hasAgenda(c) ? c.agendaStart || "" : "";
  $("comm-form-agenda-end").value = c && hasAgenda(c) ? c.agendaEnd || "" : "";
  $("comm-form-agenda-place").value = c && hasAgenda(c) ? c.agendaPlace || "" : "";
  const audience = c && Array.isArray(c.audience) && c.audience.length ? c.audience : Object.keys(AUDIENCES);
  document.querySelectorAll(".comm-audience").forEach(box => { box.checked = audience.includes(box.value); });
  const buttons = $("comm-form-buttons");
  buttons.innerHTML = "";
  ((c && c.buttons) || []).forEach(b => buttons.appendChild(buttonRow(b)));
  syncButtonAdd();
  formImage = c && isSafeImage(c.image) ? c.image : "";
  renderFormImage(null);
  showMessage("comm-form-message", "");
  $("comm-form").hidden = false;
  $("comm-add").hidden = true;
  $("comm-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeForm() {
  editing = null;
  $("comm-form").hidden = true;
  $("comm-add").hidden = false;
}

/** Premier emplacement libre de la ville (ville-0 … ville-9). */
function freeId() {
  const used = new Set(editItems.map(c => c.id));
  for (let i = 0; i < MAX_COMMS; i++) {
    if (!used.has(`${editCity}-${i}`)) return `${editCity}-${i}`;
  }
  return null;
}

async function saveForm() {
  const title = $("comm-form-name").value.trim();
  const date = $("comm-form-date").value.trim();
  const text = $("comm-form-text").value.trim();
  const audience = [...document.querySelectorAll(".comm-audience:checked")].map(b => b.value);
  const buttons = [];
  for (const row of $("comm-form-buttons").children) {
    const label = row.querySelector(".comm-btn-label").value.trim();
    let url = row.querySelector(".comm-btn-url").value.trim();
    if (!label && !url) continue;
    if (!label) return showMessage("comm-form-message", "Chaque bouton a besoin d'un texte.", true);
    if (url && !/^[a-z]+:/i.test(url)) url = "https://" + url;
    if (!isSafeUrl(url)) return showMessage("comm-form-message", `Le lien du bouton « ${label} » n'est pas valide (il doit commencer par https://).`, true);
    buttons.push({ label, url });
  }
  if (!title && !formImage) return showMessage("comm-form-message", "Ajoutez au moins un titre ou une image.", true);
  const agendaDay = $("comm-form-agenda-day").value;
  const agendaStart = agendaDay ? $("comm-form-agenda-start").value : "";
  const agendaEnd = agendaStart ? $("comm-form-agenda-end").value : "";
  const agendaPlace = agendaDay ? $("comm-form-agenda-place").value.trim() : "";
  if (agendaDay && !AGENDA_DAY.test(agendaDay)) return showMessage("comm-form-message", "Le jour de l'événement n'est pas valide.", true);
  if (!agendaDay && ($("comm-form-agenda-start").value || $("comm-form-agenda-end").value))
    return showMessage("comm-form-message", "Pour le bouton « Ajouter à l'agenda », choisissez aussi le jour.", true);
  if (agendaEnd && agendaEnd <= agendaStart) return showMessage("comm-form-message", "L'heure de fin doit être après l'heure de début.", true);
  if (!audience.length) return showMessage("comm-form-message", "Choisissez qui voit cette communication.", true);

  const id = editing ? editing.id : freeId();
  if (!id) return showMessage("comm-form-message", `Maximum ${MAX_COMMS} communications par ville.`, true);
  const order = editing ? (editing.order ?? 0)
    : editItems.reduce((max, c) => Math.max(max, (c.order ?? 0) + 1), 0);

  const btn = $("comm-form-save");
  btn.disabled = true;
  try {
    const data = {
      city: editCity, order, title, date, text, image: formImage, buttons, audience, updatedAt: serverTimestamp()
    };
    // Champs « Ajouter à l'agenda » envoyés seulement s'ils sont remplis : une communication
    // sans agenda s'enregistre même si les règles Firestore publiées ne les connaissent pas encore.
    if (agendaDay) data.agendaDay = agendaDay;
    if (agendaStart) data.agendaStart = agendaStart;
    if (agendaEnd) data.agendaEnd = agendaEnd;
    if (agendaPlace) data.agendaPlace = agendaPlace;
    await setDoc(doc(db, "communications", id), data);
    showMessage("comm-message", "Communication enregistrée ✓", false);
    closeForm();
    await afterChange();
  } catch (err) {
    console.error(err);
    showMessage("comm-form-message", err && err.code === "permission-denied"
      ? (agendaDay
        ? "Enregistrement refusé : les règles Firestore publiées ne connaissent pas encore « Ajouter à l'agenda ». Republiez firestore.rules dans la console Firebase, ou videz le jour de l'événement."
        : "Enregistrement refusé par les règles Firestore. Republiez firestore.rules dans la console Firebase.")
      : "Enregistrement impossible. Réessayez.", true);
  } finally {
    btn.disabled = false;
  }
}

/** Réduit l'image à 1200 px de large au plus, en JPEG, et dit si son format convient. */
async function readImage(file) {
  if (!file || !file.type.startsWith("image/")) throw new Error("Merci de choisir une image (JPG ou PNG).");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Image illisible. Essayez une image JPG ou PNG."));
      image.src = url;
    });
    const w = img.naturalWidth, h = img.naturalHeight;
    const scale = Math.min(1, IMAGE_WIDTH / w);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const c2d = canvas.getContext("2d");
    c2d.fillStyle = "#ffffff";
    c2d.fillRect(0, 0, canvas.width, canvas.height);
    c2d.drawImage(img, 0, 0, canvas.width, canvas.height);
    let data = "";
    for (const quality of [0.85, 0.75, 0.6, 0.45]) {
      data = canvas.toDataURL("image/jpeg", quality);
      if (data.length <= MAX_IMAGE_LENGTH) break;
    }
    if (data.length > MAX_IMAGE_LENGTH) throw new Error("Image trop lourde, essayez-en une plus petite.");

    const ratio = w / h;
    const near = (tw, th) => Math.abs(ratio - tw / th) / (tw / th) <= 0.15;
    let info = { text: `Votre image : ${w} × ${h} px ✓`, warn: false };
    if (!near(IMAGE_WIDTH, IMAGE_HEIGHT) && !near(FULL_WIDTH, FULL_HEIGHT)) {
      info = { text: `Votre image : ${w} × ${h} px. Le format conseillé est ${IMAGE_WIDTH} × ${IMAGE_HEIGHT} px (ou ${FULL_WIDTH} × ${FULL_HEIGHT} px pour une image seule) : le haut et le bas (ou les côtés) seront coupés.`, warn: true };
    } else if (w < IMAGE_WIDTH * 0.6) {
      info = { text: `Votre image : ${w} × ${h} px. Elle risque d'être floue : ${IMAGE_WIDTH} px de large au moins est conseillé.`, warn: true };
    }
    return { data, info };
  } finally {
    URL.revokeObjectURL(url);
  }
}

$("events-edit")?.addEventListener("click", openEditor);
$("back-from-communications")?.addEventListener("click", () => {
  window.hideAllAuth();
  dashboard.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
});
$("comm-city")?.addEventListener("change", async e => {
  editCity = e.target.value;
  bannerCity = editCity; // l'admin général voit dans la barre la ville qu'il modifie
  closeForm();
  showMessage("comm-message", "");
  await refreshEditor();
  await loadBanner();
});
$("comm-add")?.addEventListener("click", () => openForm(null));
$("comm-form-cancel")?.addEventListener("click", closeForm);
$("comm-form-save")?.addEventListener("click", saveForm);
$("comm-form-btn-add")?.addEventListener("click", () => {
  $("comm-form-buttons").appendChild(buttonRow(null));
  syncButtonAdd();
});
$("comm-form-image-input")?.addEventListener("change", async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const { data, info } = await readImage(file);
    formImage = data;
    renderFormImage(info);
    showMessage("comm-form-message", "");
  } catch (err) {
    showMessage("comm-form-message", err.message, true);
  }
});
$("comm-form-image-remove")?.addEventListener("click", () => {
  formImage = "";
  renderFormImage(null);
});
